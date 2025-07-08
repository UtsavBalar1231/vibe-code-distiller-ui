const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('./logger');

class TmuxUtils {
  static SESSION_PREFIX = 'claude-web';
  
  static generateSessionName(projectId, sequenceNumber = null) {
    if (sequenceNumber !== null) {
      return `${this.SESSION_PREFIX}-${projectId}-${sequenceNumber}`;
    }
    return `${this.SESSION_PREFIX}-${projectId}-${Date.now()}`;
  }
  
  static parseSessionName(sessionName) {
    const match = sessionName.match(/^claude-web-(.+)-(\d+)$/);
    if (match) {
      return {
        projectId: match[1],
        identifier: parseInt(match[2]) // Can be timestamp or sequence number
      };
    }
    return null;
  }
  
  static async hasSession(sessionName) {
    try {
      await execAsync(`tmux has-session -t ${sessionName}`);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  static async createSession(sessionName, workingDir = null) {
    try {
      const cdCmd = workingDir ? `cd ${workingDir}` : '';
      const cmd = `tmux new-session -d -s ${sessionName} ${cdCmd ? `-c ${workingDir}` : ''}`;
      await execAsync(cmd);
      
      // Disable status bar for web terminal manager use case
      // This prevents the delayed status bar appearance that confuses users
      await execAsync(`tmux set-option -t ${sessionName} status off`);
      
      logger.info(`Created tmux session with disabled status bar: ${sessionName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to create tmux session: ${error.message}`);
      throw error;
    }
  }
  
  static async listSessions() {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
      const sessions = stdout.trim().split('\n').filter(Boolean);
      return sessions.filter(session => session.startsWith(this.SESSION_PREFIX));
    } catch (error) {
      if (error.message.includes('no server running') || 
          error.message.includes('No such file or directory')) {
        return [];
      }
      throw error;
    }
  }
  
  static async getNextSequenceNumber(projectId) {
    try {
      const sessions = await this.listSessions();
      const projectSessions = sessions.filter(session => {
        const parsed = this.parseSessionName(session);
        return parsed && parsed.projectId === projectId;
      });
      
      if (projectSessions.length === 0) {
        return 1;
      }
      
      const sequenceNumbers = projectSessions.map(session => {
        const parsed = this.parseSessionName(session);
        return parsed ? parsed.identifier : 0;
      }).filter(num => num > 0 && num < 1000000000); // Filter out timestamps
      
      return sequenceNumbers.length > 0 ? Math.max(...sequenceNumbers) + 1 : 1;
    } catch (error) {
      logger.error(`Failed to get next sequence number: ${error.message}`);
      return 1;
    }
  }
  
  static async getSessionInfo(sessionName) {
    try {
      const { stdout } = await execAsync(
        `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}" | grep "^${sessionName}:"`
      );
      const [name, created, attached] = stdout.trim().split(':');
      return {
        name,
        created: new Date(parseInt(created) * 1000),
        attached: attached === '1'
      };
    } catch (error) {
      return null;
    }
  }
  
  static async killSession(sessionName) {
    try {
      await execAsync(`tmux kill-session -t ${sessionName}`);
      logger.info(`Killed tmux session: ${sessionName}`);
      return true;
    } catch (error) {
      if (error.message.includes("can't find session")) {
        logger.debug(`Tmux session already gone: ${sessionName}`);
        return true; // Session doesn't exist, which is what we wanted
      }
      logger.error(`Failed to kill tmux session: ${error.message}`);
      return false;
    }
  }
  
  static async sendKeys(sessionName, keys) {
    try {
      await execAsync(`tmux send-keys -t ${sessionName} "${keys}" Enter`);
      return true;
    } catch (error) {
      logger.error(`Failed to send keys to tmux session: ${error.message}`);
      return false;
    }
  }
  
  static async capturePane(sessionName) {
    try {
      // Use -e to preserve escape sequences (colors) and -J to preserve line breaks
      // -S -50 captures last 50 lines to avoid too much history
      // -E - means end at current line
      // -p means print to stdout
      const { stdout } = await execAsync(`tmux capture-pane -t ${sessionName} -e -J -S -50 -E - -p`);
      
      if (!stdout || !stdout.trim()) {
        logger.debug(`No content captured for ${sessionName}, trying current screen only`);
        // If no content, try capturing just the current screen
        const { stdout: currentScreen } = await execAsync(`tmux capture-pane -t ${sessionName} -e -p`);
        return currentScreen || '';
      }
      
      // Remove excessive trailing newlines but keep the structure
      const trimmed = stdout.replace(/\n{3,}$/, '\n');
      
      logger.debug(`Captured pane content for ${sessionName}:`, {
        originalLength: stdout.length,
        trimmedLength: trimmed.length,
        hasEscapeSequences: /\x1b\[/.test(trimmed),
        preview: trimmed.substring(0, 200).replace(/\x1b\[[0-9;]*[mGKHFJST]/g, '<ESC>').replace(/\r?\n/g, '\\n')
      });
      
      return trimmed;
    } catch (error) {
      logger.error(`Failed to capture tmux pane: ${error.message}`);
      return '';
    }
  }
  
  static async getCursorPosition(sessionName) {
    try {
      // Get exact cursor position using tmux built-in variables
      const { stdout } = await execAsync(`tmux display-message -t ${sessionName} -p -F '#{cursor_x} #{cursor_y}'`);
      const positions = stdout.trim().split(' ');
      
      if (positions.length === 2) {
        const cursorX = parseInt(positions[0], 10);
        const cursorY = parseInt(positions[1], 10);
        
        logger.debug(`Got cursor position for ${sessionName}: x=${cursorX}, y=${cursorY}`);
        return { cursorX, cursorY };
      }
      
      logger.warn(`Invalid cursor position format for ${sessionName}: ${stdout}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get cursor position for ${sessionName}: ${error.message}`);
      return null;
    }
  }
  
  static async disableStatusBar(sessionName) {
    try {
      // Disable tmux status bar to prevent delayed appearance in web terminal
      await execAsync(`tmux set-option -t ${sessionName} status off`);
      logger.debug(`Disabled status bar for session: ${sessionName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to disable status bar for ${sessionName}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = TmuxUtils;