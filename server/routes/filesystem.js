const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { AppError } = require('../middleware/error-handler');
const { ERROR_CODES } = require('../utils/constants');
const fileService = require('../services/file-service');

/**
 * Filesystem Routes - Support for absolute path browsing
 * These endpoints allow browsing the entire filesystem starting from root (/)
 * with appropriate security measures
 */

// Security configuration - define allowed paths
const SECURITY_CONFIG = {
    // Allow access to common user directories
    allowedPaths: [
        '/home',
        '/tmp',
        '/var/log',  // For system logs (read-only)
        '/opt',      // For optional software
        '/usr/local' // For locally installed software
    ],
    
    // Block sensitive system paths
    blockedPaths: [
        '/etc/passwd',
        '/etc/shadow',
        '/root',
        '/sys',
        '/proc',
        '/dev'
    ]
};

/**
 * Validate if a path is allowed to be accessed
 * @param {string} requestedPath - The absolute path being requested
 * @returns {boolean} - Whether the path is allowed
 */
function isPathAllowed(requestedPath) {
    // Normalize the path
    const normalizedPath = path.resolve(requestedPath);
    
    // Check if path is explicitly blocked
    for (const blockedPath of SECURITY_CONFIG.blockedPaths) {
        if (normalizedPath.startsWith(blockedPath)) {
            return false;
        }
    }
    
    // Check if path is within allowed paths
    if (normalizedPath === '/') {
        return true; // Allow root directory listing
    }
    
    for (const allowedPath of SECURITY_CONFIG.allowedPaths) {
        if (normalizedPath.startsWith(allowedPath)) {
            return true;
        }
    }
    
    return false;
}


/**
 * Get file stats and determine file type
 * @param {string} filePath - Full path to the file
 * @param {string} fileName - Name of the file
 * @returns {Object} - File information object
 */
async function getFileInfo(filePath, fileName) {
    try {
        const stats = await fs.stat(filePath);
        return {
            name: fileName,
            path: filePath,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.isFile() ? stats.size : 0,
            modified: stats.mtime.toISOString(),
            isHidden: fileName.startsWith('.')
        };
    } catch (error) {
        // If we can't stat the file, skip it
        return null;
    }
}

/**
 * Browse filesystem at absolute path
 * GET /api/filesystem/browse?path=/absolute/path&showHidden=true
 */
