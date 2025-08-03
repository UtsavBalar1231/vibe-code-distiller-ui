/**
 * File Tree Manager - Tree-based file browser for Monaco Editor integration
 * Replaces the old file-manager.js with Monaco Editor focused functionality
 */

class FileTreeManager {
    constructor() {
        this.currentPath = '/';
        this.showHidden = true;
        this.fileTree = new Map(); // Cache for file tree structure
        this.expandedFolders = new Set(); // Track expanded folders
        this.selectedProject = null; // Track selected project for highlighting
        this.dropOverlay = null; // Track drop overlay element
        this.dragCounter = 0; // Track drag enter/leave events
        this.isInTerminalArea = false; // Track if currently dragging in terminal area
        this.isDragging = false; // Track if currently in a drag operation
        this.svgCache = new Map(); // Cache for SVG icons
        
        // File loading state management
        this.fileLoadingState = {
            isLoading: false,
            loadingOverlay: null,
            currentFileName: null,
            currentFileType: null
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        // Preload commonly used SVG icons
        this.preloadSvgIcons();
        
        // Check if there's an active project and navigate to it
        this.checkActiveProject();
        
        this.loadFileTree();
        
        // Setup drag and drop for terminal (with retry mechanism)
        this.initializeDropZone();
    }

    checkActiveProject() {
        // Always start from root directory to show full tree
        this.currentPath = '/';
        
        // Get current active project from project manager
        if (window.projectManager && window.projectManager.activeProject) {
            const activeProject = window.projectManager.activeProject;
            if (activeProject && activeProject.path) {
                // Use the new method to show project in full tree context
                this.navigateToProjectInFullTree(activeProject.path, activeProject.id);
                return;
            }
        }
        
        // Fallback: try to get project from localStorage or other sources
        try {
            const storedProjects = JSON.parse(localStorage.getItem('projects') || '[]');
            if (storedProjects.length > 0) {
                // Use the first project as fallback
                const firstProject = storedProjects[0];
                if (firstProject && firstProject.path) {
                    this.navigateToProjectInFullTree(firstProject.path, firstProject.id);
                }
            }
        } catch (error) {
            // Just load the full tree from root
            this.loadFileTree();
        }
    }

    setupEventListeners() {
        // Refresh tree button
        const refreshBtn = document.getElementById('refresh-tree-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshFullTree());
        }


        // Listen for project changes - navigate to project in full tree
        document.addEventListener('projectChanged', (event) => {
            const project = event.detail.project;
            if (project && project.path) {
                this.navigateToProjectInFullTree(project.path, project.id);
            }
        });

        // Listen for theme changes to update image viewer modal if open
        document.addEventListener('themeChanged', async (event) => {
            const existingModal = document.getElementById('image-viewer-overlay');
            if (existingModal) {
                // Theme changed while modal is open, update the modal styles
                const theme = event.detail?.theme || await this.getCurrentTheme();
                this.updateImageModalTheme(existingModal, theme);
            }
        });

    }

    /**
     * Preload commonly used SVG icons
     */
    async preloadSvgIcons() {
        const commonIcons = [
            'folder', 'folder-open', 'document', 'image', 'code', 
            'text', 'json', 'web', 'css', 'settings'
        ];
        
        for (const iconName of commonIcons) {
            await this.loadSvgIcon(iconName);
        }
    }

    /**
     * Load and cache SVG icon
     * @param {string} iconName - Name of the icon (without .svg extension)
     * @returns {Promise<string>} SVG content
     */
    async loadSvgIcon(iconName) {
        if (this.svgCache.has(iconName)) {
            return this.svgCache.get(iconName);
        }
        
        try {
            const response = await fetch(`/assets/icons/${iconName}.svg`);
            const svgContent = await response.text();
            
            // Modify SVG to be inline-friendly
            const modifiedSvg = svgContent
                .replace(/width=["']24["']/, 'width="16"')
                .replace(/height=["']24["']/, 'height="16"')
                .replace(/stroke=["']#000000["']/g, 'stroke="currentColor"')
                .replace(/fill=["']#000000["']/g, 'fill="currentColor"');
            
            this.svgCache.set(iconName, modifiedSvg);
            return modifiedSvg;
        } catch (error) {
            // Fallback to a generic icon
            const fallbackSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect width="20" height="16" x="2" y="4" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>';
            this.svgCache.set(iconName, fallbackSvg);
            return fallbackSvg;
        }
    }

    /**
     * Get SVG icon HTML
     * @param {string} iconName - Name of the icon
     * @returns {string} SVG HTML
     */
    getSvgIcon(iconName) {
        return this.svgCache.get(iconName) || '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect width="20" height="16" x="2" y="4" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>';
    }

    /**
     * Clear all project highlighting in the file tree
     */
    clearProjectHighlight() {
        const prevHighlighted = document.querySelectorAll('.file-tree-node.selected-project');
        prevHighlighted.forEach(node => node.classList.remove('selected-project'));
        console.log('🧹 Cleared project highlighting');
    }

    /**
     * Show success notification after tree refresh
     */
    showRefreshSuccessNotification() {
        this.showCenterNotification('File Tree Refreshed Successfully', 'success');
    }

    /**
     * Show error notification if tree refresh fails
     */
    showRefreshErrorNotification() {
        this.showCenterNotification('Failed to Refresh File Tree', 'error');
    }

    /**
     * Show a centered notification message
     * @param {string} message - Message to display
     * @param {string} type - Notification type ('success', 'error', 'info')
     */
    async showCenterNotification(message, type = 'info') {
        // Remove existing notification if any
        const existingNotification = document.getElementById('file-tree-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Detect current theme from backend API
        let currentTheme = 'light'; // fallback
        try {
            const response = await HTTP.get('/api/theme');
            if (response.success) {
                currentTheme = response.theme;
            }
        } catch (error) {
            console.warn('Failed to get theme for file tree notification:', error.message);
        }
        const isDark = currentTheme === 'dark';

        // Load SVG icon based on type
        const loadNotificationIcon = async (iconType) => {
            const iconMap = {
                'success': '/assets/icons/check-circle.svg',
                'error': '/assets/icons/check-circle.svg', // Will use red color
                'info': '/assets/icons/check-circle.svg'
            };
            
            try {
                const response = await fetch(iconMap[iconType] || iconMap.info);
                const svgText = await response.text();
                const iconColor = isDark 
                    ? (iconType === 'success' ? '#48cc6c' : iconType === 'error' ? '#ff6b6b' : '#4a9eff')
                    : (iconType === 'success' ? '#22c55e' : iconType === 'error' ? '#ef4444' : '#3b82f6');
                
                return svgText
                    .replace(/width="24"/, 'width="32"')
                    .replace(/height="24"/, 'height="32"')
                    .replace(/currentColor/g, iconColor)
                    .replace(/stroke="[^"]*"/g, `stroke="${iconColor}"`);
            } catch (error) {
                const fallbackColor = isDark ? '#718096' : '#6b7280';
                return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="${fallbackColor}" stroke-width="2"/></svg>`;
            }
        };

        // Create notification element
        const notification = document.createElement('div');
        notification.id = 'file-tree-notification';
        notification.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;

        // Load icon and create content
        const iconSvg = await loadNotificationIcon(type);
        
        // Theme-based colors
        const colors = isDark ? {
            background: 'rgba(31, 41, 55, 0.95)',
            text: '#f9fafb',
            textSecondary: '#d1d5db',
            border: 'rgba(75, 85, 99, 0.3)'
        } : {
            background: 'rgba(255, 255, 255, 0.95)',
            text: '#1f2937',
            textSecondary: '#6b7280',
            border: 'rgba(0, 0, 0, 0.08)'
        };

        notification.innerHTML = `
            <div style="
                text-align: center;
                color: ${colors.text};
                font-weight: 600;
                pointer-events: none;
                background: ${colors.background};
                backdrop-filter: blur(10px);
                padding: 40px 48px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1);
                min-width: 320px;
                border: 1px solid ${colors.border};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 20px;
                ">
                    ${iconSvg}
                </div>
                <div style="font-size: 16px; line-height: 1.5;">
                    <div style="font-weight: 700; margin-bottom: 8px; font-size: 18px; color: ${colors.text};">
                        ${type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information'}
                    </div>
                    <div style="opacity: 0.8; font-size: 14px; font-weight: 400; color: ${colors.textSecondary};">
                        ${message}
                    </div>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
        });
        
        // Auto remove after 1 second
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 1000);
        
        console.log(`📢 Professional notification shown: ${message} (${type}, theme: ${currentTheme})`);
    }


    /**
     * Refresh the full tree to collapsed root directory view
     * Shows only root directory content, all folders collapsed
     */
    async refreshFullTree() {
        console.log('🔄 Starting tree refresh to root directory...');
        
        // Clear all expanded folders state
        this.expandedFolders.clear();
        console.log('🗂️ Cleared all expanded folders');
        
        // Clear selected project highlighting
        this.clearProjectHighlight();
        
        // Always ensure we're showing full tree from root
        this.currentPath = '/';
        
        try {
            // Load only the root directory tree
            await this.loadFileTree();
            console.log('📁 Root directory loaded');
            
            // Ensure scroll is at top after loading
            const treeContainer = document.getElementById('file-tree-container');
            if (treeContainer) {
                treeContainer.scrollTop = 0;
                console.log('📌 Scroll reset to top');
            }
            
            // Show success notification
            this.showRefreshSuccessNotification();
            
            // Notify upload manager that tree was refreshed
            document.dispatchEvent(new CustomEvent('fileTreeUpdated', {
                detail: { action: 'treeRefreshed' }
            }));
            
            console.log('✅ Tree refresh to root completed successfully');
            
        } catch (error) {
            console.error('❌ Tree refresh failed:', error);
            this.showRefreshErrorNotification();
        }
    }

    async loadFileTree() {
        try {
            const apiUrl = `/api/filesystem/browse?path=${encodeURIComponent(this.currentPath)}&showHidden=true`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.success) {
                if (data.directory) {
                    this.renderFileTree(data.directory);
                } else {
                    this.renderEmptyState();
                }
            } else {
                this.renderEmptyState();
            }
        } catch (error) {
            this.renderEmptyState();
        }
    }

    renderFileTree(directory) {
        const treeContainer = document.getElementById('file-tree-container');
        if (!treeContainer) return;

        // Clear existing tree
        treeContainer.innerHTML = '';

        // Create tree structure
        const treeRoot = document.createElement('div');
        treeRoot.className = 'file-tree-root';

        // Build tree from directory files
        if (directory.files && directory.files.length > 0) {
            this.populateChildren(treeRoot, directory.files);
        } else {
            // Show empty state if no files
            this.renderEmptyState();
            return;
        }

        treeContainer.appendChild(treeRoot);
        
        // Notify upload manager that file tree was rendered
        document.dispatchEvent(new CustomEvent('fileTreeUpdated', {
            detail: { action: 'treeRendered' }
        }));
    }

    createTreeNode(item, isRoot = false) {
        const node = document.createElement('div');
        node.className = `file-tree-node ${item.type}`;
        node.dataset.path = item.path;
        node.dataset.type = item.type;
        
        // Enable drag functionality for files and folders
        node.draggable = true;

        if (item.type === 'directory') {
            const isExpanded = isRoot || this.expandedFolders.has(item.path);
            node.classList.toggle('expanded', isExpanded);

            // Directory header
            const header = document.createElement('div');
            header.className = 'tree-node-header';
            const folderIcon = isExpanded ? this.getSvgIcon('folder-open') : this.getSvgIcon('folder');
            header.innerHTML = `
                <span class="tree-node-icon">${folderIcon}</span>
                <span class="tree-node-label">${isRoot ? 'Root' : item.name}</span>
            `;

            // Click to expand/collapse
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDirectory(item.path, node);
            });

            node.appendChild(header);

            // Children container
            const children = document.createElement('div');
            children.className = 'tree-node-children';
            
            if (isExpanded) {
                if (item.files && item.files.length > 0) {
                    // Has cached file data, populate immediately
                    this.populateChildren(children, item.files);
                } else {
                    // Need to load children dynamically for expanded folder
                    setTimeout(() => {
                        this.loadDirectoryChildren(item.path, node);
                    }, 50);
                }
            }

            node.appendChild(children);

        } else if (item.type === 'file') {
            // File node
            const header = document.createElement('div');
            header.className = 'tree-node-header file-node';
            const fileIcon = this.getFileIcon(item);
            header.innerHTML = `
                <span class="tree-node-icon">${fileIcon}</span>
                <span class="tree-node-label">${item.name}</span>
            `;

            // Click to open file in Monaco Editor
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openFileInEditor(item.path, item.name);
            });

            node.appendChild(header);
        }

        // Add drag event listeners
        this.addDragEventListeners(node, item);

        return node;
    }

    populateChildren(container, files) {
        // Sort: directories first, then files
        const sorted = [...files].sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        sorted.forEach(file => {
            const childNode = this.createTreeNode(file);
            container.appendChild(childNode);
        });
    }

    async toggleDirectory(path, nodeElement) {
        const isExpanded = nodeElement.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse
            nodeElement.classList.remove('expanded');
            this.expandedFolders.delete(path);
            
            const icon = nodeElement.querySelector('.tree-node-icon');
            if (icon) icon.innerHTML = this.getSvgIcon('folder');
            
            const children = nodeElement.querySelector('.tree-node-children');
            if (children) children.innerHTML = '';
            
        } else {
            // Expand
            nodeElement.classList.add('expanded');
            this.expandedFolders.add(path);
            
            const icon = nodeElement.querySelector('.tree-node-icon');
            if (icon) icon.innerHTML = this.getSvgIcon('folder-open');
            
            // Load children
            await this.loadDirectoryChildren(path, nodeElement);
        }
    }

    async loadDirectoryChildren(path, nodeElement) {
        try {
            const apiUrl = `/api/filesystem/browse?path=${encodeURIComponent(path)}&showHidden=true`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.success && data.directory && data.directory.files) {
                const childrenContainer = nodeElement.querySelector('.tree-node-children');
                if (childrenContainer) {
                    childrenContainer.innerHTML = '';
                    this.populateChildren(childrenContainer, data.directory.files);
                    
                    // Notify upload manager that new directories were added
                    document.dispatchEvent(new CustomEvent('fileTreeUpdated', {
                        detail: { path: path, action: 'directoryExpanded' }
                    }));
                }
            }
        } catch (error) {
            // Failed to load directory children
        }
    }

    getFileIcon(file) {
        const ext = file.name.toLowerCase().split('.').pop();
        
        const iconMap = {
            // Images
            'jpg': 'image',
            'jpeg': 'image',
            'png': 'image',
            'gif': 'image',
            'bmp': 'image',
            'webp': 'image',
            'svg': 'image',
            'ico': 'image',
            'tiff': 'image',
            'tif': 'image',
            // Code files
            'js': 'code',
            'javascript': 'code', 
            'ts': 'code',
            'typescript': 'code',
            'py': 'code',
            'python': 'code',
            'html': 'web',
            'htm': 'web',
            'css': 'css',
            'scss': 'css',
            'sass': 'css',
            'less': 'css',
            'json': 'json',
            'xml': 'json',
            'yaml': 'json',
            'yml': 'json',
            'md': 'text',
            'markdown': 'text',
            'txt': 'text',
            'log': 'document',
            'config': 'settings',
            'conf': 'settings',
            'cfg': 'settings'
        };

        const iconName = iconMap[ext] || 'document';
        return this.getSvgIcon(iconName);
    }

    /**
     * Check if a file is an image based on its extension
     * @param {string} filename - The filename to check
     * @returns {boolean} True if the file is an image
     */
    isImageFile(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'];
        return imageExtensions.includes(ext);
    }

    /**
     * Get parent directory path from a given path
     * @param {string} fullPath - Full path to get parent from
     * @returns {string} Parent directory path
     */
    getParentDirectory(fullPath) {
        if (!fullPath || fullPath === '/') return '/';
        
        // Remove trailing slash if exists
        const cleanPath = fullPath.replace(/\/$/, '');
        
        // Get parent directory
        const lastSlashIndex = cleanPath.lastIndexOf('/');
        if (lastSlashIndex <= 0) return '/';
        
        return cleanPath.substring(0, lastSlashIndex);
    }

    /**
     * Navigate to project in full tree view and highlight the selected project
     * @param {string} projectPath - Full path to the project
     * @param {string} projectId - Project ID for highlighting
     */
    async navigateToProjectInFullTree(projectPath, projectId) {
        try {
            const projectName = this.getProjectNameFromPath(projectPath);
            
            // Store selected project info for highlighting
            this.selectedProject = {
                id: projectId,
                name: projectName,
                path: projectPath
            };
            
            // Always keep root as current path to show full tree
            this.currentPath = '/';
            
            // Load the full file tree first
            await this.loadFileTree();
            
            // Ensure currentPath remains root after loadFileTree
            this.currentPath = '/';
            
            // Expand path to project recursively
            await this.expandPathRecursively(projectPath);
            
            // Ensure currentPath is still root after expansion
            this.currentPath = '/';
            
            // Give a moment for all DOM updates to complete, then highlight and scroll
            setTimeout(() => {
                this.highlightSelectedProject();
                this.scrollToProjectNode();
            }, 150);
            
        } catch (error) {
            // Fallback: just load the full tree
            this.currentPath = '/';
            await this.loadFileTree();
        }
    }

    /**
     * Extract project name from full project path
     * @param {string} projectPath - Full path to the project
     * @returns {string} Project name
     */
    getProjectNameFromPath(projectPath) {
        if (!projectPath) return '';
        
        // Remove trailing slash if exists
        const cleanPath = projectPath.replace(/\/$/, '');
        
        // Get the last part of the path (project name)
        const lastSlashIndex = cleanPath.lastIndexOf('/');
        if (lastSlashIndex === -1) return cleanPath;
        
        return cleanPath.substring(lastSlashIndex + 1);
    }

    /**
     * Expand path recursively to make project visible
     * @param {string} targetPath - Full path to expand to (e.g., "/home/projects/lanpangzi")
     */
    async expandPathRecursively(targetPath) {
        if (!targetPath || targetPath === '/') return;
        
        // Parse path into directory levels: ["/", "/home", "/home/projects"]
        const pathParts = this.parsePathLevels(targetPath);
        
        // Always expand each level sequentially, regardless of expandedFolders state
        // This ensures proper expansion after DOM re-rendering
        for (const pathLevel of pathParts) {
            await this.expandDirectoryLevel(pathLevel);
        }
    }

    /**
     * Parse full path into directory levels
     * @param {string} fullPath - Full path like "/home/projects/lanpangzi"
     * @returns {Array} Array of paths like ["/", "/home", "/home/projects"]
     */
    parsePathLevels(fullPath) {
        const cleanPath = fullPath.replace(/\/$/, ''); // Remove trailing slash
        const parts = cleanPath.split('/').filter(part => part.length > 0);
        
        const levels = [];
        let currentPath = '';
        
        for (const part of parts) {
            currentPath += '/' + part;
            // Include all parent directories, but not the final project itself
            if (currentPath !== cleanPath) {
                levels.push(currentPath);
            }
        }
        
        // Always include root if not already there
        if (levels.length === 0 || levels[0] !== '/') {
            levels.unshift('/');
        }
        
        return levels;
    }

    /**
     * Expand a specific directory level and load its children
     * @param {string} dirPath - Directory path to expand
     */
    async expandDirectoryLevel(dirPath) {
        // Find the directory node in the DOM
        const dirNode = document.querySelector(`.file-tree-node[data-path="${dirPath}"][data-type="directory"]`);
        if (!dirNode) return;

        // Always force expansion (don't check current state)
        // This ensures proper expansion after DOM re-rendering
        dirNode.classList.add('expanded');
        this.expandedFolders.add(dirPath);

        // Update folder icon
        const icon = dirNode.querySelector('.tree-node-icon');
        if (icon) icon.innerHTML = this.getSvgIcon('folder-open');

        // Load children if not already loaded or if container is empty
        const childrenContainer = dirNode.querySelector('.tree-node-children');
        if (childrenContainer) {
            // Always reload children to ensure they're up to date
            if (childrenContainer.children.length === 0) {
                await this.loadDirectoryChildren(dirPath, dirNode);
            }
            // Make children visible
            childrenContainer.style.display = 'block';
            
            // Notify upload manager that directory was expanded
            document.dispatchEvent(new CustomEvent('fileTreeUpdated', {
                detail: { path: dirPath, action: 'directoryExpanded' }
            }));
        }
    }

    /**
     * Scroll to the selected project node to make it visible
     */
    scrollToProjectNode() {
        if (!this.selectedProject) return;

        setTimeout(() => {
            // Find the project node in the DOM
            const projectNode = document.querySelector(
                `.file-tree-node[data-path="${this.selectedProject.path}"]`
            );
            
            if (!projectNode) return;

            // Get the file tree container
            const treeContainer = document.getElementById('file-tree-container');
            if (!treeContainer) return;

            // Calculate scroll position
            const containerRect = treeContainer.getBoundingClientRect();
            const nodeRect = projectNode.getBoundingClientRect();
            
            // Check if node is already visible
            const isVisible = (
                nodeRect.top >= containerRect.top &&
                nodeRect.bottom <= containerRect.bottom
            );

            if (!isVisible) {
                // Calculate optimal scroll position
                // Position the project node at 1/3 from the top for better visibility
                const offsetFromTop = containerRect.height / 3;
                const targetScrollTop = 
                    treeContainer.scrollTop + 
                    (nodeRect.top - containerRect.top) - 
                    offsetFromTop;

                // Smooth scroll to target position
                treeContainer.scrollTo({
                    top: Math.max(0, targetScrollTop),
                    behavior: 'smooth'
                });
            }
        }, 200); // Delay to ensure DOM updates are complete
    }

    /**
     * Highlight the selected project in the file tree
     */
    highlightSelectedProject() {
        if (!this.selectedProject) return;
        
        setTimeout(() => {
            // Remove previous highlights
            const prevHighlighted = document.querySelectorAll('.file-tree-node.selected-project');
            prevHighlighted.forEach(node => node.classList.remove('selected-project'));
            
            // Find and highlight the selected project node using exact path match
            const projectNode = document.querySelector(
                `.file-tree-node[data-path="${this.selectedProject.path}"][data-type="directory"]`
            );
            
            if (projectNode) {
                projectNode.classList.add('selected-project');
            } else {
                // Fallback: try to find by name if exact path doesn't work
                const allDirNodes = document.querySelectorAll('.file-tree-node[data-type="directory"]');
                for (const node of allDirNodes) {
                    const nodePath = node.dataset.path;
                    if (nodePath && nodePath.endsWith('/' + this.selectedProject.name)) {
                        // Additional check: ensure this is actually the right project
                        const nodeLabel = node.querySelector('.tree-node-label');
                        if (nodeLabel && nodeLabel.textContent.trim() === this.selectedProject.name) {
                            node.classList.add('selected-project');
                            break;
                        }
                    }
                }
            }
        }, 150); // Slightly longer delay to ensure all DOM updates are complete
    }

    renderEmptyState() {
        const treeContainer = document.getElementById('file-tree-container');
        if (!treeContainer) return;

        const folderIcon = this.getSvgIcon('folder');
        treeContainer.innerHTML = `
            <div class="file-tree-empty">
                <div class="empty-icon">${folderIcon}</div>
                <div class="empty-message">No files found</div>
            </div>
        `;
    }

    async openFileInEditor(filePath, fileName) {
        // Prevent multiple file loading operations
        if (this.isFileLoading()) {
            console.log('🚫 File loading already in progress, ignoring click');
            return;
        }

        try {
            // Determine file type for appropriate loading animation
            const fileType = this.isImageFile(fileName) ? 'image' : 'file';
            
            // Show loading animation immediately
            await this.showFileLoadingState(fileName, fileType);
            
            // Add a small delay to ensure loading animation is visible
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check if it's an image file
            if (this.isImageFile(fileName)) {
                await this.openImageViewer(filePath, fileName);
            } else {
                // Trigger Monaco Editor modal for text files
                if (window.monacoEditorManager) {
                    await window.monacoEditorManager.openFile(filePath, fileName);
                } else {
                    throw new Error('Monaco Editor Manager not available');
                }
            }
            
        } catch (error) {
            console.error('❌ Failed to open file:', error);
            
            // Show error notification
            this.showNotification(`Failed to open file: ${error.message}`, 'error');
            
        } finally {
            // Always hide loading animation, whether success or failure
            this.hideFileLoadingState();
        }
    }

    /**
     * Open image viewer for image files using modal approach like Monaco Editor
     * @param {string} filePath - Full path to the image file
     * @param {string} fileName - Name of the image file
     */
    async openImageViewer(filePath, fileName) {
        try {
            // Fetch image data from API
            const response = await fetch(`/api/filesystem/preview?path=${encodeURIComponent(filePath)}`);
            const result = await response.json();
            
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to load image');
            }
            
            if (!result.file.isImage) {
                throw new Error('File is not an image');
            }
            
            // Create and show image modal
            this.showImageModal(result.file, fileName);
            
        } catch (error) {
            console.error('Error opening image viewer:', error);
            throw error; // Re-throw to be handled by openFileInEditor
        }
    }

    /**
     * Show image in a modal similar to Monaco Editor
     * @param {Object} imageFile - Image file data from API
     * @param {string} fileName - Name of the image file
     */
    async showImageModal(imageFile, fileName) {
        // Remove existing image modal if any
        const existingModal = document.getElementById('image-viewer-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        // Get current theme and colors
        const currentTheme = await this.getCurrentTheme();
        const colors = this.getImageViewerThemeColors(currentTheme);

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'image-viewer-overlay';
        overlay.className = 'image-viewer-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'image-viewer-modal';
        modal.style.cssText = `
            background: ${colors.modalBackground};
            border-radius: 8px;
            max-width: 90vw;
            max-height: 90vh;
            position: relative;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid ${colors.borderColor};
        `;

        // Create header similar to Monaco Editor
        const header = document.createElement('div');
        header.className = 'image-viewer-header';
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background: ${colors.headerBackground};
            border-bottom: 1px solid ${colors.borderColor};
            min-height: 48px;
        `;

        const headerLeft = document.createElement('div');
        headerLeft.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        const fileIcon = document.createElement('span');
        fileIcon.innerHTML = this.getSvgIcon('image');
        fileIcon.style.fontSize = '16px';

        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = fileName;
        fileNameSpan.style.cssText = `
            color: ${colors.primaryText};
            font-weight: 500;
        `;

        const fileInfo = document.createElement('span');
        fileInfo.textContent = `${imageFile.mimeType} • ${this.formatFileSize(imageFile.size)}`;
        fileInfo.style.cssText = `
            color: ${colors.secondaryText};
            font-size: 12px;
            margin-left: 8px;
        `;

        const shortcutHint = document.createElement('span');
        shortcutHint.textContent = 'Press ESC to close';
        shortcutHint.style.cssText = `
            color: ${colors.tertiaryText};
            font-size: 11px;
            margin-left: 12px;
            font-style: italic;
        `;

        headerLeft.appendChild(fileIcon);
        headerLeft.appendChild(fileNameSpan);
        headerLeft.appendChild(fileInfo);
        headerLeft.appendChild(shortcutHint);

        const headerActions = document.createElement('div');
        headerActions.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        const closeButton = document.createElement('button');
        closeButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 18L18 6M6 6L18 18" stroke="${colors.secondaryText}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        closeButton.title = 'Close Image Viewer (Esc)';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: ${colors.secondaryText};
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: all 0.2s ease;
        `;
        closeButton.onmouseover = () => {
            closeButton.style.background = colors.buttonHoverBackground;
            closeButton.style.color = colors.buttonHoverText;
            const svg = closeButton.querySelector('svg path');
            if (svg) svg.setAttribute('stroke', colors.buttonHoverText);
        };
        closeButton.onmouseout = () => {
            closeButton.style.background = 'none';
            closeButton.style.color = colors.secondaryText;
            const svg = closeButton.querySelector('svg path');
            if (svg) svg.setAttribute('stroke', colors.secondaryText);
        };

        headerActions.appendChild(closeButton);
        header.appendChild(headerLeft);
        header.appendChild(headerActions);

        // Create image container
        const imageContainer = document.createElement('div');
        imageContainer.style.cssText = `
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: ${colors.imageBackground};
            overflow: auto;
            position: relative;
            min-height: 300px;
        `;

        // Add loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: ${colors.secondaryText};
            font-size: 14px;
        `;
        loadingIndicator.textContent = 'Loading image...';
        imageContainer.appendChild(loadingIndicator);

        const img = document.createElement('img');
        img.src = `data:${imageFile.mimeType};base64,${imageFile.content}`;
        img.alt = fileName;
        img.draggable = false; // Disable dragging of the image
        img.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            pointer-events: auto;
            user-select: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        // Show image when loaded and hide loading indicator
        img.onload = () => {
            img.style.opacity = '1';
            if (loadingIndicator && loadingIndicator.parentNode) {
                loadingIndicator.parentNode.removeChild(loadingIndicator);
            }
        };

        img.onerror = () => {
            loadingIndicator.textContent = 'Failed to load image';
            loadingIndicator.style.color = '#dc3545';
        };

        // Prevent drag events on the image
        img.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        img.addEventListener('drag', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        img.addEventListener('dragend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        imageContainer.appendChild(img);
        modal.appendChild(header);
        modal.appendChild(imageContainer);
        overlay.appendChild(modal);

        // Prevent drag events on modal and overlay
        modal.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        modal.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        modal.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        overlay.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        overlay.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        overlay.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        // Close handlers
        const closeModal = () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        };

        closeButton.onclick = closeModal;
        overlay.onclick = (e) => {
            if (e.target === overlay) closeModal();
        };

        // Keyboard shortcuts
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);

        // Show modal
        document.body.appendChild(overlay);
        
        // Trigger animation
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });
    }

    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Get current theme from backend API
     * @returns {Promise<string>} Theme name ('light' or 'dark')
     */
    async getCurrentTheme() {
        try {
            const response = await HTTP.get('/api/theme');
            if (response.success) {
                return response.theme;
            } else {
                console.warn('Failed to get theme from server:', response.error);
                return 'light'; // fallback
            }
        } catch (error) {
            console.warn('Error fetching theme:', error);
            return 'light'; // fallback
        }
    }

    /**
     * Get theme-specific colors for image viewer modal
     * @param {string} theme - Theme name ('light' or 'dark')
     * @returns {Object} Color scheme object
     */
    getImageViewerThemeColors(theme) {
        if (theme === 'dark') {
            return {
                modalBackground: '#2d2d30',
                headerBackground: '#252526',
                borderColor: '#404040',
                primaryText: '#e6e6e6',
                secondaryText: '#a8a8a8',
                tertiaryText: '#666666',
                imageBackground: '#1e1e1e',
                buttonHoverBackground: '#404040',
                buttonHoverText: '#e6e6e6'
            };
        } else {
            return {
                modalBackground: '#ffffff',
                headerBackground: '#f8f9fa',
                borderColor: '#e0e0e0',
                primaryText: '#333333',
                secondaryText: '#666666',
                tertiaryText: '#999999',
                imageBackground: '#ffffff',
                buttonHoverBackground: '#e9ecef',
                buttonHoverText: '#333333'
            };
        }
    }

    /**
     * Update the theme of an existing image modal
     * @param {HTMLElement} modalOverlay - The modal overlay element
     * @param {string} theme - Theme name ('light' or 'dark')
     */
    updateImageModalTheme(modalOverlay, theme) {
        const colors = this.getImageViewerThemeColors(theme);
        
        // Update modal content background
        const modal = modalOverlay.querySelector('.image-viewer-modal');
        if (modal) {
            modal.style.background = colors.modalBackground;
            modal.style.borderColor = colors.borderColor;
        }
        
        // Update header
        const header = modalOverlay.querySelector('.image-viewer-header');
        if (header) {
            header.style.background = colors.headerBackground;
            header.style.borderBottomColor = colors.borderColor;
        }
        
        // Update text colors
        const fileNameSpan = header?.querySelector('span:nth-child(2)');
        if (fileNameSpan) {
            fileNameSpan.style.color = colors.primaryText;
        }
        
        const fileInfo = header?.querySelector('span:nth-child(3)');
        if (fileInfo) {
            fileInfo.style.color = colors.secondaryText;
        }
        
        const shortcutHint = header?.querySelector('span:nth-child(4)');
        if (shortcutHint) {
            shortcutHint.style.color = colors.tertiaryText;
        }
        
        // Update close button
        const closeButton = header?.querySelector('button');
        if (closeButton) {
            closeButton.style.color = colors.secondaryText;
            // Update SVG stroke color
            const svg = closeButton.querySelector('svg path');
            if (svg) svg.setAttribute('stroke', colors.secondaryText);
            
            closeButton.onmouseover = () => {
                closeButton.style.background = colors.buttonHoverBackground;
                closeButton.style.color = colors.buttonHoverText;
                const svg = closeButton.querySelector('svg path');
                if (svg) svg.setAttribute('stroke', colors.buttonHoverText);
            };
            closeButton.onmouseout = () => {
                closeButton.style.background = 'none';
                closeButton.style.color = colors.secondaryText;
                const svg = closeButton.querySelector('svg path');
                if (svg) svg.setAttribute('stroke', colors.secondaryText);
            };
        }
        
        // Update image container background
        const imageContainer = modal?.querySelector('div:last-child');
        if (imageContainer) {
            imageContainer.style.background = colors.imageBackground;
        }
        
        // Update loading indicator if present
        const loadingIndicator = imageContainer?.querySelector('div');
        if (loadingIndicator && loadingIndicator.textContent?.includes('Loading')) {
            loadingIndicator.style.color = colors.secondaryText;
        }
    }


    /**
     * Add drag event listeners to file/folder nodes
     * @param {HTMLElement} node - The tree node element
     * @param {Object} item - The file/folder item data
     */
    addDragEventListeners(node, item) {
        node.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            
            e.dataTransfer.setData('text/plain', item.path);
            e.dataTransfer.setData('application/x-file-path', item.path);
            e.dataTransfer.setData('application/x-file-type', item.type);
            e.dataTransfer.effectAllowed = 'copy';
            
            node.classList.add('dragging');
            this.draggedNode = node;
        });

        node.addEventListener('dragend', (e) => {
            node.classList.remove('dragging');
            this.draggedNode = null;
        });
    }

    /**
     * Initialize drop zone with retry mechanism
     */
    initializeDropZone() {
        this.setupTerminalDropZone();
        
        setTimeout(() => {
            if (!this.dropOverlay) {
                this.setupTerminalDropZone();
            }
        }, 1000);
        
        document.addEventListener('terminalStateChanged', () => {
            setTimeout(() => {
                if (!this.dropOverlay) {
                    this.setupTerminalDropZone();
                }
            }, 500);
        });
    }

    /**
     * Setup terminal content area as drop zone
     */
    setupTerminalDropZone() {
        const terminalContent = document.getElementById('terminal-content');
        const terminalIframe = document.getElementById('ttyd-terminal');
        
        if (!terminalContent) {
            return;
        }
        
        if (this.dropOverlay) {
            this.dropOverlay.remove();
            this.dropOverlay = null;
        }
        
        this.createDropZoneOverlay(terminalContent);
        this.setupDropZoneEvents(terminalContent, terminalIframe);
    }

    /**
     * Create an overlay that covers iframe during drag operations
     */
    createDropZoneOverlay(terminalContent) {
        const overlay = document.createElement('div');
        overlay.id = 'terminal-drop-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(var(--accent-primary-rgb), 0.1);
            border: 2px dashed var(--accent-primary);
            border-radius: var(--border-radius);
            display: none;
            z-index: 999999;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
        
        // Load SVG icons
        const loadSvgIcon = async (iconPath, width = 24, height = 24, color = '#4a5568') => {
            try {
                const response = await fetch(iconPath);
                const svgText = await response.text();
                return svgText
                    .replace(/width="24"/, `width="${width}"`)
                    .replace(/height="24"/, `height="${height}"`)
                    .replace(/currentColor/g, color)
                    .replace(/stroke="[^"]*"/g, `stroke="${color}"`);
            } catch (error) {
                return `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none"><rect width="20" height="16" x="2" y="4" rx="2" stroke="${color}" stroke-width="1.5"/></svg>`;
            }
        };

        const createOverlayContent = async () => {
            // Detect current theme from backend API
            let currentTheme = 'light'; // fallback
            try {
                const response = await HTTP.get('/api/theme');
                if (response.success) {
                    currentTheme = response.theme;
                }
            } catch (error) {
                console.warn('Failed to get theme for file tree overlay:', error.message);
            }
            const isDark = currentTheme === 'dark';
            
            // Theme-based colors
            const colors = isDark ? {
                background: 'rgba(31, 41, 55, 0.95)',
                text: '#f9fafb',
                textSecondary: '#d1d5db',
                border: 'rgba(75, 85, 99, 0.3)',
                iconPrimary: '#9ca3af',
                iconSecondary: '#6b7280'
            } : {
                background: 'rgba(255, 255, 255, 0.95)',
                text: '#2d3748',
                textSecondary: '#4a5568',
                border: 'rgba(0, 0, 0, 0.08)',
                iconPrimary: '#4a5568',
                iconSecondary: '#718096'
            };

            const folderIcon = await loadSvgIcon('/assets/icons/folder.svg', 36, 36, colors.iconPrimary);
            const arrowIcon = await loadSvgIcon('/assets/icons/arrow-right.svg', 28, 28, colors.iconSecondary);
            const terminalIcon = await loadSvgIcon('/assets/icons/terminal.svg', 36, 36, colors.iconPrimary);

            overlay.innerHTML = `
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    text-align: center;
                    color: ${colors.text};
                    font-weight: 600;
                    pointer-events: none;
                    background: ${colors.background};
                    backdrop-filter: blur(10px);
                    padding: 40px 48px;
                    border-radius: 20px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1);
                    min-width: 360px;
                    border: 1px solid ${colors.border};
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                ">
                    <div style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 24px;
                        margin-bottom: 20px;
                    ">
                        <div>${folderIcon}</div>
                        <div style="opacity: 0.8;">${arrowIcon}</div>
                        <div>${terminalIcon}</div>
                    </div>
                    <div style="font-size: 16px; line-height: 1.5; color: ${colors.text};">
                        <div style="font-weight: 700; margin-bottom: 8px; font-size: 18px;">Drop to Terminal</div>
                        <div style="opacity: 0.75; font-size: 14px; font-weight: 400; color: ${colors.textSecondary};">Send file or folder path to active terminal session</div>
                    </div>
                </div>
            `;
        };

        createOverlayContent();
        
        document.body.appendChild(overlay);
        this.dropOverlay = overlay;
    }

