/**
 * File Tree Manager - Tree-based file browser for Monaco Editor integration
 * Replaces the old file-manager.js with Monaco Editor focused functionality
 */

class FileTreeManager {
    constructor() {
        this.currentPath = '/';
        this.showHidden = false;
        this.fileTree = new Map(); // Cache for file tree structure
        this.expandedFolders = new Set(); // Track expanded folders
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        // Check if there's an active project and navigate to it
        this.checkActiveProject();
        
        this.loadFileTree();
    }

    checkActiveProject() {
        // Get current active project from project manager
        if (window.projectManager && window.projectManager.activeProject) {
            const activeProject = window.projectManager.activeProject;
            if (activeProject && activeProject.path) {
                this.navigateToDirectory(activeProject.path);
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
                    this.navigateToDirectory(firstProject.path);
                }
            }
        } catch (error) {
            console.warn('Could not get active project, using root path');
        }
    }

    setupEventListeners() {
        // Refresh tree button
        const refreshBtn = document.getElementById('refresh-tree-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadFileTree());
        }

        // Toggle hidden files button
        const toggleHiddenBtn = document.getElementById('toggle-hidden-btn');
        if (toggleHiddenBtn) {
            toggleHiddenBtn.addEventListener('click', () => this.toggleHiddenFiles());
        }

        // Listen for project changes - navigate to project directory
        document.addEventListener('projectChanged', (event) => {
            const project = event.detail.project;
            if (project && project.path) {
                this.navigateToDirectory(project.path);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'h') {
                event.preventDefault();
                this.toggleHiddenFiles();
            }
        });
    }

    toggleHiddenFiles() {
        this.showHidden = !this.showHidden;
        this.loadFileTree();
    }

    async loadFileTree() {
        try {
            const apiUrl = `/api/filesystem/browse?path=${encodeURIComponent(this.currentPath)}&showHidden=${this.showHidden}`;
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
            const apiUrl = `/api/filesystem/browse?path=${encodeURIComponent(path)}&showHidden=${this.showHidden}`;
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

    navigateToDirectory(path) {
        this.currentPath = path;
        this.expandedFolders.clear(); // Reset expanded state
        this.loadFileTree();
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