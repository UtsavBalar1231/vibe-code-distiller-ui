// ===== PROJECT MANAGER =====

class ProjectManager extends EventEmitter {
    constructor() {
        super();
        this.projects = new Map();
        this.currentProject = null;
        this.projectListElement = DOM.get('project-list');
        this.searchInput = DOM.get('project-search');
        
        this.setupEventHandlers();
        this.loadProjects();
    }
    
    setupEventHandlers() {
        // New project button
        DOM.on('new-project-btn', 'click', () => {
            this.showCreateProjectModal();
        });
        
        // Welcome screen buttons
        DOM.on('welcome-new-project', 'click', () => {
            this.showCreateProjectModal();
        });
        
        DOM.on('welcome-import-project', 'click', () => {
            this.showImportProjectModal();
        });
        
        // Project search
        if (this.searchInput) {
            DOM.on(this.searchInput, 'input', Utils.debounce(() => {
                this.filterProjects(this.searchInput.value);
            }, 300));
        }
        
        // Project form submission
        DOM.on('project-form', 'submit', (e) => {
            e.preventDefault();
            this.handleProjectFormSubmit(e.target);
        });
        
        // Socket events
        socket.onProjectStatus(this.handleProjectStatus.bind(this));
        socket.onConnected(() => {
            this.loadProjects();
        });
    }
    
