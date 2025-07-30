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
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        // Check if there's an active project and navigate to it
        this.checkActiveProject();
        
        this.loadFileTree();
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
            console.warn('Could not get active project, using root path');
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
                console.error(data.message || 'Failed to load file tree');
                this.renderEmptyState();
            }
        } catch (error) {
            console.error('Error loading file tree:', error);
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
    }

    createTreeNode(item, isRoot = false) {
        const node = document.createElement('div');
        node.className = `file-tree-node ${item.type}`;
        node.dataset.path = item.path;
        node.dataset.type = item.type;

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
                }
            }
        } catch (error) {
            console.error('Error loading directory children:', error);
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
            console.error('Error navigating to project in full tree:', error);
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
        } else {
            console.warn('Monaco Editor Manager not available');
        }
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