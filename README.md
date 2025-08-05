# vibe-code-distiller-ui

A personal web interface for managing Claude Code CLI on your Raspberry Pi. This lightweight application provides a browser-based terminal and project management interface, making it easy to interact with Claude Code from any device on your local network.

## Features

- 🌐 **Web Interface**: Access Claude Code CLI through your browser
- 🖥️ **Terminal Integration**: Native terminal interface using TTYd with iframe integration
- 💾 **Persistent Sessions**: Tmux integration for session persistence across devices
- 📁 **Project Management**: Browse, create, and manage your coding projects
- 🔄 **Real-time Updates**: Live terminal output, project changes, and system stats
- 📊 **System Monitoring**: CPU, temperature, and memory monitoring for Raspberry Pi
- 🔔 **Notifications**: Desktop notifications with toggle functionality
- 📱 **Mobile Optimized**: Responsive design for phones and tablets
- 🔧 **File Management**: Drag-and-drop upload, download, and file operations
- 🖼️ **Image Management**: Dedicated image preview and management system
- 📏 **Resizable UI**: Adjustable sidebar and panel layouts
- 🔄 **Multi-Session**: Multiple terminal sessions per project
- 📤 **Project Export**: Download entire projects as archives
- 🔗 **File-to-Terminal**: Double-click files to send paths to terminal
- ⚡ **Simplified Architecture**: TTYd-based terminal with minimal overhead

## Quick Start

### Prerequisites
- Raspberry Pi with Node.js 18+ installed
- Claude Code CLI installed and configured
- Basic familiarity with terminal/command line

### Installation

1. **Clone and install**:
```bash
git clone <your-repo-url>
cd claude-code-web-manager
npm install
```

2. **Setup dependencies**:
```bash
# Install tmux and download TTYd binary
chmod +x setup-dependencies.sh
./setup-dependencies.sh
```

3. **Start the application**:
```bash
npm start
```

4. **Access from any device**:
Open your browser and go to `http://your-pi-ip:8080`

That's it! You can now manage your Claude Code projects from any device on your network.

## Configuration

The main configuration file is `config/default.json`. Here are the key settings you might want to adjust:

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  },
  "projects": {
    "rootDir": "~/projects"
  },
  "ttyd": {
    "port": 7681,
    "fontSize": 15
  }
}
```

## Project Structure

```
├── server/                    # Backend Node.js application
│   ├── app.js                # Main Express server (simplified)
│   ├── middleware/           # Express middleware
│   │   ├── cors.js          # CORS configuration
│   │   └── error-handler.js # Error handling middleware
│   ├── routes/              # API endpoints
│   │   ├── api.js          # General API routes
│   │   ├── claude.js       # Claude Code integration
│   │   ├── files.js        # File management operations
│   │   ├── images.js       # Image management
│   │   ├── projects.js     # Project CRUD operations
│   │   ├── system.js       # System monitoring
│   │   └── ttyd.js         # TTYd terminal routes
│   ├── services/           # Core business logic
│   │   ├── claude-manager.js # Claude session management
│   │   ├── file-service.js   # File system operations
│   │   ├── project-service.js # Project operations
│   │   ├── ttyd-service.js   # TTYd service management
│   │   ├── proxy-service.js  # Proxy management (TTYd, Code-server)
│   │   ├── system-setup.js   # System configuration (Git, aliases, tmux)
│   │   ├── websocket-manager.js # WebSocket event coordination
│   │   └── websocket/       # WebSocket handlers (modular)
│   │       ├── connection-manager.js # Connection & room management
│   │       ├── project-handler.js    # Project & Claude events
│   │       └── terminal-handler.js   # Terminal session management
│   └── utils/              # Utility modules
│       ├── constants.js    # Application constants
│       ├── logger.js       # Winston logger configuration
│       ├── tmux-utils.js   # Tmux session utilities
│       └── validator.js    # Input validation schemas
├── public/                 # Frontend static files
│   ├── index.html         # Main application page
│   └── assets/
│       ├── css/           # Stylesheets
│       │   ├── main.css   # Main styles
│       │   ├── components.css # Component styles
│       │   └── terminal.css # Terminal specific styles
│       ├── js/            # Client-side JavaScript modules
│       │   ├── app.js           # Main application logic
│       │   ├── socket-client.js # Socket.IO client handling
│       │   ├── terminal-ttyd.js # TTYd terminal interface
│       │   ├── project-manager.js # Project management UI
│       │   ├── file-manager.js    # File management UI
│       │   ├── image-manager.js   # Image management UI
│       │   ├── shortcuts-panel.js # Keyboard shortcuts panel
│       │   ├── vertical-divider.js # Sidebar resizing
│       │   ├── sidebar-divider.js  # Sidebar panel divider
│       │   └── utils.js           # Frontend utilities
│       ├── libs/          # External libraries
│       │   └── socket.io.min.js # Socket.IO client library
│       └── icons/         # Application icons
│           └── favicon.ico
├── config/               # Configuration files
│   └── default.json     # Main configuration
├── logs/                # Application logs
├── ttyd.aarch64        # TTYd binary for ARM64
├── ecosystem.config.js  # PM2 configuration
├── setup-dependencies.sh # Dependency setup script
├── install-service.sh   # Service installation script
└── uninstall-service.sh # Service removal script
```

## Key Features

### Terminal Session Management
- **Isolated Project Sessions**: Each project gets its own terminal session
- **Persistent Sessions**: Sessions persist even when you close your browser (thanks to tmux)
- **Multi-Device Continuation**: You can reconnect from any device and continue where you left off
- **Remote Access**: With network tunneling, you can operate the terminal from anywhere

### Smart Notifications
- **Claude Code Completion Alerts**: Automatic browser notifications when Claude Code tasks finish
- **Hook Integration**: Leverages Claude Code's hook system for seamless notification delivery
- **Desktop Integration**: Native browser notifications that work even when the tab is in background


## Advanced Usage

### Using PM2 (Optional)
If you want the app to start automatically and stay running:

```bash
# Install PM2 globally
npm install -g pm2

# Start the app with PM2
npm run pm2:start

# Make it start on boot
pm2 startup
pm2 save
```

## Development

### File Structure
- `server/app.js` - Main Express application with TTYd proxy
- `server/services/` - Core business logic
- `server/routes/` - API endpoints
- `public/assets/js/terminal-ttyd.js` - TTYd frontend integration
- `public/assets/css/` - Styling

### Adding Features
1. Backend: Add new routes in `server/routes/`
2. Frontend: Add new JavaScript modules in `public/assets/js/`
3. Styling: Update CSS in `public/assets/css/`

## Tips & Tricks

### Performance on Raspberry Pi
- The app is optimized for Pi's limited resources
- TTYd provides native terminal performance
- Close unused terminal sessions to save memory
- Use tmux to keep sessions alive without browser overhead

### Multi-Device Usage
- Bookmark `http://your-pi-ip:8080` on all your devices
- Use the same session across devices for seamless coding
- The interface adapts to phone/tablet screen sizes


## License

MIT License - Feel free to modify and use as you like!

## Support

This is a personal project designed for individual use. If you run into issues:
1. Check the logs in the `logs/` directory
2. Look at the browser console for errors
3. Make sure all dependencies are installed correctly
4. Verify TTYd binary exists and is executable in the project root

---

*Happy coding with Claude on your Raspberry Pi! 🍓*