    async loadProjects() {
        try {
            const response = await HTTP.get('/api/projects');
            
            if (response.success) {
                this.projects.clear();
                response.projects.forEach(project => {
                    this.projects.set(project.id, project);
                });
                
                this.renderProjectList();
                this.emit('projects_loaded', response.projects);
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            notifications.error('Failed to load projects: ' + error.message);
        }
    }
    
    renderProjectList() {
        if (!this.projectListElement) return;
        
        // Clear existing projects
        this.projectListElement.innerHTML = '';
        
        if (this.projects.size === 0) {
            const placeholder = DOM.create('div', {
                className: 'loading-placeholder',
                html: '<span>No projects found. Create your first project!</span>'
            });
            this.projectListElement.appendChild(placeholder);
            return;
        }
        
        // Sort projects by last modified
        const sortedProjects = Array.from(this.projects.values())
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        sortedProjects.forEach(project => {
            const projectElement = this.createProjectElement(project);
            this.projectListElement.appendChild(projectElement);
        });
    }
    
    createProjectElement(project) {
        const projectItem = DOM.create('div', {
            className: 'project-item',
            attributes: { 'data-project-id': project.id }
        });
        
        const projectContent = DOM.create('div', {
            className: 'project-content'
        });
        
        const projectName = DOM.create('div', {
            className: 'project-name',
            text: project.name
        });
        
        const projectMeta = DOM.create('div', {
            className: 'project-meta'
        });
        
        const projectType = DOM.create('span', {
            className: 'project-type',
            text: project.type
        });
        
        const projectLanguage = DOM.create('span', {
            className: 'project-language',
            text: project.language
        });
        
        const projectDate = DOM.create('span', {
            className: 'project-date',
            text: Utils.formatDate(project.updatedAt)
        });
        
        projectMeta.appendChild(projectType);
        projectMeta.appendChild(projectLanguage);
        projectMeta.appendChild(projectDate);
        
        projectContent.appendChild(projectName);
        projectContent.appendChild(projectMeta);
        
        // Delete button
        const deleteButton = DOM.create('button', {
            className: 'project-delete-btn btn-icon small',
            html: '<span class="icon">🗑️</span>',
            attributes: { 'title': 'Delete project' }
        });
        
        // Stop event propagation to prevent project selection when clicking delete
        DOM.on(deleteButton, 'click', (e) => {
            e.stopPropagation();
            this.deleteProject(project.id);
        });
        
        projectItem.appendChild(projectContent);
        projectItem.appendChild(deleteButton);
        
        // Click handler for project content
        DOM.on(projectContent, 'click', () => {
            this.selectProject(project.id);
        });
        
        // Context menu
        DOM.on(projectItem, 'contextmenu', (e) => {
            e.preventDefault();
            this.showProjectContextMenu(e, project);
        });
        
        return projectItem;
    }
    
    filterProjects(searchTerm) {
        const projectItems = this.projectListElement.querySelectorAll('.project-item');
        
        projectItems.forEach(item => {
            const projectName = item.querySelector('.project-name').textContent.toLowerCase();
            const matches = projectName.includes(searchTerm.toLowerCase());
            
            item.style.display = matches ? '' : 'none';
        });
    }
    
    async selectProject(projectId) {
        try {
            // Deselect current project
            if (this.currentProject) {
                const currentElement = this.projectListElement.querySelector(`[data-project-id="${this.currentProject}"]`);
                if (currentElement) {
                    DOM.removeClass(currentElement, 'active');
                }
                
                // Leave current project socket room
                socket.leaveProject(this.currentProject);
            }
            
            // Select new project
            this.currentProject = projectId;
            const projectElement = this.projectListElement.querySelector(`[data-project-id="${projectId}"]`);
            if (projectElement) {
                DOM.addClass(projectElement, 'active');
            }
            
            // Join project socket room
            socket.joinProject(projectId);
            
            // Load project details
            const project = await this.getProjectDetails(projectId);
            
            // Update UI
            this.updateBreadcrumb(project);
            this.updateInfoPanel(project);
            
            // Create terminal if needed, or activate existing one
            if (!terminalManager.hasTerminalsForProject(projectId)) {
                terminalManager.createTerminalForProject(projectId, true);
            } else {
                // Activate the first terminal for this project
                const existingTerminals = terminalManager.getTerminalsByProject(projectId);
                if (existingTerminals.length > 0) {
                    terminalManager.setActiveTerminal(existingTerminals[0].id);
                }
            }
            
            this.emit('project_selected', project);
            
            // Notify image manager about project change
            if (window.ImageManager) {
                window.ImageManager.setCurrentProject(projectId);
            }
            
            // Close mobile menu after selecting project
            if (window.app && window.app.isMobileMenuOpen()) {
                window.app.closeMobileMenu();
            }
            
        } catch (error) {
            console.error('Failed to select project:', error);
            notifications.error('Failed to select project: ' + error.message);
        }
    }
    
    async getProjectDetails(projectId) {
        try {
            const response = await HTTP.get(`/api/projects/${projectId}`);
            if (response.success) {
                // Update cached project
                this.projects.set(projectId, response.project);
                return response.project;
            }
        } catch (error) {
            console.error('Failed to get project details:', error);
            throw error;
        }
    }
    
    updateBreadcrumb(project) {
        const breadcrumb = DOM.get('breadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item">Dashboard</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item active">${project.name}</span>
            `;
        }
    }
    
    updateInfoPanel(project) {
        const infoPanelTitle = DOM.get('info-panel-title');
        const infoPanelContent = DOM.get('info-panel-content');
        
        if (infoPanelTitle) {
            infoPanelTitle.textContent = project.name;
        }
        
        if (infoPanelContent) {
            infoPanelContent.innerHTML = `
                <div class="project-details">
                    <div class="detail-group">
                        <h4>Project Information</h4>
                        <div class="detail-item">
                            <span class="label">Name:</span>
                            <span class="value">${project.name}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Type:</span>
                            <span class="value">${project.type}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Language:</span>
                            <span class="value">${project.language}</span>
                        </div>
                        ${project.framework ? `
                        <div class="detail-item">
                            <span class="label">Framework:</span>
                            <span class="value">${project.framework}</span>
                        </div>
                        ` : ''}
                        <div class="detail-item">
                            <span class="label">Created:</span>
                            <span class="value">${Utils.formatDate(project.createdAt)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Modified:</span>
                            <span class="value">${Utils.formatDate(project.updatedAt)}</span>
                        </div>
                    </div>
                    
                    <div class="detail-group">
                        <h4>Statistics</h4>
                        <div class="detail-item">
                            <span class="label">Size:</span>
                            <span class="value">${Utils.formatBytes(project.size || 0)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Files:</span>
                            <span class="value">${project.fileCount || 0}</span>
                        </div>
                    </div>
                    
                    <div class="detail-group">
                        <h4>Actions</h4>
                        <div class="project-actions">
                            <button class="btn btn-primary btn-small" onclick="projectManager.startClaude('${project.id}')">
                                🤖 Start Claude
                            </button>
                            <button class="btn btn-secondary btn-small" onclick="projectManager.openInTerminal('${project.id}')">
                                💻 Open Terminal
                            </button>
                            <button class="btn btn-secondary btn-small" onclick="projectManager.showProjectSettings('${project.id}')">
                                ⚙️ Settings
                            </button>
                        </div>
                    </div>
                    
                    ${project.claudeConfig.exists ? `
                    <div class="detail-group">
                        <h4>Claude Configuration</h4>
                        <div class="detail-item">
                            <span class="label">Config Files:</span>
                            <span class="value">${project.claudeConfig.files.length}</span>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }
    }
    
    showCreateProjectModal() {
        const modal = DOM.get('project-modal');
        const form = DOM.get('project-form');
        const title = DOM.get('project-modal-title');
        
        if (title) title.textContent = 'Create New Project';
        if (form) form.reset();
        
        modals.open('project-modal');
    }
    
    showImportProjectModal() {
        notifications.info('Import project functionality coming soon!');
    }
    
    async handleProjectFormSubmit(form) {
        try {
            const formData = new FormData(form);
            const projectData = {
                name: formData.get('name')
            };
            
            const response = await HTTP.post('/api/projects', projectData);
            
            if (response.success) {
                notifications.success('Project created successfully!');
                modals.close();
                
                // Add to projects map
                this.projects.set(response.project.id, response.project);
                
                // Refresh project list
                this.renderProjectList();
                
                // Select the new project
                this.selectProject(response.project.id);
                
                this.emit('project_created', response.project);
            }
        } catch (error) {
            console.error('Failed to create project:', error);
            notifications.error('Failed to create project: ' + error.message);
        }
    }
    
    showProjectContextMenu(event, project) {
        const contextMenu = DOM.get('context-menu');
        const contextMenuItems = DOM.get('context-menu-items');
        
        if (!contextMenu || !contextMenuItems) return;
        
        contextMenuItems.innerHTML = `
            <button class="context-menu-item" onclick="projectManager.selectProject('${project.id}')">
                <span class="icon">📁</span>
                <span>Open Project</span>
            </button>
            <button class="context-menu-item" onclick="projectManager.startClaude('${project.id}')">
                <span class="icon">🤖</span>
                <span>Start Claude</span>
            </button>
            <button class="context-menu-item" onclick="projectManager.openInTerminal('${project.id}')">
                <span class="icon">💻</span>
                <span>Open Terminal</span>
            </button>
            <div class="context-menu-separator"></div>
            <button class="context-menu-item" onclick="projectManager.showProjectSettings('${project.id}')">
                <span class="icon">⚙️</span>
                <span>Project Settings</span>
            </button>
            <button class="context-menu-item" onclick="projectManager.duplicateProject('${project.id}')">
                <span class="icon">📋</span>
                <span>Duplicate</span>
            </button>
            <div class="context-menu-separator"></div>
            <button class="context-menu-item" onclick="projectManager.deleteProject('${project.id}')">
                <span class="icon">🗑️</span>
                <span>Delete Project</span>
            </button>
        `;
        
        // Position context menu
        contextMenu.style.left = event.pageX + 'px';
        contextMenu.style.top = event.pageY + 'px';
        
        // Show context menu
        DOM.addClass(contextMenu, 'active');
        
        // Hide context menu on click outside
        const hideContextMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                DOM.removeClass(contextMenu, 'active');
                document.removeEventListener('click', hideContextMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideContextMenu);
        }, 0);
    }
    
    async startClaude(projectId) {
        try {
            if (!socket.isConnected()) {
                notifications.error('Not connected to server');
                return;
            }
            
            notifications.info('Starting Claude session...');
            socket.startClaude(projectId);
            
        } catch (error) {
            console.error('Failed to start Claude:', error);
            notifications.error('Failed to start Claude: ' + error.message);
        }
    }
    
    async openInTerminal(projectId) {
        try {
            // Create new terminal for project
            terminalManager.createTerminalForProject(projectId, false);
            notifications.success('Terminal opened for project');
            
        } catch (error) {
            console.error('Failed to open terminal:', error);
            notifications.error('Failed to open terminal: ' + error.message);
        }
    }
    
    showProjectSettings(projectId) {
        notifications.info('Project settings coming soon!');
    }
    
    async duplicateProject(projectId) {
        try {
            const project = this.projects.get(projectId);
            if (!project) return;
            
            const newName = prompt('Enter name for duplicated project:', project.name + ' Copy');
            if (!newName) return;
            
            const projectData = {
                name: newName,
                description: project.description,
                type: project.type,
                language: project.language,
                framework: project.framework
            };
            
            const response = await HTTP.post('/api/projects', projectData);
            
            if (response.success) {
                notifications.success('Project duplicated successfully!');
                this.projects.set(response.project.id, response.project);
                this.renderProjectList();
            }
            
        } catch (error) {
            console.error('Failed to duplicate project:', error);
            notifications.error('Failed to duplicate project: ' + error.message);
        }
    }
    
    async deleteProject(projectId) {
        try {
            const project = this.projects.get(projectId);
            if (!project) return;
            
            const confirmed = confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`);
            if (!confirmed) return;
            
            await HTTP.delete(`/api/projects/${projectId}`);
            
            // Remove from projects map
            this.projects.delete(projectId);
            
            // Close any terminals for this project
            terminalManager.closeTerminalsForProject(projectId);
            
            // If this was the current project, clear selection
            if (this.currentProject === projectId) {
                this.currentProject = null;
                socket.leaveProject(projectId);
            }
            
            // Refresh project list
            this.renderProjectList();
            
            notifications.success('Project deleted successfully');
            this.emit('project_deleted', projectId);
            
        } catch (error) {
            console.error('Failed to delete project:', error);
            notifications.error('Failed to delete project: ' + error.message);
        }
    }
    
    handleProjectStatus(data) {
        const { projectId, status } = data;
        
        switch (status) {
            case 'claude_started':
                notifications.success('Claude session started');
                break;
            case 'claude_stopped':
                notifications.info('Claude session stopped');
                break;
            case 'terminal_created':
                notifications.success('Terminal session created');
                break;
            case 'terminal_destroyed':
                notifications.info('Terminal session destroyed');
                break;
        }
        
        this.emit('project_status_changed', data);
    }
    
    // Public API methods
    getCurrentProject() {
        return this.currentProject ? this.projects.get(this.currentProject) : null;
    }
    
    getProject(projectId) {
        return this.projects.get(projectId);
    }
    
    getAllProjects() {
        return Array.from(this.projects.values());
    }
    
    hasProjects() {
        return this.projects.size > 0;
    }
    
    async refreshProjects() {
        await this.loadProjects();
    }
}

// Initialize project manager
const projectManager = new ProjectManager();

// Make project manager globally available
window.projectManager = projectManager;

// Export for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProjectManager };
}