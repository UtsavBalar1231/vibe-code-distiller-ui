const logger = require('../../utils/logger');
const { WEBSOCKET } = require('../../utils/constants');

class TerminalHandler {
  constructor() {
    // Terminal handler doesn't need to store state
  }

  async handleCreateProjectSession(socket, data, io) {
    try {
      const { projectName, projectPath, cols = 80, rows = 24, sessionName: providedSessionName } = data;
      
      logger.info('Received create project session request:', { 
        socketId: socket.id, 
        projectName, 
        projectPath, 
        providedSessionName,
        cols, 
        rows 
      });
      
      let sessionName;
      let sequenceNumber = null;
      
      if (providedSessionName) {
        sessionName = providedSessionName;
        logger.info('Using provided session name:', { sessionName });
      } else {
        if (!projectName) {
          logger.warn('Project name missing in create session request');
          socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Project name or session name required' });
          return;
        }
        
        const TmuxUtils = require('../../utils/tmux-utils');
        sequenceNumber = await TmuxUtils.getNextSequenceNumber(projectName);
        
        sessionName = `claude-web-${projectName}-${sequenceNumber}`;
        logger.info('Generated session name:', { sessionName, projectName, sequenceNumber });
      }
      
      logger.info('Creating new tmux session:', { 
        socketId: socket.id, 
        sessionName,
        projectPath, 
        cols, 
        rows 
      });
      
      const TmuxUtils = require('../../utils/tmux-utils');
      
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      if (sessionExists) {
        logger.warn('Session already exists:', { sessionName });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: `Session ${sessionName} already exists` });
        return;
      }
      
      const createResult = await TmuxUtils.createSession(sessionName, projectPath);
      
