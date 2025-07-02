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
            element.style.display = '';
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
            element.style.display = 'none';
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
    }
    
    show(message, type = 'info', options = {}) {
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
        const modal = DOM.get(modalId);
        if (modal) {
            if (this.activeModal) {
                this.close();
            }
            
            this.activeModal = modal;
            DOM.show(modal);
            setTimeout(() => {
                modal.classList.add('active');
            }, 10);
            
            // Focus first input
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                firstInput.focus();
            }
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
 * Theme Manager
 */
class ThemeManager {
    constructor() {
        this.currentTheme = Storage.get('theme', 'dark');
        this.applyTheme(this.currentTheme);
    }
    
    applyTheme(theme) {
        document.body.className = document.body.className.replace(/theme-\w+/g, '');
        document.body.classList.add(`theme-${theme}`);
        this.currentTheme = theme;
        Storage.set('theme', theme);
        
        // Update theme toggle button
        const themeToggle = DOM.get('theme-toggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('.icon');
            if (icon) {
                icon.textContent = theme === 'dark' ? '☀️' : '🌙';
            }
        }
    }
    
    toggle() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
    }
    
    getTheme() {
        return this.currentTheme;
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
    
    // Validate email
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    // Parse query string
    parseQuery: (queryString = window.location.search) => {
        const params = new URLSearchParams(queryString);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },
    
    // Build query string
    buildQuery: (params) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                searchParams.append(key, value);
            }
        });
        return searchParams.toString();
    }
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
        
        parts.push(event.key.toLowerCase());
        
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
window.theme = new ThemeManager();
window.keyboard = new KeyboardManager();

// Make utilities globally available
window.DOM = DOM;
window.Storage = Storage;
window.HTTP = HTTP;
window.Utils = Utils;
window.EventEmitter = EventEmitter;