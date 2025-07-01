const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { SUCCESS_MESSAGES } = require('../utils/constants');

// API status endpoint
router.get('/status', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  res.json({
    success: true,
    status: 'operational',
    uptime: {
      seconds: Math.floor(uptime),
      human: formatUptime(uptime)
    },
    memory: {
      used: Math.round(memory.heapUsed / 1024 / 1024),
      total: Math.round(memory.heapTotal / 1024 / 1024),
      external: Math.round(memory.external / 1024 / 1024),
      rss: Math.round(memory.rss / 1024 / 1024)
    },
    process: {
      pid: process.pid,
      version: process.version,
      platform: process.platform,
      arch: process.arch
    },
    timestamp: new Date().toISOString()
  });
});

// API version endpoint
router.get('/version', (req, res) => {
  res.json({
    success: true,
    version: '1.0.0',
    name: 'Claude Code Web Manager',
    description: 'Professional web interface for managing Claude Code CLI projects',
    api: {
      version: 'v1',
      endpoints: [
        'GET /api/status',
        'GET /api/version',
        'GET /api/projects',
        'POST /api/projects',
        'GET /api/projects/:id',
        'PUT /api/projects/:id',
        'DELETE /api/projects/:id',
        'POST /api/claude/:projectId/start',
        'POST /api/claude/:projectId/stop',
        'GET /api/claude/:projectId/status',
        'GET /api/system/status',
        'GET /api/system/logs'
      ]
    }
  });
});

// API documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    success: true,
    documentation: {
      title: 'Claude Code Web Manager API',
      version: '1.0.0',
      description: 'RESTful API for managing Claude Code projects and sessions',
      baseUrl: `${req.protocol}://${req.get('host')}/api`,
      authentication: process.env.ENABLE_AUTH === 'true' ? 'Basic Auth' : 'None',
      
      endpoints: {
        projects: {
          'GET /projects': {
            description: 'Get all projects',
            parameters: {
              limit: 'number (optional) - Maximum number of projects to return',
              offset: 'number (optional) - Number of projects to skip',
              type: 'string (optional) - Filter by project type'
            },
            response: 'Array of project objects'
          },
          'POST /projects': {
            description: 'Create a new project',
            body: {
              name: 'string (required) - Project name',
              description: 'string (optional) - Project description',
              type: 'string (optional) - Project type',
              language: 'string (optional) - Programming language',
              framework: 'string (optional) - Framework name'
            },
            response: 'Created project object'
          },
          'GET /projects/:id': {
            description: 'Get project by ID',
            parameters: { id: 'string - Project ID' },
            response: 'Project object'
          },
          'PUT /projects/:id': {
            description: 'Update project',
            parameters: { id: 'string - Project ID' },
            body: 'Partial project object',
            response: 'Updated project object'
          },
          'DELETE /projects/:id': {
            description: 'Delete project',
            parameters: { id: 'string - Project ID' },
            response: 'Success confirmation'
          }
        },
        
        claude: {
          'POST /claude/:projectId/start': {
            description: 'Start Claude Code session for project',
            parameters: { projectId: 'string - Project ID' },
            response: 'Session information'
          },
          'POST /claude/:projectId/stop': {
            description: 'Stop Claude Code session',
            parameters: { projectId: 'string - Project ID' },
            response: 'Success confirmation'
          },
          'GET /claude/:projectId/status': {
            description: 'Get Claude Code session status',
            parameters: { projectId: 'string - Project ID' },
            response: 'Session status information'
          }
        },
        
        system: {
          'GET /system/status': {
            description: 'Get system status and metrics',
            response: 'System status object'
          },
          'GET /system/logs': {
            description: 'Get application logs',
            parameters: {
              level: 'string (optional) - Log level filter',
              limit: 'number (optional) - Maximum number of log entries',
              since: 'string (optional) - ISO timestamp to filter logs since'
            },
            response: 'Array of log entries'
          }
        }
      },
      
      websocket: {
        url: `ws://${req.get('host')}`,
        events: {
          client_to_server: [
            'join-project - Join a project room',
            'leave-project - Leave a project room',
            'terminal-input - Send input to terminal',
            'terminal-resize - Resize terminal',
            'claude-command - Send command to Claude'
          ],
          server_to_client: [
            'terminal-output - Terminal output data',
            'claude-response - Claude response',
            'project-status - Project status update',
            'system-status - System status update',
            'error - Error message',
            'notification - System notification'
          ]
        }
      },
      
      errors: {
        format: {
          success: false,
          error: 'Error message',
          code: 'ERROR_CODE',
          details: 'Additional error details (optional)',
          timestamp: 'ISO timestamp'
        },
        codes: [
          'VALIDATION_ERROR - Invalid input data',
          'NOT_FOUND - Resource not found',
          'UNAUTHORIZED - Authentication required',
          'FORBIDDEN - Access denied',
          'PROJECT_NOT_FOUND - Project does not exist',
          'CLAUDE_SESSION_FAILED - Failed to start Claude session',
          'TERMINAL_CREATE_FAILED - Failed to create terminal',
          'SYSTEM_OVERLOAD - System resources exhausted'
        ]
      }
    }
  });
});

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

module.exports = router;