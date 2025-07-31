/**
 * Upload Manager - Handles file uploads with drag-and-drop functionality
 * Integrates with FileTreeManager for seamless file management
 */

class UploadManager {
    constructor() {
        this.currentUploadTarget = null;
        this.isUploading = false;
        this.uploadQueue = [];
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        
        this.init();
    }

    init() {
        this.setupDragAndDrop();
        this.setupUploadModal();
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
     * Add upload buttons to a specific node and its children
     */
    addUploadButtonsToNode(container) {
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
                    await window.fileTreeManager.refreshFullTree();
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
                    <div class="progress-text">Uploading files...</div>
                </div>
            `;
            document.body.appendChild(progress);
        }
    }

    /**
     * Show progress indicator
     */
    showProgressIndicator() {
        const progress = document.getElementById('upload-progress');
        if (progress) {
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