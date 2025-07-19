#!/bin/bash

# Claude Code Web Manager Service Installation Script

set -e

SERVICE_NAME="claude-code-ui"
SERVICE_FILE="${SERVICE_NAME}.service"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing Claude Code Web Manager as systemd service..."

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo ./install-service.sh"
    exit 1
fi

# Get current user and paths
CURRENT_USER="${SUDO_USER:-$USER}"
echo "Installing for user: ${CURRENT_USER}"

# Find npm path - source the user's bashrc to get NVM paths
NPM_PATH=$(sudo -u ${CURRENT_USER} bash -i -c 'which npm' 2>/dev/null || echo "")
NODE_PATH=$(sudo -u ${CURRENT_USER} bash -i -c 'which node' 2>/dev/null || echo "")

if [ -z "${NPM_PATH}" ]; then
    echo "Error: npm not found. Please install Node.js first."
    exit 1
fi

NPM_DIR=$(dirname "${NPM_PATH}")
echo "Found npm at: ${NPM_PATH}"
echo "Found node at: ${NODE_PATH}"

# Check for PM2
PM2_PATH=$(sudo -u ${CURRENT_USER} bash -i -c 'which pm2' 2>/dev/null || echo "")
if [ -z "${PM2_PATH}" ]; then
    echo "PM2 not found. Installing PM2 globally..."
    sudo -u ${CURRENT_USER} bash -i -c "${NPM_PATH} install -g pm2"
fi

# Create a fresh service file instead of modifying
cat > "/tmp/${SERVICE_FILE}" << EOF
[Unit]
Description=Claude Code Web Manager
Documentation=https://github.com/yourusername/claude-code-ui
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=${CURRENT_USER}
Group=${CURRENT_USER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=${NPM_PATH} run pm2:start
ExecReload=${NPM_PATH} run pm2:restart
ExecStop=${NPM_PATH} run pm2:stop
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=claude-code-ui
Environment="NODE_ENV=production"
Environment="PATH=${NPM_DIR}:/usr/bin:/usr/local/bin"
Environment="PM2_HOME=/home/${CURRENT_USER}/.pm2"

[Install]
WantedBy=multi-user.target
EOF

# Copy service file to systemd directory
cp "/tmp/${SERVICE_FILE}" "/etc/systemd/system/${SERVICE_FILE}"
rm "/tmp/${SERVICE_FILE}"

# Reload systemd daemon
systemctl daemon-reload

# Enable service to start on boot
systemctl enable ${SERVICE_NAME}

# Enable network-online.target
systemctl enable systemd-networkd-wait-online.service

echo "Service installed successfully!"
echo ""
echo "Available commands:"
echo "  sudo systemctl start ${SERVICE_NAME}    # Start the service"
echo "  sudo systemctl stop ${SERVICE_NAME}     # Stop the service"
echo "  sudo systemctl restart ${SERVICE_NAME}  # Restart the service"
echo "  sudo systemctl status ${SERVICE_NAME}   # Check service status"
echo "  sudo journalctl -u ${SERVICE_NAME} -f  # View service logs"