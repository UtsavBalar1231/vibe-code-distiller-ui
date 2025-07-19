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
      
      // Configure session for persistence and web terminal use
      await execAsync(`tmux set-option -t ${sessionName} status off`); // Disable status bar
      await execAsync(`tmux set-option -t ${sessionName} remain-on-exit on`); // Keep windows alive when command exits
      await execAsync(`tmux set-option -t ${sessionName} destroy-unattached off`); // Don't destroy when no clients attached
      
      // Configure for programmatic use and prevent automatic exit
      await execAsync(`tmux set-option -t ${sessionName} exit-empty off`); // Don't exit when all windows are closed
      await execAsync(`tmux set-option -t ${sessionName} detach-on-destroy off`); // Don't detach when session destroyed
      
      // Set reasonable limits for web use
      await execAsync(`tmux set-option -t ${sessionName} history-limit 10000`);
      
      // Set environment variables in the session to prevent shell timeout
      await execAsync(`tmux set-environment -t ${sessionName} TMOUT ""`); // Disable bash timeout
      await execAsync(`tmux set-environment -t ${sessionName} TERM xterm-256color`);
      
      logger.info(`Created persistent tmux session: ${sessionName}`);
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
  
  static async sendTmuxCommand(sessionName, command) {
    try {
      logger.info(`Sending tmux command sequence to ${sessionName}: ${command}`);
      
      // Method 1: Try sending all keys in one command (most reliable)
      try {
        await execAsync(`tmux send-keys -t ${sessionName} 'C-b' ':' '${command}' 'Enter'`);
        logger.info(`Successfully sent tmux command sequence to ${sessionName}`);
        return true;
      } catch (error) {
        logger.warn(`Single command failed, trying step-by-step approach: ${error.message}`);
      }
      
      // Method 2: Step-by-step with delays (fallback)
      // Send Ctrl+B (tmux prefix key)
      await execAsync(`tmux send-keys -t ${sessionName} 'C-b'`);
      
      // Small delay to ensure tmux processes the prefix key
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send ':' to enter command mode
      await execAsync(`tmux send-keys -t ${sessionName} ':'`);
      
      // Small delay to ensure command mode is activated
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Send the actual command
      await execAsync(`tmux send-keys -t ${sessionName} '${command}'`);
      
      // Small delay before sending Enter
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Send Enter to execute
      await execAsync(`tmux send-keys -t ${sessionName} 'Enter'`);
      
      logger.info(`Successfully sent tmux command with delays to ${sessionName}: ${command}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send tmux command to session: ${error.message}`);
      return false;
    }
  }
  
  static async getTTYdClients() {
    try {
      // Find TTYd process
      const { stdout: ttydProcess } = await execAsync('pgrep -f "ttyd.aarch64"');
      const ttydPid = ttydProcess.trim();
      
      if (!ttydPid) {
        logger.warn('TTYd process not found');
        return [];
      }
      
      // Find tmux client processes under TTYd
      const { stdout: clientPids } = await execAsync(`pgrep -P ${ttydPid} | xargs -I {} sh -c 'ps -p {} -o comm= | grep -q "tmux:" && echo {}'`);
      
      if (!clientPids.trim()) {
        logger.warn('No tmux client found under TTYd');
        return [];
      }
      
      const clients = [];
      const pids = clientPids.trim().split('\n');
      
      for (const clientPid of pids) {
        try {
          // Get the pts connected to this client
          const { stdout: lsofOutput } = await execAsync(`lsof -p ${clientPid} | grep pts`);
          const ptsMatch = lsofOutput.match(/\/dev\/pts\/(\d+)/);
          
          if (ptsMatch) {
            const ptsPath = `/dev/pts/${ptsMatch[1]}`;
            clients.push(ptsPath);
          }
        } catch (error) {
          logger.warn(`Failed to get pts for client ${clientPid}: ${error.message}`);
        }
      }
      
      logger.info(`Found TTYd clients: ${clients.join(', ')}`);
      return clients;
    } catch (error) {
      logger.error(`Failed to get TTYd clients: ${error.message}`);
      return [];
    }
  }

  static async switchToSession(sessionName, currentSessionName = null) {
    try {
      // First check if target session exists
      const exists = await this.hasSession(sessionName);
      if (!exists) {
        logger.warn(`Target session ${sessionName} does not exist`);
        return false;
      }
      
      // Get all TTYd client paths
      const ttydClients = await this.getTTYdClients();
      if (ttydClients.length === 0) {
        logger.warn('Cannot find any TTYd clients');
        return false;
      }
      
      logger.info(`Attempting to switch TTYd clients ${ttydClients.join(', ')} to ${sessionName}`);
      
      let success = false;
      
      // Try to switch all clients
      for (const ttydClient of ttydClients) {
        try {
          // Method 1: Direct tmux command with specific client
          await execAsync(`tmux switch-client -c ${ttydClient} -t ${sessionName}`);
          logger.info(`Successfully switched TTYd client ${ttydClient} to ${sessionName}`);
          success = true;
        } catch (error) {
          logger.warn(`Direct client switch failed for ${ttydClient}: ${error.message}, trying send-keys method`);
          
          // Method 2: Send keys to the specific client
          try {
            const switchCommand = `switch-client -t ${sessionName}`;
            logger.info(`Sending keys to TTYd client ${ttydClient}: Ctrl+B : ${switchCommand}`);
            
            // Send Ctrl+B prefix
            await execAsync(`tmux send-keys -t ${ttydClient} 'C-b'`);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Send : for command mode
            await execAsync(`tmux send-keys -t ${ttydClient} ':'`);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Send the switch command
            await execAsync(`tmux send-keys -t ${ttydClient} '${switchCommand}'`);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Send Enter to execute
            await execAsync(`tmux send-keys -t ${ttydClient} 'Enter'`);
            
            logger.info(`Successfully sent switch command to TTYd client ${ttydClient}`);
            success = true;
          } catch (sendKeysError) {
            logger.error(`Send-keys method failed for ${ttydClient}: ${sendKeysError.message}`);
          }
        }
      }
      
      return success;
    } catch (error) {
      logger.error(`Failed to switch to session: ${error.message}`);
      return false;
    }
  }
  
  static async capturePane(sessionName, includeHistory = true) {
    try {
      // Capture with history buffer for full terminal content
      // -S - : Start from beginning of history buffer
      // -e : Include escape sequences for proper formatting
      // -p : Print to stdout
      const captureCmd = includeHistory 
        ? `tmux capture-pane -t ${sessionName} -e -p -S -`
        : `tmux capture-pane -t ${sessionName} -e -p`;
      
      const { stdout } = await execAsync(captureCmd);
      
      if (!stdout || !stdout.trim()) {
        logger.debug(`No content captured for ${sessionName}`);
        return '';
      }
      
      // Remove excessive trailing newlines but keep the structure
      const trimmed = stdout.replace(/\n{3,}$/, '\n');
      
      logger.debug(`Captured pane content for ${sessionName}:`, {
        originalLength: stdout.length,
        trimmedLength: trimmed.length,
        includeHistory,
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