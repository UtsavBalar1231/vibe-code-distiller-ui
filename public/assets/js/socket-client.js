// ===== SOCKET.IO CLIENT =====

class SocketClient extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.connectionStatus = 'disconnected';
        this.currentProject = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        // Project connection state tracking
        this.projectStates = new Map(); // projectId -> {status, readyCallbacks, lastActivity}
        
        // Browser notifications
        this.notificationPermission = 'default';
        this.checkNotificationPermission();
        
        this.setupSocket();
    }
    
    setupSocket() {
        // Initialize Socket.IO connection
        this.socket = io({
            transports: ['websocket', 'polling'], // Prefer websocket over polling
            timeout: 20000,
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay,
            reconnectionDelayMax: 5000,
            maxHttpBufferSize: 1e6, // 1MB
            pingTimeout: 60000,
            pingInterval: 25000,
            upgrade: true, // Allow transport upgrades
            rememberUpgrade: true, // Remember successful upgrades
            forceNew: false
        });
        
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        // Connection events
        this.socket.on('connect', () => {
            this.connectionStatus = 'connected';
            this.reconnectAttempts = 0;
            this.updateConnectionStatus();
            this.emit('connected');
            
            console.log('🔌 Socket connected successfully, ID:', this.socket.id);
            
            if (notifications.isNotificationEnabled()) {
                notifications.success('Connected to server', { duration: 2000 });
            }
        });
        
        this.socket.on('disconnect', (reason) => {
            this.connectionStatus = 'disconnected';
            this.updateConnectionStatus();
            this.emit('disconnected', reason);
            
            
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, try to reconnect
                this.socket.connect();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            this.connectionStatus = 'error';
            this.reconnectAttempts++;
            this.updateConnectionStatus();
            this.emit('connection_error', error);
            
            
            if (this.reconnectAttempts >= this.maxReconnectAttempts && notifications.isNotificationEnabled()) {
                notifications.error('Failed to connect to server. Please check your connection.', {
                    duration: 0
                });
            }
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            this.connectionStatus = 'connected';
            this.reconnectAttempts = 0;
            this.updateConnectionStatus();
            this.emit('reconnected', attemptNumber);
            
            if (notifications.isNotificationEnabled()) {
                notifications.success('Reconnected to server', { duration: 2000 });
            }
            
            // Rejoin current project if any with delay to ensure server is ready
            if (this.currentProject) {
                setTimeout(() => {
                    this.joinProject(this.currentProject);
                }, 2000); // Wait 2 seconds before rejoining
            }
        });
        
        this.socket.on('reconnect_attempt', (attemptNumber) => {
            this.connectionStatus = 'reconnecting';
            this.updateConnectionStatus();
        });
        
        this.socket.on('reconnect_error', (error) => {
        });
        
        this.socket.on('reconnect_failed', () => {
            this.connectionStatus = 'failed';
            this.updateConnectionStatus();
            if (notifications.isNotificationEnabled()) {
                notifications.error('Unable to reconnect to server', { duration: 0 });
            }
        });
        
        // Server events
        this.socket.on('connected', (data) => {
            this.emit('server_connected', data);
            
            // Rejoin current project if we have one
            if (this.currentProject) {
                setTimeout(() => {
                    this.joinProject(this.currentProject);
                }, 1000);
            }
        });
        
        this.socket.on('error', (error) => {
            // Handle specific errors without logging
            if (error.message === 'Not connected to project' && this.currentProject) {
                setTimeout(() => {
                    this.joinProject(this.currentProject);
                }, 1000);
            } else if (error.message === 'Failed to resize terminal' && 
                      (error.details === 'Terminal session not found' || 
                       error.details === 'Terminal not active' ||
                       (error.details && error.details.includes('Terminal not active')))) {
                // Terminal session not ready yet, ignore this error
                // This can happen when switching terminals or reconnecting
            } else if (error.message && error.message.includes('Socket is not connected')) {
                // Socket connection error, already handled by connection status
            } else {
                // Log other errors
                console.error('❌ Server error:', error);
                if (notifications.isNotificationEnabled()) {
                    notifications.error(error.message || 'Server error occurred');
                }
            }
            
            this.emit('server_error', error);
        });
        
        this.socket.on('notification', (notification) => {
            this.handleNotification(notification);
            this.emit('notification', notification);
        });
        
        this.socket.on('claude-notification', (notification) => {
            this.handleClaudeNotification(notification);
            this.emit('claude_notification', notification);
        });
        
        // Project events
        this.socket.on('project-status', (data) => {
            this.emit('project_status', data);
        });
        
        // Project connection events
        this.socket.on('project-ready', (data) => {
            const { projectId } = data;
            this.markProjectReady(projectId);
            this.emit('project_ready', data);
        });
        
        this.socket.on('project-disconnected', (data) => {
            const { projectId } = data;
            this.markProjectDisconnected(projectId);
            this.emit('project_disconnected', data);
        });
        
        
        // Claude Code events
        this.socket.on('claude-response', (data) => {
            this.emit('claude_response', data);
        });
        
        // System events
        this.socket.on('system-status', (data) => {
            this.emit('system_status', data);
        });
    }
    
    updateConnectionStatus() {
        const statusElement = DOM.get('connection-status');
        if (!statusElement) return;
        
        const indicator = statusElement.querySelector('.indicator');
        const text = statusElement.querySelector('.text');
        
        if (indicator && text) {
            // Remove all status classes
            indicator.className = 'indicator';
            
            switch (this.connectionStatus) {
                case 'connected':
                    indicator.classList.add('online');
                    text.textContent = 'Connected';
                    break;
                case 'connecting':
                case 'reconnecting':
                    indicator.classList.add('offline');
                    text.textContent = 'Connecting...';
                    break;
                case 'disconnected':
                    indicator.classList.add('offline');
                    text.textContent = 'Disconnected';
                    break;
                case 'error':
                case 'failed':
                    indicator.classList.add('offline');
                    text.textContent = 'Connection Failed';
                    break;
                default:
                    indicator.classList.add('offline');
                    text.textContent = 'Unknown';
            }
        }
    }
    
    handleNotification(notification) {
        // Check if notifications are enabled before showing
        if (!notifications.isNotificationEnabled()) {
            return;
        }
        
        const { type, message, title } = notification;
        
        switch (type) {
            case 'user_joined':
                notifications.info(message, { title: 'User Activity' });
                break;
            case 'user_left':
                notifications.info(message, { title: 'User Activity' });
                break;
            case 'file_changed':
                notifications.info(message, { title: 'File Change', duration: 3000 });
                break;
            case 'file_added':
                notifications.success(message, { title: 'File Added', duration: 3000 });
                break;
            case 'file_removed':
                notifications.warning(message, { title: 'File Removed', duration: 3000 });
                break;
            case 'claude_session_ended':
                notifications.warning(message, { title: 'Claude Session' });
                break;
            case 'terminal_session_ended':
                notifications.warning(message, { title: 'Terminal Session' });
                break;
            default:
                notifications.info(message, { title: title || 'Notification' });
        }
    }
    
    handleClaudeNotification(notification) {
        // Check if notifications are enabled before showing
        if (!notifications.isNotificationEnabled()) {
            return;
        }
        
        const { sessionId, projectName, message, title, timestamp } = notification;
        
        
        // Show in-app notification
        notifications.warning(message, { 
            title: title, 
            duration: 0 // Persistent notification
        });
        
        // Show browser notification if permission granted
        this.showBrowserNotification(title, message, projectName);
    }
    
    checkNotificationPermission() {
        if ('Notification' in window) {
            this.notificationPermission = Notification.permission;
        }
    }
    
    
    requestNotificationPermission() {
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                // Show a notification request dialog
                if (notifications.isNotificationEnabled()) {
                    notifications.info('Please allow browser notifications to receive important Claude Code messages', {
                        title: 'Notification Permission Request',
                        duration: 0
                    });
                }
                
                Notification.requestPermission().then(permission => {
                    this.notificationPermission = permission;
                    
                    if (permission === 'granted' && notifications.isNotificationEnabled()) {
                        notifications.success('Browser notifications enabled! You can now receive notifications even when away from the page', {
                            title: 'Notification Permission Granted',
                            duration: 3000
                        });
                        
                        // Test notification
                        this.showBrowserNotification('Claude Code Web Manager', 'Browser notifications enabled!', 'System');
                    } else if (permission === 'denied' && notifications.isNotificationEnabled()) {
                        notifications.warning('Browser notifications denied. You can manually enable notifications in browser settings', {
                            title: 'Notification Permission Denied',
                            duration: 5000
                        });
                    }
                });
            } else {
                this.notificationPermission = Notification.permission;
            }
        }
    }
    
    showBrowserNotification(title, message, projectName) {
        // Check if notifications are enabled
        if (!notifications.isNotificationEnabled()) {
            return;
        }
        
        if ('Notification' in window && this.notificationPermission === 'granted') {
            const notificationTitle = title;
            const notificationOptions = {
                body: message,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'claude-notification',
                requireInteraction: true,
                timestamp: Date.now()
            };
            
            const notification = new Notification(notificationTitle, notificationOptions);
            
            notification.onclick = () => {
                // Focus the window
                window.focus();
                notification.close();
            };
            
            // Auto-close after 10 seconds
            setTimeout(() => {
                notification.close();
            }, 10000);
        }
    }
    
    // Connection methods
    connect() {
        if (this.socket.disconnected) {
            this.socket.connect();
        }
    }
    
    disconnect() {
        if (this.socket.connected) {
            this.socket.disconnect();
        }
    }
    
    isConnected() {
        return this.socket && this.socket.connected;
    }
    
    getConnectionStatus() {
        return this.connectionStatus;
    }
    
    // Project methods
    joinProject(projectId) {
        if (!this.isConnected()) {
            console.warn('Cannot join project: not connected to server');
            return false;
        }
        
        this.currentProject = projectId;
        this.socket.emit('join-project', { projectId });
        return true;
    }
    
    leaveProject(projectId = null) {
        if (!this.isConnected()) {
            console.warn('Cannot leave project: not connected to server');
            return false;
        }
        
        const targetProjectId = projectId || this.currentProject;
        if (targetProjectId) {
            this.socket.emit('leave-project', { projectId: targetProjectId });
            
            if (targetProjectId === this.currentProject) {
                this.currentProject = null;
            }
        }
        return true;
    }
    
    getCurrentProject() {
        return this.currentProject;
    }
    
    
    // Claude Code methods
    sendClaudeCommand(projectId, command, context = {}) {
        if (!this.isConnected()) {
            console.warn('Cannot send Claude command: not connected to server');
            return false;
        }
        
        this.socket.emit('claude-command', { projectId, command, context });
        return true;
    }
    
    // Project action methods
    sendProjectAction(projectId, action, payload = {}) {
        if (!this.isConnected()) {
            console.warn('Cannot send project action: not connected to server');
            return false;
        }
        
        this.socket.emit('project-action', { projectId, action, payload });
        return true;
    }
    
    startClaude(projectId, options = {}) {
        return this.sendProjectAction(projectId, 'start_claude', options);
    }
    
    stopClaude(projectId, force = false) {
        return this.sendProjectAction(projectId, 'stop_claude', { force });
    }
    
    // Utility methods
    getSocket() {
        return this.socket;
    }
    
    // Event handler shortcuts
    
    onClaudeResponse(callback) {
        return this.on('claude_response', callback);
    }
    
    onProjectStatus(callback) {
        return this.on('project_status', callback);
    }
    
    onSystemStatus(callback) {
        return this.on('system_status', callback);
    }
    
    onNotification(callback) {
        return this.on('notification', callback);
    }
    
    onConnected(callback) {
        return this.on('connected', callback);
    }
    
    onDisconnected(callback) {
        return this.on('disconnected', callback);
    }
    
    onReconnected(callback) {
        return this.on('reconnected', callback);
    }
    
    onConnectionError(callback) {
        return this.on('connection_error', callback);
    }
    
    // Authentication methods (if needed)
    authenticate(token) {
        if (this.socket) {
            this.socket.auth = { token };
            if (this.socket.connected) {
                this.socket.disconnect().connect();
            }
        }
    }
    
    // Debugging methods
    enableDebugLogs() {
        this.socket.on('connect', () => {});
        this.socket.on('disconnect', (reason) => {});
        this.socket.onAny((event, ...args) => {
        });
    }
    
    getDebugInfo() {
        return {
            connected: this.isConnected(),
            status: this.connectionStatus,
            currentProject: this.currentProject,
            reconnectAttempts: this.reconnectAttempts,
            socketId: this.socket?.id,
            transport: this.socket?.io?.engine?.transport?.name
        };
    }
    
    // Project connection state management
    isProjectReady(projectId) {
        const state = this.projectStates.get(projectId);
        return state && state.status === 'ready';
    }
    
    ensureProjectConnection(projectId, callback, timeout = 5000) {
        const state = this.projectStates.get(projectId) || { 
            status: 'disconnected', 
            readyCallbacks: [], 
            lastActivity: Date.now() 
        };
        
        this.projectStates.set(projectId, state);
        
        if (state.status === 'ready') {
            callback();
            return;
        }
        
        // Add callback to queue
        if (callback) {
            state.readyCallbacks.push({
                callback,
                timestamp: Date.now(),
                timeout: setTimeout(() => {
                    console.error(`Project connection timeout for ${projectId}`);
                    this.emit('error', new Error(`Project connection timeout: ${projectId}`));
                }, timeout)
            });
        }
        
        // If already connecting, just wait
        if (state.status === 'connecting') {
            return;
        }
        
        // Start connection process
        state.status = 'connecting';
        
        this.joinProject(projectId);
        
        // Set a backup timeout to mark as ready if no confirmation received
        setTimeout(() => {
            if (state.status === 'connecting') {
                this.markProjectReady(projectId);
            }
        }, 2000);
    }
    
    markProjectReady(projectId) {
        const state = this.projectStates.get(projectId);
        if (!state) return;
        
        state.status = 'ready';
        state.lastActivity = Date.now();
        
        
        // Execute queued callbacks
        while (state.readyCallbacks.length > 0) {
            const { callback, timeout } = state.readyCallbacks.shift();
            clearTimeout(timeout);
            try {
                callback();
            } catch (error) {
                console.error('Error executing ready callback:', error);
            }
        }
        
    }
    
    markProjectDisconnected(projectId) {
        const state = this.projectStates.get(projectId);
        if (state) {
            state.status = 'disconnected';
            // Clear any pending callbacks
            while (state.readyCallbacks.length > 0) {
                const { timeout } = state.readyCallbacks.shift();
                clearTimeout(timeout);
            }
        }
    }
}

