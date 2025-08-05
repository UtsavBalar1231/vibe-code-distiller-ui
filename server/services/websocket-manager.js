const logger = require('../utils/logger');
const { WEBSOCKET } = require('../utils/constants');
const ConnectionManager = require('./websocket/connection-manager');
const ProjectHandler = require('./websocket/project-handler');
const TerminalHandler = require('./websocket/terminal-handler');

class SocketManager {
  constructor(io) {
    this.io = io;
    this.connectionManager = new ConnectionManager();
    this.projectHandler = new ProjectHandler(this.connectionManager);
    this.terminalHandler = new TerminalHandler();
    this.setupNamespace();
  }

  setupNamespace() {
    this.io.use((socket, next) => {
      socket.metadata = {
        ip: socket.request.connection.remoteAddress,
        userAgent: socket.request.headers['user-agent'],
        connectedAt: Date.now(),
        projectId: null
      };
      
      next();
    });

    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.system('Socket.IO manager initialized');
  }

  handleConnection(socket) {
    this.connectionManager.handleConnection(socket, this.io);
    this.setupSocketEvents(socket);

    socket.on('disconnect', (reason) => {
      this.connectionManager.handleDisconnect(socket, reason, this.io);
    });
  }

  setupSocketEvents(socket) {
    // Health check events
    socket.on('ping', () => {
      socket.emit('pong');
    });
    
    // Project management events - delegate to ConnectionManager
    socket.on(WEBSOCKET.EVENTS.JOIN_PROJECT, (data) => {
      this.connectionManager.handleJoinProject(socket, data, this.io);
    });

    socket.on(WEBSOCKET.EVENTS.LEAVE_PROJECT, (data) => {
      this.connectionManager.handleLeaveProject(socket, data, this.io);
    });

    // Terminal session events - delegate to TerminalHandler
    socket.on('terminal:create-project-session', (data) => {
      this.terminalHandler.handleCreateProjectSession(socket, data, this.io);
    });
    
    socket.on('terminal:delete-session', (data) => {
      this.terminalHandler.handleDeleteSession(socket, data, this.io);
    });
    
    socket.on('terminal:switch-session', (data) => {
      this.terminalHandler.handleSwitchSession(socket, data, this.io);
    });

    // Terminal scroll events - delegate to TerminalHandler
    socket.on(WEBSOCKET.EVENTS.TERMINAL_SCROLL, (data) => {
      this.terminalHandler.handleTerminalScroll(socket, data, this.io);
    });
    
    socket.on(WEBSOCKET.EVENTS.TERMINAL_GO_TO_BOTTOM, (data) => {
      this.terminalHandler.handleTerminalGoToBottom(socket, data, this.io);
    });

    // Claude Code events - delegate to ProjectHandler
    socket.on(WEBSOCKET.EVENTS.CLAUDE_COMMAND, (data) => {
      this.projectHandler.handleClaudeCommand(socket, data, this.io);
    });

    // Project action events - delegate to ProjectHandler
    socket.on(WEBSOCKET.EVENTS.PROJECT_ACTION, (data) => {
      this.projectHandler.handleProjectAction(socket, data, this.io);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error:', {
        socketId: socket.id,
        error: error.message,
        stack: error.stack
      });
    });
  }

  // Delegate to ConnectionManager
  broadcastToProject(projectId, event, data) {
    this.connectionManager.broadcastToProject(projectId, event, data, this.io);
  }

  broadcastSystemStatus() {
    const stats = {
      timestamp: new Date().toISOString(),
      connectedClients: this.connectionManager.connections.size,
      activeProjects: this.connectionManager.projectRooms.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    this.io.emit(WEBSOCKET.EVENTS.SYSTEM_STATUS, stats);
  }

  getConnectionStats() {
    return this.connectionManager.getConnectionStats();
  }
}

// Factory function for socket handler setup
function setupSocketHandlers(io) {
  const socketManager = new SocketManager(io);
  
  // Broadcast system status periodically (optimized for Raspberry Pi)
  setInterval(() => {
    // Only broadcast if there are connected clients to save resources
    if (io.engine.clientsCount > 0) {
      socketManager.broadcastSystemStatus();
    }
  }, 60000); // Every 60 seconds (reduced frequency for better performance)

  // Store socket manager on io instance for external access
  io.socketManager = socketManager;
  
  logger.system('Socket.IO handlers initialized with full integration');
  
  return socketManager;
}

module.exports = setupSocketHandlers;