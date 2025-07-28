/**
 * File Manager - Absolute path file browser
 * Supports filesystem browsing starting from root (/)
 */

class FileManager {
    constructor() {
        this.currentPath = '/';
        this.showHidden = true;
        this.fileCache = new Map();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupFileInput();
    }

    setupEventListeners() {
        // Upload files button
        const uploadBtn = document.getElementById('upload-files-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleUploadClick());
        }

        // Create folder button (disabled for filesystem mode)
        const createFolderBtn = document.getElementById('create-folder-btn');
        if (createFolderBtn) {
            createFolderBtn.style.display = 'none'; // Hide create folder in filesystem mode
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
        this.loadFiles();
    }

    async loadFiles() {
        try {
            const apiUrl = `/api/filesystem/browse?path=${encodeURIComponent(this.currentPath)}&showHidden=${this.showHidden}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.success) {
                if (data.directory) {
                    this.renderDirectory(data.directory);
                } else if (data.file) {
                    this.renderFile(data.file);
                }
            } else {
                console.error(data.message || 'Failed to load files');
                this.renderEmptyState();
            }
        } catch (error) {
            console.error('Error loading files:', error);
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
        if (this.currentPath !== '/') {
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
        console.log(`File: ${file.name} (${this.formatFileSize(file.size)})`);
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
        const parentClass = file.isParent ? 'parent-directory' : '';
        
        // Use user-friendly name for parent directory with icon
        const displayName = file.isParent ? '↑ Back to parent' : file.name;

        item.innerHTML = `
            <div class="file-info ${hiddenClass} ${parentClass}">
                <span class="file-name">${displayName}</span>
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
        return '';
    }

    updateBreadcrumb(path) {
        const breadcrumb = document.getElementById('file-breadcrumb');
        if (!breadcrumb) return;

        breadcrumb.innerHTML = '';

        // Normalize path
        const normalizedPath = path === '/' ? '/' : path.replace(/\/$/, '');
        const segments = normalizedPath === '/' ? ['/'] : normalizedPath.split('/').filter(s => s);
        
        // Add root (/)
        const rootItem = document.createElement('button');
        rootItem.className = 'breadcrumb-item';
        rootItem.textContent = 'Root';
        rootItem.dataset.path = '/';
        rootItem.addEventListener('click', () => this.navigateToDirectory('/'));
        breadcrumb.appendChild(rootItem);
        
        if (segments.length > 1 || (segments.length === 1 && segments[0] !== '/')) {
            let currentPath = '';
            const pathSegments = segments[0] === '/' ? segments.slice(1) : segments;
            
            pathSegments.forEach((segment, index) => {
                currentPath += '/' + segment;
                
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = '/';
                breadcrumb.appendChild(separator);

                const item = document.createElement('button');
                item.className = 'breadcrumb-item';
                item.textContent = segment;
                item.dataset.path = currentPath;
                
                if (index === pathSegments.length - 1) {
                    item.classList.add('active');
                } else {
                    // Fix: Use the data-path attribute to avoid closure issues
                    item.addEventListener('click', (event) => {
                        const targetPath = event.target.dataset.path;
                        console.log('🔍 Breadcrumb click debug:', {
                            segment: segment,
                            targetPath: targetPath,
                            currentPath: this.currentPath
                        });
                        this.navigateToDirectory(targetPath);
                    });
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

    getParentPath(path) {
        if (path === '/' || !path) return '/';
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        return parentPath || '/';
    }

    async previewFile(filePath) {
        if (!filePath) {
            console.error('Invalid file path');
            return;
        }
        
        try {
            const apiUrl = `/api/filesystem/preview?path=${encodeURIComponent(filePath)}`;
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
            if (error.message.includes('404')) {
                console.error('File not found');
            } else if (error.message.includes('403')) {
                console.error('Access denied to file');
            } else if (error.message.includes('413')) {
                console.error('File too large for preview (max 5MB)');
            } else if (error.message.includes('400') && error.message.includes('directory')) {
                console.error('Cannot preview directories');
            } else {
                console.error(`Failed to preview file: ${error.message}`);
            }
        }
    }

    showPreviewModal(fileData) {
        if (!fileData) {
            console.error('No file data available for preview');
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
            console.error('Modal structure error');
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

    async downloadFile(filePath) {
        try {
            const apiUrl = `/api/filesystem/download?path=${encodeURIComponent(filePath)}`;
            const response = await fetch(apiUrl);
            
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
            
            console.log(`File downloaded: ${filename}`);
        } catch (error) {
            console.error('Error downloading file:', error);
            console.error('Failed to download file');
        }
    }

    async sendToTerminal(filePath) {
        const terminalManager = window.terminalManager;
        
        if (!terminalManager) {
            console.warn('Terminal system not available');
            return;
        }
        
        const activeSession = terminalManager.getActiveSession();
        console.log('🔍 sendToTerminal debug:', {
            activeSession: activeSession,
            hasSessionName: activeSession && activeSession.name ? true : false,
            filePath: filePath
        });
        
        if (!activeSession || !activeSession.name) {
            console.warn('No active terminal session. Please select a terminal tab first.');
            return;
        }
        
        // Only work with session-based terminals
        if (!activeSession.name.startsWith('claude-web-')) {
            console.warn('Invalid terminal session format');
            console.warn('🚨 sendToTerminal: Invalid session name format', { activeSession });
            return;
        }
        
        try {
            // Send the absolute file path to the terminal
            console.log('📤 Sending file path to terminal:', { sessionName: activeSession.name, filePath });
            
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
                console.log(`File path sent to terminal: ${filePath}`);
                console.log('✅ File path sent successfully:', { sessionName: activeSession.name, filePath });
            } else {
                throw new Error(result.details || result.error || 'Failed to send file path');
            }
            
        } catch (error) {
            console.error('❌ Failed to send file path to terminal:', error);
            console.error(`Failed to send file path to terminal: ${error.message}`);
        }
    }

    showFileMenu(event, filePath, fileType) {
        event.stopPropagation();
        
        const menu = document.getElementById('context-menu');
        const menuItems = document.getElementById('context-menu-items');
        
        if (!menu || !menuItems) return;
        
        // Clear existing menu items
        menuItems.innerHTML = '';
        
        if (fileType === 'directory') {
            // Directory menu items (simplified for filesystem mode)
            menuItems.innerHTML = `
                <div class="context-menu-item" data-action="preview">
                    <span class="menu-text">Open Directory</span>
                </div>
                <div class="context-menu-item" data-action="download-dir">
                    <span class="menu-text">Download Folder</span>
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
                <div class="context-menu-item" data-action="send-to-terminal">
                    <span class="menu-text">Send to Terminal</span>
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
                    case 'download':
                        this.downloadFile(filePath);
                        break;
                    case 'download-dir':
                        console.warn('Directory download not implemented for filesystem mode');
                        break;
                    case 'preview':
                        if (fileType === 'directory') {
                            this.navigateToDirectory(filePath);
                        } else {
                            this.previewFile(filePath);
                        }
                        break;
                    case 'send-to-terminal':
                        this.sendToTerminal(filePath);
                        break;
                }
            });
        });
        
        // Position and show menu
        menu.style.display = 'block';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
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

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

    handleUploadClick() {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.click();
        }
    }

    async uploadFiles(files) {
        try {
            console.log('🚀 Starting upload to path:', this.currentPath);
            
            const formData = new FormData();
            
            // Add files to FormData
            files.forEach(file => {
                formData.append('files', file);
            });
            
            // Add target path as URL parameter
            const uploadUrl = `/api/filesystem/upload?targetPath=${encodeURIComponent(this.currentPath)}`;
            
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                const successCount = data.files.filter(f => f.success).length;
                console.log(`✅ Successfully uploaded ${successCount} file(s) to ${this.currentPath}`);
                
                // Show user notification
                this.showUploadNotification(`Successfully uploaded ${successCount} file(s) to current directory`, 'success');
                
                this.loadFiles(); // Refresh file list
            } else {
                console.error('❌ Upload failed:', data.message || 'Failed to upload files');
                this.showUploadNotification(data.message || 'Failed to upload files', 'error');
            }
            
        } catch (error) {
            console.error('❌ Error uploading files:', error);
            this.showUploadNotification('Error uploading files', 'error');
        }
    }

    showUploadNotification(message, type = 'info') {
        // Use the existing notification system instead of creating custom notifications
        if (window.notifications) {
            const options = {
                title: 'File Upload',
                duration: 5000
            };
            
            switch (type) {
                case 'success':
                    window.notifications.success(message, options);
                    break;
                case 'error':
                    window.notifications.error(message, options);
                    break;
                case 'warning':
                    window.notifications.warning(message, options);
                    break;
                default:
                    window.notifications.info(message, options);
                    break;
            }
        } else {
            // Fallback to console if notification system is not available
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }
}

// Initialize file manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.fileManager = new FileManager();
    // Load root directory by default
    window.fileManager.loadFiles();
});