// Error handling for WebSocket events
class SocketErrorHandler {
    constructor(socketClient) {
        this.client = socketClient;
        this.setupErrorHandling();
    }
    
    setupErrorHandling() {
        // Handle specific error types
        this.client.on('server_error', (error) => {
            this.handleServerError(error);
        });
        
        this.client.on('connection_error', (error) => {
            this.handleConnectionError(error);
        });
        
        // Global error handler
        window.addEventListener('unhandledrejection', (event) => {
            if (event.reason && event.reason.message) {
                console.error('Unhandled promise rejection:', event.reason);
                this.handleGenericError(event.reason);
            }
        });
    }
    
    handleServerError(error) {
        if (!notifications.isNotificationEnabled()) {
            return;
        }
        
        const { code, message, details } = error;
        
        switch (code) {
            case 'UNAUTHORIZED':
                notifications.error('Authentication required. Please login again.');
                // Redirect to login or show auth modal
                break;
            case 'PROJECT_NOT_FOUND':
                notifications.error('Project not found. It may have been deleted.');
                break;
            case 'CLAUDE_SESSION_FAILED':
                notifications.error('Failed to start Claude session. Please try again.');
                break;
            case 'TERMINAL_CREATE_FAILED':
                notifications.error('Failed to create terminal session.');
                break;
            case 'SYSTEM_OVERLOAD':
                notifications.warning('System is overloaded. Please wait and try again.');
                break;
            default:
                notifications.error(message || 'An error occurred on the server.');
        }
    }
    
