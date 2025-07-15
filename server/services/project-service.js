const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const archiver = require('archiver');
const config = require('config');
const logger = require('../utils/logger');
const { PROJECT, ERROR_CODES, SUCCESS_MESSAGES, FILE_TYPES } = require('../utils/constants');
const { AppError } = require('../middleware/error-handler');
const { sanitize } = require('../utils/validator');

class ProjectService {
  constructor() {
    // Get projects root from config, fallback to PROJECT.ROOT_DIR
    let rootDir;
    try {
      rootDir = config.get('projects.rootDir');
      // Handle ~ path expansion
      if (rootDir.startsWith('~')) {
        rootDir = rootDir.replace('~', os.homedir());
      }
    } catch (error) {
      rootDir = PROJECT.ROOT_DIR;
    }
    
    this.projectsRoot = rootDir;
    this.watchers = new Map();
    this.projectCache = new Map();
    
    // Initialize asynchronously to handle errors properly
    this.initialize();
  }

  async initialize() {
    try {
      // Ensure projects root directory exists
      await this.ensureProjectsRoot();
      
      // Initialize project discovery
      await this.discoverProjects();
    } catch (error) {
      logger.error('Failed to initialize ProjectService:', error);
      // Don't throw here to prevent app crash, just log the error
    }
  }

