const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    // File transport
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Helper methods for different log levels
logger.debug = (message, meta = {}) => logger.log('debug', message, meta);
logger.info = (message, meta = {}) => logger.log('info', message, meta);
logger.warn = (message, meta = {}) => logger.log('warn', message, meta);
logger.error = (message, meta = {}) => logger.log('error', message, meta);

// System event logger
logger.system = (event, data = {}) => {
  logger.info(`[SYSTEM] ${event}`, { system: true, ...data });
};

// Socket event logger
logger.socket = (event, socketId, data = {}) => {
  logger.debug(`[SOCKET] ${event}`, { socketId, ...data });
};

// Claude Code event logger
logger.claude = (event, projectId, data = {}) => {
  logger.info(`[CLAUDE] ${event}`, { projectId, ...data });
};

module.exports = logger;