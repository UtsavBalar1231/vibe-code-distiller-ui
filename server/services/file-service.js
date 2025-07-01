const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const { PROJECT, ERROR_CODES, FILE_TYPES } = require('../utils/constants');
const { AppError } = require('../middleware/error-handler');

class FileService {
  constructor() {
    this.watchers = new Map();
  }

  // File reading operations
  async readFile(filePath, options = {}) {
    try {
      const { encoding = 'utf8', maxSize = PROJECT.MAX_FILE_SIZE } = options;
      
      // Security check - ensure file exists
      if (!(await fs.pathExists(filePath))) {
        throw new AppError('File not found', 404, ERROR_CODES.NOT_FOUND);
      }

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > maxSize) {
        throw new AppError(
          `File too large (${stats.size} bytes, max ${maxSize})`,
          413,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const content = await fs.readFile(filePath, encoding);
      
      return {
        content,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime || stats.ctime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        extension: path.extname(filePath),
        language: FILE_TYPES[path.extname(filePath)] || 'text'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to read file:', { filePath, error: error.message });
      throw new AppError(
        `Failed to read file: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  // File writing operations
  async writeFile(filePath, content, options = {}) {
    try {
      const { encoding = 'utf8', backup = false } = options;
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));
      
      // Create backup if requested and file exists
      if (backup && await fs.pathExists(filePath)) {
        const backupPath = `${filePath}.backup.${Date.now()}`;
        await fs.copy(filePath, backupPath);
        logger.debug('File backup created:', { original: filePath, backup: backupPath });
      }

      await fs.writeFile(filePath, content, encoding);
      
      const stats = await fs.stat(filePath);
      
      logger.debug('File written:', { filePath, size: stats.size });
      
      return {
        success: true,
        filePath,
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      logger.error('Failed to write file:', { filePath, error: error.message });
      throw new AppError(
        `Failed to write file: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  // Directory operations
  async readDirectory(dirPath, options = {}) {
    try {
      const { 
        includeHidden = false, 
        recursive = false, 
        maxDepth = 10,
        fileTypes = null 
      } = options;
      
      if (!(await fs.pathExists(dirPath))) {
        throw new AppError('Directory not found', 404, ERROR_CODES.NOT_FOUND);
      }

      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new AppError('Path is not a directory', 400, ERROR_CODES.VALIDATION_ERROR);
      }

      const files = await this.scanDirectory(dirPath, {
        includeHidden,
        recursive,
        maxDepth,
        fileTypes,
        currentDepth: 0
      });

      return {
        path: dirPath,
        files,
        totalFiles: files.filter(f => f.type === 'file').length,
        totalDirectories: files.filter(f => f.type === 'directory').length
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to read directory:', { dirPath, error: error.message });
      throw new AppError(
        `Failed to read directory: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  async scanDirectory(dirPath, options) {
    const { includeHidden, recursive, maxDepth, fileTypes, currentDepth } = options;
    
    if (currentDepth >= maxDepth) {
      return [];
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      // Skip hidden files unless requested
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const stats = await fs.stat(fullPath).catch(() => null);
      
      if (!stats) continue;

      const fileInfo = {
        name: entry.name,
        path: fullPath,
        relativePath: path.relative(dirPath, fullPath),
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? stats.size : 0,
        modified: stats.mtime,
        created: stats.birthtime || stats.ctime,
        extension: entry.isFile() ? path.extname(entry.name) : null,
        language: entry.isFile() ? FILE_TYPES[path.extname(entry.name)] || 'text' : null
      };

      // Filter by file types if specified
      if (fileTypes && entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!fileTypes.includes(ext)) {
          continue;
        }
      }

      files.push(fileInfo);

      // Recursively scan subdirectories
      if (recursive && entry.isDirectory()) {
        // Skip common large directories
        if (['node_modules', '.git', 'venv', '__pycache__', 'target', 'build'].includes(entry.name)) {
          continue;
        }

        const subFiles = await this.scanDirectory(fullPath, {
          ...options,
          currentDepth: currentDepth + 1
        });
        files.push(...subFiles);
      }
    }

    return files;
  }

  // File operations
  async createFile(filePath, content = '', options = {}) {
    try {
      if (await fs.pathExists(filePath)) {
        throw new AppError('File already exists', 409, ERROR_CODES.VALIDATION_ERROR);
      }

      return await this.writeFile(filePath, content, options);
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to create file:', { filePath, error: error.message });
      throw new AppError(
        `Failed to create file: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  async deleteFile(filePath) {
    try {
      if (!(await fs.pathExists(filePath))) {
        throw new AppError('File not found', 404, ERROR_CODES.NOT_FOUND);
      }

      await fs.remove(filePath);
      
      logger.debug('File deleted:', { filePath });
      
      return { success: true, filePath };
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to delete file:', { filePath, error: error.message });
      throw new AppError(
        `Failed to delete file: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  async moveFile(sourcePath, targetPath) {
    try {
      if (!(await fs.pathExists(sourcePath))) {
        throw new AppError('Source file not found', 404, ERROR_CODES.NOT_FOUND);
      }

      if (await fs.pathExists(targetPath)) {
        throw new AppError('Target file already exists', 409, ERROR_CODES.VALIDATION_ERROR);
      }

      // Ensure target directory exists
      await fs.ensureDir(path.dirname(targetPath));
      
      await fs.move(sourcePath, targetPath);
      
      logger.debug('File moved:', { from: sourcePath, to: targetPath });
      
      return { success: true, from: sourcePath, to: targetPath };
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to move file:', { sourcePath, targetPath, error: error.message });
      throw new AppError(
        `Failed to move file: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  async copyFile(sourcePath, targetPath, options = {}) {
    try {
      const { overwrite = false } = options;
      
      if (!(await fs.pathExists(sourcePath))) {
        throw new AppError('Source file not found', 404, ERROR_CODES.NOT_FOUND);
      }

      if (!overwrite && await fs.pathExists(targetPath)) {
        throw new AppError('Target file already exists', 409, ERROR_CODES.VALIDATION_ERROR);
      }

      // Ensure target directory exists
      await fs.ensureDir(path.dirname(targetPath));
      
      await fs.copy(sourcePath, targetPath, { overwrite });
      
      const stats = await fs.stat(targetPath);
      
      logger.debug('File copied:', { from: sourcePath, to: targetPath, size: stats.size });
      
      return { 
        success: true, 
        from: sourcePath, 
        to: targetPath,
        size: stats.size 
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to copy file:', { sourcePath, targetPath, error: error.message });
      throw new AppError(
        `Failed to copy file: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  // Directory operations
  async createDirectory(dirPath) {
    try {
      if (await fs.pathExists(dirPath)) {
        throw new AppError('Directory already exists', 409, ERROR_CODES.VALIDATION_ERROR);
      }

      await fs.ensureDir(dirPath);
      
      logger.debug('Directory created:', { dirPath });
      
      return { success: true, path: dirPath };
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to create directory:', { dirPath, error: error.message });
      throw new AppError(
        `Failed to create directory: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  // File watching operations
  startWatching(projectPath, projectId, callbacks = {}) {
    if (this.watchers.has(projectId)) {
      this.stopWatching(projectId);
    }

    try {
      const watcher = chokidar.watch(projectPath, {
        persistent: true,
        ignoreInitial: true,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/venv/**',
          '**/__pycache__/**',
          '**/target/**',
          '**/build/**',
          '**/.next/**',
          '**/dist/**'
        ],
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100
        }
      });

      // Set up event handlers
      watcher
        .on('add', (filePath) => {
          logger.debug('File added:', { projectId, filePath });
          if (callbacks.onAdd) callbacks.onAdd(filePath);
        })
        .on('change', (filePath) => {
          logger.debug('File changed:', { projectId, filePath });
          if (callbacks.onChange) callbacks.onChange(filePath);
        })
        .on('unlink', (filePath) => {
          logger.debug('File removed:', { projectId, filePath });
          if (callbacks.onRemove) callbacks.onRemove(filePath);
        })
        .on('addDir', (dirPath) => {
          logger.debug('Directory added:', { projectId, dirPath });
          if (callbacks.onAddDir) callbacks.onAddDir(dirPath);
        })
        .on('unlinkDir', (dirPath) => {
          logger.debug('Directory removed:', { projectId, dirPath });
          if (callbacks.onRemoveDir) callbacks.onRemoveDir(dirPath);
        })
        .on('error', (error) => {
          logger.error('Watcher error:', { projectId, error: error.message });
          if (callbacks.onError) callbacks.onError(error);
        });

      this.watchers.set(projectId, watcher);
      
      logger.info('File watcher started:', { projectId, path: projectPath });
      
      return { success: true, projectId };
    } catch (error) {
      logger.error('Failed to start file watcher:', { projectId, error: error.message });
      throw new AppError(
        `Failed to start file watcher: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  stopWatching(projectId) {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectId);
      logger.info('File watcher stopped:', { projectId });
      return { success: true, projectId };
    }
    return { success: false, message: 'Watcher not found' };
  }

  stopAllWatchers() {
    for (const [projectId, watcher] of this.watchers.entries()) {
      watcher.close();
      logger.debug('File watcher closed:', { projectId });
    }
    this.watchers.clear();
    logger.info('All file watchers stopped');
  }

  // Utility methods
  async getFileInfo(filePath) {
    try {
      if (!(await fs.pathExists(filePath))) {
        throw new AppError('File not found', 404, ERROR_CODES.NOT_FOUND);
      }

      const stats = await fs.stat(filePath);
      
      return {
        path: filePath,
        name: path.basename(filePath),
        directory: path.dirname(filePath),
        extension: path.extname(filePath),
        language: FILE_TYPES[path.extname(filePath)] || 'text',
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime || stats.ctime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        permissions: stats.mode,
        uid: stats.uid,
        gid: stats.gid
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Failed to get file info:', { filePath, error: error.message });
      throw new AppError(
        `Failed to get file info: ${error.message}`,
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  // Security validation
  validatePath(basePath, targetPath) {
    const resolvedBase = path.resolve(basePath);
    const resolvedTarget = path.resolve(targetPath);
    
    if (!resolvedTarget.startsWith(resolvedBase)) {
      throw new AppError(
        'Access denied: Path outside allowed directory',
        403,
        ERROR_CODES.FORBIDDEN
      );
    }
    
    return resolvedTarget;
  }

  // File type validation
  validateFileType(filePath, allowedTypes = PROJECT.ALLOWED_EXTENSIONS) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (allowedTypes.length > 0 && !allowedTypes.includes(ext)) {
      throw new AppError(
        `File type not allowed: ${ext}`,
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    
    return true;
  }
}

// Singleton instance
const fileService = new FileService();

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('Shutting down File Service...');
  fileService.stopAllWatchers();
});

process.on('SIGINT', () => {
  logger.info('Shutting down File Service...');
  fileService.stopAllWatchers();
});

module.exports = fileService;