    /**
     * Setup drag and drop event listeners
     */
    setupDropZoneEvents(terminalContent, terminalIframe) {
        this.dragCounter = 0;
        this.isInTerminalArea = false;
        this.isDragging = false;
        
        const isInTerminalArea = (e) => {
            if (!terminalContent) return false;
            
            const rect = terminalContent.getBoundingClientRect();
            return (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            );
        };
        
        const globalDragStartHandler = (e) => {
            this.isDragging = true;
            
            if (terminalIframe) {
                terminalIframe.style.pointerEvents = 'none';
            }
        };
        
        const globalDragOverHandler = (e) => {
            e.preventDefault();
            
            if (!this.isDragging) return;
            
            const inTerminalArea = isInTerminalArea(e);
            
            if (inTerminalArea) {
                e.dataTransfer.dropEffect = 'copy';
                
                if (!this.isInTerminalArea) {
                    this.isInTerminalArea = true;
                    
                    if (this.dropOverlay) {
                        this.dropOverlay.style.display = 'block';
                        this.dropOverlay.style.opacity = '1';
                        this.dropOverlay.style.pointerEvents = 'auto';
                    }
                }
            } else {
                e.dataTransfer.dropEffect = 'none';
                
                if (this.isInTerminalArea) {
                    this.isInTerminalArea = false;
                    
                    if (this.dropOverlay) {
                        this.dropOverlay.style.opacity = '0';
                        this.dropOverlay.style.pointerEvents = 'none';
                        setTimeout(() => {
                            if (this.dropOverlay && !this.isInTerminalArea) {
                                this.dropOverlay.style.display = 'none';
                            }
                        }, 100);
                    }
                }
            }
        };
        
        const globalDropHandler = (e) => {
            if (this.isDragging && (this.isInTerminalArea || isInTerminalArea(e))) {
                e.preventDefault();
                e.stopPropagation();
                
                const filePath = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/x-file-path');
                const fileType = e.dataTransfer.getData('application/x-file-type');
                
                if (filePath) {
                    this.sendPathToTerminal(filePath, fileType);
                }
            }
            
            this.cleanupDragState(terminalIframe);
        };
        
        const globalDragEndHandler = () => {
            this.cleanupDragState(terminalIframe);
        };
        
        this.removeGlobalEventListeners();
        
        this.globalDragStartHandler = globalDragStartHandler;
        this.globalDragOverHandler = globalDragOverHandler;
        this.globalDropHandler = globalDropHandler; 
        this.globalDragEndHandler = globalDragEndHandler;
        
        document.addEventListener('dragstart', this.globalDragStartHandler, true);
        document.addEventListener('dragover', this.globalDragOverHandler, true);
        document.addEventListener('drop', this.globalDropHandler, true);
        document.addEventListener('dragend', this.globalDragEndHandler, true);
    }
    