    handleConnectionError(error) {
        console.error('Connection error:', error);
        
        if (!notifications.isNotificationEnabled()) {
            return;
        }
        
        if (error.message.includes('ECONNREFUSED')) {
            notifications.error('Cannot connect to server. Please check if the server is running.');
        } else if (error.message.includes('timeout')) {
            notifications.warning('Connection timeout. Please check your internet connection.');
        } else {
            notifications.error('Connection error occurred. Trying to reconnect...');
        }
    }
    
    handleGenericError(error) {
        console.error('Generic error:', error);
        // Only show notification for critical errors
        if ((error.message.includes('socket') || error.message.includes('connection')) && notifications.isNotificationEnabled()) {
            notifications.error('A connection error occurred.');
        }
    }
}

// Heartbeat monitor to ensure connection health
class ConnectionMonitor {
    constructor(socketClient) {
        this.client = socketClient;
        this.heartbeatInterval = null;
        this.lastPong = Date.now();
        this.pingTimeout = 120000; // 120 seconds
        
        this.setupMonitoring();
    }
    
    setupMonitoring() {
        this.client.on('connected', () => {
            this.startHeartbeat();
        });
        
        this.client.on('disconnected', () => {
            this.stopHeartbeat();
        });
        
        // Listen for pong responses
        this.client.getSocket().on('pong', () => {
            this.lastPong = Date.now();
        });
    }
    
    startHeartbeat() {
        this.stopHeartbeat(); // Clear any existing interval
        
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastPong = now - this.lastPong;
            
            if (timeSinceLastPong > this.pingTimeout) {
                // Log connection issue but DO NOT force disconnect for persistent terminal sessions
                console.warn('⚠️ Connection heartbeat timeout detected, but preserving connection for terminal persistence');
                // Reset lastPong to prevent repeated warnings
                this.lastPong = now;
            }
            
            // Always send ping regardless of timeout status
            this.client.getSocket().emit('ping');
        }, 60000); // Check every 60 seconds
    }
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}

// Initialize socket client
const socketClient = new SocketClient();
const socketErrorHandler = new SocketErrorHandler(socketClient);
const connectionMonitor = new ConnectionMonitor(socketClient);

// Make socket client globally available
window.socket = socketClient;

// Export for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SocketClient, SocketErrorHandler, ConnectionMonitor };
}