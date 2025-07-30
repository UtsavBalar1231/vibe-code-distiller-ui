const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { AppError } = require('../middleware/error-handler');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Find the Git repository root for a given file path
 * @param {string} filePath - Absolute path to the file
 * @returns {Object} - { gitRoot: string|null, relativePath: string|null }
 */
function findGitRepository(filePath) {
    let currentDir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    
    // Walk up the directory tree to find .git folder
    while (currentDir !== path.dirname(currentDir)) {
        try {
            const gitDir = path.join(currentDir, '.git');
            if (fs.existsSync(gitDir)) {
                // Found Git repository root
                const relativePath = path.relative(currentDir, filePath);
                return {
                    gitRoot: currentDir,
                    relativePath: relativePath
                };
            }
        } catch (error) {
            // Continue searching
        }
        
        // Move up one directory
        currentDir = path.dirname(currentDir);
    }
    
    // No Git repository found
    return {
        gitRoot: null,
        relativePath: null
    };
}

/**
 * Git Routes - Handle Git operations for file editing
 */

/**
 * Get original file content from Git HEAD
 * GET /api/git/original-content/:path
 */
router.get('/original-content/*', async (req, res, next) => {
    try {
        // Extract and decode the file path from the URL parameter
        const filePath = '/' + decodeURIComponent(req.params[0]);
        
        if (!filePath) {
            throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }

        // Resolve to absolute path
        const fullPath = path.resolve(filePath);
        
        // Find the Git repository root for the target file
        const { gitRoot, relativePath } = findGitRepository(fullPath);
        
        if (!gitRoot) {
            // File is not in a Git repository
            res.json({
                success: true,
                content: '', // Empty content for files not in Git
                path: fullPath,
                isNewFile: false, // Not a new file, just not in Git
                inGitRepo: false, // Explicitly indicate file is not in Git repository
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            // Use git show to get the HEAD version of the file
            const gitCommand = `git show HEAD:"${relativePath}"`;
            const originalContent = execSync(gitCommand, { 
                encoding: 'utf8',
                cwd: gitRoot,
                maxBuffer: 10 * 1024 * 1024 // 10MB max buffer
            });

            res.json({
                success: true,
                content: originalContent,
                path: fullPath,
                isNewFile: false, // File exists in Git HEAD
                inGitRepo: true, // File is in Git repository
                timestamp: new Date().toISOString()
            });

        } catch (gitError) {
            // File might not exist in Git or might be a new file
            if (gitError.status === 128) {
                // Git error - file doesn't exist in HEAD (new file in Git repo)
                res.json({
                    success: true,
                    content: '', // Empty content for new files
                    path: fullPath,
                    isNewFile: true, // File is new in Git repository
                    inGitRepo: true, // File is in Git repository but not committed
                    timestamp: new Date().toISOString()
                });
            } else {
                throw new AppError(`Git operation failed: ${gitError.message}`, 500, ERROR_CODES.EXTERNAL_SERVICE_ERROR);
            }
        }

    } catch (error) {
        if (error instanceof AppError) {
            next(error);
        } else {
            next(new AppError('Failed to get original file content', 500, ERROR_CODES.INTERNAL_ERROR));
        }
    }
});

/**
 * Get Git diff for a file
 * GET /api/git/diff/:path
 */
router.get('/diff/*', async (req, res, next) => {
    try {
        // Extract and decode the file path from the URL parameter
        const filePath = '/' + decodeURIComponent(req.params[0]);
        
        if (!filePath) {
            throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }

        // Resolve to absolute path
        const fullPath = path.resolve(filePath);
        
        // Find the Git repository root for the target file
        const { gitRoot, relativePath } = findGitRepository(fullPath);
        
        if (!gitRoot) {
            // File is not in a Git repository
            res.json({
                success: true,
                diff: '',
                path: fullPath,
                hasChanges: false,
                error: 'File not in a Git repository',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            // Use git diff to get the diff for the file
            const gitCommand = `git diff HEAD -- "${relativePath}"`;
            const diffOutput = execSync(gitCommand, { 
                encoding: 'utf8',
                cwd: gitRoot,
                maxBuffer: 10 * 1024 * 1024 // 10MB max buffer
            });

            res.json({
                success: true,
                diff: diffOutput,
                path: fullPath,
                hasChanges: diffOutput.length > 0,
                timestamp: new Date().toISOString()
            });

        } catch (gitError) {
            // Handle git errors gracefully
            if (gitError.status === 128) {
                res.json({
                    success: true,
                    diff: '',
                    path: fullPath,
                    hasChanges: false,
                    error: 'File not tracked by Git or not in a Git repository',
                    timestamp: new Date().toISOString()
                });
            } else {
                throw new AppError(`Git diff failed: ${gitError.message}`, 500, ERROR_CODES.EXTERNAL_SERVICE_ERROR);
            }
        }

    } catch (error) {
        if (error instanceof AppError) {
            next(error);
        } else {
            next(new AppError('Failed to get file diff', 500, ERROR_CODES.INTERNAL_ERROR));
        }
    }
});

/**
 * Get Git status for a file or directory
 * GET /api/git/status/:path
 */
router.get('/status/*', async (req, res, next) => {
    try {
        // Extract and decode the file path from the URL parameter
        const filePath = '/' + decodeURIComponent(req.params[0]);
        
        if (!filePath) {
            throw new AppError('File path is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }

        // Resolve to absolute path
        const fullPath = path.resolve(filePath);
        
        // Find the Git repository root for the target file
        const { gitRoot, relativePath } = findGitRepository(fullPath);
        
        if (!gitRoot) {
            // File is not in a Git repository
            res.json({
                success: true,
                status: 'not-in-git',
                path: fullPath,
                error: 'File not in a Git repository',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            // Use git status to get the status for the file
            const gitCommand = `git status --porcelain "${relativePath}"`;
            const statusOutput = execSync(gitCommand, { 
                encoding: 'utf8',
                cwd: gitRoot,
                maxBuffer: 1024 * 1024 // 1MB max buffer
            });

            // Parse git status output
            let status = 'unmodified';
            if (statusOutput.trim()) {
                const statusCode = statusOutput.substring(0, 2);
                if (statusCode.includes('M')) status = 'modified';
                else if (statusCode.includes('A')) status = 'added';
                else if (statusCode.includes('D')) status = 'deleted';
                else if (statusCode.includes('??')) status = 'untracked';
            }

            res.json({
                success: true,
                status: status,
                rawStatus: statusOutput.trim(),
                path: fullPath,
                timestamp: new Date().toISOString()
            });

        } catch (gitError) {
            // Handle git errors gracefully
            if (gitError.status === 128) {
                res.json({
                    success: true,
                    status: 'not-in-git',
                    path: fullPath,
                    error: 'File not tracked by Git or not in a Git repository',
                    timestamp: new Date().toISOString()
                });
            } else {
                throw new AppError(`Git status failed: ${gitError.message}`, 500, ERROR_CODES.EXTERNAL_SERVICE_ERROR);
            }
        }

    } catch (error) {
        if (error instanceof AppError) {
            next(error);
        } else {
            next(new AppError('Failed to get file status', 500, ERROR_CODES.INTERNAL_ERROR));
        }
    }
});

module.exports = router;