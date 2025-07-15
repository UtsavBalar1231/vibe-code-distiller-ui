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
- `terminal-service-wrapper.js` - Wrapper service for terminal session management
- `project-service.js` - Project file and directory management
- `file-service.js` - File system operations and file watching

**API Routes:**
- `/api/status` - API health and status information
- `/api/projects` - Project management operations (CRUD)
- `/api/claude` - Claude AI integration endpoints
- `/api/system` - System monitoring and information
- `/api/files` - File management operations (upload/download)
- `/api/images` - Image management and preview

**Real-time Communication:**
- Socket.IO handlers in `socket-handler.js` manage WebSocket connections
- Event-driven architecture for terminal I/O, project updates, and system monitoring
- Multi-session support with auto-reconnection handling
- Real-time system monitoring (CPU, temperature, memory usage)

**Tmux Session Management:**
- Sessions follow naming convention: `claude-web-{projectId}-{timestamp}`
- Real-time discovery using `tmux list-sessions` commands
- No metadata files - tmux serves as single source of truth
- Automatic session detection and reconnection across devices
- Session persistence survives application restarts and network interruptions
- Enhanced terminal session management with improved input handling

### Client Architecture
- Pure HTML/CSS/JavaScript frontend (no framework dependencies)
- xterm.js for browser-based terminal interface with web links addon
- Socket.IO client for real-time communication
- Responsive design optimized for mobile and desktop
- Modern interface with comprehensive features:
  - Project selection sidebar with resize functionality
  - Terminal interface with multi-session support
  - File management with drag-and-drop upload
  - Image manager with preview capabilities
  - System monitoring dashboard
  - Notification system with browser integration
  - Authentication modal (when enabled)
  - Mobile-optimized navigation

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
│   ├── system.js      # System monitoring
│   ├── files.js       # File management operations
│   └── images.js      # Image management operations
├── services/          # Core business logic
│   ├── claude-manager.js         # Claude AI session management
│   ├── terminal-service.js       # Standard terminal service
│   ├── terminal-service-tmux.js  # Tmux-based terminal service
│   ├── terminal-service-wrapper.js # Terminal service wrapper
│   ├── project-service.js        # Project operations
│   └── file-service.js           # File system operations
└── utils/             # Logging, constants, validation

public/
├── index.html         # Main application page
└── assets/
    ├── css/          # Stylesheets (main.css, components.css, terminal.css)
    ├── js/           # Client-side JavaScript modules
    │   ├── app.js           # Main application logic
    │   ├── socket-client.js # Socket.IO client handling
    │   ├── terminal.js      # Terminal interface
    │   ├── project-manager.js # Project management UI
    │   ├── file-manager.js    # File management UI
    │   ├── image-manager.js   # Image management UI
    │   ├── vertical-divider.js # Sidebar resizing
    │   ├── sidebar-divider.js  # Sidebar panel divider
    │   └── utils.js           # Utility functions
    ├── libs/         # External libraries (xterm.js, socket.io)
    └── icons/        # Application icons

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

### Core Features (2025-07-02 - Present)
- **Tmux Integration**: Added persistent terminal sessions using tmux
  - Sessions persist across browser/device changes
  - Automatic session discovery and reconnection
  - Cross-device session continuation
  - Automatic session restoration after reconnection
  - Optional feature controlled by config/terminal.tmux.enabled

- **Enhanced Terminal Management**: Comprehensive terminal session handling
  - Multiple terminal sessions per project
  - Terminal restart functionality
  - Independent terminal session management
  - Improved input handling and state restoration
  - Enhanced logging for better debugging

- **File Management System**: Complete file operations interface
  - Drag-and-drop file upload
  - File preview modal with error handling
  - Download functionality for individual files and projects
  - Double-click file path to terminal integration
  - Comprehensive file browser replacing basic file listing

- **Image Management**: Dedicated image handling capabilities
  - Image preview and management interface
  - Support for common image formats
  - Integration with file management system

- **System Monitoring**: Real-time system resource tracking
  - CPU usage monitoring
  - Temperature monitoring for Raspberry Pi
  - Memory usage tracking
  - Live system statistics display

- **Notification System**: Browser-integrated notification support
  - Desktop notifications for important events
  - Notification toggle functionality
  - Permission request handling

- **Mobile Optimization**: Enhanced mobile device support
  - Responsive interface design
  - Mobile-friendly navigation
  - Touch-optimized controls
  - Sidebar resize functionality

- **UI Enhancements**: Improved user interface components
  - Resizable sidebar with vertical divider
  - Project options dropdown with new terminal creation
  - Enhanced breadcrumb navigation
  - Dark theme optimization

### Architecture Improvements (2025-07-08)
- **Tmux Session Management Optimization**: Major refactor to eliminate json file dependency
  - Removed redundant tmux-sessions.json file and related I/O operations
  - Implemented real-time session discovery using tmux commands directly
  - Sessions now use tmux as single source of truth following naming convention: `claude-web-{projectId}-{timestamp}`
  - Simplified architecture reduces code complexity by ~100 lines
  - Eliminated data synchronization issues between json file and actual tmux state
  - Improved reliability and performance by removing file system dependencies
  - Maintained full API compatibility while making core methods async where needed

- **Enhanced Socket Communication**: Improved real-time communication
  - Better error handling for socket events
  - Connection state tracking and auto-reconnection
  - Project room management for multi-user scenarios
  - Enhanced authentication middleware for Socket.IO