      if (createResult) {
        logger.info('Tmux session created successfully:', { sessionName, projectPath });
        
        const eventData = {
          sessionName,
          projectName: projectName || 'direct',
          sequenceNumber,
          timestamp: Date.now()
        };
        
        logger.info('Broadcasting terminal:session-created event:', eventData);
        io.emit('terminal:session-created', eventData);
        
        logger.info('Project session created successfully:', { 
          socketId: socket.id, 
          sessionName,
          projectName: projectName || 'direct',
          sequenceNumber
        });
      } else {
        logger.error('Failed to create tmux session:', { sessionName });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Failed to create tmux session' });
      }
      
    } catch (error) {
      logger.error('Failed to create project session:', { 
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
  
  async handleDeleteSession(socket, data, io) {
    try {
      const { sessionName } = data;
      
      logger.info('Delete session request received:', { sessionName, socketId: socket.id });
      
      if (!sessionName) {
        logger.warn('Delete session request missing sessionName:', { socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Session name required' });
        return;
      }
      
      if (sessionName === 'base-session') {
        logger.warn('Attempt to delete base-session blocked:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Cannot delete base session' });
        return;
      }
      
      if (!sessionName.startsWith('claude-web-')) {
        logger.warn('Invalid session name format:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Invalid session name format' });
        return;
      }
      
      const TmuxUtils = require('../../utils/tmux-utils');
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      
      if (!sessionExists) {
        logger.warn('Session does not exist:', { sessionName, socketId: socket.id });
        io.emit('terminal:session-deleted', { sessionName, success: true });
        return;
      }
      
      logger.info('Deleting tmux session:', { sessionName, socketId: socket.id });
      const result = await TmuxUtils.killSession(sessionName);
      
      if (result) {
        logger.info('Session deleted successfully:', { sessionName, socketId: socket.id });
        io.emit('terminal:session-deleted', { sessionName, success: true });
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
  
  async handleSwitchSession(socket, data, io) {
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
      
      if (!sessionName.startsWith('claude-web-')) {
        logger.warn('Invalid session name format:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Invalid session name format' });
        return;
      }
      
      const TmuxUtils = require('../../utils/tmux-utils');
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      
      if (!sessionExists) {
        logger.warn('Session does not exist:', { sessionName, socketId: socket.id });
        socket.emit(WEBSOCKET.EVENTS.ERROR, { message: 'Session does not exist' });
        return;
      }
      
      logger.info('Switching to tmux session:', { sessionName, currentSessionName, socketId: socket.id });
      const result = await TmuxUtils.switchToSession(sessionName, currentSessionName);
      
      if (result) {
        logger.info('Session switched successfully:', { sessionName, socketId: socket.id });
        
        io.emit('terminal:session-switched', { 
          sessionName, 
          currentSessionName,
          success: true
        });
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

  async handleTerminalScroll(socket, data, io) {
    try {
      const { sessionName, direction, mode = 'line' } = data;
      
      logger.debug('Terminal scroll request received:', { 
        sessionName, 
        direction, 
        mode,
        socketId: socket.id 
      });
      
      if (!sessionName || !direction) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Missing required parameters: sessionName and direction' 
        });
        return;
      }
      
      if (!['up', 'down'].includes(direction)) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Direction must be "up" or "down"' 
        });
        return;
      }
      
      if (!sessionName.startsWith('claude-web-')) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Invalid session name format' 
        });
        return;
      }
      
      const TmuxUtils = require('../../utils/tmux-utils');
      
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      if (!sessionExists) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Session not found',
          details: `Terminal session '${sessionName}' does not exist` 
        });
        return;
      }
      
      const success = await TmuxUtils.scrollInCopyMode(sessionName, direction, mode);
      
      socket.emit(WEBSOCKET.EVENTS.TERMINAL_SCROLL_RESULT, {
        success,
        sessionName,
        direction,
        mode,
        message: success ? `Scrolled ${direction} in ${mode} mode` : 'Failed to execute scroll command'
      });
      
      if (success) {
        logger.debug('Terminal scroll executed successfully:', { sessionName, direction, mode });
      } else {
        logger.error('Terminal scroll failed:', { sessionName, direction, mode });
      }
      
    } catch (error) {
      logger.error('Error handling terminal scroll:', {
        sessionName: data.sessionName,
        direction: data.direction,
        socketId: socket.id,
        error: error.message,
        stack: error.stack
      });
      
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Internal server error',
        details: error.message
      });
    }
  }

  async handleTerminalGoToBottom(socket, data, io) {
    try {
      const { sessionName } = data;
      
      logger.debug('Terminal go to bottom request received:', { 
        sessionName,
        socketId: socket.id 
      });
      
      if (!sessionName) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Missing required parameter: sessionName' 
        });
        return;
      }
      
      if (!sessionName.startsWith('claude-web-')) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Invalid session name format' 
        });
        return;
      }
      
      const TmuxUtils = require('../../utils/tmux-utils');
      
      const sessionExists = await TmuxUtils.hasSession(sessionName);
      if (!sessionExists) {
        socket.emit(WEBSOCKET.EVENTS.ERROR, { 
          message: 'Session not found',
          details: `Terminal session '${sessionName}' does not exist` 
        });
        return;
      }
      
      const success = await TmuxUtils.goToBottomAndExit(sessionName);
      
      socket.emit(WEBSOCKET.EVENTS.TERMINAL_SCROLL_RESULT, {
        success,
        sessionName,
        action: 'go-to-bottom-and-exit',
        message: success ? 'Jumped to bottom and exited copy mode' : 'Failed to execute go to bottom and exit command'
      });
      
      if (success) {
        logger.debug('Terminal go to bottom executed successfully:', { sessionName });
      } else {
        logger.error('Terminal go to bottom failed:', { sessionName });
      }
      
    } catch (error) {
      logger.error('Error handling terminal go to bottom:', {
        sessionName: data.sessionName,
        socketId: socket.id,
        error: error.message,
        stack: error.stack
      });
      
      socket.emit(WEBSOCKET.EVENTS.ERROR, {
        message: 'Internal server error',
        details: error.message
      });
    }
  }
}

module.exports = TerminalHandler;