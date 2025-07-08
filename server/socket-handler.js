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
      let terminalStatus = await terminalService.getSessionStatus(projectId);

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

      // Create terminal session if it doesn't exist
      if (!terminalStatus.exists) {
        try {
          await terminalService.createSession(projectId, {
            cwd: project.path,
            cols: 80, // Default terminal size
            rows: 24
          });
          terminalStatus = await terminalService.getSessionStatus(projectId);
          
          logger.info('Terminal session created automatically for project:', { projectId });
          
          // Notify client that terminal session is ready
          socket.emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
            projectId,
            status: 'terminal_ready',
            timestamp: new Date().toISOString()
          });
          
          // Emit terminal session created event
          socket.emit('terminal-session-created', {
            projectId,
            sessionId: projectId,
            timestamp: new Date().toISOString()
          });
          
          // Mark project as ready after a small delay
          setTimeout(() => {
            socket.emit('project-ready', {
              projectId,
              timestamp: new Date().toISOString()
            });
          }, 500); // Increased delay for tmux sessions
        } catch (error) {
          logger.error('Failed to create terminal session automatically:', {
            projectId,
            error: error.message,
            stack: error.stack
          });
          
          // Send error notification to client
          socket.emit(WEBSOCKET.EVENTS.ERROR, {
            message: 'Failed to create terminal session',
            details: error.message,
            projectId
          });
        }
      }

      // Set up terminal session callbacks if session exists
      if (terminalStatus.exists) {
        terminalService.setupSessionCallbacks(projectId, {
          onData: (data) => {
            socket.emit(WEBSOCKET.EVENTS.TERMINAL_OUTPUT, {
              projectId,
              data,
              timestamp: new Date().toISOString()
            });
          },
          onExit: (exitCode, signal) => {
            socket.emit(WEBSOCKET.EVENTS.NOTIFICATION, {
              type: 'terminal_session_ended',
              message: `Terminal session ended (code: ${exitCode})`,
              projectId,
              timestamp: new Date().toISOString()
            });
          },
          onError: (error) => {
            socket.emit(WEBSOCKET.EVENTS.ERROR, {
              message: 'Terminal session error',
              details: error.message,
              projectId
            });
          }
        });
        
        // Apply pending resize if any
        if (socket.pendingResize && socket.pendingResize.projectId === projectId) {
          const { cols, rows } = socket.pendingResize;
          try {
            // Wait a bit for terminal to be fully ready
            setTimeout(async () => {
              try {
                await terminalService.resizeSession(projectId, cols, rows);
                logger.info('Applied pending resize after terminal setup:', { projectId, cols, rows });
                delete socket.pendingResize;
              } catch (resizeError) {
                logger.error('Failed to apply pending resize:', {
                  projectId,
                  error: resizeError.message
                });
              }
            }, 500);
          } catch (error) {
            logger.error('Failed to schedule pending resize:', {
              projectId,
              error: error.message
            });
          }
        }
      }

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
      const { projectId, input } = data;
      
      if (!projectId || !input) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID and input required' });
        return;
      }

      // Check if socket is in the project room instead of relying on metadata
      const socketRooms = Array.from(socket.rooms);
      const isInProjectRoom = socketRooms.includes(`project-${projectId}`);
      
      if (!isInProjectRoom) {
        // Auto-rejoin the project if possible
        try {
          await this.handleJoinProject(socket, { projectId });
          logger.info('Auto-rejoined project for terminal input', { socketId: socket.id, projectId });
        } catch (joinError) {
          socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Not connected to project' });
          return;
        }
      }

      // Update metadata if it's out of sync
      if (socket.metadata.projectId !== projectId) {
        socket.metadata.projectId = projectId;
      }

      // Check if terminal session exists before sending input
      const currentTerminalStatus = await terminalService.getSessionStatus(projectId);
      if (!currentTerminalStatus.exists) {
        logger.warn('Terminal session does not exist for project:', { projectId, socketId: socket.id });
        socket.emit('terminal-input-error', {
          projectId,
          message: 'Terminal session not found. Please try selecting the project again.',
          details: 'Terminal session needs to be created',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Send input to terminal service
      await terminalService.writeToSession(projectId, input);
      
      logger.socket('Terminal input processed', socket.id, { 
        projectId, 
        inputLength: input.length 
      });

    } catch (error) {
      logger.error('Failed to process terminal input:', { 
        socketId: socket.id, 
        projectId: data.projectId,
        error: error.message,
        stack: error.stack
      });
      
      // Send specific terminal input error
      socket.emit('terminal-input-error', {
        projectId: data.projectId,
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

      // Check if terminal session exists, if not, create it first
      const terminalStatus = await terminalService.getSessionStatus(projectId);
      if (!terminalStatus.exists) {
        try {
          const project = await projectService.getProject(projectId);
          await terminalService.createSession(projectId, {
            cwd: project.path,
            cols,
            rows
          });
          
          logger.info('Terminal session created for resize:', { projectId, cols, rows });
          
          // Set up callbacks for the new session
          await this.setupProjectIntegration(socket, projectId, project);
          
          return; // Terminal already created with correct size, no need to resize
        } catch (createError) {
          logger.error('Failed to create terminal session for resize:', {
            projectId,
            error: createError.message
          });
          
          socket.emit(WEBSOCKET.EVENTS.ERROR, {
            message: 'Failed to create terminal session',
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
      const { projectId } = data;
      
      if (!projectId) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID required' });
        return;
      }

      const project = await projectService.getProject(projectId);
      const result = await terminalService.createSession(projectId, {
        cwd: project.path
      });

      // Set up terminal callbacks for this session
      this.setupTerminalSession(projectId);
      
      socket.emit('terminal:session-attached', {
        projectId,
        ...result,
        timestamp: new Date().toISOString()
      });
      
      logger.socket('Attached to tmux session', socket.id, { projectId });
    } catch (error) {
      logger.error('Failed to attach session:', { socketId: socket.id, error: error.message });
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Failed to attach session',
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