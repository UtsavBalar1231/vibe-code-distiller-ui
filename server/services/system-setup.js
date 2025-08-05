const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const logger = require('../utils/logger');

class SystemSetupService {
  async initialize() {
    try {
      logger.info('Starting system setup...');
      
      const gitInstalled = this.checkGitInstallation();
      if (!gitInstalled) {
        throw new Error('Git installation failed');
      }
      
      await this.setupClaudeAliases();
      await this.setupTmuxConfig();
      
      logger.info('System setup completed successfully');
      return true;
    } catch (error) {
      logger.error('System setup failed:', error.message);
      throw error;
    }
  }

  checkGitInstallation() {
    try {
      execSync('git --version', { stdio: 'ignore' });
      logger.info('Git installation verified successfully');
      return true;
    } catch (error) {
      const errorMessage = 'Git is not installed or not available in PATH. Please install Git before starting the application.';
      logger.error(errorMessage);
      console.error(`
╔════════════════════════════════════════════════════════════════╗
║                         ❌ STARTUP ERROR                       ║
║                                                                ║
║  Git is required for file editing functionality but was not    ║
║  found on this system.                                         ║
║                                                                ║
║  Please install Git and ensure it's available in your PATH:   ║
║                                                                ║
║  • Ubuntu/Debian: sudo apt install git                        ║
║  • CentOS/RHEL: sudo yum install git                          ║
║  • macOS: xcode-select --install                              ║
║                                                                ║
║  After installing Git, restart the application.               ║
╚════════════════════════════════════════════════════════════════╝
      `);
      return false;
    }
  }

  async setupClaudeAliases() {
    try {
      const homeDir = os.homedir();
      const bashrcPath = path.join(homeDir, '.bashrc');
      
      if (!fs.existsSync(bashrcPath)) {
        logger.warn('.bashrc file not found, skipping alias setup');
        return;
      }
      
      const bashrcContent = fs.readFileSync(bashrcPath, 'utf8');
      
      const ccAliasExists = bashrcContent.includes('alias cc="claude"') || bashrcContent.includes("alias cc='claude'");
      const ccsAliasExists = bashrcContent.includes('alias ccs="claude --dangerously-skip-permissions"') || bashrcContent.includes("alias ccs='claude --dangerously-skip-permissions'");
      
      if (ccAliasExists && ccsAliasExists) {
        logger.info('Claude aliases already exist in .bashrc');
      } else {
        const aliasesToAdd = [];
        
        if (!ccAliasExists) {
          aliasesToAdd.push('alias cc="claude"');
        }
        
        if (!ccsAliasExists) {
          aliasesToAdd.push('alias ccs="claude --dangerously-skip-permissions"');
        }
        
        if (aliasesToAdd.length > 0) {
          const aliasSection = `\n# Claude aliases\n${aliasesToAdd.join('\n')}\n`;
          fs.appendFileSync(bashrcPath, aliasSection);
          logger.info(`Added Claude aliases to .bashrc: ${aliasesToAdd.join(', ')}`);
        }
      }
      
      logger.info('Claude aliases are now available in new shell sessions (cc, ccs)');
      
    } catch (error) {
      logger.error('Error setting up Claude aliases:', error.message);
    }
  }

  async setupTmuxConfig() {
    try {
      const homeDir = os.homedir();
      const tmuxConfPath = path.join(homeDir, '.tmux.conf');
      
      const requiredConfig = [
        'set -g mouse on',
        'set -g history-limit 10000',
        'set-hook -g client-attached \'refresh-client -S\'',
        'unbind-key -T root MouseDown3Pane'
      ];
      
      let configContent = '';
      let needsUpdate = false;
      
      if (fs.existsSync(tmuxConfPath)) {
        configContent = fs.readFileSync(tmuxConfPath, 'utf8');
        logger.info('Found existing .tmux.conf file');
      } else {
        logger.info('.tmux.conf file not found, will create it');
        needsUpdate = true;
      }
      
      const missingConfig = requiredConfig.filter(line => !configContent.includes(line));
      
      if (missingConfig.length > 0 || needsUpdate) {
        if (missingConfig.length > 0) {
          logger.info(`Adding missing tmux configurations: ${missingConfig.join(', ')}`);
          const configToAdd = missingConfig.join('\n') + '\n';
          if (configContent && !configContent.endsWith('\n')) {
            configContent += '\n';
          }
          configContent += configToAdd;
        } else if (!configContent) {
          configContent = requiredConfig.join('\n') + '\n';
        }
        
        fs.writeFileSync(tmuxConfPath, configContent);
        logger.info('tmux configuration file updated successfully');
        
        try {
          execSync('tmux source-file ~/.tmux.conf 2>/dev/null', { stdio: 'ignore' });
          logger.info('tmux configuration sourced successfully');
        } catch (sourceError) {
          logger.debug('Could not source tmux config (no active sessions)', sourceError.message);
        }
      } else {
        logger.info('tmux configuration is already properly set up');
      }
      
    } catch (error) {
      logger.error('Error setting up tmux configuration:', error.message);
    }
  }
}

module.exports = new SystemSetupService();