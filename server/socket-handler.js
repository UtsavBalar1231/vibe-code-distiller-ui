const logger = require('./utils/logger');
const { WEBSOCKET, ERROR_CODES } = require('./utils/constants');
const claudeManager = require('./services/claude-manager');
const projectService = require('./services/project-service');
const fileService = require('./services/file-service');

class SocketManager {
  constructor(io) {
    this.io = io;
    this.connections = new Map();
    this.projectRooms = new Map();
    this.setupNamespace();
  }

  setupNamespace() {
    // Authentication middleware for Socket.IO
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (process.env.ENABLE_AUTH === 'true' && !token) {
        return next(new Error('Authentication required'));
      }
      
      // Store socket metadata
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
    logger.socket('Client connected', socket.id, socket.metadata);
    
    // Store connection
    this.connections.set(socket.id, socket);
    
    // Send connection confirmation
    socket.emit(WEBSOCKET.EVENTS.CONNECTED, {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      serverVersion: '1.0.0'
    });

    // Set up event handlers
    this.setupSocketEvents(socket);

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, reason);
    });
  }

  setupSocketEvents(socket) {
    // Health check events
    socket.on('ping', () => {
      socket.emit('pong');
    });
    
    // Project management events
    socket.on(WEBSOCKET.EVENTS.JOIN_PROJECT, (data) => {
      this.handleJoinProject(socket, data);
    });

    socket.on(WEBSOCKET.EVENTS.LEAVE_PROJECT, (data) => {
      this.handleLeaveProject(socket, data);
    });

    socket.on('terminal:create-project-session', (data) => {
      this.handleCreateProjectSession(socket, data);
    });
    
    socket.on('terminal:delete-session', (data) => {
      this.handleDeleteSession(socket, data);
    });
    
    socket.on('terminal:switch-session', (data) => {
      this.handleSwitchSession(socket, data);
    });

    // Claude Code events
    socket.on(WEBSOCKET.EVENTS.CLAUDE_COMMAND, (data) => {
      this.handleClaudeCommand(socket, data);
    });

    // Project action events
    socket.on(WEBSOCKET.EVENTS.PROJECT_ACTION, (data) => {
      this.handleProjectAction(socket, data);
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

  async handleJoinProject(socket, data) {
    try {
      const { projectId } = data;
      
      if (!projectId) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID required' });
        return;
      }

      // Check if already in this project room
      const socketRooms = Array.from(socket.rooms);
      if (socketRooms.includes(`project-${projectId}`) && socket.metadata.projectId === projectId) {
        // Already connected, just send status
        const project = await projectService.getProject(projectId);
        socket.emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
          projectId,
          status: 'already_connected',
          project: {
            id: project.id,
            name: project.name,
            type: project.type,
            language: project.language
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate project exists
      const project = await projectService.getProject(projectId);
      
      // Leave current project if any
      if (socket.metadata.projectId) {
        await this.handleLeaveProject(socket, { projectId: socket.metadata.projectId });
      }

      // Join project room
      socket.join(`project-${projectId}`);
      socket.metadata.projectId = projectId;
      
      // Track room membership
      if (!this.projectRooms.has(projectId)) {
        this.projectRooms.set(projectId, new Set());
      }
      this.projectRooms.get(projectId).add(socket.id);
      
      logger.socket('Joined project room', socket.id, { projectId });

      // Set up project-specific integrations
      await this.setupProjectIntegration(socket, projectId, project);
      
      // Send project status
      socket.emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
        projectId,
        status: 'connected',
        project: {
          id: project.id,
          name: project.name,
          type: project.type,
          language: project.language
        },
        timestamp: new Date().toISOString()
      });

      // Notify other clients in the room
      socket.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.NOTIFICATION, {
        type: 'user_joined',
        message: 'A user joined the project',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to join project:', { socketId: socket.id, error: error.message });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to join project',
        details: error.message
      });
    }
  }

  async setupProjectIntegration(socket, projectId, project) {
    try {
      // Check if Claude session exists
      const claudeStatus = claudeManager.getSessionStatus(projectId);

      // Set up Claude session callbacks if session exists
      if (claudeStatus.exists) {
        claudeManager.setupSessionCallbacks(projectId, {
          onOutput: (data, stream) => {
            socket.emit(WEBSOCKET.EVENTS.CLAUDE_RESPONSE, {
              projectId,
              data,
              stream,
              timestamp: new Date().toISOString()
            });
          },
          onError: (error) => {
            socket.emit(WEBSOCKET.EVENTS.ERROR, {
              message: 'Claude session error',
              details: error.message,
              projectId
            });
          },
          onExit: (code, signal) => {
            socket.emit(WEBSOCKET.EVENTS.NOTIFICATION, {
              type: 'claude_session_ended',
              message: `Claude session ended (code: ${code})`,
              projectId,
              timestamp: new Date().toISOString()
            });
          }
        });
      }

      // NOTE: Terminal sessions are now completely decoupled from projects
      // Users must manually attach to terminal sessions using session names
      // This allows multiple terminals per project and cross-project session sharing
      
      // Mark project as ready immediately since terminal attachment is separate
      setTimeout(() => {
        socket.emit('project-ready', {
          projectId,
          timestamp: new Date().toISOString()
        });
      }, 100);

      // Set up file watching
      fileService.startWatching(project.path, projectId, {
        onChange: (filePath) => {
          socket.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.NOTIFICATION, {
            type: 'file_changed',
            message: `File changed: ${filePath}`,
            filePath,
            projectId,
            timestamp: new Date().toISOString()
          });
        },
        onAdd: (filePath) => {
          socket.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.NOTIFICATION, {
            type: 'file_added',
            message: `File added: ${filePath}`,
            filePath,
            projectId,
            timestamp: new Date().toISOString()
          });
        },
        onRemove: (filePath) => {
          socket.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.NOTIFICATION, {
            type: 'file_removed',
            message: `File removed: ${filePath}`,
            filePath,
            projectId,
            timestamp: new Date().toISOString()
          });
        }
      });

      logger.debug('Project integration set up:', { projectId, socketId: socket.id });

    } catch (error) {
      logger.error('Failed to setup project integration:', { 
        projectId, 
        socketId: socket.id, 
        error: error.message 
      });
    }
  }

  async handleLeaveProject(socket, data) {
    try {
      const { projectId } = data;
      const currentProjectId = projectId || socket.metadata.projectId;
      
      if (!currentProjectId) {
        return;
      }

      // Leave project room
      socket.leave(`project-${currentProjectId}`);
      
      // Update room membership
      if (this.projectRooms.has(currentProjectId)) {
        this.projectRooms.get(currentProjectId).delete(socket.id);
        
        // Clean up empty rooms
        if (this.projectRooms.get(currentProjectId).size === 0) {
          this.projectRooms.delete(currentProjectId);
          
          // Stop file watching if no one is watching the project
          fileService.stopWatching(currentProjectId);
        }
      }
      
      socket.metadata.projectId = null;
      
      logger.socket('Left project room', socket.id, { projectId: currentProjectId });

      // Notify other clients
      socket.to(`project-${currentProjectId}`).emit(WEBSOCKET.EVENTS.NOTIFICATION, {
        type: 'user_left',
        message: 'A user left the project',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to leave project:', { socketId: socket.id, error: error.message });
    }
  }




  async handleClaudeCommand(socket, data) {
    try {
      const { projectId, command, context } = data;
      
      if (!projectId || !command) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID and command required' });
        return;
      }

      // Check if socket is in the project room
      const socketRooms = Array.from(socket.rooms);
      const isInProjectRoom = socketRooms.includes(`project-${projectId}`);
      
      if (!isInProjectRoom) {
        // Auto-rejoin the project if possible
        try {
          await this.handleJoinProject(socket, { projectId });
        } catch (joinError) {
          socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Not connected to project' });
          return;
        }
      }

      // Update metadata if it's out of sync
      if (socket.metadata.projectId !== projectId) {
        socket.metadata.projectId = projectId;
      }

      // Send command to Claude
      const result = await claudeManager.sendCommand(projectId, command, context);
      
      logger.socket('Claude command processed', socket.id, { 
        projectId, 
        commandLength: command.length 
      });

      // Send acknowledgment
      socket.emit(WEBSOCKET.EVENTS.CLAUDE_RESPONSE, {
        projectId,
        type: 'command_sent',
        result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to process Claude command:', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to process Claude command',
        details: error.message
      });
    }
  }

  async handleProjectAction(socket, data) {
    try {
      const { projectId, action, payload } = data;
      
      if (!projectId || !action) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID and action required' });
        return;
      }

      logger.socket('Project action received', socket.id, { projectId, action });

      switch (action) {
        case 'start_claude':
          await this.handleStartClaude(socket, projectId, payload);
          break;
        case 'stop_claude':
          await this.handleStopClaude(socket, projectId, payload);
          break;
        // Terminal creation/destruction is now handled by ttyd iframe
        // No additional server-side terminal management needed
        default:
          socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Unknown action' });
      }

    } catch (error) {
      logger.error('Failed to process project action:', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to process project action',
        details: error.message
      });
    }
  }

  async handleStartClaude(socket, projectId, payload) {
    const project = await projectService.getProject(projectId);
    
    const sessionResult = await claudeManager.startSession(projectId, project.path, payload);
    
    // Set up callbacks for real-time communication
    await this.setupProjectIntegration(socket, projectId, project);
    
    // Notify all clients in the project room
    this.io.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
      projectId,
      status: 'claude_started',
      session: sessionResult,
      timestamp: new Date().toISOString()
    });
  }

  async handleStopClaude(socket, projectId, payload) {
    const force = payload?.force || false;
    
    await claudeManager.stopSession(projectId, force);
    
    
    // Notify all clients in the project room
    this.io.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
      projectId,
      status: 'claude_stopped',
      timestamp: new Date().toISOString()
    });
  }

  // Terminal creation/destruction is now handled by ttyd iframe
  // Removed handleCreateTerminal and handleDestroyTerminal methods

  handleDisconnect(socket, reason) {
    logger.socket('Client disconnected', socket.id, { 
      reason, 
      duration: Date.now() - socket.metadata.connectedAt,
      projectId: socket.metadata.projectId
    });
    
    // Leave project room if connected
    if (socket.metadata.projectId) {
      this.handleLeaveProject(socket, { projectId: socket.metadata.projectId });
    }
    
    // Terminal rooms are no longer used with ttyd iframe architecture
    
    // Remove from connections
    this.connections.delete(socket.id);
  }

  // Utility methods
  async verifyProjectConnection(socket, projectId) {
    const socketRooms = Array.from(socket.rooms);
    const isInProjectRoom = socketRooms.includes(`project-${projectId}`);
    
    if (!isInProjectRoom) {
      // Try to auto-rejoin
      try {
        await this.handleJoinProject(socket, { projectId });
        return true;
      } catch (error) {
        logger.error('Failed to auto-rejoin project:', { 
          socketId: socket.id, 
          projectId, 
          error: error.message 
        });
        return false;
      }
    }
    
    // Update metadata if needed
    if (socket.metadata.projectId !== projectId) {
      socket.metadata.projectId = projectId;
    }
    
    return true;
  }

  broadcastToProject(projectId, event, data) {
    this.io.to(`project-${projectId}`).emit(event, data);
  }

  async handleCreateProjectSession(socket, data) {
    try {
      const { projectName, projectPath, cols = 80, rows = 24, sessionName: providedSessionName } = data;
      
      logger.info('🔧 Received create project session request:', { 
        socketId: socket.id, 
        projectName, 
        projectPath, 
        providedSessionName,
        cols, 
        rows 
      });
      
      // If sessionName is provided directly, use it; otherwise use projectName
      let sessionName;
      let sequenceNumber = null;
      
      if (providedSessionName) {
        sessionName = providedSessionName;
        logger.info('🎯 Using provided session name:', { sessionName });
      } else {
        if (!projectName) {
          logger.warn('❌ Project name missing in create session request');
          socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project name or session name required' });
          return;
        }
        
        // Get next sequence number for this project
        const TmuxUtils = require('./utils/tmux-utils');
        sequenceNumber = await TmuxUtils.getNextSequenceNumber(projectName);
        
        // Generate session name using project name and sequence number
        sessionName = `claude-web-${projectName}-${sequenceNumber}`;
        logger.info('🎯 Generated session name:', { sessionName, projectName, sequenceNumber });
      }
      
      logger.info('Creating new tmux session:', { 
        socketId: socket.id, 
        sessionName,
        projectPath, 
        cols, 
        rows 
      });
      
      // Actually create the tmux session
      const TmuxUtils = require('./utils/tmux-utils');
      
      // Check if session already exists
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      if (sessionExists) {
        logger.warn('⚠️ Session already exists:', { sessionName });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: `Session ${sessionName} already exists` });
        return;
      }
      
      // Create the tmux session
      const createResult = await TmuxUtils.createSession(sessionName, projectPath);
      
      if (createResult) {
        logger.info('✅ Tmux session created successfully:', { sessionName, projectPath });
        
        // Broadcast session creation event to all clients
        const eventData = {
          sessionName,
          projectName: projectName || 'direct',
          sequenceNumber,
          timestamp: Date.now()
        };
        
        logger.info('📡 Broadcasting terminal:session-created event:', eventData);
        this.io.emit('terminal:session-created', eventData);
        
        logger.info('🎉 Project session created successfully:', { 
          socketId: socket.id, 
          sessionName,
          projectName: projectName || 'direct',
          sequenceNumber
        });
      } else {
        logger.error('❌ Failed to create tmux session:', { sessionName });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Failed to create tmux session' });
      }
      
    } catch (error) {
      logger.error('❌ Failed to create project session:', { 
        socketId: socket.id, 
        projectName: data.projectName, 
        error: error.message,
        stack: error.stack
      });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to create project session',
        details: error.message
      });
    }
  }
  
  async handleDeleteSession(socket, data) {
    try {
      const { sessionName } = data;
      
      logger.info('Delete session request received:', { sessionName, socketId: socket.id });
      
      if (!sessionName) {
        logger.warn('Delete session request missing sessionName:', { socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Session name required' });
        return;
      }
      
      // Validate session name format
      if (!sessionName.startsWith('claude-web-')) {
        logger.warn('Invalid session name format:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Invalid session name format' });
        return;
      }
      
      // Check if session exists before trying to delete
      const TmuxUtils = require('./utils/tmux-utils');
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      
      if (!sessionExists) {
        logger.warn('Session does not exist:', { sessionName, socketId: socket.id });
        // Still broadcast deletion event since session is effectively gone
        this.io.emit('terminal:session-deleted', { sessionName, success: true });
        return;
      }
      
      // Delete the tmux session
      logger.info('Deleting tmux session:', { sessionName, socketId: socket.id });
      const result = await TmuxUtils.killSession(sessionName);
      
      if (result) {
        logger.info('Session deleted successfully:', { sessionName, socketId: socket.id });
        
        // Terminal service session destruction is now handled by ttyd/iframe architecture
        // No need to destroy terminal service sessions as they are managed by ttyd
        
        // Broadcast to all clients that the session was deleted
        this.io.emit('terminal:session-deleted', { sessionName, success: true });
      } else {
        logger.error('Failed to delete session:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Failed to delete session',
          details: 'Tmux session deletion returned false'
        });
      }
      
    } catch (error) {
      logger.error('Error deleting session:', { 
        sessionName: data.sessionName,
        socketId: socket.id, 
        error: error.message,
        stack: error.stack
      });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to delete session',
        details: error.message
      });
    }
  }
  
  async handleSwitchSession(socket, data) {
    try {
      const { sessionName, currentSessionName } = data;
      
      logger.info('Switch session request received:', { 
        sessionName, 
        currentSessionName, 
        socketId: socket.id 
      });
      
      if (!sessionName) {
        logger.warn('Switch session request missing sessionName:', { socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Session name required' });
        return;
      }
      
      // Validate session name format
      if (!sessionName.startsWith('claude-web-')) {
        logger.warn('Invalid session name format:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Invalid session name format' });
        return;
      }
      
      // Check if session exists
      const TmuxUtils = require('./utils/tmux-utils');
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      
      if (!sessionExists) {
        logger.warn('Session does not exist:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Session does not exist' });
        return;
      }
      
      // Switch to the session with current session context
      logger.info('Switching to tmux session:', { sessionName, currentSessionName, socketId: socket.id });
      const result = await TmuxUtils.switchToSession(sessionName, currentSessionName);
      
      if (result) {
        logger.info('Session switched successfully:', { sessionName, socketId: socket.id });
        
        // Broadcast to all clients that a session was switched
        this.io.emit('terminal:session-switched', { 
          sessionName, 
          currentSessionName,
          success: true
        });
        
        // No need to send separately to the requesting client as they will receive the broadcast
      } else {
        logger.error('Failed to switch session:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Failed to switch session',
          details: 'Session exists but switch failed'
        });
      }
      
    } catch (error) {
      logger.error('Error switching session:', { 
        sessionName: data.sessionName,
        socketId: socket.id, 
        error: error.message,
        stack: error.stack
      });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to switch session',
        details: error.message
      });
    }
  }

  broadcastSystemStatus() {
    const stats = {
      timestamp: new Date().toISOString(),
      connectedClients: this.connections.size,
      activeProjects: this.projectRooms.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    this.io.emit(WEBSOCKET.EVENTS.SYSTEM_STATUS, stats);
  }

  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      activeProjects: this.projectRooms.size,
      projectRooms: Array.from(this.projectRooms.keys()),
      connections: Array.from(this.connections.keys())
    };
  }
}

// Factory function for socket handler setup
function setupSocketHandlers(io) {
  const socketManager = new SocketManager(io);
  
  // Broadcast system status periodically
  setInterval(() => {
    socketManager.broadcastSystemStatus();
  }, 30000); // Every 30 seconds

  // Store socket manager on io instance for external access
  io.socketManager = socketManager;
  
  logger.system('Socket.IO handlers initialized with full integration');
  
  return socketManager;
}

module.exports = setupSocketHandlers;