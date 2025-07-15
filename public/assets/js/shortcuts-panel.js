/**
 * Shortcuts Panel - Floating keyboard shortcuts reference panel
 * Provides easy access to keyboard shortcuts and commands
 */

class ShortcutsPanel {
    constructor() {
        this.panel = null;
        this.triggerArea = null;
        this.isExpanded = false;
        this.isPinned = false;
        this.showTimer = null;
        this.hideTimer = null;
        this.hoverDelay = 300; // ms
        this.hideDelay = 1000; // ms
        
        // Drag functionality
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.currentPosition = { top: 80, right: 0 }; // Default position
        
        this.init();
    }

    init() {
        this.panel = DOM.get('shortcuts-panel');
        this.triggerArea = DOM.get('shortcuts-trigger-area');
        
        if (!this.panel) {
            console.warn('Shortcuts panel element not found');
            return;
        }
        
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        
        // Check if panel should be enabled based on settings
        if (this.isEnabled()) {
            this.enable();
        } else {
            this.disable();
        }
    }

    setupEventListeners() {
        // Toggle button click
        const toggleBtn = DOM.get('shortcuts-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }
        
        // Pin button click
        const pinBtn = DOM.get('shortcuts-pin-btn');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => this.togglePin());
        }
        
        // Panel hover events
        this.panel.addEventListener('mouseenter', () => this.handlePanelMouseEnter());
        this.panel.addEventListener('mouseleave', () => this.handlePanelMouseLeave());
        
        // Trigger area hover events
        if (this.triggerArea) {
            this.triggerArea.addEventListener('mouseenter', () => this.handleTriggerMouseEnter());
            this.triggerArea.addEventListener('mouseleave', () => this.handleTriggerMouseLeave());
        }
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Handle theme changes
        document.addEventListener('themeChanged', () => this.handleThemeChange());
        
