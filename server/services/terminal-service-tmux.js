const pty = require('node-pty');
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');
const TmuxUtils = require('../utils/tmux-utils');
const { TERMINAL, CLAUDE, ERROR_CODES } = require('../utils/constants');
const { AppError } = require('../middleware/error-handler');

class TmuxTerminalSession {
  constructor(sessionId, tmuxSessionName, options = {}) {
    this.sessionId = sessionId;
    this.tmuxSessionName = tmuxSessionName;
    this.ptyProcess = null;
    this.status = 'inactive';
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.outputBuffer = [];
    this.isClaudeSession = false;
    this.lastCommand = '';
    this.commandEchoFilter = false;
    
    // Terminal configuration
    this.config = {
      shell: options.shell || TERMINAL.DEFAULT_SHELL || os.platform() === 'win32' ? 'powershell.exe' : 'bash',
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...options.env
      },
      cols: options.cols || TERMINAL.DEFAULT_COLS,
      rows: options.rows || TERMINAL.DEFAULT_ROWS,
      encoding: options.encoding || TERMINAL.ENCODING
    };
    
    // Event callbacks
    this.callbacks = {
      onData: null,
      onExit: null,
      onError: null
    };
  }

  async start(isReconnect = false) {
    if (this.ptyProcess) {
      throw new AppError('Terminal already started', 400, ERROR_CODES.TERMINAL_CREATE_FAILED);
    }

    try {
      logger.info(`${isReconnect ? 'Reconnecting to' : 'Starting'} tmux terminal session:`, {
        sessionId: this.sessionId,
        tmuxSession: this.tmuxSessionName,
        cwd: this.config.cwd
      });

      // Create or verify tmux session exists
      if (!isReconnect) {
        const sessionExists = await TmuxUtils.hasSession(this.tmuxSessionName);
        if (!sessionExists) {
          await TmuxUtils.createSession(this.tmuxSessionName, this.config.cwd);
        }
      }

      // Spawn a process that attaches to the tmux session
      this.ptyProcess = pty.spawn('tmux', ['attach-session', '-t', this.tmuxSessionName], {
        name: 'xterm-256color',
        cols: this.config.cols,
        rows: this.config.rows,
        cwd: this.config.cwd,
        env: {
          ...this.config.env,
          TERM: 'xterm-256color',
        },
        encoding: this.config.encoding,
        useConpty: false,
        windowsHide: false
      });

      // Set up event handlers
      this.setupEventHandlers();
      
      this.status = 'active';
      this.lastActivity = Date.now();
      
      // If reconnecting, capture current pane content
      if (isReconnect) {
        setTimeout(async () => {
          try {
            const paneContent = await TmuxUtils.capturePane(this.tmuxSessionName);
            if (paneContent && this.callbacks.onData) {
              this.callbacks.onData(paneContent);
            }
          } catch (error) {
            logger.error('Failed to capture pane content:', error);
          }
        }, 500);
      }
      
      logger.info('Tmux terminal session started:', {
        sessionId: this.sessionId,
        tmuxSession: this.tmuxSessionName,
        pid: this.ptyProcess.pid
      });
      
      return {
        sessionId: this.sessionId,
        tmuxSessionName: this.tmuxSessionName,
        pid: this.ptyProcess.pid,
        status: this.status,
        createdAt: this.createdAt,
        isReconnect
      };
      
    } catch (error) {
      this.status = 'failed';
      
      logger.error('Failed to start tmux terminal session:', {
        sessionId: this.sessionId,
        error: error.message,
        stack: error.stack
      });
      
      throw new AppError(
        `Failed to start tmux terminal: ${error.message}`,
        500,
        ERROR_CODES.TERMINAL_CREATE_FAILED
      );
    }
  }

  setupEventHandlers() {
    if (!this.ptyProcess) return;

    // Handle terminal output
    this.ptyProcess.onData((data) => {
      this.handleOutput(data);
    });

    // Handle terminal exit
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      logger.info('Tmux attach process exited:', {
        sessionId: this.sessionId,
        exitCode,
        signal,
        uptime: this.getUptime()
      });
      
      this.status = 'detached';
      this.ptyProcess = null;
      
      if (this.callbacks.onExit) {
        this.callbacks.onExit(exitCode, signal);
      }
    });

    // Handle process errors
    this.ptyProcess.on('error', (error) => {
      logger.error('Terminal process error:', {
        sessionId: this.sessionId,
        error: error.message
      });
      
      this.status = 'error';
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    });
  }

  handleOutput(data) {
    this.lastActivity = Date.now();
    
    let processedData = data;
    
    // Filter command echo if enabled
    if (this.commandEchoFilter && this.lastCommand) {
      processedData = this.filterCommandEcho(data);
    }
    
    // Add to output buffer
    const outputEntry = {
      timestamp: Date.now(),
      data: processedData
    };
    
    this.outputBuffer.push(outputEntry);
    
    // Trim buffer if too large
    if (this.outputBuffer.length > TERMINAL.BUFFER_SIZE) {
      this.outputBuffer = this.outputBuffer.slice(-TERMINAL.BUFFER_SIZE);
    }
    
    // Call data callback
    if (this.callbacks.onData) {
      this.callbacks.onData(processedData);
    }
  }

  filterCommandEcho(data) {
    // Same implementation as original
    if (!this.lastCommand || !data) {
      return data;
    }

    const cleanData = data.replace(/\x1b\[[0-9;]*[mGKHFJST]/g, '');
    const lines = data.split(/\r?\n/);
    const cleanLines = cleanData.split(/\r?\n/);
    
    let foundEcho = false;
    for (let i = 0; i < cleanLines.length; i++) {
      const line = cleanLines[i].trim();
      if (line === '') continue;
      
      if (line === this.lastCommand || 
          line.endsWith('$ ' + this.lastCommand) || 
          line.endsWith('# ' + this.lastCommand) ||
          line.endsWith('> ' + this.lastCommand) ||
          line.endsWith(': ' + this.lastCommand) ||
          (line.includes(this.lastCommand) && line.replace(/^[^$#>:]*[$#>:]\s*/, '') === this.lastCommand)) {
        lines.splice(i, 1);
        foundEcho = true;
        break;
      }
      
      break;
    }
    
    if (foundEcho) {
      this.lastCommand = '';
      return lines.join('\n');
    }
    
    return data;
  }

  setLastCommand(command) {
    if (command && typeof command === 'string') {
      this.lastCommand = command.replace(/[\r\n]+$/, '').trim();
    }
  }

  write(data) {
    if (!this.ptyProcess || this.status !== 'active') {
      throw new AppError('Terminal not active', 400, ERROR_CODES.TERMINAL_NOT_FOUND);
    }

    try {
      this.lastActivity = Date.now();
      
      // Check if this is a command
      if (data && data.includes('\n')) {
        const command = data.replace(/\n|\r/g, '').trim();
        if (command) {
          this.setLastCommand(command);
        }
      }
      
      this.ptyProcess.write(data);
      
      // Log input (truncated)
      const logData = data.length > 100 ? data.substring(0, 100) + '...' : data;
      logger.debug('Terminal input:', {
        sessionId: this.sessionId,
        data: logData.replace(/\r?\n/g, '\\n')
      });
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to write to terminal:', {
        sessionId: this.sessionId,
        error: error.message
      });
      
      throw new AppError(
        'Failed to write to terminal',
        500,
        ERROR_CODES.TERMINAL_WRITE_FAILED
      );
    }
  }

  resize(cols, rows) {
    if (!this.ptyProcess || this.status !== 'active') {
      throw new AppError('Terminal not active', 400, ERROR_CODES.TERMINAL_NOT_FOUND);
    }

    try {
      this.ptyProcess.resize(cols, rows);
      this.config.cols = cols;
      this.config.rows = rows;
      
      logger.debug('Terminal resized:', {
        sessionId: this.sessionId,
        size: `${cols}x${rows}`
      });
      
      return { success: true, cols, rows };
    } catch (error) {
      logger.error('Failed to resize terminal:', {
        sessionId: this.sessionId,
        error: error.message
      });
      
      throw new AppError(
        'Failed to resize terminal',
        500,
        ERROR_CODES.TERMINAL_WRITE_FAILED
      );
    }
  }

  async detach() {
    if (this.ptyProcess) {
      try {
        // Send detach sequence to tmux (Ctrl+B, D)
        this.ptyProcess.write('\x02d');
        this.status = 'detached';
        
        logger.info('Detached from tmux session:', {
          sessionId: this.sessionId,
          tmuxSession: this.tmuxSessionName
        });
        
        return { success: true };
      } catch (error) {
        logger.error('Failed to detach from tmux:', {
          sessionId: this.sessionId,
          error: error.message
        });
        throw error;
      }
    }
    return { success: true, message: 'Already detached' };
  }

  async kill(signal = 'SIGTERM') {
    // First detach if attached
    if (this.ptyProcess) {
      await this.detach();
    }

    // Then kill the tmux session
    try {
      await TmuxUtils.killSession(this.tmuxSessionName);
      this.status = 'killed';
      
      logger.info('Tmux session killed:', {
        sessionId: this.sessionId,
        tmuxSession: this.tmuxSessionName
      });
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to kill tmux session:', {
        sessionId: this.sessionId,
        error: error.message
      });
      
      throw new AppError(
        'Failed to kill tmux session',
        500,
        ERROR_CODES.TERMINAL_WRITE_FAILED
      );
    }
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      tmuxSessionName: this.tmuxSessionName,
      status: this.status,
      pid: this.ptyProcess?.pid || null,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      uptime: this.getUptime(),
      size: {
        cols: this.config.cols,
        rows: this.config.rows
      },
      shell: this.config.shell,
      cwd: this.config.cwd,
      bufferSize: this.outputBuffer.length,
      isClaudeSession: this.isClaudeSession
    };
  }

  getUptime() {
    return Date.now() - this.createdAt;
  }

  getRecentOutput(lines = 100) {
    return this.outputBuffer.slice(-lines);
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  markAsClaudeSession() {
    this.isClaudeSession = true;
  }
}

