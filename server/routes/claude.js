const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { schemas, middleware } = require('../utils/validator');
const claudeManager = require('../services/claude-manager');
const terminalService = require('../services/terminal-service');
const projectService = require('../services/project-service');
const logger = require('../utils/logger');

// Start Claude Code session for a project
router.post('/:projectId/start',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { shell, verbose } = req.body;
    
    // Get project to ensure it exists
    const project = await projectService.getProject(projectId);
    
    // Start Claude session
    const sessionResult = await claudeManager.startSession(projectId, project.path, {
      shell,
      verbose
    });
    
    // Create associated terminal session
    await terminalService.createClaudeTerminal(projectId, project.path, {
      shell
    });
    
    logger.claude('Claude Code session started via API', projectId);
    
    res.json({
      success: true,
      session: sessionResult,
      message: 'Claude Code session started successfully',
      timestamp: new Date().toISOString()
    });
  })
);

// Stop Claude Code session
router.post('/:projectId/stop',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { force = false } = req.body;
    
    // Stop Claude session
    const claudeResult = await claudeManager.stopSession(projectId, force);
    
    // Stop associated terminal session if exists
    try {
      await terminalService.destroySession(projectId);
    } catch (error) {
      // Terminal session might not exist, ignore error
      logger.warn('Terminal session not found during Claude stop:', { projectId });
    }
    
    logger.claude('Claude Code session stopped via API', projectId);
    
    res.json({
      success: true,
      result: claudeResult,
      timestamp: new Date().toISOString()
    });
  })
);

// Get Claude Code session status
router.get('/:projectId/status',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    
    const claudeStatus = claudeManager.getSessionStatus(projectId);
    const terminalStatus = terminalService.getSessionStatus(projectId);
    
    res.json({
      success: true,
      status: {
        claude: claudeStatus,
        terminal: terminalStatus,
        integrated: claudeStatus.exists && terminalStatus.exists
      },
      timestamp: new Date().toISOString()
    });
  })
);

// Send command to Claude Code
router.post('/:projectId/command',
  middleware(schemas.project.id, 'params'),
  middleware(schemas.claude.command),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { command, context } = req.validated;
    
    const result = await claudeManager.sendCommand(projectId, command, context);
    
    logger.claude('Command sent via API', projectId, {
      commandLength: command.length,
      hasContext: !!context
    });
    
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  })
);

// Get Claude Code session output
router.get('/:projectId/output',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { lines = 50 } = req.query;
    
    const session = claudeManager.getSession(projectId);
    const output = session.getRecentOutput(parseInt(lines));
    
    res.json({
      success: true,
      output,
      lines: output.length,
      timestamp: new Date().toISOString()
    });
  })
);

// Get all active Claude sessions
router.get('/',
  asyncHandler(async (req, res) => {
    const sessions = claudeManager.getAllSessions();
    
    res.json({
      success: true,
      sessions,
      count: Object.keys(sessions).length,
      timestamp: new Date().toISOString()
    });
  })
);

// Force stop all Claude sessions (admin operation)
router.post('/stop-all',
  asyncHandler(async (req, res) => {
    await claudeManager.stopAllSessions();
    await terminalService.destroyAllSessions();
    
    logger.warn('All Claude Code sessions stopped via API', {
      user: req.user?.username,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'All Claude Code sessions stopped',
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router;