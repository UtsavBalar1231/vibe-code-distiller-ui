const logger = require('../../utils/logger');
const { WEBSOCKET } = require('../../utils/constants');
const claudeManager = require('../claude-manager');
const projectService = require('../project-service');

class ProjectHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  async handleClaudeCommand(socket, data, io) {
    try {
      const { projectId, command, context } = data;
      
      if (!projectId || !command) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID and command required' });
        return;
      }

      const socketRooms = Array.from(socket.rooms);
      const isInProjectRoom = socketRooms.includes(`project-${projectId}`);
      
      if (!isInProjectRoom) {
        try {
          await this.connectionManager.handleJoinProject(socket, { projectId }, io);
        } catch (joinError) {
          socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Not connected to project' });
          return;
        }
      }

      if (socket.metadata.projectId !== projectId) {
        socket.metadata.projectId = projectId;
      }

      const result = await claudeManager.sendCommand(projectId, command, context);
      
      logger.socket('Claude command processed', socket.id, { 
        projectId, 
        commandLength: command.length 
      });

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

  async handleProjectAction(socket, data, io) {
    try {
      const { projectId, action, payload } = data;
      
      if (!projectId || !action) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project ID and action required' });
        return;
      }

      logger.socket('Project action received', socket.id, { projectId, action });

      switch (action) {
        case 'start_claude':
          await this.handleStartClaude(socket, projectId, payload, io);
          break;
        case 'stop_claude':
          await this.handleStopClaude(socket, projectId, payload, io);
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

  async handleStartClaude(socket, projectId, payload, io) {
    const project = await projectService.getProject(projectId);
    
    const sessionResult = await claudeManager.startSession(projectId, project.path, payload);
    
    await this.connectionManager.setupProjectIntegration(socket, projectId, project);
    
    io.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
      projectId,
      status: 'claude_started',
      session: sessionResult,
      timestamp: new Date().toISOString()
    });
  }

  async handleStopClaude(socket, projectId, payload, io) {
    const force = payload?.force || false;
    
    await claudeManager.stopSession(projectId, force);
    
    io.to(`project-${projectId}`).emit(WEBSOCKET.EVENTS.PROJECT_STATUS, {
      projectId,
      status: 'claude_stopped',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ProjectHandler;