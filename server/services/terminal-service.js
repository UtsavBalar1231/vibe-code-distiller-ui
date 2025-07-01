const pty = require('node-pty');
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');
const { TERMINAL, CLAUDE, ERROR_CODES } = require('../utils/constants');
const { AppError } = require('../middleware/error-handler');

class TerminalSession {
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.ptyProcess = null;
    this.status = 'inactive';
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.outputBuffer = [];
    this.isClaudeSession = false;
    this.lastCommand = '';
    this.commandEchoFilter = false; // Disable echo filtering for interactive applications
    
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

  async start() {
    if (this.ptyProcess) {
      throw new AppError('Terminal already started', 400, ERROR_CODES.TERMINAL_CREATE_FAILED);
    }

    try {
      logger.info('Starting terminal session:', {
        sessionId: this.sessionId,
        shell: this.config.shell,
        cwd: this.config.cwd,
        size: `${this.config.cols}x${this.config.rows}`
      });

      // Create pseudo-terminal
      this.ptyProcess = pty.spawn(this.config.shell, [], {
        name: 'xterm-256color',
        cols: this.config.cols,
        rows: this.config.rows,
        cwd: this.config.cwd,
        env: {
          ...this.config.env,
          TERM: 'xterm-256color',
          // Don't override PS1 to let applications control their own prompts
        },
        encoding: this.config.encoding,
        // Enable raw mode for better interactive application support
        useConpty: false, // Disable Windows ConPTY for better compatibility
        windowsHide: false
      });

      // Set up event handlers
      this.setupEventHandlers();
      
      // Let terminal handle echo naturally for better user experience
      
      this.status = 'active';
      this.lastActivity = Date.now();
      
      logger.info('Terminal session started:', {
        sessionId: this.sessionId,
        pid: this.ptyProcess.pid
      });
      
      return {
        sessionId: this.sessionId,
        pid: this.ptyProcess.pid,
        status: this.status,
        createdAt: this.createdAt
      };
      
    } catch (error) {
      this.status = 'failed';
      
      logger.error('Failed to start terminal session:', {
        sessionId: this.sessionId,
        error: error.message,
        stack: error.stack
      });
      
      throw new AppError(
        `Failed to start terminal: ${error.message}`,
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
      logger.info('Terminal session exited:', {
        sessionId: this.sessionId,
        exitCode,
        signal,
        uptime: this.getUptime()
      });
      
      this.status = 'exited';
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
    
    // Filter command echo if enabled and we have a last command
    if (this.commandEchoFilter && this.lastCommand) {
      processedData = this.filterCommandEcho(data);
    }
    
    // Add to output buffer with timestamp
    const outputEntry = {
      timestamp: Date.now(),
      data: processedData
    };
    
    this.outputBuffer.push(outputEntry);
    
    // Trim buffer if too large
    if (this.outputBuffer.length > TERMINAL.BUFFER_SIZE) {
      this.outputBuffer = this.outputBuffer.slice(-TERMINAL.BUFFER_SIZE);
    }
    
    // Call data callback with processed data
    if (this.callbacks.onData) {
      this.callbacks.onData(processedData);
    }
  }

  filterCommandEcho(data) {
    if (!this.lastCommand || !data) {
      return data;
    }

    // Remove ANSI escape sequences for comparison
    const cleanData = data.replace(/\x1b\[[0-9;]*[mGKHFJST]/g, '');
    
    // Split into lines
    const lines = data.split(/\r?\n/);
    const cleanLines = cleanData.split(/\r?\n/);
    
    // Check if first non-empty line contains our command echo
    let foundEcho = false;
    for (let i = 0; i < cleanLines.length; i++) {
      const line = cleanLines[i].trim();
      if (line === '') continue; // Skip empty lines
      
      // Check various prompt formats with our command
      if (line === this.lastCommand || 
          line.endsWith('$ ' + this.lastCommand) || 
          line.endsWith('# ' + this.lastCommand) ||
          line.endsWith('> ' + this.lastCommand) ||
          line.endsWith(': ' + this.lastCommand) ||
          (line.includes(this.lastCommand) && line.replace(/^[^$#>:]*[$#>:]\s*/, '') === this.lastCommand)) {
        // Remove this echo line
        lines.splice(i, 1);
        foundEcho = true;
        break;
      }
      
      // If we found a non-empty line that's not our command, stop looking
      break;
    }
    
    if (foundEcho) {
      // Clear the last command since we've processed its echo
      this.lastCommand = '';
      return lines.join('\n');
    }
    
    return data;
  }

  setLastCommand(command) {
    if (command && typeof command === 'string') {
      // Store the command without newline characters
      this.lastCommand = command.replace(/[\r\n]+$/, '').trim();
    }
  }

  write(data) {
    if (!this.ptyProcess || this.status !== 'active') {
      throw new AppError('Terminal not active', 400, ERROR_CODES.TERMINAL_NOT_FOUND);
    }

    try {
      this.lastActivity = Date.now();
      
      // Check if this is a command (ends with newline)
      if (data && data.includes('\n')) {
        // Extract the command part (everything before the newline)
        const command = data.replace(/\n|\r/g, '').trim();
        if (command) {
          this.setLastCommand(command);
        }
      }
      
      this.ptyProcess.write(data);
      
      // Log input (truncated for security)
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

  kill(signal = 'SIGTERM') {
    if (!this.ptyProcess) {
      return { success: true, message: 'Terminal not running' };
    }

    try {
      this.ptyProcess.kill(signal);
      this.status = 'killing';
      
      logger.info('Terminal session killed:', {
        sessionId: this.sessionId,
        signal
      });
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to kill terminal:', {
        sessionId: this.sessionId,
        error: error.message
      });
      
      throw new AppError(
        'Failed to kill terminal',
        500,
        ERROR_CODES.TERMINAL_WRITE_FAILED
      );
    }
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
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

class TerminalService {
  constructor() {
    this.sessions = new Map();
    this.maxSessions = 10; // Allow more terminal sessions than Claude sessions
    
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

    // Close existing session if any
    if (this.sessions.has(sessionId)) {
      await this.destroySession(sessionId);
    }

    const session = new TerminalSession(sessionId, options);
    this.sessions.set(sessionId, session);

    try {
      const result = await session.start();
      logger.info('Terminal session created:', { sessionId, sessions: this.sessions.size });
      return result;
    } catch (error) {
      this.sessions.delete(sessionId);
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
      // Remove from sessions even if kill failed
      this.sessions.delete(sessionId);
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

  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { exists: false };
    }
    return { exists: true, ...session.getStatus() };
  }

  getAllSessions() {
    const sessions = {};
    for (const [sessionId, session] of this.sessions.entries()) {
      sessions[sessionId] = session.getStatus();
    }
    return sessions;
  }

  async destroyAllSessions() {
    const promises = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      promises.push(session.kill().catch(err => {
        logger.error('Error destroying session:', { sessionId, error: err.message });
      }));
    }
    
    await Promise.all(promises);
    this.sessions.clear();
    
    logger.info('All terminal sessions destroyed');
  }

  cleanupInactiveSessions() {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === 'exited' || 
          (session.lastActivity && (now - session.lastActivity) > inactiveThreshold)) {
        logger.info('Cleaning up inactive terminal session:', { sessionId });
        session.kill().catch(err => {
          logger.error('Error cleaning up session:', { sessionId, error: err.message });
        });
        this.sessions.delete(sessionId);
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
const terminalService = new TerminalService();

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('Shutting down Terminal Service...');
  await terminalService.destroyAllSessions();
});

process.on('SIGINT', async () => {
  logger.info('Shutting down Terminal Service...');
  await terminalService.destroyAllSessions();
});

module.exports = terminalService;