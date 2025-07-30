/**
 * Monaco Editor Manager - Manages Monaco Editor integration with Git diff support
 */

class MonacoEditorManager {
    constructor() {
        this.editor = null;
        this.currentFile = null;
        this.originalContent = null;
        this.isEditorReady = false;
        this.decorations = []; // Track current decorations
        this.isNewFile = false; // Track if current file is new
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.ensureModalHidden();
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
            closeBtn.addEventListener('click', () => this.closeEditor());
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
                    this.closeEditor();
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
                    this.closeEditor();
                }
            }
        });
    }

    async initializeMonaco() {
        if (this.isEditorReady) return;

        return new Promise((resolve, reject) => {
            // Check if Monaco is already loaded
            if (typeof monaco !== 'undefined') {
                this.createEditorInstance();
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
                    setTimeout(() => {
                        if (typeof monaco === 'undefined') {
                            reject(new Error('Monaco failed to load'));
                            return;
                        }

                        this.createEditorInstance();
                        resolve();
                    }, 100);
                } catch (error) {
                    console.error('Failed to initialize Monaco Editor:', error);
                    reject(error);
                }
            });
        });
    }

    createEditorInstance() {
        try {
            // Create Monaco Editor instance
            this.editor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: '',
                language: 'plaintext',
                theme: 'vs-dark',
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

            // Add editor change listener for diff updates
            this.editor.onDidChangeModelContent(() => {
                this.updateDiffDecorations();
            });

            this.isEditorReady = true;
        } catch (error) {
            console.error('Failed to create Monaco Editor instance:', error);
            throw error;
        }
    }

    async openFile(filePath, fileName) {
        try {
            
            // Reset state for new file
            this.isNewFile = false;
            this.originalContent = null;
            
            // Show editor first with loading state
            this.updateEditorHeader(fileName);
            this.showEditor();

            // Initialize Monaco if not ready
            if (!this.isEditorReady) {
                await this.initializeMonaco();
            }

            // Ensure Monaco is really ready
            if (!this.editor || typeof monaco === 'undefined') {
                throw new Error('Monaco Editor not properly initialized');
            }

            // Load file content
            const content = await this.loadFileContent(filePath);
            
            // Load Git original content for diff
            this.originalContent = await this.loadGitOriginalContent(filePath);

            // Update current file info
            this.currentFile = { path: filePath, name: fileName };

            // Set editor content and language
            const language = this.getLanguageFromFileName(fileName);
            
            // Create or update model with error handling
            try {
                let model = this.editor.getModel();
                if (model) {
                    model.dispose();
                }
                
                // Ensure monaco is available before creating model
                if (typeof monaco !== 'undefined' && monaco.editor) {
                    model = monaco.editor.createModel(content, language);
                    this.editor.setModel(model);
                } else {
                    throw new Error('Monaco editor not available');
                }
            } catch (modelError) {
                console.error('Error creating Monaco model:', modelError);
                // Fallback: try to set value directly
                if (this.editor && this.editor.setValue) {
                    this.editor.setValue(content);
                } else {
                    throw new Error('Cannot set editor content: ' + modelError.message);
                }
            }

            // Apply initial diff decorations
            setTimeout(() => this.updateDiffDecorations(), 100);

        } catch (error) {
            console.error('Failed to open file:', error);
            alert('Failed to open file: ' + error.message);
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
            throw new Error('Failed to load file content: ' + error.message);
        }
    }

    async loadGitOriginalContent(filePath) {
        try {
            const response = await fetch(`/api/git/original-content/${encodeURIComponent(filePath)}`);
            const data = await response.json();

            if (data.success) {
                // Store whether this is a new file for diff display
                this.isNewFile = data.isNewFile || false;
                return data.content || '';
            } else {
                this.isNewFile = true;
                return '';
            }
        } catch (error) {
            console.warn('Could not load Git original content:', error);
            this.isNewFile = true;
            return '';
        }
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
        if (!this.editor || this.originalContent === null) {
            // Clear decorations if no original content
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

    createDecorations(changes) {
        const decorations = [];

        changes.forEach(change => {
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
        });

        return decorations;
    }

    getLanguageFromFileName(fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        
        const languageMap = {
            'js': 'javascript',
            'javascript': 'javascript',
            'ts': 'typescript',
            'typescript': 'typescript',
            'py': 'python',
            'python': 'python',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'less': 'less',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'markdown': 'markdown',
            'txt': 'plaintext',
            'log': 'plaintext'
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
            iconElement.textContent = this.getFileIcon(fileName);
        }
    }

    getFileIcon(fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        
        const iconMap = {
            'js': '📄',
            'ts': '📄',
            'py': '🐍',
            'html': '🌐',
            'css': '🎨',
            'json': '📋',
            'md': '📝'
        };

        return iconMap[ext] || '📄';
    }

    updateFileStatus(status) {
        const statusElement = document.querySelector('#monaco-editor-title .file-status');
        if (statusElement) {
            switch (status) {
                case 'saved':
                    statusElement.textContent = '✅ Saved';
                    setTimeout(() => {
                        statusElement.textContent = '';
                    }, 2000);
                    break;
                case 'modified':
                    statusElement.textContent = '● Modified';
                    break;
                default:
                    statusElement.textContent = '';
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
            }
        }
    }

    closeEditor() {
        const modal = document.getElementById('monaco-editor-modal');
        const overlay = document.getElementById('monaco-editor-overlay');
        
        if (modal && overlay) {
            modal.classList.remove('active');
            overlay.classList.remove('active');
        }

        // Clear decorations
        if (this.editor && this.decorations.length > 0) {
            this.decorations = this.editor.deltaDecorations(this.decorations, []);
        }

        this.currentFile = null;
        this.originalContent = null;
        this.isNewFile = false;
    }

    isEditorOpen() {
        const modal = document.getElementById('monaco-editor-modal');
        return modal && modal.classList.contains('active');
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