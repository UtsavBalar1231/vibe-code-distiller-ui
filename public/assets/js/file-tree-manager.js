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
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        
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

    }


    /**
     * Refresh the full tree while maintaining project selection state
     */
    async refreshFullTree() {
        // Always ensure we're showing full tree from root
        this.currentPath = '/';
        
        // Load the tree
        await this.loadFileTree();
        
        // If we have a selected project, re-expand to it and highlight
        if (this.selectedProject) {
            await this.expandPathRecursively(this.selectedProject.path);
            
            setTimeout(() => {
                this.highlightSelectedProject();
                
                // Notify upload manager that tree was refreshed
                document.dispatchEvent(new CustomEvent('fileTreeUpdated', {
                    detail: { action: 'treeRefreshed' }
                }));
            }, 100);
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
            header.innerHTML = `
                <span class="tree-node-icon">${isExpanded ? '📁' : '📂'}</span>
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
            
            if (isExpanded && item.files) {
                this.populateChildren(children, item.files);
            }

            node.appendChild(children);

        } else if (item.type === 'file') {
            // File node
            const header = document.createElement('div');
            header.className = 'tree-node-header file-node';
            header.innerHTML = `
                <span class="tree-node-icon">${this.getFileIcon(item)}</span>
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
            if (icon) icon.textContent = '📂';
            
            const children = nodeElement.querySelector('.tree-node-children');
            if (children) children.innerHTML = '';
            
        } else {
            // Expand
            nodeElement.classList.add('expanded');
            this.expandedFolders.add(path);
            
            const icon = nodeElement.querySelector('.tree-node-icon');
            if (icon) icon.textContent = '📁';
            
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
            'js': '📄',
            'javascript': '📄', 
            'ts': '📄',
            'typescript': '📄',
            'py': '🐍',
            'python': '🐍',
            'html': '🌐',
            'htm': '🌐',
            'css': '🎨',
            'scss': '🎨',
            'sass': '🎨',
            'less': '🎨',
            'json': '📋',
            'xml': '📋',
            'yaml': '📋',
            'yml': '📋',
            'md': '📝',
            'markdown': '📝',
            'txt': '📝',
            'log': '📄',
            'config': '⚙️',
            'conf': '⚙️',
            'cfg': '⚙️'
        };

        return iconMap[ext] || '📄';
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
        if (icon) icon.textContent = '📁';

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

        treeContainer.innerHTML = `
            <div class="file-tree-empty">
                <div class="empty-icon">📁</div>
                <div class="empty-message">No files found</div>
            </div>
        `;
    }

    openFileInEditor(filePath, fileName) {
        // Trigger Monaco Editor modal
        if (window.monacoEditorManager) {
            window.monacoEditorManager.openFile(filePath, fileName);
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
            const folderIcon = await loadSvgIcon('/assets/icons/folder.svg', 36, 36, '#4a5568');
            const arrowIcon = await loadSvgIcon('/assets/icons/arrow-right.svg', 28, 28, '#718096');
            const terminalIcon = await loadSvgIcon('/assets/icons/terminal.svg', 36, 36, '#4a5568');

            overlay.innerHTML = `
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    text-align: center;
                    color: #2d3748;
                    font-weight: 600;
                    pointer-events: none;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    padding: 40px 48px;
                    border-radius: 20px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1);
                    min-width: 360px;
                    border: 1px solid rgba(0, 0, 0, 0.08);
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
                    <div style="font-size: 16px; line-height: 1.5; color: #2d3748;">
                        <div style="font-weight: 700; margin-bottom: 8px; font-size: 18px;">Drop to Terminal</div>
                        <div style="opacity: 0.75; font-size: 14px; font-weight: 400;">Send file or folder path to active terminal session</div>
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