/**
 * Image Manager - Handles image upload, display, and interaction
 */
class ImageManager {
    constructor() {
        this.currentProjectId = null;
        this.images = [];
        this.socket = null;
        this.initializeElements();
        this.attachEventListeners();
    }

    initializeElements() {
        this.uploadBtn = document.getElementById('upload-image-btn');
        this.fileInput = document.getElementById('image-file-input');
        this.imagesContainer = document.getElementById('images-container');
        this.noImagesDiv = document.getElementById('no-images');
        this.imagesGrid = document.getElementById('images-grid');
    }

    attachEventListeners() {
        // Upload button click
        if (this.uploadBtn) {
            this.uploadBtn.addEventListener('click', () => {
                if (this.currentProjectId) {
                    this.fileInput.click();
                } else {
                    this.showNotification('Please select a project first', 'warning');
                }
            });
        }

        // File input change
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.uploadImage(file);
                }
            });
        }
    }

    setSocket(socket) {
        this.socket = socket;
    }

    setCurrentProject(projectId) {
        this.currentProjectId = projectId;
        if (projectId) {
            this.loadImages();
        } else {
            this.clearImages();
        }
    }

    async loadImages() {
        if (!this.currentProjectId) return;

        try {
            this.showLoading();
            
            const response = await fetch(`/api/images/list/${this.currentProjectId}`, {
                credentials: 'include'
            });

            const result = await response.json();
            
            if (result.success) {
                this.images = result.data;
                this.renderImages();
            } else {
                this.showNotification(`Failed to load images: ${result.message}`, 'error');
                this.clearImages();
            }
        } catch (error) {
            console.error('Error loading images:', error);
            this.showNotification('Failed to load images', 'error');
            this.clearImages();
        }
    }

    async uploadImage(file) {
        if (!this.currentProjectId) {
            this.showNotification('No project selected', 'warning');
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select an image file', 'warning');
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            this.showNotification('Image file must be less than 10MB', 'warning');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('projectId', this.currentProjectId);

            this.showLoading();

            const response = await fetch('/api/images/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`Image "${result.data.filename}" uploaded successfully`, 'success');
                // Refresh images list
                await this.loadImages();
                // Clear file input
                this.fileInput.value = '';
            } else {
                this.showNotification(`Upload failed: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error uploading image:', error);
            this.showNotification('Failed to upload image', 'error');
        }
    }

    async deleteImage(filename) {
        if (!this.currentProjectId) return;

        if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/images/${this.currentProjectId}/${filename}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`Image "${filename}" deleted successfully`, 'success');
                // Refresh images list
                await this.loadImages();
            } else {
                this.showNotification(`Delete failed: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting image:', error);
            this.showNotification('Failed to delete image', 'error');
        }
    }

    renderImages() {
        if (!this.imagesGrid || !this.noImagesDiv) return;

        // Hide loading indicator
        const loadingDiv = this.imagesContainer.querySelector('.images-loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }

        if (this.images.length === 0) {
            this.noImagesDiv.style.display = 'flex';
            this.imagesGrid.style.display = 'none';
        } else {
            this.noImagesDiv.style.display = 'none';
            this.imagesGrid.style.display = 'grid';
            
            this.imagesGrid.innerHTML = this.images.map(image => this.createImageElement(image)).join('');
            
            // Attach event listeners to new elements
            this.attachImageEventListeners();
        }
    }

    createImageElement(image) {
        const imageUrl = `/api/images/serve/${this.currentProjectId}/${image.filename}`;
        const shortName = image.filename.length > 12 ? image.filename.substring(0, 12) + '...' : image.filename;
        
        return `
            <div class="image-item" data-filename="${image.filename}" data-path="${image.relativePath}">
                <img src="${imageUrl}" alt="${image.filename}" loading="lazy">
                <div class="image-name">${shortName}</div>
                <button class="delete-btn" data-filename="${image.filename}" title="Delete image">×</button>
            </div>
        `;
    }

    attachImageEventListeners() {
        // Double-click to send path to terminal
        this.imagesGrid.querySelectorAll('.image-item').forEach(item => {
            item.addEventListener('dblclick', (e) => {
                e.preventDefault();
                const relativePath = item.dataset.path;
                this.sendPathToTerminal(relativePath);
            });
        });

        // Delete button click
        this.imagesGrid.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const filename = btn.dataset.filename;
                this.deleteImage(filename);
            });
        });
    }

    async sendPathToTerminal(relativePath) {
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
        
        if (!this.currentProjectId) {
            this.showNotification('No project selected', 'warning');
            return;
        }
        
        // Construct absolute path from relative path
        const absolutePath = this.constructAbsolutePath(relativePath);
        if (!absolutePath) {
            this.showNotification('Failed to construct absolute path', 'warning');
            return;
        }
        
        try {
            // Send the absolute file path to the terminal via new API
            const response = await fetch('/api/terminal/send-input', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionName: activeSession.name,
                    text: absolutePath
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showNotification(`Path sent to terminal: ${absolutePath}`, 'info');
            } else {
                throw new Error(result.details || result.error || 'Failed to send path');
            }
            
        } catch (error) {
            console.error('❌ Failed to send path to terminal:', error);
            this.showNotification(`Failed to send path to terminal: ${error.message}`, 'error');
        }
    }
    
    constructAbsolutePath(relativePath) {
        try {
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
            const projectPath = project.path;
            if (!projectPath) {
                console.warn('Project path not available for path construction');
                return null;
            }
            
            // Combine project path with relative path
            // Remove leading slash from relative path if it exists
            const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
            const absolutePath = `${projectPath}/${cleanRelativePath}`;
            
            return absolutePath;
        } catch (error) {
            console.error('Error constructing absolute path:', error);
            return null;
        }
    }

    clearImages() {
        this.images = [];
        if (this.noImagesDiv) {
            this.noImagesDiv.style.display = 'flex';
        }
        if (this.imagesGrid) {
            this.imagesGrid.style.display = 'none';
            this.imagesGrid.innerHTML = '';
        }
    }

    showLoading() {
        if (this.noImagesDiv) {
            this.noImagesDiv.style.display = 'none';
        }
        if (this.imagesGrid) {
            this.imagesGrid.style.display = 'none';
            this.imagesGrid.innerHTML = '';
        }
        
        // Create or show loading indicator
        let loadingDiv = this.imagesContainer.querySelector('.images-loading');
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.className = 'images-loading';
            loadingDiv.innerHTML = `
                <div class="loading-spinner small"></div>
                <span>Loading images...</span>
            `;
            this.imagesContainer.appendChild(loadingDiv);
        }
        loadingDiv.style.display = 'flex';
    }

    showNotification(message, type = 'info') {
        // Only log to console, no UI notifications
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Create global instance
window.ImageManager = new ImageManager();