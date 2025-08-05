const logger = require('../../utils/logger');
const { WEBSOCKET } = require('../../utils/constants');
const projectService = require('../project-service');
const fileService = require('../file-service');

class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.projectRooms = new Map();
  }

  handleConnection(socket, io) {
    logger.socket('Client connected', socket.id, socket.metadata);
    
    this.connections.set(socket.id, socket);
    
    socket.emit(WEBSOCKET.EVENTS.CONNECTED, {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      serverVersion: '1.0.0'
    });

    return this.connections.get(socket.id);
  }

  async handleJoinProject(socket, data, io) {
    try {
      const { projectId } = data;
      
      if (!projectId) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID required' });
        return;
      }

      const socketRooms = Array.from(socket.rooms);
      if (socketRooms.includes(`project-${projectId}`) && socket.metadata.projectId === projectId) {
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

      const project = await projectService.getProject(projectId);
      
      if (socket.metadata.projectId) {
        await this.handleLeaveProject(socket, { projectId: socket.metadata.projectId }, io);
      }

      socket.join(`project-${projectId}`);
      socket.metadata.projectId = projectId;
      
      if (!this.projectRooms.has(projectId)) {
        this.projectRooms.set(projectId, new Set());
      }
      this.projectRooms.get(projectId).add(socket.id);
      
      logger.socket('Joined project room', socket.id, { projectId });

      await this.setupProjectIntegration(socket, projectId, project);
      
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
      const claudeManager = require('../claude-manager');
      const claudeStatus = claudeManager.getSessionStatus(projectId);

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
      
      setTimeout(() => {
        socket.emit('project-ready', {
          projectId,
          timestamp: new Date().toISOString()
        });
      }, 100);

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

  async handleLeaveProject(socket, data, io) {
    try {
      const { projectId } = data;
      const currentProjectId = projectId || socket.metadata.projectId;
      
      if (!currentProjectId) {
        return;
      }

      socket.leave(`project-${currentProjectId}`);
      
      if (this.projectRooms.has(currentProjectId)) {
        this.projectRooms.get(currentProjectId).delete(socket.id);
        
        if (this.projectRooms.get(currentProjectId).size === 0) {
          this.projectRooms.delete(currentProjectId);
          fileService.stopWatching(currentProjectId);
        }
      }
      
      socket.metadata.projectId = null;
      
      logger.socket('Left project room', socket.id, { projectId: currentProjectId });

      socket.to(`project-${currentProjectId}`).emit(WEBSOCKET.EVENTS.NOTIFICATION, {
        type: 'user_left',
        message: 'A user left the project',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to leave project:', { socketId: socket.id, error: error.message });
    }
  }

  handleDisconnect(socket, reason, io) {
    logger.socket('Client disconnected', socket.id, { 
      reason, 
      duration: Date.now() - socket.metadata.connectedAt,
      projectId: socket.metadata.projectId
    });
    
    if (socket.metadata.projectId) {
      this.handleLeaveProject(socket, { projectId: socket.metadata.projectId }, io);
    }
    
    this.connections.delete(socket.id);
  }

  async verifyProjectConnection(socket, projectId) {
    const socketRooms = Array.from(socket.rooms);
    const isInProjectRoom = socketRooms.includes(`project-${projectId}`);
    
    if (!isInProjectRoom) {
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
    
    if (socket.metadata.projectId !== projectId) {
      socket.metadata.projectId = projectId;
    }
    
    return true;
  }

  broadcastToProject(projectId, event, data, io) {
    io.to(`project-${projectId}`).emit(event, data);
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

module.exports = ConnectionManager;