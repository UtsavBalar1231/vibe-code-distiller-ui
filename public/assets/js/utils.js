// ===== UTILITY FUNCTIONS =====

/**
 * DOM Helper Functions
 */
const DOM = {
    // Get element by ID
    get: (id) => document.getElementById(id),
    
    // Query selector
    query: (selector) => document.querySelector(selector),
    
    // Query all
    queryAll: (selector) => document.querySelectorAll(selector),
    
    // Create element
    create: (tag, options = {}) => {
        const element = document.createElement(tag);
        if (options.className) element.className = options.className;
        if (options.id) element.id = options.id;
        if (options.text) element.textContent = options.text;
        if (options.html) element.innerHTML = options.html;
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        if (options.style) {
            Object.assign(element.style, options.style);
        }
        if (options.events) {
            Object.entries(options.events).forEach(([event, handler]) => {
                element.addEventListener(event, handler);
            });
        }
        return element;
    },
    
    // Add event listener
    on: (element, event, handler, options = {}) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            element.addEventListener(event, handler, options);
        }
    },
    
    // Remove event listener
    off: (element, event, handler) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            element.removeEventListener(event, handler);
        }
    },
    
    // Show element
    show: (element) => {
        console.log('DOM.show called with:', element);
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            console.log('DOM.show processing element:', element, 'isModal:', element.classList && element.classList.contains('modal'));
            // Special handling for modal elements
            if (element.classList && element.classList.contains('modal')) {
                console.log('Setting modal display styles...');
                element.style.display = 'flex';
                element.style.opacity = '';
                element.style.visibility = '';
                console.log('Modal styles set to:', {
                    display: element.style.display,
                    opacity: element.style.opacity,
                    visibility: element.style.visibility
                });
            } else {
                element.style.display = '';
            }
        } else {
            console.error('DOM.show: element not found');
        }
    },
    
    // Hide element
    hide: (element) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            // Special handling for modal elements
            if (element.classList && element.classList.contains('modal')) {
                element.style.opacity = '0';
                element.style.visibility = 'hidden';
                // Don't set display: none for modals, let CSS handle it
            } else {
                element.style.display = 'none';
            }
        }
    },
    
    // Toggle element visibility
    toggle: (element) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            element.style.display = element.style.display === 'none' ? '' : 'none';
        }
    },
    
    // Add class
    addClass: (element, className) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            element.classList.add(className);
        }
    },
    
    // Remove class
    removeClass: (element, className) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            element.classList.remove(className);
        }
    },
    
    // Toggle class
    toggleClass: (element, className) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        if (element) {
            element.classList.toggle(className);
        }
    },
    
    // Check if has class
    hasClass: (element, className) => {
        if (typeof element === 'string') {
            // Check if it's an ID selector (without #) or CSS selector
            if (element.includes('#') || element.includes('.') || element.includes(' ') || element.includes('>')) {
                // Use query selector for complex selectors
                element = DOM.query(element);
            } else {
                // Use getElementById for simple ID strings
                element = DOM.get(element);
            }
        }
        return element ? element.classList.contains(className) : false;
    }
};

/**
 * Event Emitter Class
 */
class EventEmitter {
    constructor() {
        this.events = {};
    }
    
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        return this;
    }
    
    off(event, callback) {
        if (!this.events[event]) return this;
        
        if (callback) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        } else {
            delete this.events[event];
        }
        return this;
    }
    
    emit(event, ...args) {
        if (!this.events[event]) return this;
        
        this.events[event].forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
                console.error('Error in event callback:', error);
            }
        });
        return this;
    }
    
    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    }
}

/**
 * Local Storage Helper
 */
const Storage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
            return false;
        }
    },
    
    get: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Failed to read from localStorage:', error);
            return defaultValue;
        }
    },
    
    remove: (key) => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Failed to remove from localStorage:', error);
            return false;
        }
    },
    
    clear: () => {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Failed to clear localStorage:', error);
            return false;
        }
    },
    
    has: (key) => {
        return localStorage.getItem(key) !== null;
    }
};

/**
 * HTTP Request Helper
 */
