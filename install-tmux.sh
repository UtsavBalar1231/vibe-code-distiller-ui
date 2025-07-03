#!/bin/bash

# Install tmux based on the operating system

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

# Verify installation
if command -v tmux >/dev/null 2>&1; then
    echo "✓ tmux installed successfully!"
    echo "Version: $(tmux -V)"
else
    echo "✗ tmux installation failed"
    exit 1
fi

echo ""
echo "Tmux has been installed. The Claude Code Web Manager now supports:"
echo "- Persistent terminal sessions across browser/device changes"
echo "- Session detach/reattach functionality"
echo "- Background process continuation"
echo ""
echo "Use Ctrl+Shift+S in the terminal to manage sessions."