const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const { asyncHandler } = require('../middleware/error-handler');
const { schemas, middleware } = require('../utils/validator');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error-handler');
const { ERROR_CODES } = require('../utils/constants');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Maximum 10 files at once
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types
    cb(null, true);
  }
});

// Helper function to get project path (simplified)
function getProjectPath(projectId) {
  const projectsRoot = '/home/lanpangzi/projects'; // Use hardcoded path for now
  return path.join(projectsRoot, projectId);
}

// Enhanced file listing with hidden files support
router.get('/:projectId/browse',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { path: relativePath = '', showHidden = 'true' } = req.query;
    
    try {
      const projectPath = getProjectPath(projectId);
      const fullPath = path.join(projectPath, relativePath);
      
      // Security check - ensure path is within project directory
      if (!fullPath.startsWith(projectPath)) {
        throw new AppError('Invalid file path', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      const stats = await fs.stat(fullPath);
      
      if (stats.isFile()) {
        // Return file information
        const fileInfo = {
          type: 'file',
          name: path.basename(fullPath),
          path: relativePath,
          size: stats.size,
          extension: path.extname(fullPath),
          modified: stats.mtime,
          isHidden: path.basename(fullPath).startsWith('.')
        };
        
        res.json({
          success: true,
          file: fileInfo,
          timestamp: new Date().toISOString()
        });
      } else {
        // Return directory listing
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const files = [];
        
        for (const entry of entries) {
          // Include hidden files if requested
          if (entry.name.startsWith('.') && showHidden !== 'true') {
            continue;
          }
          
          const entryPath = path.join(fullPath, entry.name);
          const entryStats = await fs.stat(entryPath);
          
          files.push({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: path.join(relativePath, entry.name),
            size: entry.isFile() ? entryStats.size : 0,
            extension: entry.isFile() ? path.extname(entry.name) : null,
            modified: entryStats.mtime,
            isHidden: entry.name.startsWith('.')
          });
        }
        
        // Sort: directories first, then files, alphabetically
        files.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        
        res.json({
          success: true,
          directory: {
            type: 'directory',
            name: path.basename(fullPath) || projectId,
            path: relativePath,
            files
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Failed to browse project files:', error);
      throw new AppError(
        'Failed to access project files',
        500,
        ERROR_CODES.FILE_ACCESS_ERROR
      );
    }
  })
);

// File upload to specific directory
router.post('/:projectId/upload',
  middleware(schemas.project.id, 'params'),
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { targetPath = '' } = req.body;
    const files = req.files;
    
    if (!files || files.length === 0) {
      throw new AppError('No files provided', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    
    try {
      const projectPath = getProjectPath(projectId);
      const uploadDir = path.join(projectPath, targetPath);
      
      // Security check - ensure path is within project directory
      if (!uploadDir.startsWith(projectPath)) {
        throw new AppError('Invalid upload path', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      // Ensure target directory exists
      await fs.ensureDir(uploadDir);
      
      const uploadedFiles = [];
      
      for (const file of files) {
        let filename = file.originalname;
        let filePath = path.join(uploadDir, filename);
        
        // Handle filename conflicts
        let counter = 1;
        while (await fs.pathExists(filePath)) {
          const ext = path.extname(filename);
          const baseName = path.basename(filename, ext);
          filename = `${baseName}_${counter}${ext}`;
          filePath = path.join(uploadDir, filename);
          counter++;
        }
        
        // Write file
        await fs.writeFile(filePath, file.buffer);
        
        const stats = await fs.stat(filePath);
        uploadedFiles.push({
          name: filename,
          originalName: file.originalname,
          size: stats.size,
          path: path.join(targetPath, filename),
          type: 'file',
          extension: path.extname(filename),
          mimeType: file.mimetype,
          modified: stats.mtime
        });
      }
      
      res.json({
        success: true,
        message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
        files: uploadedFiles,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to upload files:', error);
      throw new AppError(
        'Failed to upload files',
        500,
        ERROR_CODES.FILE_UPLOAD_ERROR
      );
    }
  })
);

// Create new directory
router.post('/:projectId/mkdir',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { path: relativePath, name } = req.body;
    
    if (!name) {
      throw new AppError('Directory name is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    
    try {
      const projectPath = getProjectPath(projectId);
      const parentDir = path.join(projectPath, relativePath || '');
      const newDir = path.join(parentDir, name);
      
      // Security check
      if (!newDir.startsWith(projectPath)) {
        throw new AppError('Invalid directory path', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      // Check if directory already exists
      if (await fs.pathExists(newDir)) {
        throw new AppError('Directory already exists', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      await fs.ensureDir(newDir);
      
      res.json({
        success: true,
        message: 'Directory created successfully',
        directory: {
          name,
          path: path.join(relativePath || '', name),
          type: 'directory'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to create directory:', error);
      throw new AppError(
        'Failed to create directory',
        500,
        ERROR_CODES.FILE_ACCESS_ERROR
      );
    }
  })
);

// Delete file or directory
router.delete('/:projectId/remove',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { path: relativePath } = req.query;
    
    if (!relativePath) {
      throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    
    try {
      const projectPath = getProjectPath(projectId);
      const fullPath = path.join(projectPath, relativePath);
      
      // Security check
      if (!fullPath.startsWith(projectPath)) {
        throw new AppError('Invalid file path', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      if (!(await fs.pathExists(fullPath))) {
        throw new AppError('File or directory not found', 404, ERROR_CODES.FILE_NOT_FOUND);
      }
      
      const stats = await fs.stat(fullPath);
      const isDirectory = stats.isDirectory();
      
      await fs.remove(fullPath);
      
      res.json({
        success: true,
        message: `${isDirectory ? 'Directory' : 'File'} deleted successfully`,
        path: relativePath,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to delete file:', error);
      throw new AppError(
        'Failed to delete file',
        500,
        ERROR_CODES.FILE_ACCESS_ERROR
      );
    }
  })
);

// Download single file
router.get('/:projectId/download',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { path: relativePath } = req.query;
    
    if (!relativePath) {
      throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    
    try {
      const projectPath = getProjectPath(projectId);
      const fullPath = path.join(projectPath, relativePath);
      
      // Security check
      if (!fullPath.startsWith(projectPath)) {
        throw new AppError('Invalid file path', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      if (!(await fs.pathExists(fullPath))) {
        throw new AppError('File not found', 404, ERROR_CODES.FILE_NOT_FOUND);
      }
      
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        throw new AppError('Cannot download directory as file', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      const filename = path.basename(fullPath);
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      
      const fileStream = fs.createReadStream(fullPath);
      fileStream.pipe(res);
    } catch (error) {
      logger.error('Failed to download file:', error);
      throw new AppError(
        'Failed to download file',
        500,
        ERROR_CODES.FILE_ACCESS_ERROR
      );
    }
  })
);

// Download directory as ZIP
router.get('/:projectId/download-zip',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { path: relativePath } = req.query;
    
    if (!relativePath) {
      throw new AppError('Directory path is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    
    try {
      const projectPath = getProjectPath(projectId);
      const fullPath = path.join(projectPath, relativePath);
      
      // Security check
      if (!fullPath.startsWith(projectPath)) {
        throw new AppError('Invalid directory path', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      if (!(await fs.pathExists(fullPath))) {
        throw new AppError('Directory not found', 404, ERROR_CODES.FILE_NOT_FOUND);
      }
      
      const stats = await fs.stat(fullPath);
      
      if (!stats.isDirectory()) {
        throw new AppError('Path is not a directory', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      const dirName = path.basename(fullPath) || 'folder';
      const filename = `${dirName}.zip`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/zip');
      
      const archive = archiver('zip', {
        zlib: { level: 9 } // Compression level
      });
      
      archive.on('error', (err) => {
        logger.error('Archive error:', err);
        throw new AppError('Failed to create archive', 500, ERROR_CODES.FILE_ACCESS_ERROR);
      });
      
      archive.pipe(res);
      
      // Add directory contents to archive
      archive.directory(fullPath, false);
      
      await archive.finalize();
    } catch (error) {
      logger.error('Failed to download directory:', error);
      throw new AppError(
        'Failed to download directory',
        500,
        ERROR_CODES.FILE_ACCESS_ERROR
      );
    }
  })
);

// Preview file content
router.get('/:projectId/preview',
  middleware(schemas.project.id, 'params'),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { path: relativePath } = req.query;
    
    if (!relativePath) {
      throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    
    try {
      const projectPath = getProjectPath(projectId);
      const fullPath = path.join(projectPath, relativePath);
      
      // Security check
      if (!fullPath.startsWith(projectPath)) {
        throw new AppError('Invalid file path', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      if (!(await fs.pathExists(fullPath))) {
        throw new AppError('File not found', 404, ERROR_CODES.FILE_NOT_FOUND);
      }
      
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        throw new AppError('Cannot preview directory', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      const filename = path.basename(fullPath);
      const extension = path.extname(filename).toLowerCase();
      
      // File size limit for preview (5MB)
      const maxPreviewSize = 5 * 1024 * 1024;
      if (stats.size > maxPreviewSize) {
        throw new AppError('File too large for preview', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      
      // Determine file type
      const textExtensions = ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.py', '.java', '.cpp', '.c', '.h', '.php', '.rb', '.go', '.rs', '.sh', '.sql', '.log'];
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
      
      const isText = textExtensions.includes(extension);
      const isImage = imageExtensions.includes(extension);
      
      let content = '';
      let mimeType = 'application/octet-stream';
      
      if (isText) {
        content = await fs.readFile(fullPath, 'utf8');
        mimeType = 'text/plain';
      } else if (isImage) {
        const buffer = await fs.readFile(fullPath);
        content = buffer.toString('base64');
        
        // Set appropriate MIME type for images
        const imageMimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        };
        mimeType = imageMimeTypes[extension] || 'image/jpeg';
      }
      
      const responseData = {
        success: true,
        file: {
          name: filename,
          path: relativePath,
          size: stats.size,
          extension,
          mimeType,
          modified: stats.mtime,
          isText,
          isImage,
          content
        },
        timestamp: new Date().toISOString()
      };
      
      res.json(responseData);
    } catch (error) {
      throw new AppError(
        error.message || 'Failed to preview file',
        error.statusCode || 500,
        error.code || ERROR_CODES.FILE_ACCESS_ERROR
      );
    }
  })
);

module.exports = router;