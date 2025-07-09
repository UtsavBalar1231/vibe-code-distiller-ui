const logger = require('./utils/logger');
const { WEBSOCKET, ERROR_CODES } = require('./utils/constants');
const claudeManager = require('./services/claude-manager');
const terminalService = require('./services/terminal-service-wrapper');
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

    // Terminal events
    socket.on(WEBSOCKET.EVENTS.TERMINAL_INPUT, (data) => {
      this.handleTerminalInput(socket, data);
    });

    socket.on(WEBSOCKET.EVENTS.TERMINAL_RESIZE, (data) => {
      this.handleTerminalResize(socket, data);
    });

    socket.on('terminal-restart', (data) => {
      this.handleTerminalRestart(socket, data);
    });

    // Tmux session events
    socket.on('terminal:list-sessions', (data) => {
      this.handleListSessions(socket, data);
    });

    socket.on('terminal:detach-session', (data) => {
      this.handleDetachSession(socket, data);
    });

    socket.on('terminal:attach-session', (data) => {
      this.handleAttachSession(socket, data);
    });
    
    socket.on('terminal:create-new-session', (data) => {
      this.handleCreateNewSession(socket, data);
    });
    
    socket.on('terminal:create-project-session', (data) => {
      this.handleCreateProjectSession(socket, data);
    });
    
    socket.on('terminal:delete-session', (data) => {
      this.handleDeleteSession(socket, data);
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

  async handleTerminalInput(socket, data) {
    try {
      const { sessionName, input } = data;
      
      if (!sessionName || !input) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Session name and input required' });
        return;
      }

      // Join terminal room if not already joined
      const terminalRoomName = `terminal-${sessionName}`;
      if (!socket.rooms.has(terminalRoomName)) {
        socket.join(terminalRoomName);
        logger.debug('Socket joined terminal room:', { socketId: socket.id, sessionName, roomName: terminalRoomName });
      }

      // Check if terminal session exists and is active before sending input
      const currentTerminalStatus = await terminalService.getSessionStatus(sessionName);
      if (!currentTerminalStatus.exists) {
        logger.warn('Terminal session does not exist:', { sessionName, socketId: socket.id });
        socket.emit('terminal-input-error', {
          sessionName,
          message: 'Terminal session not found. Please try connecting again.',
          details: 'Terminal session needs to be created',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // If session exists but is not active, try to reconnect
      if (!currentTerminalStatus.active) {
        logger.info('Terminal session exists but not active, attempting reconnection:', { sessionName });
        try {
          await terminalService.createSession(sessionName, {
            cwd: process.cwd(),
            cols: 80,
            rows: 24
          });
          
          // Wait for session to be fully ready before setting callbacks
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verify session is actually active before setting callbacks
          const verifyStatus = await terminalService.getSessionStatus(sessionName);
          if (!verifyStatus.active) {
            throw new Error('Session failed to become active after reconnection');
          }
          
          // Set up terminal session callbacks after reconnection using room broadcast
          terminalService.setupSessionCallbacks(sessionName, this.io, terminalRoomName);
          
          logger.info('Successfully reconnected to terminal session:', { sessionName });
        } catch (reconnectError) {
          logger.error('Failed to reconnect terminal session:', {
            sessionName,
            error: reconnectError.message
          });
          socket.emit('terminal-input-error', {
            sessionName,
            message: 'Failed to reconnect to terminal session',
            details: reconnectError.message,
            timestamp: new Date().toISOString()
          });
          return;
        }
      }

      // Send input to terminal service
      await terminalService.writeToSession(sessionName, input);
      
      logger.socket('Terminal input processed', socket.id, { 
        sessionName, 
        inputLength: input.length 
      });

    } catch (error) {
      logger.error('Failed to process terminal input:', { 
        socketId: socket.id, 
        sessionName: data.sessionName,
        error: error.message,
        stack: error.stack
      });
      
      // Send specific terminal input error
      socket.emit('terminal-input-error', {
        sessionName: data.sessionName,
        message: 'Failed to process terminal input',
        details: error.message,
        timestamp: new Date().toISOString()
      });
      
      // Also send general error for backward compatibility
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to process terminal input',
        details: error.message
      });
    }
  }

  async handleTerminalResize(socket, data) {
    try {
      const { projectId, cols, rows } = data;
      
      if (!projectId || !cols || !rows) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID, cols, and rows required' });
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

      // Check if terminal session exists and is active, create/reconnect if needed
      const terminalStatus = await terminalService.getSessionStatus(projectId);
      if (!terminalStatus.exists || !terminalStatus.active) {
        try {
          const project = await projectService.getProject(projectId);
          const action = terminalStatus.exists ? 'reconnecting to' : 'creating';
          logger.info(`${action} terminal session for resize:`, { projectId, cols, rows });
          
          await terminalService.createSession(projectId, {
            cwd: project.path,
            cols,
            rows
          });
          
          logger.info('Terminal session ready for resize:', { projectId, cols, rows });
          
          // Set up callbacks for the new session
          await this.setupProjectIntegration(socket, projectId, project);
          
          return; // Terminal already created with correct size, no need to resize
        } catch (createError) {
          logger.error('Failed to create/reconnect terminal session for resize:', {
            projectId,
            error: createError.message
          });
          
          socket.emit(WEBSOCKET.EVENTS.ERROR, {
            message: 'Failed to create/reconnect terminal session',
            details: createError.message
          });
          return;
        }
      }

      // Check if terminal is active before resizing
      if (!terminalStatus.active) {
        logger.debug('Terminal not yet active, skipping resize:', { projectId, cols, rows });
        // Store the resize request to apply later when terminal becomes active
        socket.pendingResize = { projectId, cols, rows };
        return;
      }

      // Resize existing terminal
      try {
        await terminalService.resizeSession(projectId, cols, rows);
        // Clear any pending resize
        if (socket.pendingResize && socket.pendingResize.projectId === projectId) {
          delete socket.pendingResize;
        }
      } catch (resizeError) {
        // If resize fails because terminal is not active or not found, recreate session
        if (resizeError.message && (resizeError.message.includes('Terminal not active') || resizeError.message.includes('Terminal session not found'))) {
          logger.info('Terminal session lost, recreating for resize:', { projectId, cols, rows });
          try {
            const project = await projectService.getProject(projectId);
            await terminalService.createSession(projectId, {
              cwd: project.path,
              cols,
              rows
            });
            
            // Set up callbacks for the new session
            await this.setupProjectIntegration(socket, projectId, project);
            
            logger.info('Terminal session recreated successfully for resize:', { projectId, cols, rows });
            return; // Terminal created with correct size, no need to resize
          } catch (createError) {
            logger.error('Failed to recreate terminal session for resize:', {
              projectId,
              error: createError.message
            });
            
            socket.emit(WEBSOCKET.EVENTS.ERROR, {
              message: 'Failed to recreate terminal session',
              details: createError.message
            });
            return;
          }
        }
        throw resizeError;
      }
      
      logger.socket('Terminal resized', socket.id, { projectId, cols, rows });

    } catch (error) {
      logger.error('Failed to resize terminal:', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to resize terminal',
        details: error.message
      });
    }
  }

  async handleTerminalRestart(socket, data) {
    try {
      const { projectId } = data;
      
      if (!projectId) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID required' });
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

      logger.info('Terminal restart requested:', { projectId, socketId: socket.id });

      // Force restart terminal session
      try {
        await terminalService.forceRestartSession(projectId);
        
        // Get project for setting up new session
        const project = await projectService.getProject(projectId);
        
        // Set up project integration for the new session
        await this.setupProjectIntegration(socket, projectId, project);
        
        // Add a small delay to ensure terminal is fully ready before notifying frontend
        setTimeout(() => {
          socket.emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
            projectId,
            status: 'terminal_restarted',
            timestamp: new Date().toISOString()
          });
          
          logger.socket('Terminal restarted successfully', socket.id, { projectId });
        }, 1000); // 1 second delay for tmux session to fully initialize
        
      } catch (restartError) {
        logger.error('Failed to restart terminal session:', {
          projectId,
          error: restartError.message
        });
        
        socket.emit(WEBSOCKET.EVENTS.ERROR, {
          message: 'Failed to restart terminal',
          details: restartError.message
        });
      }

    } catch (error) {
      logger.error('Failed to handle terminal restart:', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to restart terminal',
        details: error.message
      });
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
        case 'create_terminal':
          await this.handleCreateTerminal(socket, projectId, payload);
          break;
        case 'destroy_terminal':
          await this.handleDestroyTerminal(socket, projectId, payload);
          break;
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
    await terminalService.createClaudeTerminal(projectId, project.path, payload);
    
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
    
    try {
      await terminalService.destroySession(projectId);
    } catch (error) {
      // Ignore if terminal doesn't exist
    }
    
    // Notify all clients in the project room
    this.io.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
      projectId,
      status: 'claude_stopped',
      timestamp: new Date().toISOString()
    });
  }

  async handleCreateTerminal(socket, projectId, payload) {
    const project = await projectService.getProject(projectId);
    
    const terminalResult = await terminalService.createSession(projectId, {
      cwd: project.path,
      ...payload
    });
    
    // Set up callbacks
    await this.setupProjectIntegration(socket, projectId, project);
    
    socket.emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
      projectId,
      status: 'terminal_created',
      terminal: terminalResult,
      timestamp: new Date().toISOString()
    });
  }

  async handleDestroyTerminal(socket, projectId, payload) {
    await terminalService.destroySession(projectId);
    
    socket.emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
      projectId,
      status: 'terminal_destroyed',
      timestamp: new Date().toISOString()
    });
  }

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
    
    // Leave all terminal rooms
    const socketRooms = Array.from(socket.rooms);
    const terminalRooms = socketRooms.filter(room => room.startsWith('terminal-'));
    if (terminalRooms.length > 0) {
      logger.debug('Client left terminal rooms on disconnect:', { 
        socketId: socket.id, 
        terminalRooms 
      });
    }
    
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

  async handleListSessions(socket, data) {
    try {
      const sessions = await terminalService.listAvailableSessions();
      socket.emit('terminal:sessions-list', {
        sessions,
        timestamp: new Date().toISOString()
      });
      
      logger.socket('Listed tmux sessions', socket.id, { count: sessions.length });
    } catch (error) {
      logger.error('Failed to list sessions:', { socketId: socket.id, error: error.message });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to list sessions',
        details: error.message
      });
    }
  }

  async handleDetachSession(socket, data) {
    try {
      const { projectId } = data;
      
      if (!projectId) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID required' });
        return;
      }

      await terminalService.detachSession(projectId);
      
      socket.emit('terminal:session-detached', {
        projectId,
        timestamp: new Date().toISOString()
      });
      
      logger.socket('Detached from tmux session', socket.id, { projectId });
    } catch (error) {
      logger.error('Failed to detach session:', { socketId: socket.id, error: error.message });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to detach session',
        details: error.message
      });
    }
  }

  async handleAttachSession(socket, data) {
    try {
      const { sessionName } = data;
      
      if (!sessionName) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Session name required' });
        return;
      }

      // Join terminal room for this session
      const terminalRoomName = `terminal-${sessionName}`;
      socket.join(terminalRoomName);
      logger.debug('Socket joined terminal room on attach:', { socketId: socket.id, sessionName, roomName: terminalRoomName });

      // Check if tmux session exists
      const TmuxUtils = require('./utils/tmux-utils');
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      
      if (!sessionExists) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: `Session ${sessionName} not found` });
        return;
      }

      // Check if we already have a terminal session connected to this tmux session
      let terminalSessionExists = terminalService.isSessionActive(sessionName);
      
      if (!terminalSessionExists) {
        // Create a new terminal session that connects to the existing tmux session
        logger.info('Creating terminal session for existing tmux session:', { sessionName });
        
        // Create terminal session that will attach to existing tmux session
        await terminalService.createSession(sessionName, {
          cwd: process.cwd(), // Use current working directory
          cols: 80,
          rows: 24
        });
      }

      // Wait for session to be fully ready before setting callbacks
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Verify session is ready
      const finalStatus = await terminalService.getSessionStatus(sessionName);
      if (!finalStatus.active) {
        throw new Error(`Session ${sessionName} failed to become active`);
      }
      
      // Set up terminal session callbacks using room broadcast
      terminalService.setupSessionCallbacks(sessionName, this.io, terminalRoomName);
      
      // After setting up callbacks, immediately send current terminal content with exact cursor position
      setTimeout(async () => {
        try {
          const TmuxUtils = require('./utils/tmux-utils');
          
          // First, get the current cursor position BEFORE capturing content
          const cursorPosition = await TmuxUtils.getCursorPosition(sessionName);
          const currentContent = await TmuxUtils.capturePane(sessionName);
          
          if (currentContent && currentContent.trim()) {
            logger.info('Restoring terminal state for client:', { 
              sessionName, 
              contentLength: currentContent.length,
              cursorPosition,
              preview: currentContent.substring(0, 100).replace(/\r?\n/g, '\\n')
            });
            
            // Format content for proper terminal display
            const clearScreen = '\x1b[2J\x1b[H'; // Clear screen and move cursor to top
            const formattedContent = currentContent.replace(/\n/g, '\r\n'); // Ensure proper line endings
            
            // Send clear screen first
            socket.emit(WEBSOCKET.EVENTS.TERMINAL_OUTPUT, {
              sessionName,
              data: clearScreen,
              timestamp: new Date().toISOString()
            });
            
            // Then send the formatted content
            setTimeout(() => {
              socket.emit(WEBSOCKET.EVENTS.TERMINAL_OUTPUT, {
                sessionName,
                data: formattedContent,
                timestamp: new Date().toISOString()
              });
              
              // Finally, restore exact cursor position using ANSI escape sequence
              if (cursorPosition) {
                setTimeout(() => {
                  // ANSI escape sequence to set cursor position: \033[row;colH
                  // Note: ANSI sequences are 1-based, tmux cursor positions are 0-based
                  const row = cursorPosition.cursorY + 1;
                  const col = cursorPosition.cursorX + 1;
                  const setCursorPosition = `\x1b[${row};${col}H`;
                  
                  logger.info('Restoring cursor position:', { 
                    sessionName, 
                    tmuxX: cursorPosition.cursorX, 
                    tmuxY: cursorPosition.cursorY,
                    ansiRow: row,
                    ansiCol: col
                  });
                  
                  socket.emit(WEBSOCKET.EVENTS.TERMINAL_OUTPUT, {
                    sessionName,
                    data: setCursorPosition,
                    timestamp: new Date().toISOString()
                  });
                }, 100); // Small delay to ensure content is rendered first
              }
            }, 50); // Small delay to ensure clear screen happens first
          } else {
            logger.info('No terminal content found, no state to restore:', { sessionName });
          }
        } catch (error) {
          logger.error('Failed to restore terminal state:', { sessionName, error: error.message });
        }
      }, 500); // Give callbacks time to be set up
      
      socket.emit('terminal:session-attached', {
        sessionName,
        timestamp: new Date().toISOString()
      });
      
      logger.socket('Attached to tmux session', socket.id, { sessionName });
    } catch (error) {
      logger.error('Failed to attach session:', { socketId: socket.id, error: error.message });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to attach session',
        details: error.message
      });
    }
  }
  
  async handleCreateNewSession(socket, data) {
    try {
      const { cols = 80, rows = 24 } = data;
      
      // Generate a unique session name without project dependency
      const TmuxUtils = require('./utils/tmux-utils');
      const timestamp = Date.now();
      const sessionName = `claude-web-session-${timestamp}`;
      
      // Create new terminal session
      const result = await terminalService.createSessionDirect(sessionName, {
        cwd: process.cwd(), // Use current working directory
        cols,
        rows
      });
      
      logger.info('New terminal session created:', { sessionName, sessionId: result.sessionId, tmuxSession: result.tmuxSessionName });
      
      // Broadcast to all clients that a new session was created
      this.io.emit('terminal:session-created', {
        sessionName: result.tmuxSessionName,
        sessionId: result.sessionId,
        tmuxSession: result.tmuxSessionName
      });
      
    } catch (error) {
      logger.error('Failed to create new session:', { socketId: socket.id, error: error.message });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to create new session',
        details: error.message
      });
    }
  }
  
  async handleCreateProjectSession(socket, data) {
    try {
      const { projectName, projectPath, cols = 80, rows = 24 } = data;
      
      logger.info('🔧 Received create project session request:', { 
        socketId: socket.id, 
        projectName, 
        projectPath, 
        cols, 
        rows 
      });
      
      if (!projectName) {
        logger.warn('❌ Project name missing in create session request');
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project name required' });
        return;
      }
      
      logger.info('Creating new project session:', { 
        socketId: socket.id, 
        projectName, 
        projectPath, 
        cols, 
        rows 
      });
      
      // Get next sequence number for this project
      const TmuxUtils = require('./utils/tmux-utils');
      const sequenceNumber = await TmuxUtils.getNextSequenceNumber(projectName);
      
      // Generate session name using project name and sequence number
      const sessionName = `claude-web-${projectName}-${sequenceNumber}`;
      
      logger.info('🎯 Generated session name:', { sessionName, projectName, sequenceNumber });
      
      // Create new terminal session
      const result = await terminalService.createSessionDirect(sessionName, {
        cwd: projectPath || process.cwd(),
        cols,
        rows
      });
      
      logger.info('✅ Terminal session created, broadcasting event:', { 
        sessionName,
        projectName,
        sequenceNumber,
        result: result 
      });
      
      // Broadcast session creation event to all clients
      const eventData = {
        sessionName,
        projectName,
        sequenceNumber,
        timestamp: Date.now()
      };
      
      logger.info('📡 Broadcasting terminal:session-created event:', eventData);
      this.io.emit('terminal:session-created', eventData);
      
      logger.info('🎉 Project session created successfully:', { 
        socketId: socket.id, 
        sessionName,
        projectName,
        sequenceNumber
      });
      
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
        
        // Also destroy any associated terminal service session
        try {
          if (terminalService.isSessionActive(sessionName)) {
            await terminalService.destroySession(sessionName);
            logger.info('Terminal service session destroyed:', { sessionName });
          }
        } catch (terminalError) {
          logger.warn('Failed to destroy terminal service session (continuing anyway):', { 
            sessionName, 
            error: terminalError.message 
          });
        }
        
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