const HTTP = {
    async request(url, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        const config = { ...defaultOptions, ...options };
        
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }
        
        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error('HTTP request failed:', error);
            throw error;
        }
    },
    
    get: (url, options = {}) => HTTP.request(url, { ...options, method: 'GET' }),
    post: (url, data, options = {}) => HTTP.request(url, { ...options, method: 'POST', body: data }),
    put: (url, data, options = {}) => HTTP.request(url, { ...options, method: 'PUT', body: data }),
    delete: (url, options = {}) => HTTP.request(url, { ...options, method: 'DELETE' })
};

/**
 * Notification System
 */
class NotificationManager {
    constructor() {
        this.container = DOM.get('notification-container');
        this.notifications = new Map();
        this.nextId = 1;
        this.isEnabled = Storage.get('notifications-enabled', false);
        this.pendingNotifications = [];
        this.init();
    }
    
    init() {
        this.updateVisibility();
        this.setupToggle();
    }
    
    setupToggle() {
        const toggleBtn = DOM.get('notification-toggle');
        if (toggleBtn) {
            DOM.on(toggleBtn, 'click', async () => {
                await this.toggle();
            });
        }
    }
    
    async toggle() {
        const previousState = this.isEnabled;
        this.isEnabled = !this.isEnabled;
        this.updateVisibility();
        Storage.set('notifications-enabled', this.isEnabled);
        
        try {
            // Update all projects' notification settings
            const response = await HTTP.put('/api/projects/notification-settings', {
                enabled: this.isEnabled
            });
            
            if (!response.success) {
                throw new Error(response.message || 'Failed to update notification settings');
            }
            
            if (!this.isEnabled) {
                // Clear all current notifications when disabled
                this.clear();
                this.pendingNotifications = [];
            } else {
                // When enabling notifications, test browser notification capability
                this.testBrowserNotifications();
            }
            
            // Sync with settings modal checkbox
            this.syncSettingsCheckbox();
            
        } catch (error) {
            console.error('Failed to update notification settings:', error);
            
            // Revert state on error
            this.isEnabled = previousState;
            this.updateVisibility();
            Storage.set('notifications-enabled', this.isEnabled);
            
            // Show error notification to user
            this.add({
                id: 'notification-settings-error',
                title: 'Settings Error',
                message: 'Failed to update notification settings. Please try again.',
                type: 'error',
                duration: 5000
            });
        }
    }
    
    testBrowserNotifications() {
        // Test browser notification capability when notifications are enabled
        if (typeof window.socket !== 'undefined' && window.socket.showBrowserNotification) {
            const testResult = window.socket.showBrowserNotification(
                'Claude Code Notifications Enabled', 
                'Notifications are now active. You will receive alerts for important Claude Code events.',
                'System Test'
            );
            
            if (testResult.success) {
                // Browser notification test succeeded
                this.success('Browser notifications are working correctly!', {
                    title: 'Notification Test',
                    duration: 3000
                });
            } else {
                // Browser notification test failed, handle based on error type
                switch (testResult.error) {
                    case 'PERMISSION_REQUIRED':
                        // Request permission for browser notifications
                        this.handleBrowserPermissionRequest();
                        break;
                        
                    case 'PERMISSION_DENIED':
                        this.warning(
                            'Browser notifications are blocked. You may miss important Claude Code notifications. Please enable them in browser settings.', 
                            {
                                title: 'Browser Notifications Blocked',
                                duration: 0 // Persistent until manually closed
                            }
                        );
                        break;
                        
                    case 'UNSUPPORTED':
                        this.warning(
                            'Browser notifications are not supported. You will only see in-app notifications for Claude Code events.',
                            {
                                title: 'Browser Notifications Unavailable',
                                duration: 8000
                            }
                        );
                        break;
                        
                    case 'CREATE_FAILED':
                    default:
                        this.error(
                            `Browser notification test failed: ${testResult.message}. You may miss Claude Code notifications if this issue is not resolved.`,
                            {
                                title: 'Browser Notification Error',
                                duration: 0 // Persistent until manually closed
                            }
                        );
                        break;
                }
            }
        } else {
            // Socket client not available, show basic success message
            this.success('In-app notifications are now enabled!', {
                title: 'Notifications Enabled',
                duration: 3000
            });
        }
    }
    
