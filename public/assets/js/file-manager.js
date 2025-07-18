/**
 * File Manager - Enhanced file browser with support for all file types
 * Replaces the image-specific functionality with comprehensive file management
 */

class FileManager {
    constructor() {
        this.currentProjectId = null;
        this.currentPath = '';
        this.showHidden = true;
        this.fileCache = new Map();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupFileInput();
        this.setupNewFolderModal();
    }

    setupEventListeners() {
        // Upload files button
        const uploadBtn = document.getElementById('upload-files-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleUploadClick());
        }

        // Create folder button
        const createFolderBtn = document.getElementById('create-folder-btn');
        if (createFolderBtn) {
            createFolderBtn.addEventListener('click', () => this.handleCreateFolderClick());
        }

        // Listen for project changes
        document.addEventListener('projectChanged', (event) => {
            this.currentProjectId = event.detail.projectId;
            this.currentPath = '';
            this.loadFiles();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'u') {
                event.preventDefault();
                this.handleUploadClick();
            }
            if (event.ctrlKey && event.shiftKey && event.key === 'N') {
                event.preventDefault();
                this.handleCreateFolderClick();
            }
        });
    }

    setupFileInput() {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (event) => {
                const files = Array.from(event.target.files);
                if (files.length > 0) {
                    this.uploadFiles(files);
                }
                // Clear the input
                event.target.value = '';
            });
        }
    }

    setupNewFolderModal() {
        const form = document.getElementById('new-folder-form');
        if (form) {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.createFolder();
            });
        }
    }

    handleUploadClick() {
        if (!this.currentProjectId) {
            notifications.warning('Please select a project first');
            return;
        }

        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.click();
        }
    }

    handleCreateFolderClick() {
        if (!this.currentProjectId) {
            notifications.warning('Please select a project first');
            return;
        }

        this.showNewFolderModal();
    }

    showNewFolderModal() {
        const modal = document.getElementById('new-folder-modal');
        const folderPathInput = document.getElementById('folder-path');
        const folderNameInput = document.getElementById('folder-name');

        if (modal && folderPathInput && folderNameInput) {
            folderPathInput.value = this.currentPath || '/';
            folderNameInput.value = '';
            folderNameInput.focus();
            modal.style.display = 'block';
        }
    }

    async loadFiles() {
        if (!this.currentProjectId) {
            this.renderEmptyState();
            return;
        }

        try {
            const response = await fetch(`/api/files/${this.currentProjectId}/browse?path=${encodeURIComponent(this.currentPath)}&showHidden=${this.showHidden}`);
            const data = await response.json();

            if (data.success) {
                if (data.directory) {
                    this.renderDirectory(data.directory);
                } else if (data.file) {
                    this.renderFile(data.file);
                }
            } else {
                notifications.error(data.message || 'Failed to load files');
                this.renderEmptyState();
            }
        } catch (error) {
            console.error('Error loading files:', error);
            notifications.error('Error loading files');
            this.renderEmptyState();
        }
    }

    renderDirectory(directory) {
        const fileList = document.getElementById('file-list');
        const noFiles = document.getElementById('no-files');

        if (!fileList) return;

        // Hide no files message
        if (noFiles) {
            noFiles.style.display = 'none';
        }

        // Update breadcrumb
        this.updateBreadcrumb(this.currentPath);

        // Clear existing files
        fileList.innerHTML = '';

        // Add parent directory if not at root
        if (this.currentPath) {
            const parentItem = this.createFileItem({
                name: '..',
                type: 'directory',
                path: this.getParentPath(this.currentPath),
                isParent: true
            });
            fileList.appendChild(parentItem);
        }

        // Add files and directories
        directory.files.forEach(file => {
            const fileItem = this.createFileItem(file);
            fileList.appendChild(fileItem);
        });

        // Show file list
        fileList.style.display = 'block';
    }

    renderFile(file) {
        // For now, just show file info - could be extended to show file content
        notifications.info(`File: ${file.name} (${this.formatFileSize(file.size)})`);
    }

    renderEmptyState() {
        const fileList = document.getElementById('file-list');
        const noFiles = document.getElementById('no-files');

        if (fileList) {
            fileList.style.display = 'none';
        }

        if (noFiles) {
            noFiles.style.display = 'block';
            noFiles.querySelector('.no-files-text').textContent = 'No files found';
        }
    }

    createFileItem(file) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.dataset.path = file.path;
        item.dataset.type = file.type;

        const icon = this.getFileIcon(file);
        const size = file.type === 'file' ? this.formatFileSize(file.size) : '';
        const modified = file.modified ? new Date(file.modified).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';
        const hiddenClass = file.isHidden ? 'hidden-file' : '';

        item.innerHTML = `
            <div class="file-info ${hiddenClass}">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${size}</span>
                <span class="file-date">${modified}</span>
            </div>
            <div class="file-actions">
                ${!file.isParent ? `<button class="btn btn-tiny file-menu-btn" title="Options">⋯</button>` : ''}
            </div>
        `;

        // Add click handler for file item
        const fileInfo = item.querySelector('.file-info');
        if (fileInfo) {
            fileInfo.addEventListener('click', (event) => {
                event.stopPropagation();
                if (file.type === 'directory') {
                    this.navigateToDirectory(file.path);
                }
                // Removed file click handler - no action on file click
            });
        }

        // Add menu button handler
        const menuBtn = item.querySelector('.file-menu-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                this.showFileMenu(event, file.path, file.type);
            });
        }

        // Add double-click handler for files
        if (file.type === 'file' && fileInfo) {
            fileInfo.addEventListener('dblclick', (event) => {
                event.stopPropagation();
                this.sendToTerminal(file.path);
            });
        }

        return item;
    }

    getFileIcon(file) {
        if (file.isParent) return '📁';
        if (file.type === 'directory') return '📁';
        
        // Remove emoji icons for better readability
        return '';
    }

    updateBreadcrumb(path) {
        const breadcrumb = document.getElementById('file-breadcrumb');
        if (!breadcrumb) return;

        breadcrumb.innerHTML = '';

        // Add root
        const rootItem = document.createElement('button');
        rootItem.className = 'breadcrumb-item';
        rootItem.textContent = 'Root';
        rootItem.dataset.path = '';
        rootItem.addEventListener('click', () => this.navigateToDirectory(''));
        breadcrumb.appendChild(rootItem);

        // Add path segments
        if (path) {
            const segments = path.split('/').filter(s => s);
            let currentPath = '';

            segments.forEach((segment, index) => {
                currentPath += (currentPath ? '/' : '') + segment;
                
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = ' / ';
                breadcrumb.appendChild(separator);

                const item = document.createElement('button');
                item.className = 'breadcrumb-item';
                item.textContent = segment;
                item.dataset.path = currentPath;
                
                if (index === segments.length - 1) {
                    item.classList.add('active');
                } else {
                    item.addEventListener('click', () => this.navigateToDirectory(currentPath));
                }
                
                breadcrumb.appendChild(item);
            });
        } else {
            rootItem.classList.add('active');
        }
    }

    navigateToDirectory(path) {
        this.currentPath = path;
        this.loadFiles();
    }

    async uploadFiles(files) {
        if (!this.currentProjectId) {
            notifications.warning('Please select a project first');
            return;
        }

        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file);
        });
        formData.append('targetPath', this.currentPath);

        try {
            const response = await fetch(`/api/files/${this.currentProjectId}/upload`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                notifications.success(`Successfully uploaded ${data.files.length} file(s)`);
                this.loadFiles(); // Refresh file list
            } else {
                notifications.error(data.message || 'Failed to upload files');
            }
        } catch (error) {
            console.error('Error uploading files:', error);
            notifications.error('Error uploading files');
        }
    }

    async createFolder() {
        const folderName = document.getElementById('folder-name').value.trim();
        if (!folderName) {
            notifications.warning('Please enter a folder name');
            return;
        }

        try {
            const response = await fetch(`/api/files/${this.currentProjectId}/mkdir`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: this.currentPath,
                    name: folderName
                })
            });

            const data = await response.json();

            if (data.success) {
                notifications.success(`Folder "${folderName}" created successfully`);
                this.closeNewFolderModal();
                this.loadFiles(); // Refresh file list
            } else {
                notifications.error(data.message || 'Failed to create folder');
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            notifications.error('Error creating folder');
        }
    }

    async deleteFile(filePath) {
        if (!confirm('Are you sure you want to delete this file/folder?')) {
            return;
        }

        try {
            const response = await fetch(`/api/files/${this.currentProjectId}/remove?path=${encodeURIComponent(filePath)}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                notifications.success(data.message);
                this.loadFiles(); // Refresh file list
            } else {
                notifications.error(data.message || 'Failed to delete file');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            notifications.error('Error deleting file');
        }
    }

    sendToTerminal(filePath) {
        const terminalManager = window.terminalManager;
        const socketClient = window.socket;
        
        if (!terminalManager || !socketClient) {
            notifications.warning('Terminal system not available');
            return;
        }
        
        const activeSession = terminalManager.getActiveSession();
        console.log('🔍 sendToTerminal debug:', {
            activeSession: activeSession,
            hasProjectId: activeSession && activeSession.projectId ? true : false,
            hasSessionName: activeSession && activeSession.name ? true : false,
            filePath: filePath
        });
        
        if (!activeSession) {
            notifications.warning('No active terminal session. Please select a terminal tab first.');
            return;
        }
        
        // Handle both session-based and project-based terminals
        let terminalIdentifier = null;
        if (activeSession.name && activeSession.name.startsWith('claude-web-')) {
            // Session-based terminal (new approach)
            terminalIdentifier = activeSession.name;
        } else if (activeSession.projectId) {
            // Project-based terminal (legacy approach)
            terminalIdentifier = activeSession.projectId;
        }
        
        if (!terminalIdentifier) {
            const errorMsg = activeSession.name ? 
                `Terminal session "${activeSession.name}" is not associated with a project.` :
                'Active terminal is not associated with a project.';
            notifications.warning(errorMsg);
            console.warn('🚨 sendToTerminal: No valid terminal identifier found', { activeSession });
            return;
        }
        
        // Construct the absolute path
        const absolutePath = this.constructAbsolutePath(filePath);
        
        if (!absolutePath) {
            notifications.warning('Failed to construct absolute file path');
            console.error('❌ Failed to construct absolute path:', { filePath, currentProjectId: this.currentProjectId });
            return;
        }
        
        // Send the absolute file path to the terminal via socket
        const success = socketClient.sendTerminalInput(terminalIdentifier, absolutePath);
        
        if (success) {
            notifications.info(`File path sent to terminal: ${absolutePath}`);
            console.log('✅ File path sent successfully:', { terminalIdentifier, absolutePath });
        } else {
            notifications.warning('Failed to send file path to terminal');
            console.error('❌ Failed to send file path:', { terminalIdentifier, absolutePath });
        }
    }

    /**
     * Construct absolute file path from relative path
     * @param {string} relativePath - Relative file path from server
     * @returns {string|null} - Absolute file path or null if construction fails
     */
    constructAbsolutePath(relativePath) {
        try {
            if (!this.currentProjectId) {
                console.warn('No current project ID available for path construction');
                return null;
            }
            
            // Get project information to construct absolute path
            const projectManager = window.projectManager;
            if (!projectManager) {
                console.warn('ProjectManager not available for path construction');
                return null;
            }
            
            const project = projectManager.getProject(this.currentProjectId);
            if (!project) {
                console.warn('Project not found for path construction:', this.currentProjectId);
                return null;
            }
            
            // The project.path should contain the absolute path to the project directory
            // e.g., /home/lanpangzi/projects/my-project
            const projectPath = project.path;
            if (!projectPath) {
                console.warn('Project path not available:', project);
                return null;
            }
            
            // Construct absolute path: projectPath + relativePath
            // Handle both cases: relativePath starting with / or not
            const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
            const absolutePath = projectPath.endsWith('/') ? 
                projectPath + cleanRelativePath : 
                projectPath + '/' + cleanRelativePath;
            
            console.log('📁 Constructed absolute path:', {
                projectId: this.currentProjectId,
                projectPath: projectPath,
                relativePath: relativePath,
                absolutePath: absolutePath
            });
            
            return absolutePath;
            
        } catch (error) {
            console.error('Error constructing absolute path:', error);
            return null;
        }
    }

    /**
     * Adjust menu position to prevent overflow outside viewport
     * @param {HTMLElement} menu - The menu element
     * @param {number} x - Initial x position
     * @param {number} y - Initial y position
     * @returns {object} Adjusted position {x, y}
     */
    adjustMenuPosition(menu, x, y) {
        // Force reflow to ensure menu dimensions are accurate
        menu.offsetHeight;
        
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const offset = 10; // Increased offset for better edge clearance
        
        let adjustedX = x;
        let adjustedY = y;
        
        // Check right boundary
        if (x + menuRect.width > viewportWidth) {
            adjustedX = viewportWidth - menuRect.width - offset;
        }
        
        // Check bottom boundary
        if (y + menuRect.height > viewportHeight) {
            adjustedY = viewportHeight - menuRect.height - offset;
        }
        
        // Ensure menu doesn't go off left edge
        if (adjustedX < offset) {
            adjustedX = offset;
        }
        
        // Ensure menu doesn't go off top edge
        if (adjustedY < offset) {
            adjustedY = offset;
        }
        
        return { x: adjustedX, y: adjustedY };
    }

    showFileMenu(event, filePath, fileType) {
        event.stopPropagation();
        
        const menu = document.getElementById('context-menu');
        const menuItems = document.getElementById('context-menu-items');
        
        if (!menu || !menuItems) return;
        
        // Clear existing menu items
        menuItems.innerHTML = '';
        
        if (fileType === 'directory') {
            // Directory menu items
            menuItems.innerHTML = `
                <div class="context-menu-item" data-action="upload">
                    <span class="menu-text">Upload Files</span>
                </div>
                <div class="context-menu-item" data-action="download-dir">
                    <span class="menu-text">Download Folder</span>
                </div>
                <div class="context-menu-item context-menu-separator"></div>
                <div class="context-menu-item context-menu-danger" data-action="delete">
                    <span class="menu-text">Delete</span>
                </div>
            `;
        } else {
            // File menu items
            menuItems.innerHTML = `
                <div class="context-menu-item" data-action="download">
                    <span class="menu-text">Download</span>
                </div>
                <div class="context-menu-item" data-action="preview">
                    <span class="menu-text">Preview</span>
                </div>
                <div class="context-menu-item context-menu-separator"></div>
                <div class="context-menu-item context-menu-danger" data-action="delete">
                    <span class="menu-text">Delete</span>
                </div>
            `;
        }
        
        // Add event listeners to menu items
        const menuItemElements = menuItems.querySelectorAll('.context-menu-item[data-action]');
        menuItemElements.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.getAttribute('data-action');
                menu.classList.remove('active');
                menu.style.display = 'none';
                
                
                switch (action) {
                    case 'upload':
                        this.uploadToDirectory(filePath);
                        break;
                    case 'download':
                        this.downloadFile(filePath);
                        break;
                    case 'download-dir':
                        this.downloadDirectory(filePath);
                        break;
                    case 'preview':
                        this.previewFile(filePath);
                        break;
                    case 'delete':
                        this.deleteFile(filePath);
                        break;
                }
            });
        });
        
        // Position and show menu with boundary checking
        // First, make menu visible to get its dimensions
        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        
        // Calculate adjusted position to prevent overflow
        const adjustedPosition = this.adjustMenuPosition(menu, event.pageX, event.pageY);
        
        // Apply the adjusted position
        menu.style.left = adjustedPosition.x + 'px';
        menu.style.top = adjustedPosition.y + 'px';
        menu.style.visibility = 'visible';
        menu.classList.add('active');
        
        // Hide menu when clicking outside
        const hideMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.remove('active');
                menu.style.display = 'none';
                document.removeEventListener('click', hideMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
        }, 0);
    }

    uploadToDirectory(dirPath) {
        this.currentPath = dirPath;
        this.handleUploadClick();
    }

    async downloadFile(filePath) {
        try {
            const response = await fetch(`/api/files/${this.currentProjectId}/download?path=${encodeURIComponent(filePath)}`);
            
            if (!response.ok) {
                throw new Error('Failed to download file');
            }
            
            // Get filename from response headers or path
            const filename = response.headers.get('content-disposition')
                ? response.headers.get('content-disposition').split('filename=')[1].replace(/"/g, '')
                : filePath.split('/').pop();
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            notifications.success(`File downloaded: ${filename}`);
        } catch (error) {
            console.error('Error downloading file:', error);
            notifications.error('Failed to download file');
        }
    }

    async downloadDirectory(dirPath) {
        try {
            const response = await fetch(`/api/files/${this.currentProjectId}/download-zip?path=${encodeURIComponent(dirPath)}`);
            
            if (!response.ok) {
                throw new Error('Failed to download directory');
            }
            
            const filename = response.headers.get('content-disposition')
                ? response.headers.get('content-disposition').split('filename=')[1].replace(/"/g, '')
                : `${dirPath.split('/').pop() || 'folder'}.zip`;
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            notifications.success(`Directory downloaded: ${filename}`);
        } catch (error) {
            console.error('Error downloading directory:', error);
            notifications.error('Failed to download directory');
        }
    }

    async previewFile(filePath) {
        if (!this.currentProjectId) {
            notifications.error('Please select a project first');
            return;
        }
        
        if (!filePath) {
            notifications.error('Invalid file path');
            return;
        }
        
        try {
            const apiUrl = `/api/files/${this.currentProjectId}/preview?path=${encodeURIComponent(filePath)}`;
            
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to preview file');
            }
            
            this.showPreviewModal(data.file);
        } catch (error) {
            
            // More detailed error messages
            if (error.message.includes('404')) {
                notifications.error('File not found');
            } else if (error.message.includes('403')) {
                notifications.error('Access denied to file');
            } else if (error.message.includes('413')) {
                notifications.error('File too large for preview (max 5MB)');
            } else if (error.message.includes('400') && error.message.includes('directory')) {
                notifications.error('Cannot preview directories');
            } else {
                notifications.error(`Failed to preview file: ${error.message}`);
            }
        }
    }

    showPreviewModal(fileData) {
        if (!fileData) {
            notifications.error('No file data available for preview');
            return;
        }
        
        // Create preview modal if it doesn't exist
        let modal = document.getElementById('file-preview-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'file-preview-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 id="preview-file-title">File Preview</h3>
                        <button class="btn btn-icon modal-close">
                            <span class="icon">✕</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="preview-content"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        const titleElement = modal.querySelector('#preview-file-title');
        const contentElement = modal.querySelector('#preview-content');
        
        if (!titleElement || !contentElement) {
            notifications.error('Modal structure error');
            return;
        }
        
        titleElement.textContent = `Preview: ${fileData.name}`;
        
        if (fileData.isImage) {
            contentElement.innerHTML = `<img src="data:${fileData.mimeType};base64,${fileData.content}" alt="${fileData.name}" style="max-width: 100%; height: auto;">`;
        } else if (fileData.isText) {
            contentElement.innerHTML = `<pre><code>${this.escapeHtml(fileData.content)}</code></pre>`;
        } else {
            contentElement.innerHTML = `<div class="file-info">
                <p><strong>Name:</strong> ${fileData.name}</p>
                <p><strong>Size:</strong> ${this.formatFileSize(fileData.size)}</p>
                <p><strong>Type:</strong> ${fileData.mimeType}</p>
                <p><strong>Modified:</strong> ${new Date(fileData.modified).toLocaleString()}</p>
                <p><em>Preview not available for this file type.</em></p>
            </div>`;
        }
        
        // Add event listeners for modal close
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 200);
            };
        }
        
        // Close modal when clicking backdrop
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 200);
            }
        };
        
        modal.style.display = 'block';
        
        // Add active class for proper animation
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    closeNewFolderModal() {
        const modal = document.getElementById('new-folder-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    getParentPath(path) {
        const segments = path.split('/').filter(s => s);
        return segments.slice(0, -1).join('/');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Global functions for modal handling
function closeNewFolderModal() {
    if (window.fileManager) {
        window.fileManager.closeNewFolderModal();
    }
}

// Initialize file manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.fileManager = new FileManager();
});