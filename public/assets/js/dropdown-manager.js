/**
 * Global Dropdown Menu Manager
 * Handles all dropdown menus in the application with unified hide logic
 * Solves iframe event bubbling isolation issues
 */
class DropdownManager {
    constructor() {
        this.activeDropdowns = new Map();
        this.isInitialized = false;
        
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        
        // Main document click listener
        document.addEventListener('click', (e) => {
            this.handleDocumentClick(e);
        }, true); // Use capture phase
        
        // Window blur (focus lost)
        window.addEventListener('blur', () => {
            this.hideAllDropdowns();
        });
        
        // Iframe focus detection
        this.setupIframeFocusDetection();
        
        // Keyboard escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllDropdowns();
            }
        });
        
        this.isInitialized = true;
        console.log('✅ DropdownManager initialized');
    }
    
    /**
     * Register a dropdown menu
     * @param {string} id - Unique identifier for the dropdown
     * @param {HTMLElement} element - The dropdown element
     * @param {HTMLElement} trigger - The trigger button element
     * @param {Function} hideCallback - Optional custom hide callback
     */
    register(id, element, trigger, hideCallback = null) {
        if (!id || !element) {
            console.warn('DropdownManager: Invalid dropdown registration');
            return;
        }
        
        this.activeDropdowns.set(id, {
            element,
            trigger,
            hideCallback,
            isVisible: false
        });
        
        console.log(`📋 Dropdown registered: ${id}`);
    }
    
    /**
     * Show a dropdown menu
     * @param {string} id - Dropdown identifier
     */
    show(id) {
        const dropdown = this.activeDropdowns.get(id);
        if (!dropdown) {
            console.warn(`DropdownManager: Dropdown ${id} not found`);
            return;
        }
        
        // Hide all other dropdowns first
        this.hideAllDropdowns(id);
        
        // Show the requested dropdown
        dropdown.isVisible = true;
        dropdown.element.style.display = 'block';
        dropdown.element.classList.add('active');
        
        console.log(`👁️ Dropdown shown: ${id}`);
    }
    
    /**
     * Hide a specific dropdown menu
     * @param {string} id - Dropdown identifier
     */
    hide(id) {
        const dropdown = this.activeDropdowns.get(id);
        if (!dropdown || !dropdown.isVisible) {
            return;
        }
        
        dropdown.isVisible = false;
        dropdown.element.style.display = 'none';
        dropdown.element.classList.remove('active');
        
        // Call custom hide callback if provided
        if (dropdown.hideCallback && typeof dropdown.hideCallback === 'function') {
            dropdown.hideCallback();
        }
        
        console.log(`🙈 Dropdown hidden: ${id}`);
    }
    
    /**
     * Hide all dropdown menus
     * @param {string} exceptId - Optional dropdown ID to exclude from hiding
     */
    hideAllDropdowns(exceptId = null) {
        let hiddenCount = 0;
        
        this.activeDropdowns.forEach((dropdown, id) => {
            if (id !== exceptId && dropdown.isVisible) {
                this.hide(id);
                hiddenCount++;
            }
        });
        
        if (hiddenCount > 0) {
            console.log(`🙈 Hidden ${hiddenCount} dropdown(s)`);
        }
    }
    
    /**
     * Unregister a dropdown menu
     * @param {string} id - Dropdown identifier
     */
    unregister(id) {
        if (this.activeDropdowns.has(id)) {
            this.hide(id);
            this.activeDropdowns.delete(id);
            console.log(`❌ Dropdown unregistered: ${id}`);
        }
    }
    
    /**
     * Check if a dropdown is currently visible
     * @param {string} id - Dropdown identifier
     * @returns {boolean}
     */
    isVisible(id) {
        const dropdown = this.activeDropdowns.get(id);
        return dropdown ? dropdown.isVisible : false;
    }
    
    /**
     * Handle document click events
     * @param {Event} e - Click event
     */
    handleDocumentClick(e) {
        let shouldHideAll = true;
        
        // Check if click is on any registered dropdown or its trigger
        this.activeDropdowns.forEach((dropdown, id) => {
            if (!dropdown.isVisible) return;
            
            // Check if click is within dropdown element
            if (dropdown.element && dropdown.element.contains(e.target)) {
                shouldHideAll = false;
                return;
            }
            
            // Check if click is on trigger element
            if (dropdown.trigger && dropdown.trigger.contains(e.target)) {
                shouldHideAll = false;
                return;
            }
        });
        
        if (shouldHideAll) {
            this.hideAllDropdowns();
        }
    }
    
    /**
     * Setup iframe focus detection to handle iframe click events
     */
    setupIframeFocusDetection() {
        // Find terminal iframe
        const terminalIframe = document.getElementById('ttyd-terminal');
        if (!terminalIframe) {
            console.log('ℹ️ Terminal iframe not found, skipping iframe focus detection');
            return;
        }
        
        // Method 1: Monitor iframe focus
        terminalIframe.addEventListener('focus', () => {
            console.log('🎯 Terminal iframe focused, hiding dropdowns');
            this.hideAllDropdowns();
        });
        
        // Method 2: Monitor iframe load and setup internal click listener if possible
        terminalIframe.addEventListener('load', () => {
            try {
                // Try to access iframe content (may be blocked by same-origin policy)
                const iframeDoc = terminalIframe.contentDocument || terminalIframe.contentWindow?.document;
                if (iframeDoc) {
                    iframeDoc.addEventListener('click', () => {
                        console.log('🎯 Click inside terminal iframe, hiding dropdowns');
                        this.hideAllDropdowns();
                    });
                    console.log('✅ Terminal iframe click listener added');
                } else {
                    console.log('ℹ️ Cannot access iframe content (cross-origin), using alternative method');
                }
            } catch (error) {
                console.log('ℹ️ Cannot access iframe content due to security policy, using focus detection');
            }
        });
        
        // Method 3: Monitor window focus changes (when user clicks iframe, window may lose/regain focus)
        let lastFocusedElement = document.activeElement;
        setInterval(() => {
            const currentFocused = document.activeElement;
            if (currentFocused !== lastFocusedElement) {
                if (currentFocused === terminalIframe) {
                    console.log('🎯 Terminal iframe now focused, hiding dropdowns');
                    this.hideAllDropdowns();
                }
                lastFocusedElement = currentFocused;
            }
        }, 200); // Check every 200ms
        
        console.log('✅ Iframe focus detection setup complete');
    }
    
    /**
     * Get all registered dropdown IDs
     * @returns {Array<string>}
     */
    getAllDropdownIds() {
        return Array.from(this.activeDropdowns.keys());
    }
    
    /**
     * Get debug information
     * @returns {Object}
     */
    getDebugInfo() {
        const dropdowns = {};
        this.activeDropdowns.forEach((dropdown, id) => {
            dropdowns[id] = {
                isVisible: dropdown.isVisible,
                hasElement: !!dropdown.element,
                hasTrigger: !!dropdown.trigger,
                hasCallback: !!dropdown.hideCallback
            };
        });
        
        return {
            totalDropdowns: this.activeDropdowns.size,
            dropdowns,
            isInitialized: this.isInitialized
        };
    }
}

// Create global instance
const dropdownManager = new DropdownManager();

// Make it globally available
window.dropdownManager = dropdownManager;

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DropdownManager, dropdownManager };
}