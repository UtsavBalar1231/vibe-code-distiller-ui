const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const logger = require('../utils/logger');
const { body, param, validationResult } = require('express-validator');
const config = require('config');

// Get project root directory
const getProjectRoot = () => {
  try {
    let rootDir = config.get('projects.rootDir');
    // Handle ~ path expansion
    if (rootDir.startsWith('~')) {
      rootDir = rootDir.replace('~', require('os').homedir());
    }
    return rootDir;
  } catch (error) {
    // Fallback to default if not configured
    return path.join(process.cwd(), '../projects');
  }
};

// Configure multer for image upload
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Helper function to ensure unique filename
const generateUniqueFilename = async (dir, originalName) => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  let filename = originalName;
  let counter = 1;

  while (await fs.pathExists(path.join(dir, filename))) {
    filename = `${baseName}_${counter}${ext}`;
    counter++;
  }

  return filename;
};

// Upload image to project
router.post('/upload', upload.single('image'), [
  body('projectId').notEmpty().withMessage('Project ID is required')
], asyncHandler(async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const { projectId } = req.body;
    const projectRoot = getProjectRoot();
    const projectDir = path.join(projectRoot, projectId);

    // Check if project exists
    if (!await fs.pathExists(projectDir)) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Create .images directory if it doesn't exist
    const imagesDir = path.join(projectDir, '.images');
    await fs.ensureDir(imagesDir);

    // Generate unique filename
    const filename = await generateUniqueFilename(imagesDir, req.file.originalname);
    const filePath = path.join(imagesDir, filename);

    // Save file
    await fs.writeFile(filePath, req.file.buffer);

    // Return relative path for Claude Code
    const relativePath = `.images/${filename}`;

    logger.info('Image uploaded successfully', {
      projectId,
      filename,
      size: req.file.size,
      relativePath
    });

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        filename,
        relativePath,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
}));

// Get images list for a project
router.get('/list/:projectId', [
  param('projectId').notEmpty().withMessage('Project ID is required')
], asyncHandler(async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { projectId } = req.params;
    const projectRoot = getProjectRoot();
    const projectDir = path.join(projectRoot, projectId);

    // Check if project exists
    if (!await fs.pathExists(projectDir)) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const imagesDir = path.join(projectDir, '.images');

    // If .images directory doesn't exist, return empty list
    if (!await fs.pathExists(imagesDir)) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Read images directory
    const files = await fs.readdir(imagesDir);
    const images = [];

    for (const file of files) {
      const filePath = path.join(imagesDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          images.push({
            filename: file,
            relativePath: `.images/${file}`,
            size: stats.size,
            modified: stats.mtime
          });
        }
      }
    }

    // Sort by modification time (newest first)
    images.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json({
      success: true,
      data: images
    });
}));

// Delete an image
router.delete('/:projectId/:filename', [
  param('projectId').notEmpty().withMessage('Project ID is required'),
  param('filename').notEmpty().withMessage('Filename is required')
], asyncHandler(async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { projectId, filename } = req.params;
    const projectRoot = getProjectRoot();
    const projectDir = path.join(projectRoot, projectId);

    // Check if project exists
    if (!await fs.pathExists(projectDir)) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const filePath = path.join(projectDir, '.images', filename);

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Delete file
    await fs.remove(filePath);

    logger.info('Image deleted successfully', {
      projectId,
      filename
    });

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
}));

// Serve image files
router.get('/serve/:projectId/:filename', [
  param('projectId').notEmpty().withMessage('Project ID is required'),
  param('filename').notEmpty().withMessage('Filename is required')
], asyncHandler(async (req, res) => {
    const { projectId, filename } = req.params;
    const projectRoot = getProjectRoot();
    const filePath = path.join(projectRoot, projectId, '.images', filename);

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Set appropriate headers
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
}));

module.exports = router;