    handleBrowserPermissionRequest() {
        // Request browser notification permission through socket client
        if (typeof window.socket !== 'undefined' && window.socket.requestNotificationPermission) {
            this.info('Requesting browser notification permission...', {
                title: 'Permission Request',
                duration: 3000
            });
            
            // Use the existing permission request method
            window.socket.requestNotificationPermission();
        } else {
            // Fallback: manual permission request
            if ('Notification' in window) {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        this.success('Browser notifications enabled successfully!', {
                            title: 'Permission Granted',
                            duration: 3000
                        });
                        
                        // Test again after permission granted
                        setTimeout(() => this.testBrowserNotifications(), 1000);
                    } else {
                        this.warning(
                            'Browser notification permission was denied. You will miss important Claude Code notifications unless you enable them manually in browser settings.',
                            {
                                title: 'Permission Denied',
                                duration: 0
                            }
                        );
                    }
                });
            }
        }
    }
    
    updateVisibility() {
        const toggleBtn = DOM.get('notification-toggle');
        if (this.container) {
            if (this.isEnabled) {
                DOM.removeClass(this.container, 'hidden');
            } else {
                DOM.addClass(this.container, 'hidden');
            }
        }
        
        if (toggleBtn) {
            const textElement = toggleBtn.querySelector('.text');
            const iconElement = toggleBtn.querySelector('.icon');
            if (textElement) {
                textElement.textContent = this.isEnabled ? 'Notifications: Enabled' : 'Notifications: Disabled';
            }
            if (iconElement) {
                iconElement.textContent = this.isEnabled ? '🔔' : '🔕';
            }
            toggleBtn.title = this.isEnabled ? 'Disable notifications' : 'Enable notifications';
        }
    }
    
    
    isNotificationEnabled() {
        return this.isEnabled;
    }
    
    syncSettingsCheckbox() {
        // Update settings modal toggle switch if it exists
        const settingsToggle = DOM.get('notifications-toggle');
        const settingsCheckbox = DOM.get('notifications-enabled');
        if (settingsToggle && settingsCheckbox) {
            settingsCheckbox.checked = this.isEnabled;
            settingsToggle.classList.toggle('active', this.isEnabled);
        }
    }
    
    show(message, type = 'info', options = {}) {
        // If notifications are disabled, don't show anything
        if (!this.isEnabled) {
            return null;
        }
        
        const id = this.nextId++;
        const notification = this.createNotification(id, message, type, options);
        
        this.container.appendChild(notification);
        this.notifications.set(id, notification);
        
        // Trigger animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Auto dismiss
        if (options.duration !== 0) {
            const duration = options.duration || 5000;
            setTimeout(() => {
                this.hide(id);
            }, duration);
        }
        
        return id;
    }
    
    createNotification(id, message, type, options) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const notification = DOM.create('div', {
            className: `notification ${type}`,
            attributes: { 'data-id': id }
        });
        
        const icon = DOM.create('div', {
            className: 'notification-icon',
            text: icons[type] || icons.info
        });
        
        const content = DOM.create('div', {
            className: 'notification-content'
        });
        
        if (options.title) {
            const title = DOM.create('div', {
                className: 'notification-title',
                text: options.title
            });
            content.appendChild(title);
        }
        
        const messageEl = DOM.create('div', {
            className: 'notification-message',
            text: message
        });
        content.appendChild(messageEl);
        
        const closeBtn = DOM.create('button', {
            className: 'notification-close',
            text: '×',
            events: {
                click: () => this.hide(id)
            }
        });
        
        notification.appendChild(icon);
        notification.appendChild(content);
        notification.appendChild(closeBtn);
        
        // Progress bar for auto-dismiss
        if (options.duration && options.duration > 0) {
            const progress = DOM.create('div', {
                className: 'notification-progress',
                style: { width: '100%' }
            });
            notification.appendChild(progress);
            
            // Animate progress bar
            setTimeout(() => {
                progress.style.transition = `width ${options.duration}ms linear`;
                progress.style.width = '0%';
            }, 10);
        }
        
        return notification;
    }
    
    hide(id) {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                this.notifications.delete(id);
            }, 300);
        }
    }
    
    clear() {
        this.notifications.forEach((notification, id) => {
            this.hide(id);
        });
    }
    
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }
    
    error(message, options = {}) {
        return this.show(message, 'error', options);
    }
    
    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }
    
    info(message, options = {}) {
        return this.show(message, 'info', options);
    }
}

