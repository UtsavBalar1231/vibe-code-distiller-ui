// ===== MAIN APPLICATION =====

class ClaudeCodeWebManager extends EventEmitter {
    constructor() {
        super();
        this.isInitialized = false;
        this.systemStats = {};
        
        this.init();
    }
    
    async init() {
        try {
            // Show loading screen
            this.showLoadingScreen();
            
            // Initialize components
            await this.initializeComponents();
            
            // Setup global event handlers
            this.setupGlobalEventHandlers();
            
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Initialize shortcuts panel if available
            this.initializeShortcutsPanel();
            
            // Check authentication
            await this.checkAuthentication();
            
            // Hide loading screen and show app
            this.hideLoadingScreen();
            
            // Initialize system monitoring
            this.initializeSystemMonitoring();
            
            // Request notification permission after app is ready
            this.requestNotificationPermission();
            
            // Setup notification status click handler
            this.setupNotificationStatusHandler();
            
            this.isInitialized = true;
            this.emit('app_initialized');
            
            console.log('🚀 Claude Code Web Manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            this.showErrorScreen(error);
        }
    }
    
    showLoadingScreen() {
        const loadingScreen = DOM.get('loading-screen');
        const app = DOM.get('app');
        
        if (loadingScreen) DOM.show(loadingScreen);
        if (app) DOM.hide(app);
    }
    
    hideLoadingScreen() {
        const loadingScreen = DOM.get('loading-screen');
        const app = DOM.get('app');
        
        if (loadingScreen) {
            setTimeout(() => {
                DOM.hide(loadingScreen);
                if (app) DOM.show(app);
            }, 500);
        }
    }
    
    showErrorScreen(error) {
        const loadingScreen = DOM.get('loading-screen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="loading-content">
                    <div class="error-icon">❌</div>
                    <h2>Failed to Initialize</h2>
                    <p>Claude Code Web Manager failed to start:</p>
                    <p class="error-message">${error.message}</p>
                    <button class="btn btn-primary" onclick="location.reload()">Retry</button>
                </div>
            `;
        }
    }
    
    async initializeComponents() {
        // Ensure socket is available
        if (typeof socket === 'undefined') {
            throw new Error('Socket client not available');
        }
        
        // Wait for socket connection
        if (!socket.isConnected()) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Socket connection timeout'));
                }, 10000);
                
                socket.onConnected(() => {
                    clearTimeout(timeout);
                    resolve();
                });
                
                socket.onConnectionError((error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        }
    }
    
    setupGlobalEventHandlers() {
        // Mobile menu toggle
        DOM.on('mobile-menu-toggle', 'click', () => {
            this.toggleMobileMenu();
        });
        
        // Mobile backdrop
        DOM.on('mobile-backdrop', 'click', () => {
            this.closeMobileMenu();
        });
        
        
        // Settings button
        DOM.on('settings-btn', 'click', () => {
            this.showSettings();
        });
        
        
        
        
        
        // Modal close handlers
        DOM.queryAll('.modal-close').forEach(btn => {
            DOM.on(btn, 'click', () => {
                modals.close();
            });
        });
        
        // Settings tabs
        DOM.on(document, 'click', (e) => {
            if (e.target.classList.contains('settings-tab')) {
                this.switchSettingsTab(e.target.dataset.tab);
            }
        });
        
        // Window events
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        window.addEventListener('resize', Utils.throttle(() => {
            this.handleWindowResize();
        }, 250));
        
        // System monitoring
        socket.onSystemStatus((data) => {
            this.updateSystemStatus(data);
        });
    }
    
    setupKeyboardShortcuts() {
        // Global shortcuts
        keyboard.register('ctrl+,', () => {
            this.showSettings();
        });
        
        
        keyboard.register('escape', () => {
            this.handleEscapeKey();
        });
        
        // Terminal shortcuts are handled by TerminalManager
        // Project shortcuts are handled by ProjectManager
    }
    
    initializeShortcutsPanel() {
        // The shortcuts panel initializes itself via DOMContentLoaded
        // but we can add any app-specific integration here
        if (window.shortcutsPanel) {
            console.log('✅ Shortcuts panel initialized');
        } else {
            // Wait for shortcuts panel to be ready
            setTimeout(() => {
                if (window.shortcutsPanel) {
                    console.log('✅ Shortcuts panel ready');
                }
            }, 100);
        }
    }
    
    async checkAuthentication() {
        try {
            // Check if authentication is enabled
            const response = await HTTP.get('/api/auth/user');
            
            if (!response.success && response.error === 'Not authenticated') {
                this.showAuthModal();
                return;
            }
            
            // Authentication successful or not required
            console.log('✅ Authentication check passed');
            
        } catch (error) {
            if (error.message.includes('401')) {
                // Auth is likely disabled, continue without auth
                console.log('✅ Authentication not required (disabled)');
            } else {
                console.warn('Authentication check failed:', error);
                // Continue anyway for development
            }
        }
    }
    
    showAuthModal() {
        const authModal = DOM.get('auth-modal');
        const loginForm = DOM.get('login-form');
        
        if (authModal && loginForm) {
            DOM.show(authModal);
            
            // Setup login form handler
            DOM.on(loginForm, 'submit', async (e) => {
                e.preventDefault();
                await this.handleLogin(e.target);
            });
        }
    }
    
    async handleLogin(form) {
        try {
            const formData = new FormData(form);
            const credentials = {
                username: formData.get('username'),
                password: formData.get('password')
            };
            
            const response = await HTTP.post('/api/auth/login', credentials);
            
            if (response.success) {
                DOM.hide('auth-modal');
                notifications.success('Login successful');
                
                // Re-initialize socket with auth
                socket.authenticate(response.token);
                
            } else {
                this.showAuthError(response.error || 'Login failed');
            }
            
        } catch (error) {
            console.error('Login failed:', error);
            this.showAuthError(error.message);
        }
    }
    
    showAuthError(message) {
        const errorElement = DOM.get('auth-error');
        if (errorElement) {
            errorElement.textContent = message;
            DOM.show(errorElement);
            
            setTimeout(() => {
                DOM.hide(errorElement);
            }, 5000);
        }
    }
    
    initializeSystemMonitoring() {
        // Update system metrics periodically
        setInterval(() => {
            this.updateSystemMetrics();
        }, 5000);
        
        // Initial update
        this.updateSystemMetrics();
    }
    
    async updateSystemMetrics() {
        try {
            const response = await HTTP.get('/api/system/status');
            
            if (response.success) {
                this.systemStats = response.system;
                this.updateSystemUI();
            }
        } catch (error) {
            console.warn('Failed to get system status:', error);
        }
    }
    
    updateSystemUI() {
        // Update header system load
        const systemLoad = DOM.get('system-load');
        if (systemLoad && this.systemStats.cpu) {
            systemLoad.querySelector('.text').textContent = `CPU: ${this.systemStats.cpu.usage}%`;
        }
        
        // Update temperature display
        const systemTemp = DOM.get('system-temp');
        if (systemTemp && this.systemStats.temperature) {
            const temp = this.systemStats.temperature.cpu;
            systemTemp.querySelector('.text').textContent = `Temp: ${temp}°C`;
        }
        
        // Update memory display
        const systemMemory = DOM.get('system-memory');
        if (systemMemory && this.systemStats.memory) {
            const memUsage = this.systemStats.memory.usage;
            systemMemory.querySelector('.text').textContent = `RAM: ${memUsage}%`;
        }
    }
    
    updateSystemStatus(data) {
        // Update connection count and other real-time stats
        console.log('📊 System status update:', data);
    }
    
    async showSettings(defaultTab = 'general') {
        const settingsModal = DOM.get('settings-modal');
        const settingsContent = settingsModal?.querySelector('.settings-content');
        
        if (settingsContent) {
            this.renderSettingsContent(settingsContent);
            await this.loadSettingsValues();
            this.switchSettingsTab(defaultTab);
        }
        
        modals.open('settings-modal');
    }
    
    renderSettingsContent(container) {
        container.innerHTML = `
            <div class="settings-panel active" data-panel="general">
                
                <div class="settings-group">
                    <h4>Notifications</h4>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Enable Notifications</div>
                            <div class="settings-item-description">Show system and project notifications</div>
                        </div>
                        <div class="settings-item-control">
                            <div class="toggle-switch" id="notifications-toggle">
                                <input type="checkbox" id="notifications-enabled">
                                <div class="toggle-slider"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="settings-group">
                    <h4>Shortcuts Panel</h4>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Show Shortcuts Panel</div>
                            <div class="settings-item-description">Display floating keyboard shortcuts reference panel</div>
                        </div>
                        <div class="settings-item-control">
                            <div class="toggle-switch" id="shortcuts-panel-toggle">
                                <input type="checkbox" id="shortcuts-panel-enabled" checked>
                                <div class="toggle-slider"></div>
                            </div>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Reset Panel Position</div>
                            <div class="settings-item-description">Reset shortcuts panel to default position</div>
                        </div>
                        <div class="settings-item-control">
                            <button class="btn btn-secondary btn-small" id="reset-shortcuts-position">Reset Position</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="settings-panel" data-panel="terminal">
                <div class="settings-group">
                    <h4>Terminal Appearance</h4>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Font Size</div>
                            <div class="settings-item-description">Terminal font size (8-32 pixels). Changes require TTYd service restart.</div>
                        </div>
                        <div class="settings-item-control">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="number" id="terminal-font-size" min="8" max="32" value="15" style="width: 80px;">
                                <button class="btn btn-primary btn-small" id="apply-font-size">Apply</button>
                            </div>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">TTYd Service</div>
                            <div class="settings-item-description">Terminal service status information</div>
                        </div>
                        <div class="settings-item-control">
                            <span class="service-status" id="ttyd-status">Loading...</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="settings-panel" data-panel="system">
                <div class="settings-group">
                    <h4>System Information</h4>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Memory Usage</div>
                            <div class="settings-item-description">${this.systemStats.memory?.used || 0} MB used</div>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">CPU Usage</div>
                            <div class="settings-item-description">${this.systemStats.cpu?.usage || 0}% average</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Update TTYd status display
        this.updateTTYdStatus();
        
        // Setup settings event handlers
        
        // Terminal settings event handlers
        DOM.on('apply-font-size', 'click', async (e) => {
            const fontSize = parseInt(DOM.get('terminal-font-size').value);
            
            if (isNaN(fontSize) || fontSize < 8 || fontSize > 32) {
                notifications.error('Font size must be between 8 and 32 pixels');
                return;
            }
            
            try {
                e.target.disabled = true;
                e.target.textContent = 'Applying...';
                
                const response = await HTTP.post('/api/ttyd/config', { fontSize });
                
                if (response.success) {
                    notifications.success('Font size updated! TTYd service has been restarted.');
                    // Update TTYd status after configuration change
                    this.updateTTYdStatus();
                    // Reload the terminal iframe to reflect changes
                    if (window.terminalManager) {
                        setTimeout(() => {
                            window.terminalManager.reloadTerminal();
                        }, 2000);
                    }
                } else {
                    notifications.error(`Failed to update font size: ${response.error}`);
                }
            } catch (error) {
                notifications.error(`Error updating font size: ${error.message}`);
            } finally {
                e.target.disabled = false;
                e.target.textContent = 'Apply';
            }
        });
        
        // Notification settings event handler
        DOM.on('notifications-toggle', 'click', (e) => {
            const toggleElement = e.currentTarget;
            const checkbox = toggleElement.querySelector('input[type="checkbox"]');
            
            // Toggle the checkbox state
            checkbox.checked = !checkbox.checked;
            
            // Update visual state
            toggleElement.classList.toggle('active', checkbox.checked);
            
            // Save state and update NotificationManager
            Storage.set('notifications-enabled', checkbox.checked);
            
            if (window.notifications && window.notifications.isEnabled !== checkbox.checked) {
                window.notifications.toggle();
            }
        });
        
        // Shortcuts panel settings event handlers
        DOM.on('shortcuts-panel-toggle', 'click', (e) => {
            const toggleElement = e.currentTarget;
            const checkbox = toggleElement.querySelector('input[type="checkbox"]');
            
            // Toggle the checkbox state
            checkbox.checked = !checkbox.checked;
            
            // Update visual state
            toggleElement.classList.toggle('active', checkbox.checked);
            
            // Save state and update shortcuts panel
            Storage.set('shortcuts-panel-enabled', checkbox.checked);
            
            if (window.shortcutsPanel) {
                if (checkbox.checked) {
                    window.shortcutsPanel.enable();
                } else {
                    window.shortcutsPanel.disable();
                }
            }
        });
        
        DOM.on('reset-shortcuts-position', 'click', () => {
            if (window.shortcutsPanel && typeof window.shortcutsPanel.resetPosition === 'function') {
                window.shortcutsPanel.resetPosition();
                notifications.success('Shortcuts panel position reset to default');
            }
        });
        
    }
    
    async loadSettingsValues() {
        // Load terminal settings from TTYd service
        try {
            const response = await HTTP.get('/api/ttyd/config');
            if (response.success) {
                const fontSizeInput = DOM.get('terminal-font-size');
                if (fontSizeInput) {
                    fontSizeInput.value = response.data.fontSize || 15;
                }
                
                // Update TTYd status
                this.updateTTYdStatus();
            }
        } catch (error) {
            console.warn('Failed to load TTYd configuration:', error);
            // Fallback to default value
            const fontSizeInput = DOM.get('terminal-font-size');
            if (fontSizeInput) {
                fontSizeInput.value = 15;
            }
        }
        
        // Load notification settings
        const notificationsEnabled = Storage.get('notifications-enabled', true);
        
        // Set notification toggle switch state
        const notificationToggle = DOM.get('notifications-toggle');
        const notificationCheckbox = DOM.get('notifications-enabled');
        if (notificationToggle && notificationCheckbox) {
            notificationCheckbox.checked = notificationsEnabled;
            notificationToggle.classList.toggle('active', notificationsEnabled);
        }
        
        // Load shortcuts panel settings
        const shortcutsPanelEnabled = Storage.get('shortcuts-panel-enabled', true);
        
        // Set shortcuts panel toggle switch state
        const shortcutsToggle = DOM.get('shortcuts-panel-toggle');
        const shortcutsCheckbox = DOM.get('shortcuts-panel-enabled');
        if (shortcutsToggle && shortcutsCheckbox) {
            shortcutsCheckbox.checked = shortcutsPanelEnabled;
            shortcutsToggle.classList.toggle('active', shortcutsPanelEnabled);
        }
    }
    
    switchSettingsTab(tabName) {
        // Update tab buttons
        DOM.queryAll('.settings-tab').forEach(tab => {
            DOM.removeClass(tab, 'active');
        });
        DOM.addClass(DOM.query(`[data-tab="${tabName}"]`), 'active');
        
        // Update panels
        DOM.queryAll('.settings-panel').forEach(panel => {
            DOM.removeClass(panel, 'active');
        });
        DOM.addClass(DOM.query(`[data-panel="${tabName}"]`), 'active');
    }
    
    
    
    
    showDebugInfo() {
        const debugInfo = {
            socket: socket.getDebugInfo(),
            projects: projectManager.getAllProjects().length,
            terminals: terminalManager.getAllTerminals().length,
            currentProject: projectManager.getCurrentProject()?.id,
            systemStats: this.systemStats
        };
        
        console.log('🔧 Debug Info:', debugInfo);
        notifications.info('Debug information logged to console');
    }
    
    
    handleEscapeKey() {
        // Close mobile menu
        if (this.isMobileMenuOpen()) {
            this.closeMobileMenu();
            return;
        }
        
        // Close modals
        if (modals.isOpen()) {
            modals.close();
            return;
        }
        
        // Close context menus
        const contextMenu = DOM.get('context-menu');
        if (contextMenu && DOM.hasClass(contextMenu, 'active')) {
            DOM.removeClass(contextMenu, 'active');
            return;
        }
        
    }
    
    toggleMobileMenu() {
        const sidebar = DOM.get('sidebar');
        const backdrop = DOM.get('mobile-backdrop');
        
        if (sidebar && backdrop) {
            if (DOM.hasClass(sidebar, 'open')) {
                this.closeMobileMenu();
            } else {
                DOM.addClass(sidebar, 'open');
                DOM.addClass(backdrop, 'active');
                document.body.style.overflow = 'hidden';
            }
        }
    }
    
    closeMobileMenu() {
        const sidebar = DOM.get('sidebar');
        const backdrop = DOM.get('mobile-backdrop');
        
        if (sidebar && backdrop) {
            DOM.removeClass(sidebar, 'open');
            DOM.removeClass(backdrop, 'active');
            document.body.style.overflow = '';
        }
    }
    
    isMobileMenuOpen() {
        const sidebar = DOM.get('sidebar');
        return sidebar && DOM.hasClass(sidebar, 'open');
    }
    
    handleWindowResize() {
        // Close mobile menu on resize to larger screen
        if (window.innerWidth > 768 && this.isMobileMenuOpen()) {
            this.closeMobileMenu();
        }
        
        // TTYd iframe handles resizing automatically
        // No need to manually fit terminals in TTYd architecture
        const activeSession = terminalManager.getActiveSession();
        if (activeSession) {
            console.log('Active session:', activeSession.name);
        }
    }
    
    cleanup() {
        console.log('🧹 Cleaning up application...');
        
        // Cleanup shortcuts panel
        if (window.shortcutsPanel && typeof window.shortcutsPanel.destroy === 'function') {
            window.shortcutsPanel.destroy();
        }
        
        // Leave current project
        if (projectManager.getCurrentProject()) {
            socket.leaveProject();
        }
        
        // Disconnect socket
        socket.disconnect();
    }
    
    // Public API methods
    getSystemStats() {
        return this.systemStats;
    }
    
    isReady() {
        return this.isInitialized;
    }
    
    requestNotificationPermission() {
        // Only request permission if it's not already determined
        if ('Notification' in window && Notification.permission === 'default') {
            // Add a click handler to request permission on first user interaction
            const requestPermissionOnInteraction = () => {
                if (socket && socket.requestNotificationPermission) {
                    socket.requestNotificationPermission();
                }
                // Remove the listener after first interaction
                document.removeEventListener('click', requestPermissionOnInteraction, true);
            };
            
            // Add listener to capture any click on the page
            document.addEventListener('click', requestPermissionOnInteraction, true);
            
            // Also try after a short delay as fallback
            setTimeout(() => {
                if ('Notification' in window && Notification.permission === 'default') {
                    requestPermissionOnInteraction();
                }
            }, 3000);
        }
    }
    
    setupNotificationStatusHandler() {
        const notificationStatus = document.getElementById('notification-status');
        if (notificationStatus) {
            notificationStatus.addEventListener('click', () => {
                if ('Notification' in window) {
                    if (Notification.permission === 'default') {
                        // Request permission
                        if (socket && socket.requestNotificationPermission) {
                            socket.requestNotificationPermission();
                        }
                    } else if (Notification.permission === 'denied') {
                        // Show instructions to enable in browser settings
                        notifications.warning('Notification permission denied. Please click the lock icon in the browser address bar and enable notifications.', {
                            title: 'How to Enable Notifications',
                            duration: 8000
                        });
                    } else if (Notification.permission === 'granted') {
                        // Show test notification
                        if (socket && socket.showBrowserNotification) {
                            socket.showBrowserNotification('Claude Code Web Manager', 'Notifications working properly!', 'Test');
                        }
                    }
                } else {
                    notifications.error('Your browser does not support notifications', {
                        title: 'Feature Not Supported',
                        duration: 3000
                    });
                }
            });
        }
    }
    
    async updateTTYdStatus() {
        const statusElement = DOM.get('ttyd-status');
        if (!statusElement) return;
        
        try {
            const response = await HTTP.get('/api/ttyd/status');
            if (response.success) {
                const status = response.data;
                if (status.isRunning) {
                    statusElement.textContent = `Running (PID: ${status.pid}, Port: ${status.port})`;
                    statusElement.style.color = '#4CAF50';
                } else {
                    statusElement.textContent = 'Not Running';
                    statusElement.style.color = '#f44336';
                }
            } else {
                statusElement.textContent = 'Status Unknown';
                statusElement.style.color = '#ff9800';
            }
        } catch (error) {
            statusElement.textContent = 'Error checking status';
            statusElement.style.color = '#f44336';
        }
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for all scripts to load
    setTimeout(() => {
        try {
            // Check if required globals are available
            if (typeof socket === 'undefined') {
                throw new Error('Socket client not initialized');
            }
            if (typeof terminalManager === 'undefined') {
                throw new Error('Terminal manager not initialized');
            }
            if (typeof projectManager === 'undefined') {
                throw new Error('Project manager not initialized');
            }
            
            window.app = new ClaudeCodeWebManager();
            
            // Initialize image manager socket connection
            if (window.ImageManager && window.socket) {
                window.ImageManager.setSocket(window.socket);
            }
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            
            // Show error in loading screen
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.innerHTML = `
                    <div class="loading-content">
                        <div class="error-icon">❌</div>
                        <h2>Failed to Initialize</h2>
                        <p>Claude Code Web Manager failed to start:</p>
                        <p class="error-message">${error.message}</p>
                        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
                    </div>
                `;
            }
        }
    }, 100);
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('📱 Page hidden');
    } else {
        console.log('📱 Page visible');
        // Refresh when page becomes visible again
        if (window.app && window.app.isReady()) {
            projectManager.refreshProjects();
        }
    }
});

// Global error handling
window.addEventListener('error', (event) => {
    console.error('❌ Global error:', event.error);
    notifications.error('An unexpected error occurred');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled promise rejection:', event.reason);
    notifications.error('An unexpected error occurred');
});

console.log('🚀 Claude Code Web Manager loading...');