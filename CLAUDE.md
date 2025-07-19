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
- TTYd (for terminal interface)
- Supported on Linux/macOS with ARM64/x64 architectures

## Architecture

### Server Architecture
The application follows a layered service architecture built on Express.js:

**Core Services:**
- `claude-manager.js` - Manages Claude AI CLI sessions and processes
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
- Event-driven architecture for project updates, system monitoring, and notifications
- Multi-session support with auto-reconnection handling
- Real-time system monitoring (CPU, temperature, memory usage)

**Terminal Integration:**
- TTYd service running on port 7681 provides web-based terminal interface
- HTTP proxy at `/terminal` route forwards requests to TTYd
- Manual WebSocket upgrade handling to prevent conflicts with Socket.IO
- iframe-based terminal embedding for seamless integration

**Tmux Session Management:**
- Sessions follow naming convention: `claude-web-{projectId}-{timestamp}`
- Real-time discovery using `tmux list-sessions` commands
- No metadata files - tmux serves as single source of truth
- Automatic session detection and reconnection across devices
- Session persistence survives application restarts and network interruptions

### Client Architecture
- Pure HTML/CSS/JavaScript frontend (no framework dependencies)
- TTYd iframe for browser-based terminal interface
- Socket.IO client for real-time communication (separated from terminal WebSocket)
- Responsive design optimized for mobile and desktop
- Modern interface with comprehensive features:
  - Project selection sidebar with resize functionality
  - Terminal interface via iframe integration
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
├── app.js              # Main Express application with TTYd proxy
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
│   ├── claude-manager.js # Claude AI session management
│   ├── project-service.js # Project operations
│   └── file-service.js    # File system operations
└── utils/             # Logging, constants, validation, tmux utilities

public/
├── index.html         # Main application page
└── assets/
    ├── css/          # Stylesheets (main.css, components.css, terminal.css)
    ├── js/           # Client-side JavaScript modules
    │   ├── app.js           # Main application logic
    │   ├── socket-client.js # Socket.IO client handling
    │   ├── terminal-ttyd.js # TTYd terminal interface
    │   ├── project-manager.js # Project management UI
    │   ├── file-manager.js    # File management UI
    │   ├── image-manager.js   # Image management UI
    │   ├── vertical-divider.js # Sidebar resizing
    │   ├── sidebar-divider.js  # Sidebar panel divider
    │   └── utils.js           # Utility functions
    ├── libs/         # External libraries (socket.io)
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
- **Separation of Concerns**: Keep WebSocket handlers separate for different services (Socket.IO vs TTYd)

### Core Dependencies
- **express**: Web framework
- **socket.io**: Real-time communication
- **http-proxy-middleware**: TTYd proxy integration
- **chokidar**: File watching
- **fs-extra**: Enhanced file system operations
- **winston**: Logging framework
- **helmet**: Security middleware
- **joi**: Input validation

## Feature Updates

- 新增功能：将项目的新功能加入到claude.md中，以便跟踪项目演进和特性更新

### Core Features (2025-07-02 - Present)
- **TTYd Integration**: Web-based terminal interface using TTYd + iframe
  - Direct terminal access without complex WebSocket handling
  - Seamless integration with existing application
  - Cross-device session continuation via tmux
  - Automatic session restoration after reconnection
  - Simple and reliable terminal interface

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

### Terminal Architecture Revolution (2025-07-18)
- **TTYd Migration**: Complete migration from xterm.js to TTYd + iframe architecture
  - **Problem Solved**: Eliminated complex WebSocket handling and session management
  - **Technology Stack**: Replaced xterm.js + node-pty with TTYd + iframe
  - **Benefits**: Simplified codebase, improved reliability, native terminal experience
  - **WebSocket Conflict Resolution**: Separated Socket.IO and TTYd WebSocket handling
  - **Code Reduction**: Removed ~500 lines of terminal-related code
  - **Improved Stability**: Eliminated xterm.js rendering issues and connection problems

- **WebSocket Architecture Optimization**: Resolved WebSocket upgrade conflicts
  - **Root Cause**: TTYd proxy WebSocket upgrades conflicted with Socket.IO
  - **Solution**: Manual WebSocket upgrade handling with path-based routing
  - **Implementation**: Server-side upgrade event handling for `/terminal` vs `/socket.io`
  - **Result**: Stable WebSocket connections for both services
  - **Lesson**: Always separate WebSocket upgrade handling when multiple services need WebSocket

- **Codebase Cleanup**: Systematic removal of legacy code
  - Removed all wetty-related files and dependencies
  - Cleaned up terminal service abstractions
  - Simplified proxy configuration
  - Eliminated redundant terminal management code
  - Renamed files to reflect new architecture

## Architecture Optimization Lessons

### TTYd Integration Success (2025-07-18)

**问题识别**: xterm.js + node-pty 架构过于复杂，存在WebSocket冲突和渲染问题
**解决方案**: 迁移到TTYd + iframe架构，简化终端集成

#### 重构收益
- **架构简化**: 移除复杂的terminal service层，减少~500行代码
- **稳定性提升**: 消除xterm.js的渲染问题和WebSocket冲突
- **用户体验**: 获得原生terminal体验，无需复杂的前端渲染
- **维护成本**: 大幅降低terminal相关代码的维护复杂度

#### 技术实现
- **TTYd服务**: 在7681端口提供web终端服务
- **HTTP代理**: `/terminal` 路由代理到TTYd
- **iframe集成**: 前端通过iframe嵌入TTYd界面
- **WebSocket分离**: 手动处理WebSocket升级，避免与Socket.IO冲突

#### 关键突破
- **WebSocket冲突解决**: 发现并解决Socket.IO与TTYd代理的WebSocket升级冲突
- **路径过滤**: 实现基于路径的WebSocket升级路由
- **架构分离**: 将终端功能与应用业务逻辑完全分离

#### 设计原则
1. **简单胜过复杂**: 选择成熟的TTYd而非自建terminal方案
2. **关注点分离**: 将terminal功能与应用核心功能分离
3. **问题隔离**: 通过iframe隔离terminal相关的潜在问题
4. **冲突预防**: 提前考虑不同服务间的WebSocket冲突

#### 经验总结
- **架构选择**: 有时候"删除代码"比"添加代码"更有价值
- **服务分离**: 复杂功能应该考虑使用专门的服务而非自建
- **WebSocket管理**: 多个WebSocket服务需要仔细管理升级事件
- **测试驱动**: 通过实际测试发现并解决真实问题

这次重构是一个很好的"从复杂到简单"的案例，证明了选择合适的技术栈可以大幅降低系统复杂度。

## Future Optimization Opportunities
- 考虑为其他复杂功能也采用类似的"服务分离"模式
- 评估是否有其他地方可以用成熟的第三方服务替代自建方案
- 持续关注系统的架构简洁性和服务边界清晰度
- 继续优化移动端体验和响应式设计
- 考虑增加更多的系统监控指标

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.