/**
 * Modal Manager
 */
class ModalManager {
    constructor() {
        this.activeModal = null;
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Close modal on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
                this.close();
            }
        });
        
        // Close modal on close button click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close')) {
                this.close();
            }
        });
        
        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.close();
            }
        });
    }
    
    open(modalId) {
        console.log('ModalManager.open called with:', modalId);
        const modal = DOM.get(modalId);
        console.log('Modal element found:', modal);
        
        if (modal) {
            console.log('Modal current style before open:', {
                display: modal.style.display,
                opacity: modal.style.opacity,
                visibility: modal.style.visibility,
                classes: modal.className
            });
            
            if (this.activeModal) {
                console.log('Closing existing modal:', this.activeModal);
                this.close();
            }
            
            this.activeModal = modal;
            console.log('Calling DOM.show...');
            DOM.show(modal);
            
            console.log('Modal style after DOM.show:', {
                display: modal.style.display,
                opacity: modal.style.opacity,
                visibility: modal.style.visibility,
                classes: modal.className
            });
            
            setTimeout(() => {
                console.log('Adding active class...');
                modal.classList.add('active');
                console.log('Modal style after adding active class:', {
                    display: modal.style.display,
                    opacity: modal.style.opacity,
                    visibility: modal.style.visibility,
                    classes: modal.className
                });
            }, 10);
            
            // Focus first input
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                firstInput.focus();
            }
        } else {
            console.error('Modal element not found:', modalId);
        }
    }
    
    close() {
        if (this.activeModal) {
            this.activeModal.classList.remove('active');
            setTimeout(() => {
                DOM.hide(this.activeModal);
                this.activeModal = null;
            }, 300);
        }
    }
    
    isOpen() {
        return this.activeModal !== null;
    }
}


/**
 * Utility Functions
 */
const Utils = {
    // Debounce function
    debounce: (func, wait, immediate = false) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    },
    
    // Throttle function
    throttle: (func, limit) => {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // Format bytes
    formatBytes: (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },
    
    // Format time duration
    formatDuration: (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    },
    
    // Format date
    formatDate: (date) => {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        return date.toLocaleString();
    },
    
    // Generate unique ID
    generateId: () => {
        return Math.random().toString(36).substr(2, 9);
    },
    
    // Escape HTML
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // Copy to clipboard
    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    },
    
    // Check if element is in viewport
    isInViewport: (element) => {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    },
    
    // Smooth scroll to element
    scrollToElement: (element, options = {}) => {
        if (typeof element === 'string') {
            element = DOM.query(element);
        }
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                ...options
            });
        }
    },
    
    // Wait for specified time
    wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
};

/**
 * Keyboard Shortcuts Manager
 */
class KeyboardManager {
    constructor() {
        this.shortcuts = new Map();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            const key = this.getKeyString(e);
            
            // Skip if key is null/undefined
            if (!key) {
                return;
            }
            
            const handler = this.shortcuts.get(key);
            
            if (handler) {
                e.preventDefault();
                handler(e);
            }
        });
    }
    
    getKeyString(event) {
        const parts = [];
        
        if (event.ctrlKey) parts.push('ctrl');
        if (event.altKey) parts.push('alt');
        if (event.shiftKey) parts.push('shift');
        if (event.metaKey) parts.push('meta');
        
        // Handle undefined or null key values
        if (event.key && typeof event.key === 'string') {
            parts.push(event.key.toLowerCase());
        } else {
            // Fallback for undefined keys
            console.warn('⚠️ Undefined key in keyboard event:', event);
            return null;
        }
        
        return parts.join('+');
    }
    
    register(shortcut, handler) {
        this.shortcuts.set(shortcut.toLowerCase(), handler);
    }
    
    unregister(shortcut) {
        this.shortcuts.delete(shortcut.toLowerCase());
    }
    
    clear() {
        this.shortcuts.clear();
    }
}

// Global instances
window.notifications = new NotificationManager();
window.modals = new ModalManager();
window.keyboard = new KeyboardManager();

// Make utilities globally available
window.DOM = DOM;
window.Storage = Storage;
window.HTTP = HTTP;
window.Utils = Utils;
window.EventEmitter = EventEmitter;