const config = require('config');
const logger = require('../utils/logger');

// Determine which terminal service to use based on configuration
const useTmux = config.get('terminal.tmux.enabled');

logger.info(`Terminal Service: Using ${useTmux ? 'tmux' : 'standard'} terminal service`);

// Export the appropriate service
if (useTmux) {
  module.exports = require('./terminal-service-tmux');
} else {
  module.exports = require('./terminal-service');
}