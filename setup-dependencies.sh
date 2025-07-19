#!/bin/bash

# Setup Dependencies for Claude Code Web Manager
# This script installs tmux and downloads TTYd binary

set -e

echo "Setting up dependencies for Claude Code Web Manager..."

# Function to install tmux based on operating system
install_tmux() {
    echo "Installing tmux for persistent terminal sessions..."
    
    if command -v apt-get >/dev/null 2>&1; then
        # Debian/Ubuntu
        echo "Detected Debian/Ubuntu system"
        sudo apt-get update
        sudo apt-get install -y tmux
    elif command -v yum >/dev/null 2>&1; then
        # RedHat/CentOS
        echo "Detected RedHat/CentOS system"
        sudo yum install -y tmux
    elif command -v pacman >/dev/null 2>&1; then
        # Arch Linux
        echo "Detected Arch Linux system"
        sudo pacman -S --noconfirm tmux
    elif command -v brew >/dev/null 2>&1; then
        # macOS
        echo "Detected macOS system"
        brew install tmux
    elif command -v apk >/dev/null 2>&1; then
        # Alpine Linux
        echo "Detected Alpine Linux system"
        sudo apk add tmux
    else
        echo "Unable to detect package manager. Please install tmux manually."
        echo "Visit: https://github.com/tmux/tmux/wiki/Installing"
        exit 1
    fi
}

# Check if tmux is already installed
if command -v tmux >/dev/null 2>&1; then
    echo "✓ tmux is already installed ($(tmux -V))"
else
    install_tmux
    
    # Verify tmux installation
    if command -v tmux >/dev/null 2>&1; then
        echo "✓ tmux installed successfully! ($(tmux -V))"
    else
        echo "✗ tmux installation failed"
        exit 1
    fi
fi

# Check if TTYd binary exists in current directory
TTYD_BINARY="ttyd.aarch64"
if [ -f "$TTYD_BINARY" ]; then
    echo "✓ TTYd binary already exists: $TTYD_BINARY"
else
    echo "Downloading TTYd binary for ARM64..."
    
    # Download TTYd binary
    TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.aarch64"
    
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$TTYD_BINARY" "$TTYD_URL"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$TTYD_BINARY" "$TTYD_URL"
    else
        echo "✗ Neither curl nor wget found. Please install one of them to download TTYd."
        exit 1
    fi
    
    # Verify download
    if [ -f "$TTYD_BINARY" ]; then
        # Make executable
        chmod +x "$TTYD_BINARY"
        echo "✓ TTYd binary downloaded successfully: $TTYD_BINARY"
    else
        echo "✗ Failed to download TTYd binary"
        exit 1
    fi
fi

echo ""
echo "✅ All dependencies are ready!"
echo ""
echo "Dependencies installed/verified:"
echo "- tmux: For persistent terminal sessions"
echo "- TTYd binary: For web-based terminal interface"
echo ""
echo "The Claude Code Web Manager now supports:"
echo "- Persistent terminal sessions across browser/device changes"
echo "- Session detach/reattach functionality"
echo "- Background process continuation"
echo "- Native web terminal interface"
echo ""
echo "You can now start the application with: npm start"