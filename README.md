# Claude Code Web Manager

A personal web interface for managing Claude Code CLI on your Raspberry Pi. This lightweight application provides a browser-based terminal and project management interface, making it easy to interact with Claude Code from any device on your local network.

## Features

- 🌐 **Web Interface**: Access Claude Code CLI through your browser
- 🖥️ **Terminal Integration**: Real-time terminal interface using xterm.js
- 💾 **Persistent Sessions**: Tmux integration for session persistence across devices
- 📁 **Project Management**: Browse and manage your coding projects
- 🔄 **Real-time Updates**: Live terminal output and project changes
- 📊 **System Monitoring**: Keep an eye on your Raspberry Pi's resources
- 🎨 **Dark Theme**: Easy on the eyes interface
- 🔔 **Notifications**: Desktop notifications for important events
- 📱 **Mobile Friendly**: Works on phones and tablets too
- 🔧 **File Management**: Upload, download, and manage project files
- 🖼️ **Image Support**: View and manage images in your projects

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
- Browse your projects in the sidebar
- Click any project to open it in the terminal
- Create new projects with the "+" button
- Upload files by dragging and dropping

### Keyboard Shortcuts
- `Ctrl+N`: Create new project
- `Ctrl+,`: Open settings
- `Ctrl+Shift+S`: Show tmux session manager
- `Escape`: Close modals/menus

## Features Explained

### Tmux Integration
When enabled, your terminal sessions become persistent:
- Start coding on your laptop
- Switch to your phone/tablet and continue
- Sessions survive browser crashes and network disconnections
- Press `Ctrl+Shift+S` to see all active sessions

### File Management
- Upload files by dragging them into the interface
- Download individual files or entire project folders
- Basic file operations (create, delete, rename)
- Syntax highlighting for code files
- **Double-click files**: Send file path to terminal for easy Claude Code queries

### System Monitoring
Keep track of your Raspberry Pi's health:
- CPU usage and temperature
- Memory usage
- Active processes
- Network activity

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

### Recent Updates
- **Tmux Integration**: Persistent terminal sessions across devices
- **File Management**: Upload and download project files
- **Image Support**: View and manage images in projects
- **Notifications**: Desktop notifications for important events
- **Mobile Optimization**: Better experience on phones and tablets
- **System Monitoring**: Real-time Pi resource monitoring

## License

MIT License - Feel free to modify and use as you like!

## Support

This is a personal project designed for individual use. If you run into issues:
1. Check the logs in the `logs/` directory
2. Look at the browser console for errors
3. Make sure all dependencies are installed correctly

---

*Happy coding with Claude on your Raspberry Pi! 🍓*