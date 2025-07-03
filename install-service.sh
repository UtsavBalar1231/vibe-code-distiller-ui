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

# Update service file with correct paths and user
CURRENT_USER="${SUDO_USER:-$USER}"
sed -i "s|User=pi|User=${CURRENT_USER}|g" "${PROJECT_DIR}/${SERVICE_FILE}"
sed -i "s|Group=pi|Group=${CURRENT_USER}|g" "${PROJECT_DIR}/${SERVICE_FILE}"
sed -i "s|WorkingDirectory=/home/distiller/claudeCodeUi|WorkingDirectory=${PROJECT_DIR}|g" "${PROJECT_DIR}/${SERVICE_FILE}"

# Find npm and node paths
NPM_PATH=$(sudo -u ${CURRENT_USER} which npm)
NODE_PATH=$(sudo -u ${CURRENT_USER} which node)
NPM_DIR=$(dirname "${NPM_PATH}")

if [ -z "${NPM_PATH}" ]; then
    echo "Error: npm not found. Please install Node.js first."
    exit 1
fi

# Update paths in service file
sed -i "s|/home/distiller/.nvm/versions/node/v22.17.0/bin/npm|${NPM_PATH}|g" "${PROJECT_DIR}/${SERVICE_FILE}"
sed -i "s|/home/distiller/.nvm/versions/node/v22.17.0/bin:|${NPM_DIR}:|g" "${PROJECT_DIR}/${SERVICE_FILE}"
sed -i "s|Environment=\"PM2_HOME=/home/distiller/.pm2\"|Environment=\"PM2_HOME=/home/${CURRENT_USER}/.pm2\"|g" "${PROJECT_DIR}/${SERVICE_FILE}"

# Copy service file to systemd directory
cp "${PROJECT_DIR}/${SERVICE_FILE}" "/etc/systemd/system/${SERVICE_FILE}"

# Reload systemd daemon
systemctl daemon-reload

# Enable service to start on boot
systemctl enable ${SERVICE_NAME}

# Enable network-online.target to ensure network is up
systemctl enable systemd-networkd-wait-online.service

echo "Service installed successfully!"
echo ""
echo "Available commands:"
echo "  sudo systemctl start ${SERVICE_NAME}    # Start the service"
echo "  sudo systemctl stop ${SERVICE_NAME}     # Stop the service"
echo "  sudo systemctl restart ${SERVICE_NAME}  # Restart the service"
echo "  sudo systemctl status ${SERVICE_NAME}   # Check service status"
echo "  sudo journalctl -u ${SERVICE_NAME} -f  # View service logs"
echo ""
echo "The service will automatically start on boot after network is connected."