  async ensureProjectsRoot() {
    try {
      await fs.ensureDir(this.projectsRoot);
      logger.info('Projects root directory ensured:', { path: this.projectsRoot });
    } catch (error) {
      logger.error('Failed to create projects root directory:', error);
      throw new AppError(
        'Failed to initialize projects directory',
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  async discoverProjects() {
    try {
      const entries = await fs.readdir(this.projectsRoot, { withFileTypes: true });
      const projects = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(this.projectsRoot, entry.name);
          const project = await this.loadProject(entry.name, projectPath);
          if (project) {
            projects.push(project);
            this.projectCache.set(project.id, project);
          }
        }
      }

      logger.info('Projects discovered:', { count: projects.length });
      return projects;
    } catch (error) {
      logger.error('Failed to discover projects:', error);
      throw new AppError(
        'Failed to discover existing projects',
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR
      );
    }
  }

  async loadProject(projectId, projectPath) {
    try {
      const configPath = path.join(projectPath, PROJECT.CONFIG_DIR, PROJECT.CONFIG_FILE);
      const stats = await fs.stat(projectPath);
      
      let config = {
        name: projectId,
        description: '',
        type: 'other',
        language: 'other',
        framework: '',
        settings: {}
      };

      // Load configuration if exists
      if (await fs.pathExists(configPath)) {
        try {
          const configData = await fs.readJson(configPath);
          config = { ...config, ...configData };
        } catch (error) {
          logger.warn('Failed to load project config:', { projectId, error: error.message });
        }
      }

      // Detect project type and language from files
      const detectedInfo = await this.detectProjectInfo(projectPath);
      
      const project = {
        id: projectId,
        name: config.name || projectId,
        description: config.description || detectedInfo.description,
        type: config.type || detectedInfo.type,
        language: config.language || detectedInfo.language,
        framework: config.framework || detectedInfo.framework,
        path: projectPath,
        createdAt: stats.birthtime || stats.ctime,
        updatedAt: stats.mtime,
        size: await this.getDirectorySize(projectPath),
        fileCount: await this.getFileCount(projectPath),
        claudeConfig: await this.getClaudeConfig(projectPath),
        settings: {
          autoSave: true,
          enableHotReload: false,
          showHiddenFiles: false,
          terminalTheme: 'dark',
          ...config.settings
        },
        status: 'active'
      };

      return project;
    } catch (error) {
      logger.error('Failed to load project:', { projectId, error: error.message });
      return null;
    }
  }

  async detectProjectInfo(projectPath) {
    const info = {
      type: 'other',
      language: 'other',
      framework: '',
      description: ''
    };

    try {
      // Check for common configuration files
      const files = await fs.readdir(projectPath);
      
      // Package.json (Node.js/JavaScript)
      if (files.includes('package.json')) {
        try {
          const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
          info.language = 'javascript';
          info.description = packageJson.description || '';
          
          // Detect framework from dependencies
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
          if (deps.react) info.framework = 'React';
          else if (deps.vue) info.framework = 'Vue';
          else if (deps.angular) info.framework = 'Angular';
          else if (deps.express) info.framework = 'Express';
          else if (deps.next) info.framework = 'Next.js';
          else if (deps.nuxt) info.framework = 'Nuxt.js';
          
          // Detect project type
          if (deps.react || deps.vue || deps.angular || deps.next || deps.nuxt) {
            info.type = 'web';
          } else if (deps.express || deps.fastify || deps.koa) {
            info.type = 'api';
          } else if (packageJson.bin) {
            info.type = 'cli';
          }
        } catch (e) {
          logger.warn('Failed to parse package.json:', { projectPath });
        }
      }
      
      // Python projects
      else if (files.includes('requirements.txt') || files.includes('pyproject.toml') || files.includes('setup.py')) {
        info.language = 'python';
        if (files.includes('manage.py')) info.framework = 'Django';
        else if (files.includes('app.py') || files.includes('main.py')) info.framework = 'Flask';
      }
      
      // Go projects
      else if (files.includes('go.mod')) {
        info.language = 'go';
        info.type = 'api';
      }
      
      // Rust projects
      else if (files.includes('Cargo.toml')) {
        info.language = 'rust';
      }
      
      // Java projects
      else if (files.includes('pom.xml') || files.includes('build.gradle')) {
        info.language = 'java';
        if (files.includes('pom.xml')) info.framework = 'Maven';
        else info.framework = 'Gradle';
      }
      
      // TypeScript
      if (files.includes('tsconfig.json')) {
        info.language = 'typescript';
      }
      
      // Check for common web files
      if (files.includes('index.html') || files.includes('index.htm')) {
        info.type = 'web';
      }
      
      // Check for Dockerfile
      if (files.includes('Dockerfile')) {
        info.type = info.type === 'other' ? 'api' : info.type;
      }

    } catch (error) {
      logger.warn('Failed to detect project info:', { projectPath, error: error.message });
    }

    return info;
  }

  async getClaudeConfig(projectPath) {
    try {
      const claudeConfigPath = path.join(projectPath, PROJECT.CONFIG_DIR);
      if (await fs.pathExists(claudeConfigPath)) {
        const files = await fs.readdir(claudeConfigPath);
        return {
          exists: true,
          files: files,
          path: claudeConfigPath
        };
      }
    } catch (error) {
      logger.warn('Failed to get Claude config:', { projectPath, error: error.message });
    }
    
    return { exists: false, files: [], path: null };
  }

  async getDirectorySize(dirPath) {
    try {
      let totalSize = 0;
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
          // Skip node_modules and other large directories
          if (['node_modules', '.git', 'venv', '__pycache__', 'target', 'build'].includes(file.name)) {
            continue;
          }
          totalSize += await this.getDirectorySize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  async getFileCount(dirPath) {
    try {
      let count = 0;
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isDirectory()) {
          // Skip large directories
          if (['node_modules', '.git', 'venv', '__pycache__', 'target', 'build'].includes(file.name)) {
            continue;
          }
          count += await this.getFileCount(path.join(dirPath, file.name));
        } else {
          count++;
        }
      }
      
      return count;
    } catch (error) {
      return 0;
    }
  }

  // Public API methods
  async getAllProjects(options = {}) {
    const { limit, offset, type } = options;
    
    // Refresh project cache
    await this.discoverProjects();
    
    let projects = Array.from(this.projectCache.values());
    
    // Filter by type if specified
    if (type) {
      projects = projects.filter(p => p.type === type);
    }
    
    // Sort by updated date (most recent first)
    projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    // Apply pagination
    if (offset || limit) {
      const start = parseInt(offset) || 0;
      const end = limit ? start + parseInt(limit) : undefined;
      projects = projects.slice(start, end);
    }
    
    return projects;
  }

  async getProject(projectId) {
    if (!projectId) {
      throw new AppError('Project ID is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Check cache first
    if (this.projectCache.has(projectId)) {
      const project = this.projectCache.get(projectId);
      // Refresh project data
      const updatedProject = await this.loadProject(projectId, project.path);
      if (updatedProject) {
        this.projectCache.set(projectId, updatedProject);
        return updatedProject;
      }
    }

    // Load from filesystem
    const projectPath = path.join(this.projectsRoot, projectId);
    
    if (!(await fs.pathExists(projectPath))) {
      throw new AppError('Project not found', 404, ERROR_CODES.PROJECT_NOT_FOUND);
    }

    const project = await this.loadProject(projectId, projectPath);
    if (!project) {
      throw new AppError('Failed to load project', 500, ERROR_CODES.PROJECT_NOT_FOUND);
    }

    this.projectCache.set(projectId, project);
    return project;
  }

  async createProject(projectData) {
    const projectId = sanitize.projectName(projectData.name);
    
    if (!projectId) {
      throw new AppError('Invalid project name', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const projectPath = path.join(this.projectsRoot, projectId);
    
    // Check if project already exists
    if (await fs.pathExists(projectPath)) {
      throw new AppError('Project already exists', 409, ERROR_CODES.PROJECT_CREATE_FAILED);
    }

    try {
      // Create project directory
      await fs.ensureDir(projectPath);
      
      // Create Claude config directory
      const configDir = path.join(projectPath, PROJECT.CONFIG_DIR);
      await fs.ensureDir(configDir);
      
      // Create project configuration
      const config = {
        name: projectData.name,
        createdAt: new Date().toISOString(),
        settings: {
          autoSave: true,
          enableHotReload: false,
          showHiddenFiles: false,
          terminalTheme: 'dark'
        }
      };
      
      const configPath = path.join(configDir, PROJECT.CONFIG_FILE);
      await fs.writeJson(configPath, config, { spaces: 2 });
      
      // Create Claude Code hook configuration for notifications  
      const serverConfig = require('config');
      const serverPort = process.env.PORT || serverConfig.get('server.port') || 3000;
      const hookConfig = {
        hooks: {
          Notification: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: `curl -X POST http://localhost:${serverPort}/api/notification -H 'Content-Type: application/json' -d @-`
                }
              ]
            }
          ],
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: `curl -X POST http://localhost:${serverPort}/api/notification -H 'Content-Type: application/json' -d '{"session_id": "stop-event", "message": "Claude Code session has ended", "title": "Claude Code", "transcript_path": ""}'`
                }
              ]
            }
          ]
        }
      };
      
      const hookConfigPath = path.join(configDir, 'settings.local.json');
      await fs.writeJson(hookConfigPath, hookConfig, { spaces: 2 });
      
      // Load the created project
      const project = await this.loadProject(projectId, projectPath);
      this.projectCache.set(projectId, project);
      
      logger.info('Project created:', { projectId });
      
      return project;
    } catch (error) {
      // Cleanup on failure
      try {
        await fs.remove(projectPath);
      } catch (cleanupError) {
        logger.error('Failed to cleanup failed project creation:', cleanupError);
      }
      
      logger.error('Failed to create project:', error);
      throw new AppError(
        'Failed to create project',
        500,
        ERROR_CODES.PROJECT_CREATE_FAILED,
        error.message
      );
    }
  }

  // Removed createProjectStructure method - projects now create empty folders only

  async updateProject(projectId, updateData) {
    const project = await this.getProject(projectId);
    
    try {
      // Update configuration
      const configPath = path.join(project.path, PROJECT.CONFIG_DIR, PROJECT.CONFIG_FILE);
      const currentConfig = await fs.pathExists(configPath) 
        ? await fs.readJson(configPath) 
        : {};
      
      const updatedConfig = {
        ...currentConfig,
        ...updateData,
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeJson(configPath, updatedConfig, { spaces: 2 });
      
      // Reload project
      const updatedProject = await this.loadProject(projectId, project.path);
      this.projectCache.set(projectId, updatedProject);
      
      logger.info('Project updated:', { projectId });
      
      return updatedProject;
    } catch (error) {
      logger.error('Failed to update project:', error);
      throw new AppError(
        'Failed to update project',
        500,
        ERROR_CODES.PROJECT_NOT_FOUND,
        error.message
      );
    }
  }

  async deleteProject(projectId) {
    if (!projectId) {
      throw new AppError('Project ID is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const projectPath = path.join(this.projectsRoot, projectId);
    let project = null;

    try {
      // Check if project exists in cache
      if (this.projectCache.has(projectId)) {
        project = this.projectCache.get(projectId);
      }

      // Check if project directory exists in filesystem
      const projectExists = await fs.pathExists(projectPath);
      
      if (!projectExists) {
        // Project was manually deleted, clean up cache and return success
        if (this.watchers.has(projectId)) {
          await this.watchers.get(projectId).close();
          this.watchers.delete(projectId);
        }
        
        this.projectCache.delete(projectId);
        
        logger.info('Project already deleted from filesystem, cleaned up cache:', { projectId });
        return { success: true, message: SUCCESS_MESSAGES.PROJECT_DELETED };
      }

      // Project exists, proceed with normal deletion
      if (!project) {
        // Load project info if not in cache
        project = await this.loadProject(projectId, projectPath);
        if (!project) {
          throw new AppError('Failed to load project for deletion', 500, ERROR_CODES.PROJECT_NOT_FOUND);
        }
      }

      // Stop any watchers
      if (this.watchers.has(projectId)) {
        await this.watchers.get(projectId).close();
        this.watchers.delete(projectId);
      }
      
      // Remove from cache
      this.projectCache.delete(projectId);
      
      // Delete directory
      await fs.remove(projectPath);
      
      logger.info('Project deleted:', { projectId });
      
      return { success: true, message: SUCCESS_MESSAGES.PROJECT_DELETED };
    } catch (error) {
      logger.error('Failed to delete project:', error);
      throw new AppError(
        'Failed to delete project',
        500,
        ERROR_CODES.PROJECT_DELETE_FAILED,
        error.message
      );
    }
  }

  async getProjectFiles(projectId, relativePath = '') {
    const project = await this.getProject(projectId);
    const fullPath = path.join(project.path, relativePath);
    
    // Security check - ensure path is within project directory
    if (!fullPath.startsWith(project.path)) {
      throw new AppError('Invalid file path', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    
    try {
      const stats = await fs.stat(fullPath);
      
      if (stats.isFile()) {
        // Return file content
        const content = await fs.readFile(fullPath, 'utf8');
        return {
          type: 'file',
          name: path.basename(fullPath),
          path: relativePath,
          size: stats.size,
          content,
          extension: path.extname(fullPath),
          language: FILE_TYPES[path.extname(fullPath)] || 'text',
          modified: stats.mtime
        };
      } else {
        // Return directory listing
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const files = [];
        
        for (const entry of entries) {
          // Skip hidden files unless requested
          if (entry.name.startsWith('.') && !project.settings.showHiddenFiles) {
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
            language: entry.isFile() ? FILE_TYPES[path.extname(entry.name)] || 'text' : null,
            modified: entryStats.mtime
          });
        }
        
        // Sort: directories first, then files, alphabetically
        files.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        
        return {
          type: 'directory',
          name: path.basename(fullPath) || project.name,
          path: relativePath,
          files
        };
      }
    } catch (error) {
      logger.error('Failed to get project files:', error);
      throw new AppError(
        'Failed to access project files',
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR,
        error.message
      );
    }
  }

  async getProjectStats(projectId) {
    const project = await this.getProject(projectId);
    
    try {
      const stats = {
        size: await this.getDirectorySize(project.path),
        fileCount: await this.getFileCount(project.path),
        lastActivity: project.updatedAt,
        created: project.createdAt,
        languages: {},
        fileTypes: {}
      };
      
      // Analyze file types and languages
      await this.analyzeProjectFiles(project.path, stats);
      
      return stats;
    } catch (error) {
      logger.error('Failed to get project stats:', error);
      throw new AppError(
        'Failed to get project statistics',
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR,
        error.message
      );
    }
  }

  async downloadProject(projectId, res) {
    if (!projectId) {
      throw new AppError('Project ID is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Get project to ensure it exists
    const project = await this.getProject(projectId);
    const projectPath = path.join(this.projectsRoot, projectId);
    
    if (!(await fs.pathExists(projectPath))) {
      throw new AppError('Project not found', 404, ERROR_CODES.PROJECT_NOT_FOUND);
    }

    const sanitizedProjectName = sanitize.filename(project.name || projectId);
    const filename = `${sanitizedProjectName}.zip`;
    
    try {
      // Set response headers
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');
      
      // Create archiver instance
      const archive = archiver('zip', {
        zlib: { level: 9 } // Compression level
      });

      // Handle archiver errors
      archive.on('error', (err) => {
        logger.error('Archiver error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Failed to create project archive',
            error: err.message
          });
        }
      });

      // Handle archiver warnings
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          logger.warn('Archiver warning:', err);
        } else {
          logger.error('Archiver warning (will throw):', err);
          throw err;
        }
      });

      // Pipe archive to response
      archive.pipe(res);

      // Add project directory to archive
      // Exclude common directories that shouldn't be in downloads
      const excludePatterns = [
        'node_modules/**',
        '.git/**',
        '.venv/**',
        '__pycache__/**',
        'target/**',
        'build/**',
        'dist/**',
        '.next/**',
        '.nuxt/**',
        'coverage/**',
        '.coverage/**',
        '*.log',
        '.DS_Store',
        'Thumbs.db',
        '.env',
        '.env.local',
        '.env.*.local'
      ];

      archive.glob('**/*', {
        cwd: projectPath,
        ignore: excludePatterns,
        dot: true // Include hidden files like .gitignore
      });

      // Log the download
      logger.info('Project download initiated:', {
        projectId,
        projectName: project.name,
        projectPath,
        filename
      });

      // Finalize the archive
      await archive.finalize();

      return { filename };
    } catch (error) {
      logger.error('Failed to download project:', error);
      throw new AppError(
        'Failed to create project download',
        500,
        ERROR_CODES.FILE_SYSTEM_ERROR,
        error.message
      );
    }
  }

  async analyzeProjectFiles(dirPath, stats, depth = 0) {
    if (depth > 10) return; // Prevent deep recursion
    
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isDirectory()) {
          // Skip large directories
          if (['node_modules', '.git', 'venv', '__pycache__', 'target', 'build'].includes(file.name)) {
            continue;
          }
          await this.analyzeProjectFiles(path.join(dirPath, file.name), stats, depth + 1);
        } else {
          const ext = path.extname(file.name);
          const language = FILE_TYPES[ext] || 'other';
          
          stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
          stats.languages[language] = (stats.languages[language] || 0) + 1;
        }
      }
    } catch (error) {
      // Ignore errors in file analysis
    }
  }
}

// Singleton instance
const projectService = new ProjectService();

module.exports = projectService;