router.get('/browse', async (req, res, next) => {
    try {
        const requestedPath = req.query.path || '/';
        const showHidden = req.query.showHidden === 'true';
        
        // Security validation
        if (!isPathAllowed(requestedPath)) {
            throw new AppError('Access denied to this path', 403, ERROR_CODES.ACCESS_DENIED);
        }
        
        
        // Resolve and normalize the path
        const fullPath = path.resolve(requestedPath);
        
        // Check if path exists
        const stats = await fs.stat(fullPath);
        
        if (stats.isFile()) {
            // If it's a file, return file information
            const fileInfo = await getFileInfo(fullPath, path.basename(fullPath));
            res.json({
                success: true,
                file: fileInfo,
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        if (!stats.isDirectory()) {
            throw new AppError('Path is not a file or directory', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        // Read directory contents
        const entries = await fs.readdir(fullPath);
        const files = [];
        
        for (const entry of entries) {
            // Skip hidden files if not requested
            if (!showHidden && entry.startsWith('.')) {
                continue;
            }
            
            const entryPath = path.join(fullPath, entry);
            const fileInfo = await getFileInfo(entryPath, entry);
            
            if (fileInfo) {
                files.push(fileInfo);
            }
        }
        
        // Sort files: directories first, then by name
        files.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        
        res.json({
            success: true,
            directory: {
                path: fullPath,
                files: files
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * Get file preview for absolute path
 * GET /api/filesystem/preview?path=/absolute/path/to/file
 */
router.get('/preview', async (req, res, next) => {
    try {
        const requestedPath = req.query.path;
        
        if (!requestedPath) {
            throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        // Security validation
        if (!isPathAllowed(requestedPath)) {
            throw new AppError('Access denied to this path', 403, ERROR_CODES.ACCESS_DENIED);
        }
        
        const fullPath = path.resolve(requestedPath);
        
        // Check if file exists and is readable
        const stats = await fs.stat(fullPath);
        
        if (!stats.isFile()) {
            throw new AppError('Path is not a file', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        // File size limit for preview (5MB)
        const maxPreviewSize = 5 * 1024 * 1024;
        if (stats.size > maxPreviewSize) {
            throw new AppError('File too large for preview (max 5MB)', 413, ERROR_CODES.FILE_TOO_LARGE);
        }
        
        const fileName = path.basename(fullPath);
        const fileExt = path.extname(fileName).toLowerCase();
        
        // Determine MIME type
        const mimeTypes = {
            '.txt': 'text/plain',
            '.js': 'text/javascript',
            '.json': 'application/json',
            '.html': 'text/html',
            '.css': 'text/css',
            '.md': 'text/markdown',
            '.py': 'text/plain',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
        };
        
        const mimeType = mimeTypes[fileExt] || 'application/octet-stream';
        const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
        const isImage = mimeType.startsWith('image/');
        
        let content = null;
        
        if (isText) {
            // Read as text
            content = await fs.readFile(fullPath, 'utf8');
        } else if (isImage) {
            // Read as base64 for images
            const buffer = await fs.readFile(fullPath);
            content = buffer.toString('base64');
        }
        
        res.json({
            success: true,
            file: {
                name: fileName,
                path: fullPath,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                mimeType: mimeType,
                isText: isText,
                isImage: isImage,
                content: content
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * Download file from absolute path
 * GET /api/filesystem/download?path=/absolute/path/to/file
 */
router.get('/download', async (req, res, next) => {
    try {
        const requestedPath = req.query.path;
        
        if (!requestedPath) {
            throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        // Security validation
        if (!isPathAllowed(requestedPath)) {
            throw new AppError('Access denied to this path', 403, ERROR_CODES.ACCESS_DENIED);
        }
        
        const fullPath = path.resolve(requestedPath);
        
        // Check if file exists
        const stats = await fs.stat(fullPath);
        
        if (!stats.isFile()) {
            throw new AppError('Path is not a file', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        const fileName = path.basename(fullPath);
        
        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', stats.size);
        
        // Stream the file
        const readStream = require('fs').createReadStream(fullPath);
        readStream.pipe(res);
        
    } catch (error) {
        next(error);
    }
});

/**
 * Configure multer for file uploads
 */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Use the targetPath from query parameter
        const targetPath = req.query.targetPath || '/tmp';
        
        // Security validation
        if (!isPathAllowed(targetPath)) {
            return cb(new AppError('Access denied to target directory', 403, ERROR_CODES.ACCESS_DENIED));
        }
        
        cb(null, targetPath);
    },
    filename: function (req, file, cb) {
        // Use original filename
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 10 // Maximum 10 files at once
    },
    fileFilter: function (req, file, cb) {
        // Accept all file types for filesystem upload
        cb(null, true);
    }
});

/**
 * Upload files to filesystem
 * POST /api/filesystem/upload?targetPath=/absolute/path
 * Body: multipart/form-data with files
 */
router.post('/upload', upload.array('files', 10), async (req, res, next) => {
    try {
        const targetPath = req.query.targetPath || '/tmp';
        const uploadedFiles = req.files || [];
        
        // Security validation
        if (!isPathAllowed(targetPath)) {
            throw new AppError('Access denied to target directory', 403, ERROR_CODES.ACCESS_DENIED);
        }
        
        // Ensure target directory exists
        try {
            await fs.access(targetPath);
        } catch (error) {
            throw new AppError('Target directory does not exist', 404, ERROR_CODES.FILE_SYSTEM_ERROR);
        }
        
        const results = [];
        
        for (const file of uploadedFiles) {
            try {
                results.push({
                    originalName: file.originalname,
                    filename: file.filename,
                    path: file.path,
                    size: file.size,
                    success: true
                });
            } catch (error) {
                results.push({
                    originalName: file.originalname,
                    success: false,
                    error: error.message
                });
            }
        }
        
        res.json({
            success: true,
            message: `Successfully uploaded ${results.filter(r => r.success).length} file(s)`,
            files: results,
            targetPath: targetPath
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * Delete file or directory from absolute path
 * DELETE /api/filesystem/delete?path=/absolute/path/to/file-or-directory
 */
router.delete('/delete', async (req, res, next) => {
    try {
        const requestedPath = req.query.path;
        
        if (!requestedPath) {
            throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        // Security validation
        if (!isPathAllowed(requestedPath)) {
            throw new AppError('Access denied to this path', 403, ERROR_CODES.ACCESS_DENIED);
        }
        
        const fullPath = path.resolve(requestedPath);
        
        // Check if file/directory exists
        try {
            await fs.stat(fullPath);
        } catch (error) {
            throw new AppError('File or directory not found', 404, ERROR_CODES.NOT_FOUND);
        }
        
        // Use FileService to delete the file/directory
        const result = await fileService.deleteFile(fullPath);
        
        res.json({
            success: true,
            message: 'File or directory deleted successfully',
            path: fullPath,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        next(error);
    }
});

module.exports = router;