const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { schemas, middleware } = require('../utils/validator');
const projectService = require('../services/project-service');

// Get all projects
router.get('/', asyncHandler(async (req, res) => {
  const { limit, offset, type } = req.query;
  const projects = await projectService.getAllProjects({ limit, offset, type });
  
  res.json({
    success: true,
    projects,
    total: projects.length,
    timestamp: new Date().toISOString()
  });
}));

// Create new project
router.post('/', 
  middleware(schemas.project.create),
  asyncHandler(async (req, res) => {
    const project = await projectService.createProject(req.validated);
    
    res.status(201).json({
      success: true,
      project,
      message: 'Project created successfully',
      timestamp: new Date().toISOString()
    });
  })
);

// Get project by ID
router.get('/:id',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const project = await projectService.getProject(id);
    
    res.json({
      success: true,
      project,
      timestamp: new Date().toISOString()
    });
  })
);

// Update project
router.put('/:id',
  middleware(schemas.project.id, 'params'),
  middleware(schemas.project.update),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const project = await projectService.updateProject(id, req.validated);
    
    res.json({
      success: true,
      project,
      message: 'Project updated successfully',
      timestamp: new Date().toISOString()
    });
  })
);

// Delete project
router.delete('/:id',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await projectService.deleteProject(id);
    
    res.json({
      success: true,
      message: 'Project deleted successfully',
      timestamp: new Date().toISOString()
    });
  })
);

// Get project files
router.get('/:id/files',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { path = '' } = req.query;
    const files = await projectService.getProjectFiles(id, path);
    
    res.json({
      success: true,
      files,
      path,
      timestamp: new Date().toISOString()
    });
  })
);

// Get project statistics
router.get('/:id/stats',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const stats = await projectService.getProjectStats(id);
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  })
);

// Download project as ZIP
router.get('/:id/download',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { filename } = await projectService.downloadProject(id, res);
    
    // Headers are already set by the service
    // The response stream is handled by the service
    // This endpoint just ensures proper error handling
  })
);

module.exports = router;