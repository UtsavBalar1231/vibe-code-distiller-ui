#!/usr/bin/env node

require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

// Import utilities and middleware
const logger = require('./utils/logger');
const { SERVER } = require('./utils/constants');
const { 
  errorHandler, 
  notFoundHandler, 
  setupProcessErrorHandlers 
} = require('./middleware/error-handler');
const { 
  corsWithLogging, 
  securityHeaders, 
  preflightRateLimit 
} = require('./middleware/cors');
const { basicAuth, optionalAuth } = require('./middleware/auth');

// Import routes
const apiRoutes = require('./routes/api');
const projectRoutes = require('./routes/projects');
const systemRoutes = require('./routes/system');
const claudeRoutes = require('./routes/claude');
const imageRoutes = require('./routes/images');
const fileRoutes = require('./routes/files');

// Import socket handler
const socketHandler = require('./socket-handler');

// Setup process error handlers
setupProcessErrorHandlers();

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1024 * 1024 // 1MB
});

// Store io instance for access in routes
app.set('io', io);

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Basic security middleware
app.use(helmet({
  contentSecurityPolicy: false, // We handle this in cors middleware
  crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// CORS and security headers
app.use(preflightRateLimit);
app.use(corsWithLogging);
app.use(securityHeaders);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      const error = new Error('Invalid JSON');
      error.status = 400;
      throw error;
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Cookie parsing
app.use(cookieParser());

// Static files (with optional auth for production)
if (process.env.NODE_ENV === 'production') {
  app.use('/assets', optionalAuth, express.static(path.join(__dirname, '../public/assets'), {
    maxAge: '7d',
    etag: true,
    lastModified: true
  }));
} else {
  app.use('/assets', express.static(path.join(__dirname, '../public/assets')));
}

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// Authentication routes (no auth required for login)
app.post('/api/auth/login', require('./middleware/auth').handleLogin);
app.post('/api/auth/logout', require('./middleware/auth').handleLogout);
app.get('/api/auth/user', basicAuth, require('./middleware/auth').getCurrentUser);

// Protected API routes
app.use('/api', basicAuth, apiRoutes);
app.use('/api/projects', basicAuth, projectRoutes);
app.use('/api/system', basicAuth, systemRoutes);
app.use('/api/claude', basicAuth, claudeRoutes);
app.use('/api/images', basicAuth, imageRoutes);
app.use('/api/files', basicAuth, fileRoutes);

// Serve main application (with auth in production)
app.get('/', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    basicAuth(req, res, next);
  } else {
    next();
  }
}, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve other static files
app.use(express.static(path.join(__dirname, '../public'), {
  index: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0'
}));

// Setup Socket.IO handlers
socketHandler(io);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Get port from environment or default
const port = process.env.PORT || SERVER.DEFAULT_PORT;
const host = process.env.HOST || SERVER.DEFAULT_HOST;

// Start server
const startServer = async () => {
  try {
    // Check if port is available
    server.listen(port, host, () => {
      logger.system('Server started', {
        port,
        host,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      });

      console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 🔧 Claude Code Web Manager                     ║
║                                                                ║
║  Server running at: http://${host}:${port}                           ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(20)} ║
║  PID: ${process.pid.toString().padEnd(25)}                          ║
║  Memory: ${(Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB').padEnd(20)} ║
║                                                                ║
║  Ready to manage your Claude Code projects! 🚀                 ║
╚════════════════════════════════════════════════════════════════╝
      `);
    });

    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error:', err);
        process.exit(1);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.system('Shutdown initiated', { signal });
      
      // Stop accepting new connections
      server.close(() => {
        logger.system('HTTP server closed');
        
        // Close all socket connections
        io.close(() => {
          logger.system('Socket.IO server closed');
          
          // Exit process
          process.exit(0);
        });
      });
      
      // Force exit after timeout
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, SERVER.SHUTDOWN_TIMEOUT);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io };