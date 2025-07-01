const crypto = require('crypto');
const logger = require('../utils/logger');
const { AppError } = require('./error-handler');
const { ERROR_CODES } = require('../utils/constants');

// Simple session store for basic authentication
class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // 5 minutes
  }

  create(sessionId, data) {
    const session = {
      id: sessionId,
      data: data,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    if (Date.now() > session.expires) {
      this.sessions.delete(sessionId);
      return null;
    }
    
    session.lastAccess = Date.now();
    return session;
  }

  destroy(sessionId) {
    return this.sessions.delete(sessionId);
  }

  cleanup() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expires) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

const sessionStore = new SessionStore();

// Generate secure session ID
const generateSessionId = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash password with salt
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

// Verify password
const verifyPassword = (password, salt, hash) => {
  const hashVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === hashVerify;
};

// Simple rate limiting for auth attempts
const authAttempts = new Map();

const rateLimitAuth = (ip) => {
  const now = Date.now();
  const attempts = authAttempts.get(ip) || [];
  
  // Remove old attempts (older than 15 minutes)
  const recentAttempts = attempts.filter(time => now - time < 900000);
  
  // Check if too many attempts
  if (recentAttempts.length >= 5) {
    return false;
  }
  
  // Add current attempt
  recentAttempts.push(now);
  authAttempts.set(ip, recentAttempts);
  
  return true;
};

// Basic authentication middleware
const basicAuth = (req, res, next) => {
  // Skip auth if disabled
  if (!process.env.ENABLE_AUTH || process.env.ENABLE_AUTH === 'false') {
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Check rate limiting
  if (!rateLimitAuth(clientIP)) {
    logger.warn('Authentication rate limit exceeded:', { ip: clientIP });
    return res.status(429).json({
      success: false,
      error: 'Too many authentication attempts',
      code: ERROR_CODES.SYSTEM_OVERLOAD
    });
  }

  // Check for session cookie
  const sessionId = req.cookies?.sessionId;
  if (sessionId) {
    const session = sessionStore.get(sessionId);
    if (session) {
      req.user = session.data;
      return next();
    }
  }

  // Check for Authorization header
  const authHeader = req.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: ERROR_CODES.UNAUTHORIZED
    });
  }

  try {
    // Decode basic auth
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Verify credentials
    const validUsername = process.env.USERNAME || 'admin';
    const validPassword = process.env.PASSWORD || 'admin123';

    if (username !== validUsername || password !== validPassword) {
      logger.warn('Invalid authentication attempt:', {
        ip: clientIP,
        username: username,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: ERROR_CODES.UNAUTHORIZED
      });
    }

    // Create session
    const newSessionId = generateSessionId();
    const userData = { username, loginTime: Date.now() };
    sessionStore.create(newSessionId, userData);

    // Set session cookie
    res.cookie('sessionId', newSessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    req.user = userData;
    
    logger.info('User authenticated:', {
      username,
      ip: clientIP,
      sessionId: newSessionId
    });

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: ERROR_CODES.INTERNAL_ERROR
    });
  }
};

// Login endpoint middleware
const handleLogin = (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
      code: ERROR_CODES.VALIDATION_ERROR
    });
  }

  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Check rate limiting
  if (!rateLimitAuth(clientIP)) {
    return res.status(429).json({
      success: false,
      error: 'Too many login attempts',
      code: ERROR_CODES.SYSTEM_OVERLOAD
    });
  }

  // Verify credentials
  const validUsername = process.env.USERNAME || 'admin';
  const validPassword = process.env.PASSWORD || 'admin123';

  if (username !== validUsername || password !== validPassword) {
    logger.warn('Invalid login attempt:', {
      ip: clientIP,
      username: username,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials',
      code: ERROR_CODES.UNAUTHORIZED
    });
  }

  // Create session
  const sessionId = generateSessionId();
  const userData = { username, loginTime: Date.now() };
  sessionStore.create(sessionId, userData);

  // Set session cookie
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  logger.info('User logged in:', {
    username,
    ip: clientIP,
    sessionId
  });

  res.json({
    success: true,
    message: 'Login successful',
    user: { username, loginTime: userData.loginTime }
  });
};

// Logout endpoint middleware
const handleLogout = (req, res) => {
  const sessionId = req.cookies?.sessionId;
  
  if (sessionId) {
    sessionStore.destroy(sessionId);
    res.clearCookie('sessionId');
    
    logger.info('User logged out:', {
      sessionId,
      ip: req.ip || req.connection.remoteAddress
    });
  }

  res.json({
    success: true,
    message: 'Logout successful'
  });
};

// Get current user info
const getCurrentUser = (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
      code: ERROR_CODES.UNAUTHORIZED
    });
  }

  res.json({
    success: true,
    user: req.user
  });
};

// Optional authentication middleware (doesn't block if not authenticated)
const optionalAuth = (req, res, next) => {
  if (!process.env.ENABLE_AUTH || process.env.ENABLE_AUTH === 'false') {
    return next();
  }

  const sessionId = req.cookies?.sessionId;
  if (sessionId) {
    const session = sessionStore.get(sessionId);
    if (session) {
      req.user = session.data;
    }
  }

  next();
};

// Cleanup function
const cleanup = () => {
  sessionStore.cleanup();
  
  // Clean up auth attempts
  const now = Date.now();
  for (const [ip, attempts] of authAttempts.entries()) {
    const recentAttempts = attempts.filter(time => now - time < 900000);
    if (recentAttempts.length === 0) {
      authAttempts.delete(ip);
    } else {
      authAttempts.set(ip, recentAttempts);
    }
  }
};

// Cleanup interval
setInterval(cleanup, 300000); // 5 minutes

module.exports = {
  basicAuth,
  optionalAuth,
  handleLogin,
  handleLogout,
  getCurrentUser,
  sessionStore
};