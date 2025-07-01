# Claude Code Web Manager

A Node.js web application that provides a browser-based interface for managing Claude Code CLI projects. Specifically optimized for Raspberry Pi environments with a simplified interface focused on project selection and terminal interaction.

## Features

- 🌐 **Web-based Interface**: Browser-based interface for Claude Code CLI management
- 🖥️ **Terminal Integration**: Real-time terminal interface using xterm.js
- 📁 **Project Management**: Easy project selection and management
- 🔄 **Real-time Communication**: WebSocket-based real-time updates
- 🍓 **Raspberry Pi Optimized**: Lightweight and optimized for ARM devices
- 🔒 **Optional Authentication**: Configurable authentication system
- 📊 **System Monitoring**: Built-in system information and status monitoring

## Quick Start

### Prerequisites

- Node.js 18.0.0+
- NPM 8.0.0+
- Claude Code CLI installed and configured

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd claudeCodeUi
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
# Development mode
npm run dev

# Production mode
npm start

# With PM2 process manager (recommended for production)
npm run pm2:start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

1. **Select a Project**: Use the sidebar to browse and select your Claude Code projects
2. **Terminal Interface**: Interact with Claude Code CLI through the integrated terminal
3. **Real-time Updates**: All terminal output and project changes are updated in real-time
4. **Session Management**: Multiple terminal sessions are supported with auto-reconnection

## Configuration

Configuration files are located in the `config/` directory:

- `config/default.json` - Development configuration
- `config/production.json` - Production overrides
- `ecosystem.config.js` - PM2 deployment configuration

Key configuration options:
- Server port and host settings
- Claude executable path
- Authentication settings
- WebSocket timeouts
- Logging levels

## PM2 Process Management

For production deployment, use PM2:

```bash
# Start with PM2
npm run pm2:start

# Stop PM2 process
npm run pm2:stop

# Restart PM2 process
npm run pm2:restart

# Delete PM2 process
npm run pm2:delete

# View PM2 status
pm2 status
```

## System Requirements

- **Supported OS**: Linux, macOS
- **Architecture**: ARM64, x64
- **Memory**: Minimum 256MB RAM (optimized for 128MB on Raspberry Pi)
- **Node.js**: 18.0.0 or higher
- **Browser**: Modern browsers with WebSocket support

## API Endpoints

- `/api/status` - Application health and status
- `/api/projects` - Project management operations
- `/api/claude` - Claude AI integration endpoints
- `/api/system` - System monitoring information

## Development

### Project Structure

```
├── server/                 # Backend Express.js application
│   ├── app.js             # Main application entry
│   ├── socket-handler.js  # WebSocket event handling
│   ├── middleware/        # Express middleware
│   ├── routes/           # API route definitions
│   ├── services/         # Core business logic
│   └── utils/            # Utilities and helpers
├── public/               # Frontend static files
│   ├── index.html        # Main application page
│   └── assets/          # CSS, JS, and library files
├── config/              # Configuration files
└── logs/               # Application logs
```

### Development Commands

```bash
npm run dev        # Start development server with nodemon
npm start          # Start production server
npm run pm2:start  # Start with PM2 process manager
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port in `config/default.json`
2. **Claude CLI not found**: Update the Claude executable path in configuration
3. **WebSocket connection failed**: Check firewall settings and CORS configuration
4. **Memory issues on Raspberry Pi**: Ensure PM2 memory limits are properly configured

### Logs

Application logs are stored in the `logs/` directory:
- `app.log` - General application logs
- `error.log` - Error logs only

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions, please refer to the project's issue tracker.