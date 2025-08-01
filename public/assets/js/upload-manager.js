/**
 * Upload Manager - Handles file uploads and deletions with drag-and-drop functionality
 * Integrates with FileTreeManager for seamless file management
 */

class UploadManager {
    constructor() {
        this.currentUploadTarget = null;
        this.isUploading = false;
        this.uploadQueue = [];
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.currentDeleteTarget = null;
        this.isDeleting = false;
        
        this.init();
    }

    init() {
        this.setupDragAndDrop();
        this.setupUploadModal();
        this.setupDeleteModal();
        this.setupProgressIndicator();
    }

    /**
     * Setup drag and drop functionality on file tree
     */
    setupDragAndDrop() {
        const treeContainer = document.getElementById('file-tree-container');
        if (!treeContainer) return;

        // Prevent default drag behaviors on the window
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            window.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Handle drag and drop on file tree container
        treeContainer.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        treeContainer.addEventListener('dragover', (e) => this.handleDragOver(e));
        treeContainer.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        treeContainer.addEventListener('drop', (e) => this.handleDrop(e));

        // Add upload button to directory headers
        this.addUploadButtons();
    }

    /**
     * Handle drag enter event
     */
    handleDragEnter(e) {
        e.preventDefault();
        const targetElement = this.findDirectoryTarget(e.target);
        if (targetElement) {
            targetElement.classList.add('drag-over');
            this.showDropIndicator(targetElement);
        }
    }

