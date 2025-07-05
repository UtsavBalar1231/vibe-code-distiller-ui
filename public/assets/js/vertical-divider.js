/**
 * Vertical Divider - Resizable sidebar functionality
 */
class VerticalDivider {
    constructor() {
        this.divider = null;
        this.sidebar = null;
        this.mainContent = null;
        this.appBody = null;
        this.isDragging = false;
        this.startX = 0;
        this.startWidth = 0;
        this.minWidth = 200;
        this.maxWidth = 600;
        
        this.init();
    }
    
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupElements());
        } else {
            this.setupElements();
        }
    }
    
    setupElements() {
        this.divider = document.getElementById('vertical-divider');
        this.sidebar = document.getElementById('sidebar');
        this.mainContent = document.querySelector('.main-content');
        this.appBody = document.querySelector('.app-body');
        
        if (!this.divider || !this.sidebar || !this.mainContent || !this.appBody) {
            console.warn('Vertical divider elements not found');
            return;
        }
        
        this.attachEventListeners();
        this.loadSavedState();
    }
    
    attachEventListeners() {
        // Mouse events
        this.divider.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.stopDrag());
        
        // Touch events for mobile
        this.divider.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
        document.addEventListener('touchmove', (e) => this.drag(e.touches[0]));
        document.addEventListener('touchend', () => this.stopDrag());
        
        // Prevent text selection during drag
        this.divider.addEventListener('selectstart', (e) => e.preventDefault());
        
        // Window resize handler
        window.addEventListener('resize', () => this.handleWindowResize());
    }
    
    startDrag(event) {
        this.isDragging = true;
        this.startX = event.clientX;
        
        // Get current width of sidebar
        const rect = this.sidebar.getBoundingClientRect();
        this.startWidth = rect.width;
        
        // Calculate max width based on window size
        this.maxWidth = Math.min(600, window.innerWidth * 0.6);
        
        // Add dragging class for visual feedback
        this.divider.classList.add('dragging');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        
        // Add overlay to prevent issues with iframes
        this.addDragOverlay();
        
        event.preventDefault();
    }
    
    drag(event) {
        if (!this.isDragging) return;
        
        const deltaX = event.clientX - this.startX;
        let newWidth = this.startWidth + deltaX;
        
        // Constrain within bounds
        newWidth = Math.max(this.minWidth, Math.min(newWidth, this.maxWidth));
        
        // Apply the new width
        this.sidebar.style.width = `${newWidth}px`;
        
        // Update CSS variable for responsive design
        document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        
        event.preventDefault();
    }
    
    stopDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.divider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Remove drag overlay
        this.removeDragOverlay();
        
        // Save the current state
        this.saveState();
    }
    
    addDragOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'drag-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: transparent;
            z-index: 9999;
            cursor: ew-resize;
        `;
        document.body.appendChild(overlay);
    }
    
    removeDragOverlay() {
        const overlay = document.getElementById('drag-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    handleWindowResize() {
        // Recalculate max width on window resize
        this.maxWidth = Math.min(600, window.innerWidth * 0.6);
        
        // Check if current width exceeds new max
        const currentWidth = this.sidebar.getBoundingClientRect().width;
        if (currentWidth > this.maxWidth) {
            this.sidebar.style.width = `${this.maxWidth}px`;
            document.documentElement.style.setProperty('--sidebar-width', `${this.maxWidth}px`);
            this.saveState();
        }
    }
    
    saveState() {
        if (!this.sidebar) return;
        
        const rect = this.sidebar.getBoundingClientRect();
        const width = rect.width;
        
        try {
            localStorage.setItem('sidebar-width', width.toString());
        } catch (error) {
            console.warn('Failed to save sidebar width state:', error);
        }
    }
    
    loadSavedState() {
        try {
            const savedWidth = localStorage.getItem('sidebar-width');
            if (savedWidth && !isNaN(parseFloat(savedWidth))) {
                let width = parseFloat(savedWidth);
                
                // Ensure width is within bounds
                this.maxWidth = Math.min(600, window.innerWidth * 0.6);
                width = Math.max(this.minWidth, Math.min(width, this.maxWidth));
                
                this.sidebar.style.width = `${width}px`;
                document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
            }
        } catch (error) {
            console.warn('Failed to load sidebar width state:', error);
        }
    }
    
    resetToDefault() {
        const defaultWidth = 300;
        this.sidebar.style.width = `${defaultWidth}px`;
        document.documentElement.style.setProperty('--sidebar-width', `${defaultWidth}px`);
        this.saveState();
    }
    
    // Public methods for external control
    setSidebarWidth(width) {
        if (typeof width !== 'number' || width < this.minWidth || width > this.maxWidth) {
            console.warn('Invalid sidebar width:', width);
            return;
        }
        
        this.sidebar.style.width = `${width}px`;
        document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
        this.saveState();
    }
    
    getSidebarWidth() {
        return this.sidebar ? this.sidebar.getBoundingClientRect().width : 0;
    }
    
    toggleSidebar() {
        const currentWidth = this.getSidebarWidth();
        if (currentWidth <= 50) {
            // Restore to saved width or default
            this.loadSavedState();
        } else {
            // Collapse to minimum
            this.setSidebarWidth(50);
        }
    }
}

// Initialize the vertical divider when the script loads
const verticalDivider = new VerticalDivider();

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VerticalDivider;
}