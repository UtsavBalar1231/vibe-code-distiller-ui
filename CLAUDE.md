# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Web Manager is a Node.js web application that provides a browser-based interface for managing Claude Code CLI projects. The application is specifically optimized for Raspberry Pi environments and offers a simplified interface focused on project selection and terminal interaction for easier debugging and maintenance.

## Development Commands

### Starting the Application
```bash
npm start          # Production server
npm run dev        # Development with nodemon
npm run pm2:start  # Start with PM2 process manager
```

### Process Management
```bash
npm run pm2:stop     # Stop PM2 process
npm run pm2:restart  # Restart PM2 process
npm run pm2:delete   # Delete PM2 process
```

### Requirements
- Node.js 18.0.0+
- NPM 8.0.0+
- Supported on Linux/macOS with ARM64/x64 architectures

## Architecture

### Server Architecture
The application follows a layered service architecture built on Express.js:

**Core Services:**
- `claude-manager.js` - Manages Claude AI CLI sessions and processes
- `terminal-service-tmux.js` - Handles persistent terminal sessions using tmux with real-time discovery
- `terminal-service.js` - Standard terminal service (non-tmux fallback)
- `project-service.js` - Project file and directory management
- `file-service.js` - File system operations and file watching

**API Routes:**
- `/api/status` - API health and status information
- `/api/projects` - Project management operations (CRUD)
- `/api/claude` - Claude AI integration endpoints
- `/api/system` - System monitoring and information

**Real-time Communication:**
- Socket.IO handlers in `socket-handler.js` manage WebSocket connections
- Event-driven architecture for terminal I/O, project updates, and system monitoring
- Multi-session support with auto-reconnection handling

**Tmux Session Management:**
- Sessions follow naming convention: `claude-web-{projectId}-{timestamp}`
- Real-time discovery using `tmux list-sessions` commands
- No metadata files - tmux serves as single source of truth
- Automatic session detection and reconnection across devices
- Session persistence survives application restarts and network interruptions

### Client Architecture
- Pure HTML/CSS/JavaScript frontend (no framework dependencies)
- xterm.js for browser-based terminal interface
- Socket.IO client for real-time communication
- Simplified responsive design with dark theme
- Streamlined interface with core components:
  - Project selection sidebar
  - Terminal interface
  - Basic connection status display

### Configuration
- `config/default.json` - Base configuration (development defaults)
- `config/production.json` - Production overrides
- `ecosystem.config.js` - PM2 deployment configuration

Key configuration areas:
- Server settings (port, host, CORS)
- Claude executable path and session management
- Terminal appearance and behavior
- WebSocket timeouts and buffer sizes
- Authentication and security settings
- Logging levels and file locations

### Security Features
- Optional authentication system (disabled by default)
- Rate limiting middleware
- CORS configuration
- Security headers via Helmet
- Input validation with Joi
- Session management for authenticated users

### File Structure
```
server/
├── app.js              # Main Express application
├── socket-handler.js   # WebSocket event handling
├── middleware/         # Auth, CORS, error handling
├── routes/             # API endpoint definitions
│   ├── api.js         # General API routes
│   ├── claude.js      # Claude AI integration
│   ├── projects.js    # Project management
│   └── system.js      # System monitoring
├── services/          # Core business logic
│   ├── claude-manager.js    # Claude AI session management
│   ├── terminal-service.js  # Terminal session handling
│   ├── project-service.js   # Project operations
│   └── file-service.js      # File system operations
└── utils/             # Logging, constants, validation

public/
├── index.html         # Main application page
└── assets/
    ├── css/          # Stylesheets
    ├── js/           # Client-side JavaScript
    └── libs/         # External libraries (xterm.js, socket.io)

config/               # Configuration files
logs/                # Application logs
```

### Raspberry Pi Optimizations
The application includes specific optimizations for Raspberry Pi deployment:
- Memory limit set to 200MB in PM2 configuration
- Node.js optimizations: `--max-old-space-size=128 --optimize-for-size`
- PM2 process management for production stability
- Graceful shutdown handling and automatic restart on crashes

## Development Guidelines

### Bug Fixing Process
在修复任何BUG之前，都需要先在./bug_fix文件夹中创建***_bug_fix_plan.md计划文件，然后一一按照步骤解决

### Testing Guidelines
测试时不要编写测试脚本，永远使用playwright直接调用浏览器进行测试

### Code Standards
- Follow existing patterns in the codebase
- Use the established service layer architecture
- Maintain separation between client and server code
- Follow security best practices for web applications
- Use Winston for all logging operations
- Validate inputs using Joi schema validation

### Architecture Design Principles
- **Single Source of Truth**: Avoid data duplication by using authoritative systems directly (e.g., tmux for session state)
- **Real-time Discovery**: Query live system state rather than maintaining cached metadata
- **Naming Conventions**: Use structured naming patterns to eliminate need for separate mapping files
- **Simplify Dependencies**: Remove redundant file I/O when system commands provide the same information
- **Async-First Design**: Make methods async when they involve external system calls for better performance

### Core Dependencies
- **express**: Web framework
- **socket.io**: Real-time communication
- **node-pty**: Terminal process management
- **chokidar**: File watching
- **fs-extra**: Enhanced file system operations
- **winston**: Logging framework
- **helmet**: Security middleware
- **joi**: Input validation

## Feature Updates

- 新增功能：将项目的新功能加入到claude.md中，以便跟踪项目演进和特性更新
- **Tmux Integration (2025-07-02)**: Added persistent terminal sessions using tmux
  - Sessions persist across browser/device changes
  - Automatic session discovery and reconnection
  - Cross-device session continuation
  - Session management UI with Ctrl+Shift+S shortcut
  - Optional feature controlled by config/terminal.tmux.enabled

- **Tmux Session Management Optimization (2025-07-08)**: Major refactor to eliminate json file dependency
  - Removed redundant tmux-sessions.json file and related I/O operations
  - Implemented real-time session discovery using tmux commands directly
  - Sessions now use tmux as single source of truth following naming convention: `claude-web-{projectId}-{timestamp}`
  - Simplified architecture reduces code complexity by ~100 lines
  - Eliminated data synchronization issues between json file and actual tmux state
  - Improved reliability and performance by removing file system dependencies
  - Maintained full API compatibility while making core methods async where needed