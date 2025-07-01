// Server constants
const SERVER = {
  DEFAULT_PORT: 3000,
  DEFAULT_HOST: '0.0.0.0',
  MAX_MEMORY_MB: 200,
  SHUTDOWN_TIMEOUT: 10000
};

// Claude Code constants
const CLAUDE = {
  EXECUTABLE: 'claude',
  MAX_SESSIONS: 5,
  SESSION_TIMEOUT: 3600000, // 1 hour
  DEFAULT_SHELL: '/bin/bash',
  COMMANDS: {
    HELP: '/help',
    EXIT: '/exit',
    CLEAR: '/clear',
    STATUS: '/status'
  }
};

// Project constants
const PROJECT = {
  ROOT_DIR: process.env.PROJECTS_ROOT_PATH || '/home/pi/projects',
  CONFIG_DIR: '.claude',
  CONFIG_FILE: 'config.json',
  ALLOWED_EXTENSIONS: ['.js', '.py', '.ts', '.jsx', '.tsx', '.vue', '.php', '.rb', '.go', '.rs', '.java', '.cpp', '.c', '.h'],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  WATCH_EXTENSIONS: ['.js', '.py', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt']
};

// Terminal constants
const TERMINAL = {
  BUFFER_SIZE: 10000,
  SCROLLBACK: 1000,
  DEFAULT_COLS: 80,
  DEFAULT_ROWS: 24,
  ENCODING: 'utf8',
  THEME: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#ffffff',
    selection: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5'
  }
};

// WebSocket constants
const WEBSOCKET = {
  PING_TIMEOUT: 60000,
  PING_INTERVAL: 25000,
  UPGRADE_TIMEOUT: 10000,
  MAX_HTTP_BUFFER_SIZE: 1024 * 1024, // 1MB
  EVENTS: {
    // Client to Server
    JOIN_PROJECT: 'join-project',
    LEAVE_PROJECT: 'leave-project',
    TERMINAL_INPUT: 'terminal-input',
    TERMINAL_RESIZE: 'terminal-resize',
    CLAUDE_COMMAND: 'claude-command',
    PROJECT_ACTION: 'project-action',
    
    // Server to Client
    TERMINAL_OUTPUT: 'terminal-output',
    CLAUDE_RESPONSE: 'claude-response',
    PROJECT_STATUS: 'project-status',
    SYSTEM_STATUS: 'system-status',
    ERROR: 'error',
    NOTIFICATION: 'notification',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected'
  }
};

// API constants
const API = {
  BASE_PATH: '/api',
  VERSION: 'v1',
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },
  CORS: {
    ORIGIN: process.env.CORS_ORIGIN || '*',
    METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    ALLOWED_HEADERS: ['Content-Type', 'Authorization', 'X-Requested-With']
  }
};

// System monitoring constants
const MONITORING = {
  INTERVAL: 5000,
  METRICS: {
    CPU: 'cpu',
    MEMORY: 'memory',
    DISK: 'disk',
    NETWORK: 'network',
    TEMPERATURE: 'temperature'
  },
  THRESHOLDS: {
    CPU_WARNING: 80,
    CPU_CRITICAL: 95,
    MEMORY_WARNING: 80,
    MEMORY_CRITICAL: 95,
    DISK_WARNING: 80,
    DISK_CRITICAL: 95,
    TEMP_WARNING: 70,
    TEMP_CRITICAL: 80
  }
};

// Error codes
const ERROR_CODES = {
  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  
  // Project errors
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_CREATE_FAILED: 'PROJECT_CREATE_FAILED',
  PROJECT_DELETE_FAILED: 'PROJECT_DELETE_FAILED',
  PROJECT_CONFIG_INVALID: 'PROJECT_CONFIG_INVALID',
  
  // Claude errors
  CLAUDE_NOT_AVAILABLE: 'CLAUDE_NOT_AVAILABLE',
  CLAUDE_SESSION_FAILED: 'CLAUDE_SESSION_FAILED',
  CLAUDE_SESSION_NOT_FOUND: 'CLAUDE_SESSION_NOT_FOUND',
  CLAUDE_COMMAND_FAILED: 'CLAUDE_COMMAND_FAILED',
  
  // Terminal errors
  TERMINAL_CREATE_FAILED: 'TERMINAL_CREATE_FAILED',
  TERMINAL_NOT_FOUND: 'TERMINAL_NOT_FOUND',
  TERMINAL_WRITE_FAILED: 'TERMINAL_WRITE_FAILED',
  
  // System errors
  SYSTEM_OVERLOAD: 'SYSTEM_OVERLOAD',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR'
};

// Success messages
const SUCCESS_MESSAGES = {
  PROJECT_CREATED: 'Project created successfully',
  PROJECT_UPDATED: 'Project updated successfully',
  PROJECT_DELETED: 'Project deleted successfully',
  CLAUDE_SESSION_STARTED: 'Claude Code session started',
  CLAUDE_SESSION_STOPPED: 'Claude Code session stopped',
  TERMINAL_CREATED: 'Terminal session created',
  TERMINAL_DESTROYED: 'Terminal session destroyed'
};

// File type mappings
const FILE_TYPES = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.vue': 'vue',
  '.json': 'json',
  '.md': 'markdown',
  '.txt': 'text',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.env': 'env'
};

module.exports = {
  SERVER,
  CLAUDE,
  PROJECT,
  TERMINAL,
  WEBSOCKET,
  API,
  MONITORING,
  ERROR_CODES,
  SUCCESS_MESSAGES,
  FILE_TYPES
};