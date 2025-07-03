#!/bin/bash

# Claude Code Web Manager Service Uninstall Script

set -e

SERVICE_NAME="claude-code-ui"
SERVICE_FILE="${SERVICE_NAME}.service"

echo "Uninstalling Claude Code Web Manager systemd service..."

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo ./uninstall-service.sh"
    exit 1
fi

# Stop service if running
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "Stopping ${SERVICE_NAME} service..."
    systemctl stop ${SERVICE_NAME}
fi

# Disable service
if systemctl is-enabled --quiet ${SERVICE_NAME}; then
    echo "Disabling ${SERVICE_NAME} service..."
    systemctl disable ${SERVICE_NAME}
fi

# Remove service file
if [ -f "/etc/systemd/system/${SERVICE_FILE}" ]; then
    rm "/etc/systemd/system/${SERVICE_FILE}"
    echo "Service file removed"
fi

# Reload systemd daemon
systemctl daemon-reload

echo "Service uninstalled successfully!"