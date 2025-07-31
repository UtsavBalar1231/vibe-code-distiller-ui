const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { AppError } = require('../middleware/error-handler');
const { ERROR_CODES } = require('../utils/constants');

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
 * Configure multer for file upload
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // File size limit (10MB)
    const maxSize = 10 * 1024 * 1024;
    
    // Allow all file types but with size restriction
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: fileFilter
});

/**
 * Generate unique filename to avoid conflicts
 */
async function generateUniqueFilename(dir, originalName) {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    let filename = originalName;
    let counter = 1;

    try {
        while (true) {
            try {
                await fs.access(path.join(dir, filename));
                // File exists, generate new name
                filename = `${baseName}_${counter}${ext}`;
                counter++;
            } catch (error) {
                // File doesn't exist, use this name
                break;
            }
        }
    } catch (error) {
        // Error checking file existence, use original name
    }

    return filename;
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
            // Text formats
            '.txt': 'text/plain',
            '.log': 'text/plain',
            '.conf': 'text/plain',
            '.config': 'text/plain',
            '.ini': 'text/plain',
            '.env': 'text/plain',
            '.properties': 'text/plain',
            '.gitignore': 'text/plain',
            '.gitattributes': 'text/plain',
            '.editorconfig': 'text/plain',
            
            // Programming languages
            '.js': 'text/javascript',
            '.mjs': 'text/javascript',
            '.jsx': 'text/javascript',
            '.ts': 'text/typescript',
            '.tsx': 'text/typescript',
            '.py': 'text/plain',
            '.java': 'text/plain',
            '.c': 'text/plain',
            '.cpp': 'text/plain',
            '.cc': 'text/plain',
            '.cxx': 'text/plain',
            '.h': 'text/plain',
            '.hpp': 'text/plain',
            '.cs': 'text/plain',
            '.php': 'text/plain',
            '.rb': 'text/plain',
            '.go': 'text/plain',
            '.rs': 'text/plain',
            '.sh': 'text/plain',
            '.bash': 'text/plain',
            '.zsh': 'text/plain',
            '.fish': 'text/plain',
            '.ps1': 'text/plain',
            '.bat': 'text/plain',
            '.cmd': 'text/plain',
            
            // Web formats
            '.html': 'text/html',
            '.htm': 'text/html',
            '.css': 'text/css',
            '.scss': 'text/css',
            '.sass': 'text/css',
            '.less': 'text/css',
            
            // Data formats
            '.json': 'application/json',
            '.yaml': 'text/plain',
            '.yml': 'text/plain',
            '.xml': 'text/xml',
            '.csv': 'text/csv',
            '.tsv': 'text/plain',
            '.sql': 'text/plain',
            
            // Documentation
            '.md': 'text/markdown',
            '.markdown': 'text/markdown',
            '.rst': 'text/plain',
            '.adoc': 'text/plain',
            '.asciidoc': 'text/plain',
            
            // Images
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.ico': 'image/x-icon'
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
 * Save file content to absolute path
 * PUT /api/filesystem/save
 * Body: { path: string, content: string }
 */
router.put('/save', async (req, res, next) => {
    try {
        const { path: filePath, content } = req.body;
        
        if (!filePath) {
            throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        if (typeof content !== 'string') {
            throw new AppError('File content must be a string', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        // Security validation
        if (!isPathAllowed(filePath)) {
            throw new AppError('Access denied to this path', 403, ERROR_CODES.ACCESS_DENIED);
        }
        
        const fullPath = path.resolve(filePath);
        
        // Ensure parent directory exists
        const parentDir = path.dirname(fullPath);
        try {
            await fs.mkdir(parentDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, continue
        }
        
        // Write file content
        await fs.writeFile(fullPath, content, 'utf8');
        
        // Get file stats for response
        const stats = await fs.stat(fullPath);
        
        res.json({
            success: true,
            message: 'File saved successfully',
            file: {
                path: fullPath,
                size: stats.size,
                modified: stats.mtime.toISOString()
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * Upload files to filesystem path
 * POST /api/filesystem/upload
 * Body: FormData with files and targetPath
 */
router.post('/upload', upload.array('files', 10), async (req, res, next) => {
    try {
        const { targetPath } = req.body;
        
        if (!targetPath) {
            throw new AppError('Target path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        if (!req.files || req.files.length === 0) {
            throw new AppError('No files provided', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        
        // Security validation
        if (!isPathAllowed(targetPath)) {
            throw new AppError('Access denied to this path', 403, ERROR_CODES.ACCESS_DENIED);
        }
        
        const fullTargetPath = path.resolve(targetPath);
        
        // Check if target directory exists
        try {
            const stats = await fs.stat(fullTargetPath);
            if (!stats.isDirectory()) {
                throw new AppError('Target path is not a directory', 400, ERROR_CODES.VALIDATION_ERROR);
            }
        } catch (error) {
            throw new AppError('Target directory does not exist', 404, ERROR_CODES.NOT_FOUND);
        }
        
        const uploadResults = [];
        const errors = [];
        
        // Process each file
        for (const file of req.files) {
            try {
                // Validate file size
                if (file.size > 10 * 1024 * 1024) {
                    errors.push({
                        filename: file.originalname,
                        error: 'File size exceeds 10MB limit'
                    });
                    continue;
                }
                
                // Generate unique filename
                const filename = await generateUniqueFilename(fullTargetPath, file.originalname);
                const filePath = path.join(fullTargetPath, filename);
                
                // Write file
                await fs.writeFile(filePath, file.buffer);
                
                // Get file stats
                const stats = await fs.stat(filePath);
                
                uploadResults.push({
                    originalName: file.originalname,
                    filename: filename,
                    path: filePath,
                    size: stats.size,
                    mimetype: file.mimetype,
                    uploaded: stats.mtime.toISOString()
                });
                
            } catch (error) {
                errors.push({
                    filename: file.originalname,
                    error: error.message
                });
            }
        }
        
        const response = {
            success: true,
            message: `${uploadResults.length} files uploaded successfully`,
            uploaded: uploadResults,
            timestamp: new Date().toISOString()
        };
        
        if (errors.length > 0) {
            response.errors = errors;
            response.message += `, ${errors.length} files failed`;
        }
        
        res.json(response);
        
    } catch (error) {
        next(error);
    }
});


module.exports = router;