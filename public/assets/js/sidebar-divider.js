/**
 * Sidebar Divider - Resizable panels functionality
 */
class SidebarDivider {
    constructor() {
        this.divider = null;
        this.projectsPanel = null;
        this.imagesPanel = null;
        this.sidebar = null;
        this.isDragging = false;
        this.startY = 0;
        this.startHeight = 0;
        this.minHeight = 100;
        this.maxHeight = 0;
        
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
        this.divider = document.getElementById('sidebar-divider');
        this.sidebar = document.getElementById('sidebar');
        
        if (!this.divider || !this.sidebar) {
            console.warn('Sidebar divider elements not found');
            return;
        }
        
        // Get the sidebar panels
        const panels = this.sidebar.querySelectorAll('.sidebar-panel');
        if (panels.length >= 2) {
            this.projectsPanel = panels[0];
            this.imagesPanel = panels[1];
        } else {
            console.warn('Expected 2 sidebar panels, found:', panels.length);
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
        this.divider.addEventListener('touchstart', (e) => this.handleTouchStart(e), {passive: false});
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e), {passive: false});
        document.addEventListener('touchend', () => this.stopDrag(), {passive: false});
        document.addEventListener('touchcancel', () => this.stopDrag(), {passive: false});
        
        // Prevent text selection during drag
        this.divider.addEventListener('selectstart', (e) => e.preventDefault());
    }
    
    startDrag(event) {
        this.isDragging = true;
        this.startY = event.clientY;
        
        // Get current height of projects panel
        const rect = this.projectsPanel.getBoundingClientRect();
        this.startHeight = rect.height;
        
        // Calculate max height (total sidebar height minus minimums)
        const sidebarRect = this.sidebar.getBoundingClientRect();
        const dividerHeight = this.divider.getBoundingClientRect().height;
        this.maxHeight = sidebarRect.height - this.minHeight - dividerHeight - 20; // 20px for padding
        
        // Add dragging class for visual feedback
        this.divider.classList.add('dragging');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        
        event.preventDefault();
    }
    
    drag(event) {
        if (!this.isDragging) return;
        
        const deltaY = event.clientY - this.startY;
        let newHeight = this.startHeight + deltaY;
        
        // Constrain within bounds
        newHeight = Math.max(this.minHeight, Math.min(newHeight, this.maxHeight));
        
        // Apply the new height
        this.projectsPanel.style.flex = `0 0 ${newHeight}px`;
        
        event.preventDefault();
    }
    
    stopDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.divider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Save the current state
        this.saveState();
    }
    
    handleTouchStart(event) {
        // Check if touch event has valid touch points
        if (!event.touches || event.touches.length === 0) {
            console.warn('TouchStart event has no touch points');
            return;
        }
        
        try {
            this.startDrag(event.touches[0]);
        } catch (error) {
            console.error('Error in touch start:', error);
        }
    }
    
    handleTouchMove(event) {
        // Only process if we're dragging and have valid touch points
        if (!this.isDragging) return;
        
        if (!event.touches || event.touches.length === 0) {
            // No touch points, stop dragging
            this.stopDrag();
            return;
        }
        
        try {
            this.drag(event.touches[0]);
        } catch (error) {
            console.error('Error in touch move:', error);
            this.stopDrag();
        }
    }
    
    saveState() {
        if (!this.projectsPanel) return;
        
        const rect = this.projectsPanel.getBoundingClientRect();
        const height = rect.height;
        
        try {
            localStorage.setItem('sidebar-projects-panel-height', height.toString());
        } catch (error) {
            console.warn('Failed to save sidebar state:', error);
        }
    }
    
    loadSavedState() {
        try {
            const savedHeight = localStorage.getItem('sidebar-projects-panel-height');
            if (savedHeight && !isNaN(parseFloat(savedHeight))) {
                const height = parseFloat(savedHeight);
                this.projectsPanel.style.flex = `0 0 ${height}px`;
            }
        } catch (error) {
            console.warn('Failed to load sidebar state:', error);
        }
    }
    
    resetToDefault() {
        if (this.projectsPanel) {
            this.projectsPanel.style.flex = '0 0 250px';
            this.saveState();
        }
    }
}

// Initialize the sidebar divider when the script loads
const sidebarDivider = new SidebarDivider();

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SidebarDivider;
}