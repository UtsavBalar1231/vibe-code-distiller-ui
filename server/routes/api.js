const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { SUCCESS_MESSAGES } = require('../utils/constants');
const path = require('path');
const TmuxUtils = require('../utils/tmux-utils');

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
        'POST /api/notification',
        'GET /api/system/status',
        'GET /api/system/logs',
        'GET /api/sessions',
        'DELETE /api/sessions/:sessionName'
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
        
        notifications: {
          'POST /notification': {
            description: 'Receive Claude Code notification hooks',
            body: {
              session_id: 'string - Claude session ID',
              transcript_path: 'string - Path to conversation transcript',
              message: 'string - Notification message',
              title: 'string - Notification title'
            },
            response: 'Success confirmation with notification details'
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
            'notification - System notification',
            'claude-notification - Claude Code hook notifications'
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

// Claude Code notification endpoint
router.post('/notification', (req, res) => {
  try {
    const { session_id, transcript_path, message, title } = req.body;
    
    // Extract project name from transcript path
    let projectName = 'Current Project';
    if (transcript_path) {
      const pathSegments = transcript_path.split('/');
      // Find the segment that contains the project (usually the parent directory of .claude)
      const claudeIndex = pathSegments.findIndex(segment => segment === '.claude');
      if (claudeIndex > 0) {
        projectName = pathSegments[claudeIndex - 1];
      }
    }
    
    // Create notification object
    const notification = {
      sessionId: session_id,
      projectName,
      message: message || 'Claude Code notification',
      title: title || 'Claude Code',
      timestamp: new Date().toISOString()
    };
    
    // Broadcast to all connected clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('claude-notification', notification);
      logger.info(`Notification sent to all clients: ${message} (Project: ${projectName})`);
    }
    
    res.json({
      success: true,
      message: 'Notification sent successfully',
      notification
    });
    
  } catch (error) {
    logger.error('Error processing notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process notification',
      details: error.message
    });
  }
});

// Get all claude-web sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await TmuxUtils.listSessions();
    const sessionInfos = [];
    
    for (const sessionName of sessions) {
      // 过滤掉base-session，确保用户永远看不到
      if (sessionName === 'base-session' || !sessionName.startsWith('claude-web-')) {
        continue;
      }
      
      const info = await TmuxUtils.getSessionInfo(sessionName);
      const parsed = TmuxUtils.parseSessionName(sessionName);
      
      sessionInfos.push({
        name: sessionName,
        projectId: parsed ? parsed.projectId : null,
        identifier: parsed ? parsed.identifier : null,
        created: info ? info.created : null,
        attached: info ? info.attached : false
      });
    }
    
    res.json({
      success: true,
      sessions: sessionInfos
    });
  } catch (error) {
    logger.error('Error getting sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sessions',
      details: error.message
    });
  }
});

// Delete a session
router.delete('/sessions/:sessionName', async (req, res) => {
  try {
    const { sessionName } = req.params;
    
    // 防止删除base-session
    if (sessionName === 'base-session') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete base session',
        details: 'base-session is a system session and cannot be deleted'
      });
    }
    
    // Validate session name format
    if (!sessionName.startsWith('claude-web-')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session name format',
        details: 'Session name must start with claude-web-'
      });
    }
    
    const result = await TmuxUtils.killSession(sessionName);
    
    if (result) {
      // Broadcast session deletion to all connected clients
      const io = req.app.get('io');
      if (io) {
        io.emit('session-deleted', { sessionName });
      }
      
      res.json({
        success: true,
        message: 'Session deleted successfully',
        sessionName
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete session',
        sessionName
      });
    }
  } catch (error) {
    logger.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete session',
      details: error.message
    });
  }
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