class TmuxTerminalService {
  constructor() {
    this.sessions = new Map();
    this.maxSessions = 10;
    
    // Clean up inactive sessions periodically
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 300000); // Every 5 minutes
  }


  async createSession(sessionId, options = {}) {
    if (this.sessions.size >= this.maxSessions) {
      throw new AppError(
        `Maximum number of terminal sessions (${this.maxSessions}) reached`,
        503,
        ERROR_CODES.SYSTEM_OVERLOAD
      );
    }

    // Use sessionId directly as session name
    return this.connectToSessionByName(sessionId, options);
  }

  async connectToSessionByName(sessionName, options = {}) {
    logger.info('Connecting to session by name:', { sessionName });

    // Check if tmux session exists
    if (!await TmuxUtils.hasSession(sessionName)) {
      throw new AppError(`Tmux session ${sessionName} not found`, 404, ERROR_CODES.TERMINAL_NOT_FOUND);
    }

    // Close existing terminal connection if any
    if (this.sessions.has(sessionName)) {
      const existing = this.sessions.get(sessionName);
      await existing.detach();
    }

    const session = new TmuxTerminalSession(sessionName, sessionName, options);
    this.sessions.set(sessionName, session);

    try {
      // Always use reconnect mode for existing sessions
      const result = await session.start(true);
      logger.info('Connected to session by name:', { sessionName, sessions: this.sessions.size });
      return result;
    } catch (error) {
      this.sessions.delete(sessionName);
      throw error;
    }
  }


  async destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AppError('Terminal session not found', 404, ERROR_CODES.TERMINAL_NOT_FOUND);
    }

    try {
      await session.kill();
      this.sessions.delete(sessionId);
      
      logger.info('Terminal session destroyed:', { sessionId, sessions: this.sessions.size });
      
      return { success: true, message: 'Terminal session destroyed' };
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  async forceRestartSession(sessionId) {
    logger.info('Force restarting terminal session:', { sessionId });
    
    try {
      // First, try to destroy existing session if any
      const activeSession = this.sessions.get(sessionId);
      if (activeSession) {
        try {
          await activeSession.kill();
          this.sessions.delete(sessionId);
          logger.info('Existing session killed for restart:', { sessionId });
        } catch (killError) {
          logger.warn('Failed to kill existing session (proceeding anyway):', {
            sessionId,
            error: killError.message
          });
          this.sessions.delete(sessionId);
        }
      }

      // Kill tmux session if it exists
      const tmuxExists = await TmuxUtils.hasSession(sessionId);
      if (tmuxExists) {
        const killResult = await TmuxUtils.killSession(sessionId);
        if (killResult) {
          logger.info('Tmux session killed for restart:', { sessionId });
        } else {
          logger.warn('Tmux session could not be killed (proceeding anyway):', { sessionId });
        }
      }

      logger.info('Terminal session force restart completed:', { 
        sessionId,
        remainingSessions: this.sessions.size 
      });
      
      return { success: true, message: 'Terminal session force restarted' };
      
    } catch (error) {
      logger.error('Failed to force restart terminal session:', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      
      // Clean up in case of error
      this.sessions.delete(sessionId);
      
      throw new AppError(
        `Failed to force restart terminal session: ${error.message}`,
        500,
        ERROR_CODES.TERMINAL_WRITE_FAILED
      );
    }
  }

  async detachSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AppError('Terminal session not found', 404, ERROR_CODES.TERMINAL_NOT_FOUND);
    }

    await session.detach();
    this.sessions.delete(sessionId);
    
    logger.info('Detached from terminal session:', { sessionId });
    
    return { success: true, message: 'Detached from terminal session' };
  }

  async listAvailableSessions() {
    try {
      const tmuxSessions = await TmuxUtils.listSessions();
      const available = [];
      
      for (const sessionName of tmuxSessions) {
        const info = await TmuxUtils.getSessionInfo(sessionName);
        available.push({
          sessionName,
          created: info ? info.created : new Date(),
          attached: info ? info.attached : false,
          active: this.sessions.has(sessionName)
        });
      }
      
      return available;
    } catch (error) {
      logger.error('Failed to list available sessions:', error);
      return [];
    }
  }
  
  async createNewSession(projectId, options = {}) {
    // If projectId is not provided, create a session with timestamp
    if (!projectId) {
      const timestamp = Date.now();
      const sessionName = `claude-web-session-${timestamp}`;
      return this.createSessionDirect(sessionName, options);
    }

    const sessionId = `${projectId}-${Date.now()}`;
    
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new AppError(
        `Maximum number of terminal sessions (${this.maxSessions}) reached`,
        503,
        ERROR_CODES.SYSTEM_OVERLOAD
      );
    }
    
    // Always create a new tmux session with sequence number
    const sequenceNumber = await TmuxUtils.getNextSequenceNumber(projectId);
    const tmuxSessionName = TmuxUtils.generateSessionName(projectId, sequenceNumber);
    
    logger.info('Creating new tmux session:', { projectId, sessionId, tmuxSession: tmuxSessionName, sequenceNumber });
    
    const session = new TmuxTerminalSession(sessionId, tmuxSessionName, options);
    this.sessions.set(sessionId, session);
    
    try {
      const result = await session.start(false); // Never reconnect for new sessions
      logger.info('New terminal session created:', { sessionId, sessions: this.sessions.size });
      return {
        ...result,
        sessionId,
        tmuxSession: tmuxSessionName,
        projectId,
        sequenceNumber
      };
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  async createSessionDirect(sessionName, options = {}) {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new AppError(
        `Maximum number of terminal sessions (${this.maxSessions}) reached`,
        503,
        ERROR_CODES.SYSTEM_OVERLOAD
      );
    }
    
    logger.info('Creating new session directly:', { sessionName });
    
    const session = new TmuxTerminalSession(sessionName, sessionName, options);
    this.sessions.set(sessionName, session);
    
    try {
      const result = await session.start(false); // Never reconnect for new sessions
      logger.info('New session created directly:', { sessionName, sessions: this.sessions.size });
      return {
        ...result,
        sessionId: sessionName,
        tmuxSession: sessionName
      };
    } catch (error) {
      this.sessions.delete(sessionName);
      throw error;
    }
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AppError('Terminal session not found', 404, ERROR_CODES.TERMINAL_NOT_FOUND);
    }
    return session;
  }

  writeToSession(sessionId, data) {
    const session = this.getSession(sessionId);
    return session.write(data);
  }

  resizeSession(sessionId, cols, rows) {
    const session = this.getSession(sessionId);
    return session.resize(cols, rows);
  }

  async getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    
    // Check if tmux session exists
    const tmuxExists = await TmuxUtils.hasSession(sessionId);
    
    if (!session && !tmuxExists) {
      return { exists: false };
    }
    
    return {
      exists: true,
      active: !!session,
      tmuxExists,
      ...(session ? session.getStatus() : {})
    };
  }

  async getAllSessions() {
    const sessions = {};
    
    // Include active sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      sessions[sessionId] = {
        ...session.getStatus(),
        active: true
      };
    }
    
    // Include tmux sessions that aren't active in memory
    try {
      const tmuxSessions = await TmuxUtils.listSessions();
      for (const sessionName of tmuxSessions) {
        if (!sessions[sessionName]) {
          const info = await TmuxUtils.getSessionInfo(sessionName);
          sessions[sessionName] = {
            sessionId: sessionName,
            tmuxSessionName: sessionName,
            created: info ? info.created : new Date(),
            attached: info ? info.attached : false,
            active: false,
            status: 'detached'
          };
        }
      }
    } catch (error) {
      logger.error('Failed to get tmux sessions for getAllSessions:', error);
    }
    
    return sessions;
  }

  async destroyAllSessions() {
    const promises = [];
    
    // Kill all active sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      promises.push(session.kill().catch(err => {
        logger.error('Error destroying session:', { sessionId, error: err.message });
      }));
    }
    
    // Kill all tmux sessions
    try {
      const tmuxSessions = await TmuxUtils.listSessions();
      for (const sessionName of tmuxSessions) {
        promises.push(TmuxUtils.killSession(sessionName).catch(err => {
          logger.error('Error killing tmux session:', { sessionName, error: err.message });
        }));
      }
    } catch (error) {
      logger.error('Failed to list tmux sessions for destruction:', error);
    }
    
    await Promise.all(promises);
    this.sessions.clear();
    
    logger.info('All terminal sessions destroyed');
  }

  async cleanupInactiveSessions() {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    
    // Clean up detached sessions from memory
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === 'detached' || session.status === 'exited') {
        this.sessions.delete(sessionId);
      }
    }
    
    // Clean up old tmux sessions
    const tmuxSessions = await TmuxUtils.listSessions();
    
    for (const sessionName of tmuxSessions) {
      const parsed = TmuxUtils.parseSessionName(sessionName);
      if (parsed && (now - parsed.timestamp) > inactiveThreshold) {
        logger.info('Cleaning up old tmux session:', { sessionName, age: now - parsed.timestamp });
        await TmuxUtils.killSession(sessionName);
      }
    }
  }

  // Integration with Claude Manager
  async createClaudeTerminal(projectId, projectPath, options = {}) {
    const terminalOptions = {
      ...options,
      cwd: projectPath,
      env: {
        ...process.env,
        CLAUDE_PROJECT_ID: projectId,
        CLAUDE_WORKING_DIR: projectPath,
        ...options.env
      }
    };

    const result = await this.createSession(projectId, terminalOptions);
    const session = this.getSession(projectId);
    session.markAsClaudeSession();
    
    return result;
  }

  // Event handler setup for WebSocket integration
  setupSessionCallbacks(sessionId, callbacks) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.setCallbacks(callbacks);
    }
  }

  // Get session output history
  getSessionOutput(sessionId, lines = 100) {
    const session = this.getSession(sessionId);
    return session.getRecentOutput(lines);
  }

  // Check if session exists and is active
  isSessionActive(sessionId) {
    const session = this.sessions.get(sessionId);
    return session && session.status === 'active';
  }
}

// Singleton instance
const tmuxTerminalService = new TmuxTerminalService();

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('Shutting down Tmux Terminal Service...');
  await tmuxTerminalService.destroyAllSessions();
});

process.on('SIGINT', async () => {
  logger.info('Shutting down Tmux Terminal Service...');
  await tmuxTerminalService.destroyAllSessions();
});

module.exports = tmuxTerminalService;