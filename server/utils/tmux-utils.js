const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('./logger');

class TmuxUtils {
  static SESSION_PREFIX = 'claude-web';
  
  static generateSessionName(projectId) {
    return `${this.SESSION_PREFIX}-${projectId}-${Date.now()}`;
  }
  
  static parseSessionName(sessionName) {
    const match = sessionName.match(/^claude-web-(.+)-(\d+)$/);
    if (match) {
      return {
        projectId: match[1],
        timestamp: parseInt(match[2])
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
      logger.info(`Created tmux session: ${sessionName}`);
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
      if (error.message.includes('no server running')) {
        return [];
      }
      throw error;
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
      const { stdout } = await execAsync(`tmux capture-pane -t ${sessionName} -p`);
      return stdout;
    } catch (error) {
      logger.error(`Failed to capture tmux pane: ${error.message}`);
      return '';
    }
  }
}

module.exports = TmuxUtils;