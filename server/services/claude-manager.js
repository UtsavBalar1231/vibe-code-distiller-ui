const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const { CLAUDE, ERROR_CODES, SUCCESS_MESSAGES } = require('../utils/constants');
const { AppError } = require('../middleware/error-handler');

class ClaudeSession {
  constructor(projectId, projectPath, options = {}) {
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.status = 'initializing';
    this.process = null;
    this.startTime = null;
    this.lastActivity = null;
    this.output = [];
    this.isReady = false;
    this.error = null;
    
    // Configuration
    this.options = {
      shell: options.shell || CLAUDE.DEFAULT_SHELL,
      cwd: projectPath,
      timeout: options.timeout || CLAUDE.SESSION_TIMEOUT,
      maxOutputBuffer: options.maxOutputBuffer || 10000,
      ...options
    };
    
    // Event callbacks
    this.callbacks = {
      onOutput: null,
      onError: null,
      onReady: null,
      onExit: null
    };
  }

  async start() {
    if (this.process) {
      throw new AppError('Session already started', 400, ERROR_CODES.CLAUDE_SESSION_FAILED);
    }

    try {
      this.status = 'starting';
      this.startTime = Date.now();
      
      // Check if Claude executable is available
      const claudeExecutable = await this.findClaudeExecutable();
      
      // Set up environment
      const env = {
        ...process.env,
        CLAUDE_WORKING_DIR: this.projectPath,
        CLAUDE_PROJECT_ID: this.projectId,
        // Disable interactive prompts
        CLAUDE_NON_INTERACTIVE: '1',
        // Enable colored output
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      };

      // Claude Code arguments
      const args = [
        '--working-dir', this.projectPath,
        '--project-name', this.projectId
      ];

      // Add any additional options
      if (this.options.verbose) {
        args.push('--verbose');
      }

      logger.claude('Starting Claude Code session', this.projectId, {
        executable: claudeExecutable,
        args: args,
        cwd: this.projectPath
      });

      // Spawn Claude Code process
      this.process = spawn(claudeExecutable, args, {
        cwd: this.projectPath,
        env: env,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      // Set up process event handlers
      this.setupProcessHandlers();
      
      // Wait for Claude to be ready
      await this.waitForReady();
      
      this.status = 'running';
      this.lastActivity = Date.now();
      
      logger.claude('Claude Code session started', this.projectId, {
        pid: this.process.pid,
        startupTime: Date.now() - this.startTime
      });
      
      return {
        sessionId: this.projectId,
        pid: this.process.pid,
        status: this.status,
        startTime: this.startTime
      };
      
    } catch (error) {
      this.status = 'failed';
      this.error = error.message;
      
      logger.error('Failed to start Claude Code session:', {
        projectId: this.projectId,
        error: error.message,
        stack: error.stack
      });
      
      throw new AppError(
        `Failed to start Claude Code session: ${error.message}`,
        500,
        ERROR_CODES.CLAUDE_SESSION_FAILED
      );
    }
  }

  async findClaudeExecutable() {
    // Try different common locations for Claude executable
    const possiblePaths = [
      process.env.CLAUDE_CODE_PATH,
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      'claude', // Let system PATH resolve it
      path.join(process.env.HOME || '/home/pi', '.local/bin/claude'),
      './node_modules/.bin/claude' // If installed locally
    ].filter(Boolean);

    for (const claudePath of possiblePaths) {
      try {
        if (claudePath === 'claude') {
          // Test if it's available in PATH
          return claudePath;
        } else {
          // Check if file exists and is executable
          if (await fs.pathExists(claudePath)) {
            const stats = await fs.stat(claudePath);
            if (stats.isFile()) {
              return claudePath;
            }
          }
        }
      } catch (error) {
        // Continue trying other paths
      }
    }

    throw new Error('Claude Code executable not found. Please ensure Claude Code is installed and accessible.');
  }

  setupProcessHandlers() {
    if (!this.process) return;

    // Handle stdout
    this.process.stdout.on('data', (data) => {
      const output = data.toString();
      this.handleOutput(output, 'stdout');
    });

    // Handle stderr
    this.process.stderr.on('data', (data) => {
      const output = data.toString();
      this.handleOutput(output, 'stderr');
    });

    // Handle process error
    this.process.on('error', (error) => {
      logger.error('Claude Code process error:', {
        projectId: this.projectId,
        error: error.message
      });
      
      this.status = 'error';
      this.error = error.message;
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      logger.claude('Claude Code process exited', this.projectId, {
        code,
        signal,
        uptime: this.getUptime()
      });
      
      this.status = 'stopped';
      this.process = null;
      
      if (this.callbacks.onExit) {
        this.callbacks.onExit(code, signal);
      }
    });

    // Handle process close
    this.process.on('close', (code, signal) => {
      logger.claude('Claude Code process closed', this.projectId, { code, signal });
    });
  }

  handleOutput(data, stream) {
    this.lastActivity = Date.now();
    
    // Add to output buffer
    const outputEntry = {
      timestamp: Date.now(),
      stream: stream,
      data: data
    };
    
    this.output.push(outputEntry);
    
    // Trim output buffer if too large
    if (this.output.length > this.options.maxOutputBuffer) {
      this.output = this.output.slice(-this.options.maxOutputBuffer);
    }
    
    // Check if Claude is ready
    if (!this.isReady && this.checkIfReady(data)) {
      this.isReady = true;
      if (this.callbacks.onReady) {
        this.callbacks.onReady();
      }
    }
    
    // Call output callback
    if (this.callbacks.onOutput) {
      this.callbacks.onOutput(data, stream);
    }
  }

  checkIfReady(output) {
    // Look for Claude Code ready indicators
    const readyIndicators = [
      'Claude Code is ready',
      'Waiting for your request',
      'How can I help you',
      'What would you like me to do',
      '> ', // Command prompt
      'claude>'
    ];
    
    return readyIndicators.some(indicator => 
      output.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  async waitForReady(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkReady = () => {
        if (this.isReady) {
          resolve();
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          reject(new Error('Claude Code session startup timeout'));
          return;
        }
        
        if (this.status === 'error' || this.status === 'failed') {
          reject(new Error(`Claude Code session failed: ${this.error}`));
          return;
        }
        
        setTimeout(checkReady, 100);
      };
      
      checkReady();
    });
  }

  async sendCommand(command) {
    if (!this.process || this.status !== 'running') {
      throw new AppError('Claude session not running', 400, ERROR_CODES.CLAUDE_SESSION_NOT_FOUND);
    }

    try {
      this.lastActivity = Date.now();
      
      // Ensure command ends with newline
      const commandToSend = command.endsWith('\n') ? command : command + '\n';
      
      logger.claude('Sending command', this.projectId, {
        command: command.substring(0, 100) // Log first 100 chars
      });
      
      // Write to process stdin
      this.process.stdin.write(commandToSend);
      
      return { success: true, timestamp: Date.now() };
    } catch (error) {
      logger.error('Failed to send command to Claude:', {
        projectId: this.projectId,
        error: error.message
      });
      
      throw new AppError(
        'Failed to send command to Claude',
        500,
        ERROR_CODES.CLAUDE_COMMAND_FAILED
      );
    }
  }

  async stop(force = false) {
    if (!this.process) {
      return { success: true, message: 'Session not running' };
    }

    try {
      logger.claude('Stopping Claude Code session', this.projectId, { force });
      
      if (force) {
        // Force kill
        this.process.kill('SIGKILL');
      } else {
        // Graceful shutdown
        try {
          // Try to send exit command first
          if (this.status === 'running') {
            await this.sendCommand('/exit');
            
            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          // Ignore errors when sending exit command
        }
        
        // Send SIGTERM
        this.process.kill('SIGTERM');
        
        // If still running after 5 seconds, force kill
        setTimeout(() => {
          if (this.process) {
            logger.warn('Force killing Claude Code process', { projectId: this.projectId });
            this.process.kill('SIGKILL');
          }
        }, 5000);
      }
      
      this.status = 'stopping';
      
      return { 
        success: true, 
        message: SUCCESS_MESSAGES.CLAUDE_SESSION_STOPPED 
      };
      
    } catch (error) {
      logger.error('Failed to stop Claude session:', {
        projectId: this.projectId,
        error: error.message
      });
      
      throw new AppError(
        'Failed to stop Claude session',
        500,
        ERROR_CODES.CLAUDE_SESSION_FAILED
      );
    }
  }

  getStatus() {
    return {
      projectId: this.projectId,
      status: this.status,
      isReady: this.isReady,
      pid: this.process?.pid || null,
      startTime: this.startTime,
      lastActivity: this.lastActivity,
      uptime: this.getUptime(),
      outputBuffer: this.output.length,
      error: this.error
    };
  }

  getUptime() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  getRecentOutput(lines = 50) {
    return this.output.slice(-lines);
  }
}

class ClaudeManager {
  constructor() {
    this.sessions = new Map();
    this.maxSessions = CLAUDE.MAX_SESSIONS;
    
    // Clean up inactive sessions periodically
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 300000); // Every 5 minutes
  }

  async startSession(projectId, projectPath, options = {}) {
    if (this.sessions.size >= this.maxSessions) {
      throw new AppError(
        `Maximum number of sessions (${this.maxSessions}) reached`,
        503,
        ERROR_CODES.SYSTEM_OVERLOAD
      );
    }

    // Stop existing session if any
    if (this.sessions.has(projectId)) {
      await this.stopSession(projectId);
    }

    const session = new ClaudeSession(projectId, projectPath, options);
    this.sessions.set(projectId, session);

    try {
      const result = await session.start();
      logger.info('Claude session started:', { projectId, sessions: this.sessions.size });
      return result;
    } catch (error) {
      this.sessions.delete(projectId);
      throw error;
    }
  }

  async stopSession(projectId, force = false) {
    const session = this.sessions.get(projectId);
    if (!session) {
      throw new AppError('Session not found', 404, ERROR_CODES.CLAUDE_SESSION_NOT_FOUND);
    }

    try {
      const result = await session.stop(force);
      this.sessions.delete(projectId);
      logger.info('Claude session stopped:', { projectId, sessions: this.sessions.size });
      return result;
    } catch (error) {
      // Remove from sessions even if stop failed
      this.sessions.delete(projectId);
      throw error;
    }
  }

  async sendCommand(projectId, command, context = {}) {
    const session = this.sessions.get(projectId);
    if (!session) {
      throw new AppError('Session not found', 404, ERROR_CODES.CLAUDE_SESSION_NOT_FOUND);
    }

    // Add context to command if provided
    let fullCommand = command;
    if (context.files && context.files.length > 0) {
      fullCommand = `Context files: ${context.files.join(', ')}\n\n${command}`;
    }
    if (context.focus) {
      fullCommand = `Focus: ${context.focus}\n\n${fullCommand}`;
    }

    return await session.sendCommand(fullCommand);
  }

  getSession(projectId) {
    const session = this.sessions.get(projectId);
    if (!session) {
      throw new AppError('Session not found', 404, ERROR_CODES.CLAUDE_SESSION_NOT_FOUND);
    }
    return session;
  }

  getSessionStatus(projectId) {
    const session = this.sessions.get(projectId);
    if (!session) {
      return { exists: false };
    }
    return { exists: true, ...session.getStatus() };
  }

  getAllSessions() {
    const sessions = {};
    for (const [projectId, session] of this.sessions.entries()) {
      sessions[projectId] = session.getStatus();
    }
    return sessions;
  }

  async stopAllSessions() {
    const promises = [];
    for (const [projectId, session] of this.sessions.entries()) {
      promises.push(session.stop().catch(err => {
        logger.error('Error stopping session:', { projectId, error: err.message });
      }));
    }
    
    await Promise.all(promises);
    this.sessions.clear();
    
    logger.info('All Claude sessions stopped');
  }

  cleanupInactiveSessions() {
    const now = Date.now();
    const inactiveThreshold = CLAUDE.SESSION_TIMEOUT;
    
    for (const [projectId, session] of this.sessions.entries()) {
      if (session.lastActivity && (now - session.lastActivity) > inactiveThreshold) {
        logger.info('Cleaning up inactive Claude session:', { projectId });
        session.stop().catch(err => {
          logger.error('Error cleaning up session:', { projectId, error: err.message });
        });
        this.sessions.delete(projectId);
      }
    }
  }

  // Event handler setup for WebSocket integration
  setupSessionCallbacks(projectId, callbacks) {
    const session = this.sessions.get(projectId);
    if (session) {
      session.setCallbacks(callbacks);
    }
  }
}

// Singleton instance
const claudeManager = new ClaudeManager();

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('Shutting down Claude Manager...');
  await claudeManager.stopAllSessions();
});

process.on('SIGINT', async () => {
  logger.info('Shutting down Claude Manager...');
  await claudeManager.stopAllSessions();
});

module.exports = claudeManager;