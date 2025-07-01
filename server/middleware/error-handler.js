const logger = require('../utils/logger');
const { ERROR_CODES } = require('../utils/constants');

// Custom error class for application errors
class AppError extends Error {
  constructor(message, statusCode = 500, code = ERROR_CODES.INTERNAL_ERROR, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  // Log error details
  logger.error('Error caught by error handler:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    code: err.code,
    statusCode: err.statusCode
  });

  // Default error response
  let error = {
    success: false,
    message: 'Internal server error',
    code: ERROR_CODES.INTERNAL_ERROR,
    timestamp: new Date().toISOString()
  };

  // Handle different error types
  if (err instanceof AppError) {
    error.message = err.message;
    error.code = err.code;
    if (err.details) {
      error.details = err.details;
    }
    return res.status(err.statusCode).json(error);
  }

  // Handle Joi validation errors
  if (err.name === 'ValidationError') {
    error.message = 'Validation failed';
    error.code = ERROR_CODES.VALIDATION_ERROR;
    error.details = err.details || [];
    return res.status(400).json(error);
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error.message = 'Invalid JSON format';
    error.code = ERROR_CODES.VALIDATION_ERROR;
    return res.status(400).json(error);
  }

  // Handle file system errors
  if (err.code === 'ENOENT') {
    error.message = 'File or directory not found';
    error.code = ERROR_CODES.NOT_FOUND;
    return res.status(404).json(error);
  }

  if (err.code === 'EACCES') {
    error.message = 'Permission denied';
    error.code = ERROR_CODES.FORBIDDEN;
    return res.status(403).json(error);
  }

  if (err.code === 'ENOSPC') {
    error.message = 'Insufficient storage space';
    error.code = ERROR_CODES.RESOURCE_EXHAUSTED;
    return res.status(507).json(error);
  }

  // Handle specific HTTP errors
  if (err.status || err.statusCode) {
    const statusCode = err.status || err.statusCode;
    
    switch (statusCode) {
      case 400:
        error.message = 'Bad request';
        error.code = ERROR_CODES.VALIDATION_ERROR;
        break;
      case 401:
        error.message = 'Unauthorized';
        error.code = ERROR_CODES.UNAUTHORIZED;
        break;
      case 403:
        error.message = 'Forbidden';
        error.code = ERROR_CODES.FORBIDDEN;
        break;
      case 404:
        error.message = 'Not found';
        error.code = ERROR_CODES.NOT_FOUND;
        break;
      case 429:
        error.message = 'Too many requests';
        error.code = ERROR_CODES.SYSTEM_OVERLOAD;
        break;
      default:
        error.message = err.message || 'Internal server error';
    }
    
    return res.status(statusCode).json(error);
  }

  // Handle process/system errors
  if (err.code === 'EMFILE' || err.code === 'ENFILE') {
    error.message = 'Too many open files';
    error.code = ERROR_CODES.RESOURCE_EXHAUSTED;
    return res.status(503).json(error);
  }

  // Handle network errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
    error.message = 'Connection error';
    error.code = ERROR_CODES.INTERNAL_ERROR;
    return res.status(503).json(error);
  }

  // Default 500 error
  return res.status(500).json(error);
};

// 404 handler middleware
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.method} ${req.url} not found`,
    404,
    ERROR_CODES.NOT_FOUND
  );
  next(error);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Process error handlers
const handleUncaughtException = (err) => {
  logger.error('Uncaught Exception:', {
    message: err.message,
    stack: err.stack
  });
  
  // Graceful shutdown
  process.exit(1);
};

const handleUnhandledRejection = (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : null,
    promise: promise
  });
  
  // Graceful shutdown
  process.exit(1);
};

// Setup process error handlers
const setupProcessErrorHandlers = () => {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
  
  // Graceful shutdown on SIGTERM/SIGINT
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  setupProcessErrorHandlers
};