    /**
     * 清理拖拽状态
     */
    cleanupDragState(terminalIframe) {
        this.isDragging = false;
        this.isInTerminalArea = false;
        this.dragCounter = 0;
        
        if (this.dropOverlay) {
            this.dropOverlay.style.opacity = '0';
            this.dropOverlay.style.pointerEvents = 'none';
            setTimeout(() => {
                if (this.dropOverlay) {
                    this.dropOverlay.style.display = 'none';
                }
            }, 100);
        }
        
        if (terminalIframe) {
            terminalIframe.style.pointerEvents = 'auto';
        }
    }
    
    /**
     * 移除全局事件监听器
     */
    removeGlobalEventListeners() {
        if (this.globalDragStartHandler) {
            document.removeEventListener('dragstart', this.globalDragStartHandler, true);
        }
        if (this.globalDragOverHandler) {
            document.removeEventListener('dragover', this.globalDragOverHandler, true);
        }
        if (this.globalDropHandler) {
            document.removeEventListener('drop', this.globalDropHandler, true);
        }
        if (this.globalDragEndHandler) {
            document.removeEventListener('dragend', this.globalDragEndHandler, true);
        }
    }

    /**
     * Send file/folder path to terminal
     * @param {string} filePath - Absolute path of the file/folder
     * @param {string} fileType - Type of the item ('file' or 'directory')
     */
    async sendPathToTerminal(filePath, fileType) {
        const terminalManager = window.terminalManager;
        
        if (!terminalManager) {
            this.showNotification('Terminal system not available', 'warning');
            return;
        }
        
        const activeSession = terminalManager.getActiveSession();
        
        if (!activeSession || !activeSession.name) {
            this.showNotification('No active terminal session. Please select a terminal tab first.', 'warning');
            return;
        }
        
        // Only work with session-based terminals
        if (!activeSession.name.startsWith('claude-web-')) {
            this.showNotification('Invalid terminal session format', 'warning');
            return;
        }
        
        try {
            // Send the absolute file path to the terminal via API
            const response = await fetch('/api/terminal/send-input', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionName: activeSession.name,
                    text: filePath
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showNotification(`${fileType === 'directory' ? 'Folder' : 'File'} path sent to terminal: ${filePath}`, 'success');
            } else {
                throw new Error(result.error || result.message || 'Failed to send path to terminal');
            }
            
        } catch (error) {
            this.showNotification(`Failed to send path to terminal: ${error.message}`, 'error');
        }
    }

