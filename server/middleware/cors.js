const cors = require('cors');
const { API } = require('../utils/constants');
const logger = require('../utils/logger');

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl requests, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [API.CORS.ORIGIN];
    
    // Allow all origins in development
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check for localhost/development patterns
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/;
    const localNetworkPattern = /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/;
    
    if (localhostPattern.test(origin) || localNetworkPattern.test(origin)) {
      return callback(null, true);
    }
    
    logger.warn('CORS blocked request from origin:', { origin });
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  
  methods: API.CORS.METHODS,
  
  allowedHeaders: API.CORS.ALLOWED_HEADERS,
  
  credentials: true,
  
  // Preflight cache duration (24 hours)
  maxAge: 86400,
  
  // Success status for preflight requests
  optionsSuccessStatus: 200,
  
  // Allow credentials
  credentials: true
};

// Custom CORS middleware with logging
const corsWithLogging = (req, res, next) => {
  // Log CORS requests in development
  if (process.env.NODE_ENV === 'development') {
    logger.debug('CORS request:', {
      origin: req.get('origin'),
      method: req.method,
      url: req.url,
      headers: {
        'access-control-request-method': req.get('access-control-request-method'),
        'access-control-request-headers': req.get('access-control-request-headers')
      }
    });
  }
  
  // Apply CORS
  cors(corsOptions)(req, res, (err) => {
    if (err) {
      logger.error('CORS error:', {
        message: err.message,
        origin: req.get('origin'),
        method: req.method,
        url: req.url
      });
      return res.status(403).json({
        success: false,
        error: 'CORS policy violation',
        message: err.message
      });
    }
    next();
  });
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self' blob:; " +
    "connect-src 'self' ws: wss:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Strict Transport Security (if HTTPS)
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Remove server header
  res.removeHeader('X-Powered-By');
  
  next();
};

// Rate limiting for CORS preflight requests
const preflightRateLimit = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Limit preflight requests per IP
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!req.app.preflightRequests) {
      req.app.preflightRequests = new Map();
    }
    
    const now = Date.now();
    const requests = req.app.preflightRequests.get(clientIP) || [];
    
    // Remove old requests (older than 1 minute)
    const recentRequests = requests.filter(time => now - time < 60000);
    
    // Check if too many preflight requests
    if (recentRequests.length > 30) {
      logger.warn('Too many preflight requests from IP:', { clientIP });
      return res.status(429).json({
        success: false,
        error: 'Too many preflight requests'
      });
    }
    
    // Add current request
    recentRequests.push(now);
    req.app.preflightRequests.set(clientIP, recentRequests);
    
    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      const cutoff = now - 300000; // 5 minutes ago
      for (const [ip, times] of req.app.preflightRequests.entries()) {
        if (times.length === 0 || Math.max(...times) < cutoff) {
          req.app.preflightRequests.delete(ip);
        }
      }
    }
  }
  
  next();
};

module.exports = {
  corsWithLogging,
  securityHeaders,
  preflightRateLimit,
  corsOptions
};