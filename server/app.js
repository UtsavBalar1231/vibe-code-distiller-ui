#!/usr/bin/env node

require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('config');

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

// Import routes
const apiRoutes = require('./routes/api');
const projectRoutes = require('./routes/projects');
const systemRoutes = require('./routes/system');
const claudeRoutes = require('./routes/claude');
const imageRoutes = require('./routes/images');
const fileRoutes = require('./routes/files');
const ttydRoutes = require('./routes/ttyd');

// Import socket handler
const socketHandler = require('./socket-handler');

// Import TTYd service
const ttydService = require('./services/ttyd-service');

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
  maxHttpBufferSize: 1024 * 1024, // 1MB
  transports: ['websocket', 'polling'], // Prefer websocket over polling
  allowEIO3: true, // Support older clients if needed
  upgradeTimeout: 30000, // 30 seconds for upgrade
  allowUpgrades: true
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
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

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

// Static files
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

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



// TTYd terminal proxy route - Dynamic proxy that gets target from service
const dynamicTTYdProxy = (req, res, next) => {
  const ttydPort = ttydService.getStatus().port;
  const proxy = createProxyMiddleware({
    target: `http://localhost:${ttydPort}`,
    changeOrigin: true,
    pathRewrite: {
      '^/terminal': '',
    },
    ws: false,
    logLevel: 'silent',
    timeout: 30000,
    proxyTimeout: 30000,
    secure: false,
    onError: (err, req, res) => {
      logger.error('TTYd proxy error:', { error: err.message, url: req.url, method: req.method });
      if (!res.headersSent) {
        res.status(502).json({ error: 'Terminal service unavailable', details: err.message });
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      delete proxyRes.headers['x-frame-options'];
      delete proxyRes.headers['content-security-policy'];
      delete proxyRes.headers['x-content-type-options'];
      logger.debug('TTYd proxy response:', { statusCode: proxyRes.statusCode, url: req.url });
    }
  });
  
  return proxy(req, res, next);
};

// Register TTYd proxy route early
app.use('/terminal', dynamicTTYdProxy);

// API routes (no authentication required)
app.use('/api', apiRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/claude', claudeRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/ttyd', ttydRoutes);

// Serve main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve other static files
app.use(express.static(path.join(__dirname, '../public'), {
  index: false,
  maxAge: '0'
}));

// Setup Socket.IO handlers
socketHandler(io);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Get port from environment, config, or default
const port = process.env.PORT || config.get('server.port') || SERVER.DEFAULT_PORT;
const host = process.env.HOST || config.get('server.host') || SERVER.DEFAULT_HOST;

// Setup tmux configuration function
const setupTmuxConfig = () => {
  try {
    const homeDir = os.homedir();
    const tmuxConfPath = path.join(homeDir, '.tmux.conf');
    
    // Required tmux configuration lines
    const requiredConfig = [
      'set -g mouse on',
      'set -g history-limit 10000',
      'set-hook -g client-attached \'refresh-client -S\'',
      'unbind-key -T root MouseDown3Pane'
    ];
    
    let configContent = '';
    let needsUpdate = false;
    
    // Check if .tmux.conf exists
    if (fs.existsSync(tmuxConfPath)) {
      configContent = fs.readFileSync(tmuxConfPath, 'utf8');
      logger.info('Found existing .tmux.conf file');
    } else {
      logger.info('.tmux.conf file not found, will create it');
      needsUpdate = true;
    }
    
    // Check if required configurations exist
    const missingConfig = requiredConfig.filter(line => !configContent.includes(line));
    
    if (missingConfig.length > 0 || needsUpdate) {
      if (missingConfig.length > 0) {
        logger.info(`Adding missing tmux configurations: ${missingConfig.join(', ')}`);
        // Append missing configurations
        const configToAdd = missingConfig.join('\n') + '\n';
        if (configContent && !configContent.endsWith('\n')) {
          configContent += '\n';
        }
        configContent += configToAdd;
      } else if (!configContent) {
        // Create new config file with required settings
        configContent = requiredConfig.join('\n') + '\n';
      }
      
      // Write the configuration file
      fs.writeFileSync(tmuxConfPath, configContent);
      logger.info('tmux configuration file updated successfully');
      
      // Source the tmux configuration if tmux is running
      try {
        execSync('tmux source-file ~/.tmux.conf 2>/dev/null', { stdio: 'ignore' });
        logger.info('tmux configuration sourced successfully');
      } catch (sourceError) {
        // This is expected if no tmux sessions are running
        logger.debug('Could not source tmux config (no active sessions)', sourceError.message);
      }
    } else {
      logger.info('tmux configuration is already properly set up');
    }
    
  } catch (error) {
    logger.error('Error setting up tmux configuration:', error.message);
  }
};

// Setup Claude aliases function
const setupClaudeAliases = () => {
  try {
    const homeDir = os.homedir();
    const bashrcPath = path.join(homeDir, '.bashrc');
    
    // Check if .bashrc exists
    if (!fs.existsSync(bashrcPath)) {
      logger.warn('.bashrc file not found, skipping alias setup');
      return;
    }
    
    // Read current .bashrc content
    const bashrcContent = fs.readFileSync(bashrcPath, 'utf8');
    
    // Check if aliases already exist
    const ccAliasExists = bashrcContent.includes('alias cc="claude"') || bashrcContent.includes("alias cc='claude'");
    const ccsAliasExists = bashrcContent.includes('alias ccs="claude --dangerously-skip-permissions"') || bashrcContent.includes("alias ccs='claude --dangerously-skip-permissions'");
    
    if (ccAliasExists && ccsAliasExists) {
      logger.info('Claude aliases already exist in .bashrc');
    } else {
      // Add aliases to .bashrc
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
    
    // Note: Aliases will be available in new shell sessions
    logger.info('Claude aliases are now available in new shell sessions (cc, ccs)');
    
  } catch (error) {
    logger.error('Error setting up Claude aliases:', error.message);
  }
};

// Start server
const startServer = async () => {
  try {
    // Setup Claude aliases at startup
    setupClaudeAliases();
    
    // Setup tmux configuration at startup
    setupTmuxConfig();
    
    // Start TTYd service first
    logger.info('Starting TTYd service...');
    try {
      await ttydService.start();
      logger.info('TTYd service started successfully');
      logger.info('TTYd proxy is ready (using dynamic proxy)');
      
    } catch (ttydError) {
      logger.error('Failed to start TTYd service:', ttydError);
      logger.error('Application will not start without TTYd service');
      process.exit(1);
    }
    
    // Manual WebSocket upgrade handling to avoid conflicts between Socket.IO and ttyd
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url;
      logger.debug('WebSocket upgrade request:', { pathname, headers: request.headers });
      
      if (pathname.startsWith('/terminal')) {
        // Forward terminal WebSocket upgrades to ttyd
        logger.debug('Forwarding terminal WebSocket upgrade to ttyd');
        
        // Create a proxy for WebSocket upgrade
        const { createProxyMiddleware } = require('http-proxy-middleware');
        const ttydPort = ttydService.getStatus().port;
        const wsProxy = createProxyMiddleware({
          target: `http://localhost:${ttydPort}`,
          changeOrigin: true,
          pathRewrite: {
            '^/terminal': '', // remove /terminal prefix when forwarding to ttyd
          },
          ws: true,
          logLevel: 'silent'
        });
        
        wsProxy.upgrade(request, socket, head);
      } else {
        // Let Socket.IO handle its own WebSocket upgrades
        logger.debug('Letting Socket.IO handle WebSocket upgrade');
        // Socket.IO will handle its own upgrade events
      }
    });
    
    // Check if port is available
    server.listen(port, host, () => {
      logger.system('Server started', {
        port,
        host,
        environment: 'development',
        pid: process.pid,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      });

      console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 🔧 Claude Code Web Manager                     ║
║                                                                ║
║  Server running at: http://${host}:${port}                           ║
║  Environment: development       ║
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
      
      // Stop TTYd service first
      try {
        logger.info('Stopping TTYd service...');
        await ttydService.stop();
        logger.info('TTYd service stopped');
      } catch (ttydError) {
        logger.error('Error stopping TTYd service:', ttydError);
      }
      
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