    /**
     * Show notification to user
     * @param {string} message - Notification message
     * @param {string} type - Notification type ('success', 'warning', 'error', 'info')
     */
    showNotification(message, type = 'info') {
        // Try to use existing notification system if available
        if (window.projectManager && typeof window.projectManager.showNotification === 'function') {
            window.projectManager.showNotification(message, type);
        } else if (window.showNotification && typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            // Fallback for critical error messages
            if (type === 'error') {
                alert(message);
            }
        }
    }

    /**
     * Check if a file is currently loading
     * @returns {boolean} True if a file is currently loading
     */
    isFileLoading() {
        return this.fileLoadingState.isLoading;
    }

    /**
     * Show file loading state with professional animation
     * @param {string} fileName - Name of the file being loaded
     * @param {string} fileType - Type of file ('file', 'image', 'folder')
     */
    async showFileLoadingState(fileName, fileType = 'file') {
        // Don't show if already loading
        if (this.fileLoadingState.isLoading) {
            return;
        }

        // Set loading state
        this.fileLoadingState.isLoading = true;
        this.fileLoadingState.currentFileName = fileName;
        this.fileLoadingState.currentFileType = fileType;

        // Remove existing overlay if any
        if (this.fileLoadingState.loadingOverlay) {
            this.fileLoadingState.loadingOverlay.remove();
            this.fileLoadingState.loadingOverlay = null;
        }

        // Create loading overlay
        const overlay = document.createElement('div');
        overlay.id = 'file-loading-overlay';
        overlay.className = 'file-loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;

        // Get current theme for theming
        let currentTheme = 'light';
        try {
            const response = await fetch('/api/theme');
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.theme) {
                    currentTheme = data.theme;
                }
            }
        } catch (error) {
            console.warn('Failed to get theme for file loading overlay:', error.message);
        }
        const isDark = currentTheme === 'dark';

        // Theme-based colors
        const colors = isDark ? {
            background: 'rgba(31, 41, 55, 0.95)',
            text: '#f9fafb',
            textSecondary: '#d1d5db',
            border: 'rgba(75, 85, 99, 0.3)',
            iconColor: '#9ca3af'
        } : {
            background: 'rgba(255, 255, 255, 0.95)',
            text: '#1f2937',
            textSecondary: '#6b7280',
            border: 'rgba(0, 0, 0, 0.08)',
            iconColor: '#4a5568'
        };

        // Get appropriate icon based on file type
        let iconName = 'document';
        if (fileType === 'image') {
            iconName = 'image';
        } else if (fileType === 'folder') {
            iconName = 'folder';
        }

        // Load and prepare icon
        const iconSvg = await this.loadFileLoadingIcon(iconName, colors.iconColor);

        // Create modal content
        overlay.innerHTML = `
            <div class="file-loading-modal" style="
                text-align: center;
                color: ${colors.text};
                font-weight: 600;
                pointer-events: none;
                background: ${colors.background};
                backdrop-filter: blur(10px);
                padding: 40px 48px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1);
                min-width: 360px;
                border: 1px solid ${colors.border};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <div class="file-loading-icon" style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 20px;
                    font-size: 48px;
                    opacity: 0.8;
                ">
                    ${iconSvg}
                </div>
                <div class="file-loading-title" style="
                    font-weight: 700;
                    margin-bottom: 8px;
                    font-size: 18px;
                    color: ${colors.text};
                ">
                    Opening ${fileType === 'image' ? 'Image' : 'File'}
                </div>
                <div class="file-loading-description" style="
                    opacity: 0.75;
                    font-size: 14px;
                    font-weight: 400;
                    color: ${colors.textSecondary};
                    margin-bottom: 20px;
                ">
                    Loading ${fileName}...
                </div>
                <div class="file-loading-spinner" style="
                    margin: 0 auto;
                    width: 32px;
                    height: 32px;
                    border: 3px solid ${colors.border};
                    border-top: 3px solid ${colors.iconColor};
                    border-radius: 50%;
                    animation: file-loading-spin 1s linear infinite;
                "></div>
            </div>
        `;

        // Add spinner animation styles
        if (!document.getElementById('file-loading-styles')) {
            const styles = document.createElement('style');
            styles.id = 'file-loading-styles';
            styles.textContent = `
                @keyframes file-loading-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(styles);
        }

        // Add to document and store reference
        document.body.appendChild(overlay);
        this.fileLoadingState.loadingOverlay = overlay;

        // Animate in
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });

        console.log(`📂 File loading overlay shown for: ${fileName} (${fileType})`);
    }

    /**
     * Hide file loading state
     */
    hideFileLoadingState() {
        if (!this.fileLoadingState.isLoading || !this.fileLoadingState.loadingOverlay) {
            return;
        }

        const overlay = this.fileLoadingState.loadingOverlay;
        
        // Animate out
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 300);

        // Reset state
        this.fileLoadingState.isLoading = false;
        this.fileLoadingState.loadingOverlay = null;
        this.fileLoadingState.currentFileName = null;
        this.fileLoadingState.currentFileType = null;

        console.log('📂 File loading overlay hidden');
    }

    /**
     * Load and prepare SVG icon for file loading overlay
     * @param {string} iconName - Name of the icon
     * @param {string} color - Color for the icon
     * @returns {Promise<string>} SVG HTML
     */
    async loadFileLoadingIcon(iconName, color) {
        try {
            const response = await fetch(`/assets/icons/${iconName}.svg`);
            const svgContent = await response.text();
            
            // Modify SVG for loading overlay
            return svgContent
                .replace(/width="24"/, 'width="48"')
                .replace(/height="24"/, 'height="48"')
                .replace(/stroke="[^"]*"/g, `stroke="${color}"`)
                .replace(/fill="[^"]*"/g, `fill="${color}"`)
                .replace(/currentColor/g, color);
        } catch (error) {
            // Fallback SVG
            return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
            </svg>`;
        }
    }

    /**
     * Clean up resources and event listeners
     */
    destroy() {
        // Clean up all global event listeners
        this.removeGlobalEventListeners();
        
        // Clean up drop overlay
        if (this.dropOverlay && this.dropOverlay.parentNode) {
            this.dropOverlay.parentNode.removeChild(this.dropOverlay);
            this.dropOverlay = null;
        }

        // Clean up file loading overlay
        if (this.fileLoadingState.loadingOverlay && this.fileLoadingState.loadingOverlay.parentNode) {
            this.fileLoadingState.loadingOverlay.parentNode.removeChild(this.fileLoadingState.loadingOverlay);
        }

        // Reset file loading state
        this.fileLoadingState = {
            isLoading: false,
            loadingOverlay: null,
            currentFileName: null,
            currentFileType: null
        };

        // Clean up drag state
        this.dragCounter = 0;
        this.isInTerminalArea = false;
        this.isDragging = false;

        // Clean up other resources
        this.fileTree.clear();
        this.expandedFolders.clear();
        this.selectedProject = null;
        this.draggedNode = null;
    }
}

// Initialize file tree manager when DOM is loaded
function initializeFileTreeManager() {
    window.fileTreeManager = new FileTreeManager();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFileTreeManager);
} else {
    // DOM already loaded
    initializeFileTreeManager();
}