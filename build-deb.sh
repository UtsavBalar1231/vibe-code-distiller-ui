#!/bin/bash

# Claude Code Web Manager Debian Package Builder
# This script builds a complete Debian package with all dependencies

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="claude-code-web-manager"
VERSION="1.0.0-1"
DIST_DIR="dist"
BUILD_DIR="${DIST_DIR}/build"
DEB_OUTPUT_DIR="${DIST_DIR}/packages"

# Helper functions
log_info() {
    echo -e "${BLUE}${BOLD}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}${BOLD}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Required command '$1' not found. Please install it first."
        exit 1
    fi
}

print_banner() {
    echo -e "${BOLD}${BLUE}"
    echo "========================================================"
    echo "  Claude Code Web Manager - Debian Package Builder"
    echo "========================================================"
    echo -e "${NC}"
}

# Main execution
main() {
    print_banner
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "server" ]; then
        log_error "This script must be run from the project root directory"
        exit 1
    fi
    
    # Check required build tools
    log_info "Checking build environment..."
    check_command "dpkg-buildpackage"
    check_command "npm"
    check_command "node"
    check_command "curl"
    check_command "lintian"
    
    # Clean up previous builds
    log_info "Cleaning up previous builds..."
    rm -rf "${DIST_DIR}"
    mkdir -p "${BUILD_DIR}"
    mkdir -p "${DEB_OUTPUT_DIR}"
    
    # Copy source files to build directory
    log_info "Preparing source files..."
    
    # Create list of files to copy (exclude development files)
    rsync -av \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='logs' \
        --exclude='.claude' \
        --exclude='*.tmp' \
        --exclude='*.log' \
        --exclude='.env*' \
        --exclude='*.swp' \
        --exclude='*.swo' \
        --exclude='.DS_Store' \
        --exclude='Thumbs.db' \
        --exclude='coverage' \
        --exclude='.nyc_output' \
        --exclude='test-output' \
        --exclude='.pm2' \
        ./ "${BUILD_DIR}/"
    
    # Navigate to build directory
    cd "${BUILD_DIR}"
    
    # Install production dependencies
    log_info "Installing Node.js production dependencies..."
    if [ -f "package-lock.json" ]; then
        npm ci --production --no-optional
    else
        npm install --production --no-optional
    fi
    
    curl -L -f -o ttyd.aarch64 "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.aarch64"
    chmod +x ttyd.aarch64
    log_success "Downloaded ttyd.aarch64"
    
    # Build the Debian package
    log_info "Building Debian package..."
    
    # Set build environment variables
    export DEB_BUILD_OPTIONS="nocheck"
    export DEB_HOST_ARCH="arm64"
    
    # Build package
    dpkg-buildpackage -us -uc -b --host-arch="${DEB_HOST_ARCH}" || {
		log_error "Failed to build Debian package"
		exit 1
	}
    
    # Move generated packages to output directory
    log_info "Collecting build artifacts..."
    cd ..
    mv *.deb "${DEB_OUTPUT_DIR}/" 2>/dev/null || true
    mv *.changes "${DEB_OUTPUT_DIR}/" 2>/dev/null || true
    mv *.buildinfo "${DEB_OUTPUT_DIR}/" 2>/dev/null || true
    
    # Run package quality checks
    log_info "Running package quality checks..."
    cd "${DEB_OUTPUT_DIR}"
    
    DEB_FILE=$(ls *.deb 2>/dev/null | head -1)
    if [ -n "${DEB_FILE}" ]; then
        log_info "Running lintian checks on ${DEB_FILE}..."
        if lintian --color=auto "${DEB_FILE}"; then
            log_success "Package passed lintian checks"
        else
            log_warning "Package has lintian warnings (see above)"
        fi
        
        # Display package information
        log_info "Package information:"
        dpkg-deb --info "${DEB_FILE}"
        
        echo ""
        log_info "Package contents:"
        dpkg-deb --contents "${DEB_FILE}" | head -20
        if [ $(dpkg-deb --contents "${DEB_FILE}" | wc -l) -gt 20 ]; then
            echo "... (truncated, $(dpkg-deb --contents "${DEB_FILE}" | wc -l) total files)"
        fi
        
    else
        log_error "No .deb file found in output directory"
        exit 1
    fi
    
    # Return to project root
    cd ../../..
    
    # Display build summary
    echo ""
    log_success "Build completed successfully!"
    echo ""
    echo -e "${BOLD}Build Summary:${NC}"
    echo "  Package: ${PACKAGE_NAME}"
    echo "  Version: ${VERSION}"
    echo "  Output directory: ${DEB_OUTPUT_DIR}"
    echo ""
    echo -e "${BOLD}Generated files:${NC}"
    ls -la "${DEB_OUTPUT_DIR}/"
    echo ""
    echo -e "${BOLD}Installation commands:${NC}"
    echo "  # Install the package:"
    echo "  sudo dpkg -i ${DEB_OUTPUT_DIR}/${DEB_FILE}"
    echo ""
    echo "  # If dependencies are missing:"
    echo "  sudo apt-get install -f"
    echo ""
    echo "  # Start the service:"
    echo "  sudo systemctl start claude-code-web-manager"
    echo ""
    echo "  # Check service status:"
    echo "  sudo systemctl status claude-code-web-manager"
    echo ""
    echo -e "${BOLD}Web interface will be available at:${NC}"
    echo "  http://localhost:3000"
    echo "  http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'YOUR_IP'):3000"
    echo ""
    
    # Clean up build directory but keep packages
    log_info "Cleaning up build artifacts..."
    rm -rf "${BUILD_DIR}"
    
    log_success "Debian package build process completed!"
}

# Handle script interruption
trap 'log_error "Build interrupted"; exit 1' INT TERM

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            log_info "Cleaning up all build artifacts..."
            rm -rf "${DIST_DIR}"
            log_success "Clean completed"
            exit 0
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean           Clean up all build artifacts"
            echo "  --help, -h        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                Build the Debian package"
            echo "  $0 --clean        Clean up build artifacts"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
    log_warning "Running as root is not recommended for building packages"
    log_warning "Consider running as a regular user"
    echo ""
fi

# Run main function
main "$@"