    /**
     * Handle drag over event
     */
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        
        const targetElement = this.findDirectoryTarget(e.target);
        if (targetElement) {
            targetElement.classList.add('drag-over');
            this.showDropIndicator(targetElement);
        }
    }

    /**
     * Handle drag leave event
     */
    handleDragLeave(e) {
        e.preventDefault();
        const targetElement = this.findDirectoryTarget(e.target);
        if (targetElement && !targetElement.contains(e.relatedTarget)) {
            targetElement.classList.remove('drag-over');
            this.hideDropIndicator(targetElement);
        }
    }

    /**
     * Handle drop event
     */
    async handleDrop(e) {
        e.preventDefault();
        
        const targetElement = this.findDirectoryTarget(e.target);
        if (!targetElement) return;

        targetElement.classList.remove('drag-over');
        this.hideDropIndicator(targetElement);

        const targetPath = targetElement.dataset.path;
        const files = Array.from(e.dataTransfer.files);

        if (files.length > 0 && targetPath) {
            await this.uploadFiles(files, targetPath);
        }
    }

    /**
     * Find the directory target for drag and drop
     */
    findDirectoryTarget(element) {
        while (element && element !== document.body) {
            if (element.classList && 
                element.classList.contains('file-tree-node') && 
                element.dataset.type === 'directory') {
                return element;
            }
            element = element.parentNode;
        }
        return null;
    }

    /**
     * Show drop indicator for directory
     */
    showDropIndicator(element) {
        const header = element.querySelector('.tree-node-header');
        if (header && !header.querySelector('.drop-indicator')) {
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            indicator.innerHTML = '<img src="/assets/icons/upload.svg" alt="Upload" class="icon" style="width: 14px; height: 14px; margin-right: 4px;"> Drop files here';
            header.appendChild(indicator);
        }
    }

    /**
     * Hide drop indicator for directory
     */
    hideDropIndicator(element) {
        const indicator = element.querySelector('.drop-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Add upload buttons to directory headers
     */
    addUploadButtons() {
        // Use MutationObserver to add upload buttons to new directory nodes
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if the added node contains directory nodes
                            const hasDirectories = node.matches && node.matches('.file-tree-node[data-type="directory"]') ||
                                                 node.querySelector && node.querySelector('.file-tree-node[data-type="directory"]');
                            if (hasDirectories) {
                                shouldUpdate = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldUpdate) {
                // Small delay to ensure DOM is fully updated
                setTimeout(() => {
                    this.addUploadButtonsToNode(document.getElementById('file-tree-container'));
                }, 50);
            }
        });

        const treeContainer = document.getElementById('file-tree-container');
        if (treeContainer) {
            observer.observe(treeContainer, { 
                childList: true, 
                subtree: true,
                attributes: false,
                characterData: false
            });
            
            // Add buttons to existing nodes
            this.addUploadButtonsToNode(treeContainer);
            
            // Also listen for custom events from FileTreeManager
            document.addEventListener('fileTreeUpdated', () => {
                setTimeout(() => {
                    this.addUploadButtonsToNode(treeContainer);
                }, 100);
            });
        }
    }

    /**
     * Add upload and delete buttons to a specific node and its children
     */
    addUploadButtonsToNode(container) {
        // Add upload buttons to directory nodes
        const directoryNodes = container.querySelectorAll('.file-tree-node[data-type="directory"]');
        directoryNodes.forEach(node => {
            const header = node.querySelector('.tree-node-header');
            if (header && !header.querySelector('.upload-btn')) {
                const uploadBtn = document.createElement('button');
                uploadBtn.className = 'upload-btn';
                uploadBtn.innerHTML = '<img src="/assets/icons/upload.svg" alt="Upload" class="icon" style="width: 12px; height: 12px;">';
                uploadBtn.title = 'Upload files to this directory';
                uploadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showUploadModal(node.dataset.path);
                });
                header.appendChild(uploadBtn);
            }
        });
        
        // Add delete buttons to both directory AND file nodes
        const allNodes = container.querySelectorAll('.file-tree-node');
        allNodes.forEach(node => {
            const header = node.querySelector('.tree-node-header');
            if (header && !header.querySelector('.delete-btn')) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '<img src="/assets/icons/trash.svg" alt="Delete" class="icon" style="width: 12px; height: 12px;">';
                deleteBtn.title = `Delete this ${node.dataset.type}`;
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showDeleteModal(node.dataset.path, node.dataset.type);
                });
                header.appendChild(deleteBtn);
            }
        });
    }

    /**
     * Setup upload modal
     */
    setupUploadModal() {
        // Create upload modal if it doesn't exist
        if (!document.getElementById('upload-modal')) {
            const modal = document.createElement('div');
            modal.id = 'upload-modal';
            modal.className = 'upload-modal';
            modal.innerHTML = `
                <div class="upload-modal-content">
                    <div class="upload-modal-header">
                        <h3>Upload Files</h3>
                        <button class="close-btn" onclick="window.uploadManager.hideUploadModal()">&times;</button>
                    </div>
                    <div class="upload-modal-body">
                        <div class="upload-target-info">
                            <strong>Target Directory:</strong>
                            <span id="upload-target-path"></span>
                        </div>
                        <div class="upload-drop-zone" id="upload-drop-zone">
                            <div class="drop-zone-content">
                                <div class="drop-zone-icon">
                                    <img src="/assets/icons/folder.svg" alt="Folder" class="icon" style="width: 48px; height: 48px; opacity: 0.6;">
                                </div>
                                <div class="drop-zone-text">
                                    <p>Drag and drop files here</p>
                                    <p>or</p>
                                    <button class="select-files-btn" id="select-files-btn">Select Files</button>
                                </div>
                                <div class="file-size-limit">Maximum file size: 10MB</div>
                            </div>
                            <input type="file" id="file-input" multiple style="display: none;">
                        </div>
                        <div class="selected-files" id="selected-files"></div>
                    </div>
                    <div class="upload-modal-footer">
                        <button class="btn btn-secondary" onclick="window.uploadManager.hideUploadModal()">Cancel</button>
                        <button class="btn btn-primary" id="upload-btn" onclick="window.uploadManager.startUpload()">Upload</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Setup modal event listeners
            this.setupModalEventListeners();
        }
    }

    /**
     * Setup event listeners for upload modal
     */
    setupModalEventListeners() {
        const fileInput = document.getElementById('file-input');
        const selectFilesBtn = document.getElementById('select-files-btn');
        const dropZone = document.getElementById('upload-drop-zone');

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(Array.from(e.target.files));
        });

        // Select files button
        selectFilesBtn.addEventListener('click', () => {
            fileInput.click();
        });

        // Drop zone drag and drop
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-active');
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('drag-active');
            }
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-active');
            this.handleFileSelection(Array.from(e.dataTransfer.files));
        });
    }

    /**
     * Show upload modal for specific directory
     */
    showUploadModal(targetPath) {
        this.currentUploadTarget = targetPath;
        
        const modal = document.getElementById('upload-modal');
        const targetPathElement = document.getElementById('upload-target-path');
        
        if (modal && targetPathElement) {
            targetPathElement.textContent = targetPath;
            modal.style.display = 'block';
            
            // Clear previous selections
            this.clearSelectedFiles();
        }
    }

    /**
     * Hide upload modal
     */
    hideUploadModal() {
        const modal = document.getElementById('upload-modal');
        if (modal) {
            modal.style.display = 'none';
            this.currentUploadTarget = null;
            this.uploadQueue = [];
            this.clearSelectedFiles();
        }
    }

    /**
     * Handle file selection from input or drop
     */
    handleFileSelection(files) {
        this.uploadQueue = [];
        const validFiles = [];
        const errors = [];

        files.forEach(file => {
            // Validate file size
            if (file.size > this.maxFileSize) {
                errors.push(`${file.name}: File size exceeds 10MB limit`);
                return;
            }

            validFiles.push(file);
            this.uploadQueue.push(file);
        });

        // Show selected files
        this.displaySelectedFiles(validFiles, errors);

        // Enable/disable upload button
        const uploadBtn = document.getElementById('upload-btn');
        if (uploadBtn) {
            uploadBtn.disabled = validFiles.length === 0;
        }
    }

    /**
     * Display selected files in modal
     */
    displaySelectedFiles(files, errors) {
        const container = document.getElementById('selected-files');
        if (!container) return;

        container.innerHTML = '';

        if (files.length > 0) {
            const filesHeader = document.createElement('h4');
            filesHeader.textContent = `Selected Files (${files.length})`;
            container.appendChild(filesHeader);

            const filesList = document.createElement('div');
            filesList.className = 'files-list';

            files.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.innerHTML = `
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                    </div>
                    <button class="remove-file-btn" onclick="window.uploadManager.removeFile(${index})">&times;</button>
                `;
                filesList.appendChild(fileItem);
            });

            container.appendChild(filesList);
        }

        // Show errors if any
        if (errors.length > 0) {
            const errorsHeader = document.createElement('h4');
            errorsHeader.textContent = 'Errors';
            errorsHeader.style.color = '#dc3545';
            container.appendChild(errorsHeader);

            const errorsList = document.createElement('div');
            errorsList.className = 'errors-list';
            errors.forEach(error => {
                const errorItem = document.createElement('div');
                errorItem.className = 'error-item';
                errorItem.textContent = error;
                errorsList.appendChild(errorItem);
            });
            container.appendChild(errorsList);
        }
    }

    /**
     * Remove file from upload queue
     */
    removeFile(index) {
        this.uploadQueue.splice(index, 1);
        this.handleFileSelection(this.uploadQueue);
    }

    /**
     * Clear selected files
     */
    clearSelectedFiles() {
        const container = document.getElementById('selected-files');
        const fileInput = document.getElementById('file-input');
        
        if (container) container.innerHTML = '';
        if (fileInput) fileInput.value = '';
        
        this.uploadQueue = [];
    }

    /**
     * Start upload process
     */
    async startUpload() {
        if (!this.currentUploadTarget || this.uploadQueue.length === 0) return;

        await this.uploadFiles(this.uploadQueue, this.currentUploadTarget);
        this.hideUploadModal();
    }

    /**
     * Upload files to target directory
     */
    async uploadFiles(files, targetPath) {
        if (this.isUploading) return;
        
        this.isUploading = true;
        this.showProgressIndicator();

        try {
            const formData = new FormData();
            formData.append('targetPath', targetPath);

            files.forEach(file => {
                formData.append('files', file);
            });

            const response = await fetch('/api/filesystem/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('success', result.message);
                
                // Refresh file tree to show uploaded files
                if (window.fileTreeManager) {
                    await window.fileTreeManager.refreshFullTree(false);
                }
            } else {
                this.showNotification('error', result.message || 'Upload failed');
                
                // Show detailed errors if available
                if (result.errors && result.errors.length > 0) {
                    result.errors.forEach(error => {
                        this.showNotification('error', `${error.filename}: ${error.error}`);
                    });
                }
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('error', 'Upload failed: ' + error.message);
        } finally {
            this.isUploading = false;
            this.hideProgressIndicator();
        }
    }

    /**
     * Setup delete confirmation modal
     */
    setupDeleteModal() {
        // Create delete modal if it doesn't exist
        if (!document.getElementById('delete-modal')) {
            const modal = document.createElement('div');
            modal.id = 'delete-modal';
            modal.className = 'upload-modal'; // Reuse upload modal styles
            modal.innerHTML = `
                <div class="upload-modal-content">
                    <div class="upload-modal-header">
                        <h3>Delete Confirmation</h3>
                        <button class="close-btn" onclick="window.uploadManager.hideDeleteModal()">&times;</button>
                    </div>
                    <div class="upload-modal-body">
                        <div class="delete-warning-info">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                                <img src="/assets/icons/trash.svg" alt="Delete" class="icon" style="width: 24px; height: 24px; color: var(--accent-danger);">
                                <div>
                                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                                        Are you sure you want to delete this <span id="delete-item-type">item</span>?
                                    </div>
                                    <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                                        This action cannot be undone.
                                    </div>
                                </div>
                            </div>
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                                <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 4px;" id="delete-item-name"></div>
                                <div style="font-size: var(--font-size-xs); color: var(--text-secondary); font-family: var(--font-mono);" id="delete-item-path"></div>
                            </div>
                        </div>
                    </div>
                    <div class="upload-modal-footer">
                        <button class="btn btn-secondary" onclick="window.uploadManager.hideDeleteModal()">Cancel</button>
                        <button class="btn btn-danger" id="confirm-delete-btn" onclick="window.uploadManager.confirmDelete()">Delete</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    }

    /**
     * Show delete confirmation modal for specific file/directory
     */
    showDeleteModal(itemPath, itemType) {
        this.currentDeleteTarget = {
            path: itemPath,
            type: itemType
        };
        
        const modal = document.getElementById('delete-modal');
        const itemTypeElement = document.getElementById('delete-item-type');
        const itemNameElement = document.getElementById('delete-item-name');
        const itemPathElement = document.getElementById('delete-item-path');
        
        if (modal && itemTypeElement && itemNameElement && itemPathElement) {
            const itemName = itemPath.split('/').pop() || 'Unknown';
            
            itemTypeElement.textContent = itemType === 'directory' ? 'folder' : 'file';
            itemNameElement.textContent = itemName;
            itemPathElement.textContent = itemPath;
            
            modal.style.display = 'flex';
        }
    }

    /**
     * Hide delete confirmation modal
     */
    hideDeleteModal() {
        const modal = document.getElementById('delete-modal');
        if (modal) {
            modal.style.display = 'none';
            this.currentDeleteTarget = null;
        }
    }

    /**
     * Confirm deletion and execute
     */
    async confirmDelete() {
        if (!this.currentDeleteTarget) return;

        await this.deleteItem(this.currentDeleteTarget.path, this.currentDeleteTarget.type);
        this.hideDeleteModal();
    }

    /**
     * Delete file or directory
     */
    async deleteItem(itemPath, itemType) {
        if (this.isDeleting) return;
        
        this.isDeleting = true;
        this.showProgressIndicator('Deleting...');

        try {
            const response = await fetch('/api/filesystem/delete', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: itemPath,
                    type: itemType
                })
            });

            const result = await response.json();

            if (result.success) {
                // Show center notification instead of corner notification
                await this.showDeleteSuccessNotification(result.deleted.name, result.deleted.type);
                
                // Refresh file tree to show changes
                if (window.fileTreeManager) {
                    await window.fileTreeManager.refreshFullTree(false);
                }
            } else {
                this.showNotification('error', result.message || 'Delete failed');
            }

        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('error', 'Delete failed: ' + error.message);
        } finally {
            this.isDeleting = false;
            this.hideProgressIndicator();
        }
    }

    /**
     * Show delete success notification in center of screen (matching file tree style)
     */
    async showDeleteSuccessNotification(itemName, itemType) {
        // Remove existing notification if any
        const existingNotification = document.getElementById('delete-success-notification');
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
            console.warn('Failed to get theme for delete notification:', error.message);
        }
        const isDark = currentTheme === 'dark';

        // Load success icon
        const loadSuccessIcon = async () => {
            try {
                const response = await fetch('/assets/icons/check-circle.svg');
                const svgText = await response.text();
                const iconColor = isDark ? '#48cc6c' : '#22c55e';
                
                return svgText
                    .replace(/width="24"/, 'width="32"')
                    .replace(/height="24"/, 'height="32"')
                    .replace(/currentColor/g, iconColor)
                    .replace(/stroke="[^"]*"/g, `stroke="${iconColor}"`);
            } catch (error) {
                const fallbackColor = isDark ? '#48cc6c' : '#22c55e';
                return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="${fallbackColor}" stroke-width="2"/><path d="m9 12 2 2 4-4" stroke="${fallbackColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }
        };

        // Create notification element
        const notification = document.createElement('div');
        notification.id = 'delete-success-notification';
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
        const iconSvg = await loadSuccessIcon();
        
        // Theme-based colors (matching file tree notification style)
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

        const typeText = itemType === 'directory' ? 'Folder' : 'File';
        
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
                        Delete Successful
                    </div>
                    <div style="opacity: 0.8; font-size: 14px; font-weight: 400; color: ${colors.textSecondary};">
                        ${typeText} "${itemName}" has been deleted successfully
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
        
        // Auto remove after 1.5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 1500);
        
        console.log(`🗑️ Delete success notification shown: ${typeText} "${itemName}" deleted (theme: ${currentTheme})`);
    }

    /**
     * Setup progress indicator
     */
    setupProgressIndicator() {
        if (!document.getElementById('upload-progress')) {
            const progress = document.createElement('div');
            progress.id = 'upload-progress';
            progress.className = 'upload-progress';
            progress.innerHTML = `
                <div class="progress-content">
                    <div class="progress-spinner"></div>
                    <div class="progress-text" id="progress-text">Uploading files...</div>
                </div>
            `;
            document.body.appendChild(progress);
        }
    }

    /**
     * Show progress indicator
     */
    showProgressIndicator(text = 'Uploading files...') {
        const progress = document.getElementById('upload-progress');
        const progressText = document.getElementById('progress-text');
        if (progress) {
            if (progressText) {
                progressText.textContent = text;
            }
            progress.style.display = 'flex';
        }
    }

    /**
     * Hide progress indicator
     */
    hideProgressIndicator() {
        const progress = document.getElementById('upload-progress');
        if (progress) {
            progress.style.display = 'none';
        }
    }

    /**
     * Show notification to user
     */
    showNotification(type, message) {
        // Create notification container if it doesn't exist
        let container = document.getElementById('notifications-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications-container';
            container.className = 'notifications-container';
            document.body.appendChild(container);
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;

        container.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize upload manager when DOM is loaded
function initializeUploadManager() {
    window.uploadManager = new UploadManager();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUploadManager);
} else {
    // DOM already loaded
    initializeUploadManager();
}