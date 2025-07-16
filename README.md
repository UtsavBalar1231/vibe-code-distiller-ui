# Claude Code Web Manager

A personal web interface for managing Claude Code CLI on your Raspberry Pi. This lightweight application provides a browser-based terminal and project management interface, making it easy to interact with Claude Code from any device on your local network.

## Features

- 🌐 **Web Interface**: Access Claude Code CLI through your browser
- 🖥️ **Terminal Integration**: Real-time terminal interface using xterm.js with web links
- 💾 **Persistent Sessions**: Tmux integration for session persistence across devices
- 📁 **Project Management**: Browse, create, and manage your coding projects
- 🔄 **Real-time Updates**: Live terminal output, project changes, and system stats
- 📊 **System Monitoring**: CPU, temperature, and memory monitoring for Raspberry Pi
- 🎨 **Dark Theme**: Optimized dark interface for comfortable coding
- 🔔 **Notifications**: Desktop notifications with toggle functionality
- 📱 **Mobile Optimized**: Responsive design for phones and tablets
- 🔧 **File Management**: Drag-and-drop upload, download, and file operations
- 🖼️ **Image Management**: Dedicated image preview and management system
- 🔐 **Authentication**: Optional authentication system for security
- 📏 **Resizable UI**: Adjustable sidebar and panel layouts
- 🔄 **Multi-Session**: Multiple terminal sessions per project
- 📤 **Project Export**: Download entire projects as archives
- 🔗 **File-to-Terminal**: Double-click files to send paths to terminal

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

2. **Start the application**:
```bash
npm start
```

3. **Access from any device**:
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
  "claude": {
    "executable": "claude",
    "maxSessions": 5
  },
  "terminal": {
    "tmux": {
      "enabled": true,
      "sessionPrefix": "claude-web"
    }
  }
}
```

## Project Structure

```
├── server/                    # Backend Node.js application
│   ├── app.js                # Main server file
│   ├── services/             # Core services
│   │   ├── claude-manager.js # Claude Code session management
│   │   ├── terminal-service.js # Terminal handling
│   │   └── project-service.js # Project operations
│   └── routes/               # API endpoints
├── public/                   # Frontend files
│   ├── index.html           # Main page
│   └── assets/              # CSS, JS, and libraries
├── config/                  # Configuration files
└── logs/                   # Application logs
```

## How It Works

### Terminal Sessions
- Each project gets its own terminal session
- Sessions persist even when you close your browser (thanks to tmux)
- You can reconnect from any device and continue where you left off

### Project Management
- Browse your projects in the sidebar navigation
- Click the "New Project" button to create new projects (automatically saved in ~/projects)
- Click the "+" button next to any project to create a new terminal session for that project
- Upload files directly to specific projects using drag-and-drop
- Download entire projects as compressed archives to your local device


## Features Explained

### Tmux Integration
When enabled, your terminal sessions become persistent:
- Start coding on your laptop
- Switch to your phone/tablet and continue
- Sessions survive browser crashes and network disconnections
- Sessions are automatically managed for you

### File Management
- **Drag-and-drop upload**: Drop files directly into the interface
- **Download functionality**: Download individual files or entire project archives
- **File operations**: Create, delete, rename files and folders
- **File preview modal**: Preview files with enhanced error handling
- **Double-click integration**: Send file path to terminal for easy Claude Code queries
- **Syntax highlighting**: Code files display with proper syntax highlighting

### Image Management
- **Dedicated image interface**: Separate image management system
- **Image preview**: View images directly in the browser
- **Image upload**: Drag-and-drop image files
- **Format support**: Common image formats (PNG, JPG, GIF, etc.)
- **Integrated workflow**: Seamless integration with file management

### System Monitoring
Keep track of your Raspberry Pi's health with real-time monitoring:
- **CPU usage**: Real-time CPU utilization percentage
- **Temperature monitoring**: System temperature for thermal management
- **Memory usage**: RAM utilization and available memory
- **Live updates**: Automatic refresh of system statistics
- **Status indicators**: Visual indicators in the header
- **Performance tracking**: Monitor system performance during development

## Troubleshooting

### Common Issues

**Port 8080 is busy**:
```bash
# Kill whatever is using port 8080
sudo lsof -ti:8080 | xargs kill -9
# Or change the port in config/default.json
```

**Can't find Claude CLI**:
- Make sure `claude` command works in your terminal
- Update the path in `config/default.json` if needed

**Can't connect from other devices**:
- Make sure your Pi's firewall allows port 8080
- Check that you're using the correct IP address

### Logs
Check the logs if something goes wrong:
```bash
tail -f logs/app.log        # General logs
tail -f logs/error.log      # Error logs only
```

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

### Custom Shell Commands
Add your own shortcuts by modifying the terminal service or creating custom scripts in your project directories.

## Development

### File Structure
- `server/app.js` - Main Express application
- `server/services/` - Core business logic
- `server/routes/` - API endpoints
- `public/assets/js/` - Frontend JavaScript
- `public/assets/css/` - Styling

### Adding Features
1. Backend: Add new routes in `server/routes/`
2. Frontend: Add new JavaScript modules in `public/assets/js/`
3. Styling: Update CSS in `public/assets/css/`

### Testing
Use Playwright to test the interface in a real browser:
```bash
# Install Playwright
npm install -D playwright

# Run tests (create your own test files)
npx playwright test
```

## Tips & Tricks

### Performance on Raspberry Pi
- The app is optimized for Pi's limited resources
- Close unused terminal sessions to save memory
- Use tmux to keep sessions alive without browser overhead

### Multi-Device Usage
- Bookmark `http://your-pi-ip:8080` on all your devices
- Use the same session across devices for seamless coding
- The interface adapts to phone/tablet screen sizes

### Security Note
This app is designed for personal use on your local network. It doesn't have authentication enabled by default since it's meant to be used only by you on your own Pi.

## What's New

### Latest Updates (2025-07-09)
- **Enhanced Terminal Management**: Improved session handling with better logging
- **Socket Communication**: Better error handling and connection management
- **Terminal Restart**: Added terminal restart functionality
- **UI Improvements**: Enhanced terminal display and sizing fixes

### Recent Major Features (2025-07-08)
- **Tmux Optimization**: Eliminated JSON file dependency for better performance
- **Real-time Session Discovery**: Direct tmux command integration
- **Architecture Simplification**: Reduced code complexity by ~100 lines
- **Enhanced Reliability**: Improved session persistence and state management

### Core Feature Set (2025-07-02 - 2025-07-08)
- **Tmux Integration**: Persistent terminal sessions across devices
- **File Management**: Comprehensive file operations with drag-and-drop
- **Image Management**: Dedicated image handling and preview system
- **Notifications**: Desktop notifications with toggle functionality
- **Mobile Optimization**: Responsive design for all devices
- **System Monitoring**: Real-time Pi resource monitoring
- **Resizable UI**: Adjustable sidebar and panel layouts
- **Multi-Session Support**: Multiple terminal sessions per project
- **Project Export**: Download entire projects as archives
- **Authentication**: Optional security layer when needed

## License

MIT License - Feel free to modify and use as you like!

## Support

This is a personal project designed for individual use. If you run into issues:
1. Check the logs in the `logs/` directory
2. Look at the browser console for errors
3. Make sure all dependencies are installed correctly

---

*Happy coding with Claude on your Raspberry Pi! 🍓*