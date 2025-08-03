/**
 * Monaco Editor Manager - Manages Monaco Editor integration with Git diff support
 */

class MonacoEditorManager {
    constructor() {
        this.editor = null;
        this.currentFile = null;
        this.originalContent = null;
        this.initialContent = null; // Store initial content for unsaved changes detection
        this.isEditorReady = false;
        this.decorations = []; // Track current decorations
        this.isNewFile = false; // Track if current file is new
        this.inGitRepo = true; // Track if current file is in Git repository (default true for backward compatibility)
        this.modelCache = new Map(); // Cache models to avoid recreation
        this.isOperationInProgress = false; // Prevent concurrent operations
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.ensureModalHidden();
        this.setupThemeListeners();
        this.setupGlobalErrorHandling();
    }

    ensureModalHidden() {
        // Ensure modal is hidden on initialization
        const modal = document.getElementById('monaco-editor-modal');
        const overlay = document.getElementById('monaco-editor-overlay');
        
        if (modal && overlay) {
            modal.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            console.warn('Monaco Editor modal elements not found during initialization');
        }
    }

    setupEventListeners() {
        // Close editor button
        const closeBtn = document.getElementById('close-editor-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.handleCloseAttempt());
        }

        // Save file button  
        const saveBtn = document.getElementById('save-file-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveFile());
        }

        // Close editor with overlay click (but not modal content click)
        const overlay = document.getElementById('monaco-editor-overlay');
        const modal = document.getElementById('monaco-editor-modal');
        if (overlay && modal) {
            overlay.addEventListener('click', (e) => {
                // Only close if clicking the overlay itself, not the modal content
                if (e.target === overlay) {
                    this.handleCloseAttempt();
                }
            });
            
            // Prevent modal content clicks from bubbling to overlay
            modal.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (this.isEditorOpen()) {
                if (event.ctrlKey && event.key === 's') {
                    event.preventDefault();
                    this.saveFile();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    this.handleCloseAttempt();
                }
            }
        });
    }

    setupThemeListeners() {
        // Listen for theme changes from the application
        document.addEventListener('themeChanged', async (event) => {
            const theme = event.detail?.theme || await this.getCurrentTheme();
            this.updateEditorTheme(theme);
        });
    }
    
    /**
     * Setup global error handling for Monaco Editor specific errors
     */
    setupGlobalErrorHandling() {
        // Global error handling is available but currently disabled
    }

    async getCurrentTheme() {
        // Get current theme from backend API, default to 'light'
        try {
            const response = await HTTP.get('/api/theme');
            if (response.success) {
                return response.theme;
            } else {
                console.warn('Failed to get theme from server:', response.error);
                return 'light'; // fallback
            }
        } catch (error) {
            console.warn('Failed to get theme from server:', error.message);
            return 'light'; // fallback
        }
    }

    getMonacoTheme(appTheme) {
        // Map application theme to Monaco Editor theme
        return appTheme === 'dark' ? 'vs-dark' : 'vs';
    }

    updateEditorTheme(appTheme) {
        // Update Monaco Editor theme if editor exists
        if (this.editor && typeof monaco !== 'undefined') {
            const monacoTheme = this.getMonacoTheme(appTheme);
            monaco.editor.setTheme(monacoTheme);
        }
    }

    async initializeMonaco() {
        if (this.isEditorReady) return;

        return new Promise(async (resolve, reject) => {
            // Check if Monaco is already loaded
            if (typeof monaco !== 'undefined') {
                await this.createEditorInstance();
                resolve();
                return;
            }

            require.config({
                paths: { 
                    vs: '/node_modules/monaco-editor/min/vs' 
                }
            });

            // Configure Monaco environment for web workers  
            self.MonacoEnvironment = {
                getWorkerUrl: function (moduleId, label) {
                    if (label === 'json') {
                        return '/node_modules/monaco-editor/min/vs/language/json/jsonWorker.js';
                    }
                    if (label === 'css' || label === 'scss' || label === 'less') {
                        return '/node_modules/monaco-editor/min/vs/language/css/cssWorker.js';
                    }
                    if (label === 'html' || label === 'handlebars' || label === 'razor') {
                        return '/node_modules/monaco-editor/min/vs/language/html/htmlWorker.js';
                    }
                    if (label === 'typescript' || label === 'javascript') {
                        return '/node_modules/monaco-editor/min/vs/language/typescript/tsWorker.js';
                    }
                    return '/node_modules/monaco-editor/min/vs/base/worker/workerMain.js';
                }
            };

            require(['vs/editor/editor.main'], () => {
                try {
                    // Wait a bit to ensure Monaco is fully loaded
                    setTimeout(async () => {
                        if (typeof monaco === 'undefined') {
                            reject(new Error('Monaco failed to load'));
                            return;
                        }

                        await this.createEditorInstance();
                        resolve();
                    }, 100);
                } catch (error) {
                    console.error('Failed to initialize Monaco Editor:', error);
                    reject(error);
                }
            });
        });
    }

    async createEditorInstance() {
        try {
            
            // Get current theme for Monaco Editor
            const currentTheme = await this.getCurrentTheme();
            const monacoTheme = this.getMonacoTheme(currentTheme);
            
            // Check if Monaco Editor container exists
            const container = document.getElementById('monaco-editor');
            
            // Create Monaco Editor instance
            this.editor = monaco.editor.create(container, {
                value: '',
                language: 'plaintext',
                theme: monacoTheme,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                minimap: { enabled: true },
                wordWrap: 'on',
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                folding: true,
                glyphMargin: true,
                lineDecorationsWidth: 10,
                renderLineHighlight: 'all',
                fontSize: 14,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace'
            });
            

            // Add editor change listener for diff updates and unsaved changes indicator
            this.editor.onDidChangeModelContent(() => {
                // Use setTimeout to avoid conflicts and ensure stability
                setTimeout(() => {
                    try {
                        if (this.editor && this.editor.getModel() && !this.isOperationInProgress) {
                            this.updateDiffDecorations();
                            this.updateUnsavedChangesIndicator();
                        }
                    } catch (error) {
                        // Silently handle errors during content changes to avoid noise
                        console.debug('Content change handler error (non-critical):', error.message);
                    }
                }, 50);
            });

            this.isEditorReady = true;
        } catch (error) {
            console.error('❌ Failed to create Monaco Editor instance:', error);
            throw error;
        }
    }

    async openFile(filePath, fileName) {
        // Prevent concurrent file operations
        if (this.isOperationInProgress) {
            return;
        }
        
        this.isOperationInProgress = true;
        
        try {
            // Reset state for new file
            this.isNewFile = false;
            this.originalContent = null;
            this.initialContent = null;
            this.inGitRepo = true;

            // Initialize Monaco if not ready BEFORE loading file
            if (!this.isEditorReady) {
                await this.initializeMonaco();
            }

            // Ensure Monaco is really ready
            if (!this.editor || typeof monaco === 'undefined') {
                throw new Error('Monaco Editor not properly initialized');
            }

            // Load and validate file content BEFORE showing modal
            const content = await this.loadFileContent(filePath);
            
            // Load Git original content for diff
            this.originalContent = await this.loadGitOriginalContent(filePath);

            // If we get here, file loading was successful - now show editor
            this.updateEditorHeader(fileName);
            this.showEditor();

            // Update current file info
            this.currentFile = { path: filePath, name: fileName };

            // Store initial content for unsaved changes detection
            this.initialContent = content;

            // Set editor content and language
            const language = this.getLanguageFromFileName(fileName);
            
            // Use single-model approach to avoid disposal issues
            try {
                
                // Ensure monaco is available
                if (typeof monaco !== 'undefined' && monaco.editor) {
                    // Get or create a single persistent model
                    let model = this.editor.getModel();
                    
                    if (!model) {
                        model = monaco.editor.createModel('', 'plaintext');
                        this.editor.setModel(model);
                    }
                    
                    
                    // Update model content without creating new model
                    model.setValue(content);
                    
                    // Update language
                    monaco.editor.setModelLanguage(model, language);
                    
                    
                } else {
                    throw new Error('Monaco editor not available');
                }
            } catch (modelError) {
                console.error('❌ Error in model update:', modelError);
                
                // Final fallback: direct setValue
                if (this.editor && this.editor.setValue) {
                    this.editor.setValue(content);
                } else {
                    throw new Error('Cannot set editor content: ' + modelError.message);
                }
            }

            // Apply initial diff decorations and update unsaved changes indicator
            // Use longer delay to ensure Monaco's services are stable
            setTimeout(() => {
                try {
                    if (this.editor && this.editor.getModel() && !this.isOperationInProgress) {
                        this.updateDiffDecorations();
                        this.updateUnsavedChangesIndicator();
                    }
                } catch (error) {
                    console.warn('Error applying initial decorations:', error);
                }
            }, 300);

        } catch (error) {
            console.error('❌ Failed to open file:', error);
            
            // Ensure modal is hidden on error
            this.hideModalOnError();
            
            // Show user-friendly error message
            alert('Failed to open file: ' + error.message);
        } finally {
            // Always reset operation flag
            this.isOperationInProgress = false;
        }
    }

    async loadFileContent(filePath) {
        try {
            const response = await fetch(`/api/filesystem/preview?path=${encodeURIComponent(filePath)}`);
            
            const data = await response.json();

            if (data.success && data.file && data.file.isText) {
                return data.file.content;
            } else {
                throw new Error('File is not readable or not a text file');
            }
        } catch (error) {
            console.error('❌ Error loading file content:', error);
            throw new Error('Failed to load file content: ' + error.message);
        }
    }

    async loadGitOriginalContent(filePath) {
        try {
            const response = await fetch(`/api/git/original-content/${encodeURIComponent(filePath)}`);
            const data = await response.json();

            if (data.success) {
                // Store Git repository status and new file flag
                this.inGitRepo = data.inGitRepo !== undefined ? data.inGitRepo : true;
                this.isNewFile = data.isNewFile || false;
                
                // If file is not in Git repository, return null to disable Git features
                if (!this.inGitRepo) {
                    return null;
                }
                
                return data.content || '';
            } else {
                this.inGitRepo = false;
                this.isNewFile = true;
                return null;
            }
        } catch (error) {
            console.warn('Could not load Git original content:', error);
            this.inGitRepo = false;
            this.isNewFile = true;
            return null;
        }
    }

    /**
     * DEPRECATED: This method is no longer used.
     * We now use a single persistent model approach to avoid disposal issues.
     */
    async safelyDisposeModel() {
    }
    
    /**
     * Check if an error is a Monaco Editor 'Canceled' error
     * @param {Error} error - The error to check
     * @returns {boolean} True if it's a Monaco canceled error
     */
    isMonacoCanceledError(error) {
        return error && (
            error.message === 'Canceled' ||
            error.message === 'Canceled: Canceled' ||
            (error.message && error.message.includes('Canceled')) ||
            error.name === 'Canceled'
        );
    }

    async saveFile() {
        if (!this.currentFile || !this.editor) {
            return;
        }

        try {
            const content = this.editor.getValue();
            
            const response = await fetch(`/api/filesystem/save`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: this.currentFile.path,
                    content: content
                })
            });

            const data = await response.json();

            if (data.success) {
                this.updateFileStatus('saved');
                
                // Update initial content to current content after successful save
                this.initialContent = content;
                
                // Reload Git original content for updated diff
                this.originalContent = await this.loadGitOriginalContent(this.currentFile.path);
                this.updateDiffDecorations();
                
            } else {
                throw new Error(data.message || 'Save failed');
            }

        } catch (error) {
            console.error('Failed to save file:', error);
            alert('Failed to save file: ' + error.message);
        }
    }

    updateDiffDecorations() {
        try {
            // Clear decorations if file is not in Git repository or no original content
            if (!this.editor || this.originalContent === null || !this.inGitRepo) {
                if (this.decorations.length > 0) {
                    this.decorations = this.editor.deltaDecorations(this.decorations, []);
                }
                return;
            }

            const currentContent = this.editor.getValue();
            const diff = this.computeDiff(this.originalContent, currentContent);
            
            // Apply decorations based on diff
            const newDecorations = this.createDecorations(diff);
            
            // Update decorations and track the new ones
            this.decorations = this.editor.deltaDecorations(this.decorations, newDecorations);
        } catch (error) {
            // Handle Monaco-specific 'Canceled' errors silently
            if (this.isMonacoCanceledError(error)) {
                console.debug('Diff decorations update was canceled, ignoring error:', error.message);
            } else {
                console.warn('Error updating diff decorations:', error);
                // Clear decorations on error to prevent stale state
                try {
                    if (this.editor && this.decorations.length > 0) {
                        this.decorations = this.editor.deltaDecorations(this.decorations, []);
                    }
                } catch (cleanupError) {
                    console.debug('Could not clean up decorations:', cleanupError.message);
                }
            }
        }
    }

    computeDiff(original, current) {
        const originalLines = original.split('\n');
        const currentLines = current.split('\n'); 
        const changes = [];

        // Special case: if this is a new file, mark all current lines as added
        if (this.isNewFile || original === '') {
            for (let i = 0; i < currentLines.length; i++) {
                if (currentLines[i].trim() !== '') { // Only mark non-empty lines
                    changes.push({ type: 'added', line: i + 1 });
                }
            }
            return changes;
        }

        // For existing files, perform line-by-line diff
        const maxLines = Math.max(originalLines.length, currentLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = originalLines[i];
            const currentLine = currentLines[i];
            
            if (originalLine === undefined && currentLine !== undefined) {
                // Added line
                changes.push({ type: 'added', line: i + 1 });
            } else if (originalLine !== undefined && currentLine === undefined) {
                // Deleted line - we can't show this in Monaco but we can track it
                changes.push({ type: 'deleted', line: i + 1 });
            } else if (originalLine !== currentLine) {
                // Modified line
                changes.push({ type: 'modified', line: i + 1 });
            }
        }

        return changes;
    }

    hasUnsavedChanges() {
        try {
            // Return false if no editor or no initial content to compare with
            if (!this.editor || this.initialContent === null) {
                return false;
            }

            const currentContent = this.editor.getValue();
            
            // Normalize line endings for comparison
            const normalizeContent = (content) => {
                return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            };

            return normalizeContent(currentContent) !== normalizeContent(this.initialContent);
        } catch (error) {
            // Handle Monaco-specific 'Canceled' errors silently
            if (this.isMonacoCanceledError(error)) {
                console.debug('Unsaved changes check was canceled:', error.message);
                return false; // Assume no unsaved changes if we can't check
            } else {
                console.warn('Error checking for unsaved changes:', error);
                return false; // Assume no unsaved changes on error to prevent blocking operations
            }
        }
    }

    createDecorations(changes) {
        const decorations = [];

        // Ensure Monaco is available before creating decorations
        if (typeof monaco === 'undefined' || !monaco.Range) {
            console.warn('Monaco not available for creating decorations');
            return decorations;
        }

        changes.forEach(change => {
            try {
                // Skip deleted lines as they don't exist in current content
                if (change.type === 'deleted') {
                    return;
                }

                const decoration = {
                    range: new monaco.Range(change.line, 1, change.line, Number.MAX_SAFE_INTEGER),
                    options: {}
                };

                switch (change.type) {
                    case 'added':
                        decoration.options = {
                            isWholeLine: true,
                            className: 'git-diff-added-line',
                            glyphMarginClassName: 'git-diff-added-glyph',
                            marginClassName: 'git-diff-added-margin',
                            glyphMarginHoverMessage: { value: 'Added line' }
                        };
                        break;
                    case 'modified':
                        decoration.options = {
                            isWholeLine: true,
                            className: 'git-diff-modified-line',
                            glyphMarginClassName: 'git-diff-modified-glyph', 
                            marginClassName: 'git-diff-modified-margin',
                            glyphMarginHoverMessage: { value: 'Modified line' }
                        };
                        break;
                }

                decorations.push(decoration);
            } catch (error) {
                // Skip individual decoration creation errors
                console.debug('Error creating decoration for line', change.line, ':', error.message);
            }
        });

        return decorations;
    }

    getLanguageFromFileName(fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        
        const languageMap = {
            // JavaScript/TypeScript
            'js': 'javascript',
            'mjs': 'javascript', 
            'jsx': 'javascript',
            'javascript': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'typescript': 'typescript',
            
            // Python
            'py': 'python',
            'python': 'python',
            
            // Web languages
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'less': 'less',
            
            // Data formats  
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'csv': 'plaintext',
            'sql': 'sql',
            
            // Documentation
            'md': 'markdown',
            'markdown': 'markdown',
            
            // Programming languages
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'cc': 'cpp',
            'cxx': 'cpp',
            'h': 'c',
            'hpp': 'cpp',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            
            // Shell scripts
            'sh': 'shell',
            'bash': 'shell',
            'zsh': 'shell',
            'fish': 'shell',
            'ps1': 'powershell',
            'bat': 'bat',
            'cmd': 'bat',
            
            // Config files
            'conf': 'plaintext',
            'config': 'plaintext',
            'ini': 'ini',
            'env': 'plaintext',
            'properties': 'properties',
            'gitignore': 'plaintext',
            'gitattributes': 'plaintext',
            'editorconfig': 'plaintext',
            
            // Plain text and logs
            'txt': 'plaintext',
            'log': 'plaintext',
            'rst': 'plaintext',
            'adoc': 'plaintext',
            'asciidoc': 'plaintext'
        };

        return languageMap[ext] || 'plaintext';
    }

    updateEditorHeader(fileName) {
        const titleElement = document.querySelector('#monaco-editor-title .file-name');
        if (titleElement) {
            titleElement.textContent = fileName;
        }

        const iconElement = document.querySelector('#monaco-editor-title .file-icon');
        if (iconElement) {
            const iconName = this.getFileIcon(fileName);
            iconElement.innerHTML = `<img src="/assets/icons/${iconName}.svg" alt="${iconName}" class="icon" style="width: 14px; height: 14px;">`;
        }
    }

    getFileIcon(fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        
        const iconMap = {
            'js': 'code',
            'ts': 'code',
            'py': 'code',
            'html': 'web',
            'css': 'css',
            'json': 'json',
            'md': 'document'
        };

        return iconMap[ext] || 'document';
    }

    updateUnsavedChangesIndicator() {
        try {
            const statusElement = document.querySelector('#monaco-editor-title .file-status');
            if (statusElement) {
                if (this.hasUnsavedChanges()) {
                    statusElement.textContent = '● Unsaved changes';
                    statusElement.style.color = '#ffc107'; // Yellow color to indicate unsaved changes
                } else {
                    // Only clear if it's showing unsaved changes (don't interfere with save confirmation)
                    if (statusElement.textContent === '● Unsaved changes') {
                        statusElement.textContent = '';
                        statusElement.style.color = '';
                    }
                }
            }
        } catch (error) {
            // Handle Monaco-specific 'Canceled' errors silently
            if (this.isMonacoCanceledError(error)) {
                console.debug('Unsaved changes indicator update was canceled:', error.message);
            } else {
                console.warn('Error updating unsaved changes indicator:', error);
            }
        }
    }

    updateFileStatus(status) {
        const statusElement = document.querySelector('#monaco-editor-title .file-status');
        if (statusElement) {
            switch (status) {
                case 'saved':
                    statusElement.textContent = '✅ Saved';
                    statusElement.style.color = '#28a745'; // Green color for saved
                    setTimeout(() => {
                        // After showing saved message, update to current state
                        this.updateUnsavedChangesIndicator();
                    }, 2000);
                    break;
                case 'modified':
                    statusElement.textContent = '● Modified';
                    statusElement.style.color = '#ffc107'; // Yellow color for modified
                    break;
                default:
                    statusElement.textContent = '';
                    statusElement.style.color = '';
            }
        }
    }

    showEditor() {
        const modal = document.getElementById('monaco-editor-modal');
        const overlay = document.getElementById('monaco-editor-overlay');
        
        
        if (modal && overlay) {
            overlay.classList.add('active');
            modal.classList.add('active');
            
            // Focus editor
            if (this.editor) {
                this.editor.focus();
                
                // Force layout update
                setTimeout(() => {
                    if (this.editor) {
                        this.editor.layout();
                    }
                }, 100);
            }
        }
    }

    async handleCloseAttempt() {
        // Check if there are unsaved changes
        if (this.hasUnsavedChanges()) {
            const result = await this.showUnsavedChangesDialog();
            
            switch (result) {
                case 'save':
                    // Save file first, then close
                    try {
                        await this.saveFile();
                        this.closeEditor();
                    } catch (error) {
                        // If save fails, don't close the editor
                        console.error('Save failed, editor will remain open:', error);
                    }
                    break;
                case 'discard':
                    // Close without saving
                    this.closeEditor();
                    break;
                case 'cancel':
                    // Do nothing, keep editor open
                    break;
            }
        } else {
            // No unsaved changes, close directly
            this.closeEditor();
        }
    }

    showUnsavedChangesDialog() {
        return new Promise((resolve) => {
            const fileName = this.currentFile ? this.currentFile.name : 'this file';
            const message = `You have unsaved changes in ${fileName}.\n\nWhat would you like to do?`;
            
            // Create custom dialog with three options
            const result = confirm(message + '\n\nClick OK to SAVE and close, or Cancel to continue editing.');
            
            if (result) {
                // User clicked OK - they want to save
                resolve('save');
            } else {
                // User clicked Cancel - ask if they want to discard changes
                const discardResult = confirm('Do you want to close without saving? Your changes will be lost.\n\nClick OK to DISCARD changes and close, or Cancel to continue editing.');
                if (discardResult) {
                    resolve('discard');
                } else {
                    resolve('cancel');
                }
            }
        });
    }

    closeEditor() {
        
        const modal = document.getElementById('monaco-editor-modal');
        const overlay = document.getElementById('monaco-editor-overlay');
        
        if (modal && overlay) {
            modal.classList.remove('active');
            overlay.classList.remove('active');
        }

        // Clear decorations safely
        try {
            if (this.editor && this.decorations.length > 0) {
                this.decorations = this.editor.deltaDecorations(this.decorations, []);
            }
        } catch (error) {
            console.warn('Error clearing decorations during editor close:', error);
        }

        // Clear the persistent model content (but don't dispose the model)
        try {
            const model = this.editor?.getModel();
            if (model) {
                model.setValue('');
            }
        } catch (error) {
            console.warn('Error clearing model content:', error);
        }
        
        this.currentFile = null;
        this.originalContent = null;
        this.initialContent = null;
        this.isNewFile = false;
        this.inGitRepo = true;
    }

    hideModalOnError() {
        
        // Hide modal and overlay if they're visible
        const modal = document.getElementById('monaco-editor-modal');
        const overlay = document.getElementById('monaco-editor-overlay');
        
        if (modal && overlay) {
            modal.classList.remove('active');
            overlay.classList.remove('active');
        }

        // Clear any decorations safely
        try {
            if (this.editor && this.decorations.length > 0) {
                this.decorations = this.editor.deltaDecorations(this.decorations, []);
            }
        } catch (error) {
            console.warn('Error clearing decorations during error handling:', error);
        }

        // Reset state
        this.currentFile = null;
        this.originalContent = null;
        this.initialContent = null;
        this.isNewFile = false;
        this.inGitRepo = true;
    }

    isEditorOpen() {
        const modal = document.getElementById('monaco-editor-modal');
        return modal && modal.classList.contains('active');
    }
    
    /**
     * Get the current editor state for debugging
     * @returns {Object} Current state information
     */
    getEditorState() {
        return {
            isEditorReady: this.isEditorReady,
            isFileLoading: this.isFileLoading,
            hasCurrentFile: !!this.currentFile,
            hasAbortController: !!this.currentAbortController,
            isEditorOpen: this.isEditorOpen(),
            hasEditor: !!this.editor,
            decorationsCount: this.decorations.length
        };
    }
}

// Initialize Monaco Editor Manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.monacoEditorManager = new MonacoEditorManager();
    
    // Extra safety check: ensure modal is hidden after page load
    setTimeout(() => {
        const modal = document.getElementById('monaco-editor-modal');
        const overlay = document.getElementById('monaco-editor-overlay');
        
        if (modal && overlay) {
            if (modal.classList.contains('active') || overlay.classList.contains('active')) {
                console.warn('Monaco Editor modal was unexpectedly active on page load, forcing close');
                modal.classList.remove('active');
                overlay.classList.remove('active');
            }
        }
    }, 500); // Check after 500ms to ensure all scripts have loaded
});