        // Setup drag functionality
        this.setupDragHandlers();
    }

    setupKeyboardShortcuts() {
        // F1 to toggle shortcuts panel
        keyboard.register('f1', (e) => {
            e.preventDefault();
            this.toggle();
        });
        
        // Escape to hide panel (only if not pinned)
        keyboard.register('escape', () => {
            if (this.isExpanded && !this.isPinned) {
                this.hide();
            }
        });
    }

    activateTriggerArea() {
        if (this.triggerArea) {
            this.triggerArea.classList.add('active');
        }
    }

    toggle() {
        if (this.isExpanded) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        if (this.isExpanded) return;
        
        this.clearHideTimer();
        this.isExpanded = true;
        
        this.panel.classList.remove('collapsed');
        this.panel.classList.add('expanded');
        
        // Update toggle icon
        const toggleIcon = this.panel.querySelector('.shortcuts-toggle-icon');
        if (toggleIcon) {
            toggleIcon.textContent = '▶';
        }
        
        // Focus management for accessibility
        this.panel.setAttribute('aria-hidden', 'false');
        
        // Send analytics event
        this.sendEvent('shortcuts_panel_shown');
    }

    hide() {
        if (!this.isExpanded || this.isPinned) return;
        
        this.clearShowTimer();
        this.isExpanded = false;
        
        this.panel.classList.remove('expanded');
        this.panel.classList.add('collapsed');
        
        // Update toggle icon
        const toggleIcon = this.panel.querySelector('.shortcuts-toggle-icon');
        if (toggleIcon) {
            toggleIcon.textContent = '◀';
        }
        
        // Focus management for accessibility
        this.panel.setAttribute('aria-hidden', 'true');
        
        // Send analytics event
        this.sendEvent('shortcuts_panel_hidden');
    }

    togglePin() {
        this.isPinned = !this.isPinned;
        
        const pinBtn = DOM.get('shortcuts-pin-btn');
        if (pinBtn) {
            if (this.isPinned) {
                pinBtn.classList.add('pinned');
                pinBtn.title = 'Unpin panel';
                this.panel.classList.add('pinned');
                this.show(); // Ensure panel is shown when pinned
            } else {
                pinBtn.classList.remove('pinned');
                pinBtn.title = 'Pin panel';
                this.panel.classList.remove('pinned');
            }
        }
        
        // Send analytics event
        this.sendEvent('shortcuts_panel_pinned', { pinned: this.isPinned });
    }

    handlePanelMouseEnter() {
        this.clearHideTimer();
        if (!this.isExpanded) {
            this.show();
        }
    }

    handlePanelMouseLeave() {
        if (!this.isPinned) {
            this.startHideTimer();
        }
    }

    handleTriggerMouseEnter() {
        this.startShowTimer();
    }

    handleTriggerMouseLeave() {
        this.clearShowTimer();
        if (!this.isPinned && this.isExpanded) {
            this.startHideTimer();
        }
    }

    startShowTimer() {
        this.clearShowTimer();
        this.showTimer = setTimeout(() => {
            this.show();
        }, this.hoverDelay);
    }

    clearShowTimer() {
        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }

    startHideTimer() {
        this.clearHideTimer();
        this.hideTimer = setTimeout(() => {
            this.hide();
        }, this.hideDelay);
    }

    clearHideTimer() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    handleResize() {
        // Handle responsive behavior on window resize
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile && this.isExpanded && !this.isPinned) {
            // Auto-hide on mobile unless pinned
            this.hide();
        }
    }

    handleThemeChange() {
        // Theme changes are handled via CSS, but we can add any JS-specific logic here
        this.sendEvent('shortcuts_panel_theme_changed');
    }

    // Utility method to send events for analytics or other listeners
    sendEvent(eventName, data = {}) {
        const event = new CustomEvent(eventName, {
            detail: { ...data, timestamp: Date.now() }
        });
        document.dispatchEvent(event);
    }

    // Public API methods for external access
    isVisible() {
        return this.isExpanded;
    }

    isPinnedState() {
        return this.isPinned;
    }

    // Method to add custom shortcuts programmatically
    addShortcut(section, command, description) {
        const sectionEl = this.panel.querySelector(`[data-section="${section}"]`);
        if (!sectionEl) {
            console.warn(`Section "${section}" not found in shortcuts panel`);
            return;
        }
        
        const shortcutsList = sectionEl.querySelector('.shortcuts-list');
        if (shortcutsList) {
            const shortcutItem = DOM.create('div', {
                className: 'shortcut-item',
                html: `
                    <span class="shortcut-command">${command}</span>
                    <span class="shortcut-description">${description}</span>
                `
            });
            shortcutsList.appendChild(shortcutItem);
        }
    }

    // Method to update existing shortcuts
    updateShortcut(command, newDescription) {
        const commandEl = Array.from(this.panel.querySelectorAll('.shortcut-command'))
            .find(el => el.textContent.trim() === command);
        
        if (commandEl) {
            const descriptionEl = commandEl.parentElement.querySelector('.shortcut-description');
            if (descriptionEl) {
                descriptionEl.textContent = newDescription;
            }
        }
    }

    // Setup drag handlers for panel repositioning
    setupDragHandlers() {
        const header = this.panel.querySelector('.shortcuts-header');
        if (!header) return;

        // Load saved position
        const savedPosition = Storage.get('shortcuts-panel-position');
        if (savedPosition) {
            this.currentPosition = savedPosition;
            this.updatePanelPosition();
        }

        // Mouse events
        header.addEventListener('mousedown', (e) => this.handleDragStart(e));
        document.addEventListener('mousemove', (e) => this.handleDragMove(e));
        document.addEventListener('mouseup', () => this.handleDragEnd());

        // Touch events for mobile
        header.addEventListener('touchstart', (e) => this.handleDragStart(e.touches[0]), { passive: false });
        document.addEventListener('touchmove', (e) => this.handleDragMove(e.touches[0]), { passive: false });
        document.addEventListener('touchend', () => this.handleDragEnd());
    }

    handleDragStart(e) {
        if (!this.isExpanded) return;
        
        this.isDragging = true;
        const header = this.panel.querySelector('.shortcuts-header');
        if (header) {
            header.classList.add('dragging');
        }

        const rect = this.panel.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        e.preventDefault();
    }

    handleDragMove(e) {
        if (!this.isDragging) return;

        const windowHeight = window.innerHeight;
        const panelHeight = this.panel.offsetHeight;
        
        // Calculate new position (constrained to window bounds)
        let newTop = e.clientY - this.dragOffset.y;
        
        // Constrain to window bounds
        newTop = Math.max(0, Math.min(newTop, windowHeight - panelHeight));
        
        this.currentPosition.top = newTop;
        this.updatePanelPosition();

        e.preventDefault();
    }

    handleDragEnd() {
        if (!this.isDragging) return;

        this.isDragging = false;
        const header = this.panel.querySelector('.shortcuts-header');
        if (header) {
            header.classList.remove('dragging');
        }

        // Save position
        Storage.set('shortcuts-panel-position', this.currentPosition);
        
        this.sendEvent('shortcuts_panel_moved', { position: this.currentPosition });
    }

    updatePanelPosition() {
        this.panel.style.top = `${this.currentPosition.top}px`;
    }

    // Reset panel position to default
    resetPosition() {
        this.currentPosition = { top: 80, right: 0 };
        this.updatePanelPosition();
        Storage.remove('shortcuts-panel-position');
    }

    // Enable the shortcuts panel
    enable() {
        if (this.panel) {
            this.panel.style.display = 'flex';
            this.activateTriggerArea();
            Storage.set('shortcuts-panel-enabled', true);
        }
        if (this.triggerArea) {
            this.triggerArea.style.display = 'block';
        }
    }

    // Disable the shortcuts panel
    disable() {
        if (this.panel) {
            this.panel.style.display = 'none';
            this.hide(); // Hide if currently expanded
            Storage.set('shortcuts-panel-enabled', false);
        }
        if (this.triggerArea) {
            this.triggerArea.style.display = 'none';
        }
    }

    // Check if panel is enabled
    isEnabled() {
        return Storage.get('shortcuts-panel-enabled', true);
    }

    // Cleanup method
    destroy() {
        this.clearShowTimer();
        this.clearHideTimer();
        
        // Remove keyboard shortcuts
        keyboard.unregister('f1');
        keyboard.unregister('escape');
        
        // Remove event listeners
        if (this.triggerArea) {
            this.triggerArea.classList.remove('active');
        }
        
        this.sendEvent('shortcuts_panel_destroyed');
    }
}

// Initialize shortcuts panel when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.shortcutsPanel = new ShortcutsPanel();
});

// Make shortcutsPanel globally available for external access
window.ShortcutsPanel = ShortcutsPanel;