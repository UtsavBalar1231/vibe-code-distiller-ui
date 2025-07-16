// ===== TERMINAL INTEGRATION WITH XTERM.JS =====

class TerminalManager extends EventEmitter {
    constructor() {
        super();
        this.terminals = new Map();
        this.activeTerminal = null;
        this.terminalCounter = 0;
        this.container = DOM.get('terminal-content');
        this.tabsContainer = DOM.get('terminal-tabs');
        this.welcomeScreen = DOM.get('welcome-screen');
        this.isRestoringFromReconnect = false;
        
        this.setupTerminalControls();
        this.setupKeyboardShortcuts();
        
        // Listen for socket events
        socket.onTerminalOutput(this.handleTerminalOutput.bind(this));
        socket.onClaudeResponse(this.handleClaudeResponse.bind(this));
        socket.onProjectStatus(this.handleProjectStatus.bind(this));
        socket.socket.on('terminal_input_error', this.handleTerminalInputError.bind(this));
        
        // Tmux session events
        socket.socket.on('terminal:sessions-list', this.handleSessionsList.bind(this));
        socket.socket.on('terminal:session-attached', this.handleSessionAttached.bind(this));
        socket.socket.on('terminal:session-detached', this.handleSessionDetached.bind(this));
        socket.socket.on('terminal:session-created', (data) => {
            this.handleSessionCreated(data);
        });
        socket.socket.on('terminal:session-deleted', this.handleSessionDeleted.bind(this));
        
        
        // Error handling events
        socket.socket.on('error', this.handleSocketError.bind(this));
        socket.socket.on('connect_error', this.handleConnectionError.bind(this));
        socket.socket.on('disconnect', this.handleDisconnection.bind(this));
        
        // Connection recovery events
        socket.onReconnected(this.handleReconnection.bind(this));
        
        // Note: loadAllSessions will be called after DOM is ready
    }
    
    setupTerminalControls() {
        // Terminal control buttons have been removed as per UI simplification
        // Functionality is still available via keyboard shortcuts
    }
    
    setupKeyboardShortcuts() {
        keyboard.register('ctrl+`', () => {
            this.toggleTerminal();
        });
        
        keyboard.register('ctrl+shift+c', () => {
            this.clearActiveTerminal();
        });
        
        keyboard.register('ctrl+shift+t', () => {
            this.createTerminal();
        });
        
        keyboard.register('ctrl+shift+w', () => {
            this.closeActiveTerminal();
        });
        
        // Tab navigation
        keyboard.register('ctrl+tab', () => {
            this.switchToNextTerminal();
        });
        
        keyboard.register('ctrl+shift+tab', () => {
            this.switchToPreviousTerminal();
        });
        
        // Terminal switching by number
        for (let i = 1; i <= 9; i++) {
            keyboard.register(`ctrl+${i}`, () => {
                this.switchToTerminal(i - 1);
            });
        }
    }
    
    createTerminal(projectId = null, options = {}) {
        const terminalId = `terminal-${++this.terminalCounter}`;
        const isClaudeTerminal = Boolean(projectId);
        
        // Load saved settings
        const savedFontSize = Storage.get('terminal-font-size') || 14;
        
        // Don't manually set rows/cols - let FitAddon calculate proper size
        
        // Create terminal instance with fixed high-contrast theme
        const terminal = new Terminal({
            fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
            fontSize: parseInt(savedFontSize),
            fontWeight: 'normal',
            fontWeightBold: 'bold',
            lineHeight: 1.2,
            letterSpacing: 0,
            cursor: 'block',
            cursorBlink: true,
            cursorStyle: 'block',
            scrollback: 2000,
            tabStopWidth: 4,
            // rows and cols will be set by FitAddon
            theme: this.getThemeConfig(this.getCurrentTheme()),
            allowTransparency: false,
            bellSound: null,
            bellStyle: 'none',
            convertEol: true,
            disableStdin: false,
            macOptionIsMeta: true,
            macOptionClickForcesSelection: false,
            rightClickSelectsWord: true,
            rendererType: 'canvas',
            windowsMode: false,
            ...options
        });
        
        // Create addons
        const fitAddon = new FitAddon.FitAddon();
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        
        // Load addons
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);
        
        // Create terminal wrapper element
        const terminalElement = DOM.create('div', {
            className: 'terminal-instance',
            id: terminalId
        });
        
        const terminalWrapper = DOM.create('div', {
            className: 'terminal-wrapper'
        });
        
        // Removed terminal status bar to prevent overlap with tmux status bar
        // const statusBar = this.createStatusBar(terminalId, projectId);
        
        terminalElement.appendChild(terminalWrapper);
        // terminalElement.appendChild(statusBar);
        this.container.appendChild(terminalElement);
        
        // Open terminal in wrapper
        terminal.open(terminalWrapper);
        
        // Fit terminal to container with proper timing and force initial resize
        this.fitTerminalSafely(fitAddon, terminalWrapper, terminalId);
        
        // Force an additional fit after DOM is fully rendered
        setTimeout(() => {
            try {
                fitAddon.fit();
                console.log(`Terminal ${terminalId} force-fitted after DOM render`);
            } catch (error) {
                console.warn(`Failed to force-fit terminal ${terminalId}:`, error);
            }
        }, 200);
        
        // Send initial size to server for tmux sessions (with delay for reconnections)
        if (projectId && socket.isConnected()) {
            // Small delay to allow server to set up terminal session
            setTimeout(() => {
                const { cols, rows } = terminal;
                if (cols && rows) {
                    socket.resizeTerminal(projectId, cols, rows);
                }
            }, 300);
        }
        
        // Prevent character duplication by intercepting keyboard events for session-based terminals
        const terminalScreen = terminalWrapper.querySelector('.xterm-screen');
        if (terminalScreen) {
            terminalScreen.addEventListener('keydown', (e) => {
                // Get terminal data to check if it's a session-based terminal
                const terminalData = this.terminals.get(terminalId);
                if (terminalData && terminalData.sessionName && terminalData.sessionName.startsWith('claude-web-')) {
                    // For session-based terminals, prevent local echo by handling input manually
                    if (e.ctrlKey || e.altKey || e.metaKey) {
                        // Allow special key combinations to pass through
                        return;
                    }
                    
                    // Prevent default for regular character input to avoid duplication
                    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Convert key event to appropriate terminal input
                        let data = '';
                        if (e.key === 'Enter') {
                            data = '\r';
                        } else if (e.key === 'Backspace') {
                            data = '\x7f';
                        } else if (e.key === 'Tab') {
                            data = '\t';
                        } else if (e.key.length === 1) {
                            data = e.key;
                        }
                        
                        if (data && socket.isConnected()) {
                            socket.sendTerminalInput(terminalData.sessionName, data);
                        }
                    }
                }
            });
        }
        
        // Setup terminal event handlers
        this.setupTerminalEvents(terminal, terminalId, projectId);
        
        // Setup mobile touch gestures
        this.setupMobileTouchGestures(terminalWrapper, terminal);
        
        // Create tab
        const tab = this.createTerminalTab(terminalId, projectId, isClaudeTerminal);
        
        // Store terminal data
        const terminalData = {
            id: terminalId,
            terminal,
            element: terminalElement,
            tab,
            fitAddon,
            webLinksAddon,
            projectId,
            isClaudeTerminal,
            // statusBar removed to prevent overlap with tmux status bar
            history: [],
            historyIndex: -1,
            currentInput: '',
            isActive: false
        };
        
        this.terminals.set(terminalId, terminalData);
        
        // Make this terminal active with enhanced visibility check
        this.setActiveTerminalSafely(terminalId);
        
        // Hide welcome screen with multiple fallbacks
        this.hideWelcomeScreenSafely();
        
        // Focus terminal
        terminal.focus();
        
        // Don't show initial messages - let the shell show its natural prompt
        
        // Resize observer for responsive terminal
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                // Always call fit when terminal container is resized, regardless of active state
                // This ensures terminal fills the available space properly
                try {
                    // Use debouncing to avoid excessive fitting
                    clearTimeout(terminalData.resizeTimeout);
                    terminalData.resizeTimeout = setTimeout(() => {
                        fitAddon.fit();
                        this.updateTerminalSize(terminalId);
                        console.log(`Terminal ${terminalId} resized via ResizeObserver`);
                    }, 100);
                } catch (error) {
                    console.warn(`Failed to fit terminal ${terminalId} in ResizeObserver:`, error);
                }
            });
            resizeObserver.observe(terminalWrapper);
            terminalData.resizeObserver = resizeObserver;
        }
        
        this.emit('terminal_created', { terminalId, projectId, isClaudeTerminal });
        
        return terminalId;
    }
    
    setupTerminalEvents(terminal, terminalId, projectId) {
        let inputBuffer = '';
        let lastCommandSent = '';
        
        // Handle data input with proper echo prevention
        terminal.onData((data) => {
            const terminalData = this.terminals.get(terminalId);
            if (!terminalData) return;
            
            // For interactive applications like Claude Code, send all input directly to server
            // without local processing to ensure interactive prompts work correctly
            if (socket.isConnected()) {
                // Support both session-based and project-based input
                if (terminalData.sessionName && terminalData.sessionName.startsWith('claude-web-')) {
                    // New session-based approach - send input to server without local echo
                    // The server will echo it back, preventing character duplication
                    
                    // Prevent local echo by not writing to terminal here
                    // Only send to server and let server handle echo
                    socket.sendTerminalInput(terminalData.sessionName, data);
                    return;
                } else if (projectId) {
                    // Legacy project-based approach
                    this.sendTerminalInputSafely(projectId, data, terminalId);
                    return;
                }
            }
            
            // Local terminal fallback when not connected to server
            const char = data.charCodeAt(0);
            
            if (char === 13) { // Enter
                const command = inputBuffer.trim();
                
                // Always echo the newline locally first
                terminal.writeln('');
                
                if (command) {
                    // Add to history
                    terminalData.history.push(command);
                    terminalData.historyIndex = terminalData.history.length;
                    
                    // Handle local commands
                    if (this.handleLocalCommand(terminal, command, terminalId)) {
                        inputBuffer = '';
                        return;
                    }
                    
                    terminal.writeln('\x1b[31mError: Not connected to server\x1b[0m');
                } else {
                    this.writePrompt(terminal);
                }
                
                inputBuffer = '';
                
            } else if (char === 127) { // Backspace
                if (inputBuffer.length > 0) {
                    inputBuffer = inputBuffer.slice(0, -1);
                    terminal.write('\b \b'); // Local backspace handling
                }
                
            } else if (char === 27) { // Escape sequences (arrow keys, etc.)
                // Handle arrow keys for history navigation
                if (data === '\x1b[A') { // Up arrow
                    inputBuffer = this.navigateHistory(terminal, terminalData, -1, inputBuffer);
                } else if (data === '\x1b[B') { // Down arrow
                    inputBuffer = this.navigateHistory(terminal, terminalData, 1, inputBuffer);
                }
                
            } else if (char >= 32) { // Printable characters
                inputBuffer += data;
                terminal.write(data); // Local echo for immediate feedback
                
            } else {
                // Handle control characters locally when not connected
                switch (char) {
                    case 3: // Ctrl+C
                        terminal.writeln('^C');
                        this.writePrompt(terminal);
                        inputBuffer = '';
                        break;
                        
                    case 12: // Ctrl+L
                        terminal.clear();
                        this.writePrompt(terminal);
                        break;
                }
            }
        });
        
        // Store the lastCommandSent reference for this terminal
        const terminalData = this.terminals.get(terminalId);
        if (terminalData) {
            terminalData.getLastCommandSent = () => lastCommandSent;
            terminalData.clearLastCommandSent = () => { lastCommandSent = ''; };
            
            // Also store a flag to track if we've received the initial prompt
            terminalData.hasReceivedInitialPrompt = false;
        }
        
        // Handle terminal resize
        terminal.onResize((size) => {
            if (projectId && socket.isConnected()) {
                socket.resizeTerminal(projectId, size.cols, size.rows);
            }
        });
        
        // Handle selection events
        terminal.onSelectionChange(() => {
            const selection = terminal.getSelection();
            if (selection) {
                // Copy selection to clipboard automatically
                Utils.copyToClipboard(selection);
            }
        });
        
        // Don't write initial prompt when connected to server - let the shell handle its natural prompt
        if (!projectId || !socket.isConnected()) {
            this.writePrompt(terminal);
        }
    }
    
    handleLocalCommand(terminal, command, terminalId) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        
        switch (cmd) {
            case '/help':
                this.showTerminalHelp(terminal);
                return true;
                
            case '/clear':
                terminal.clear();
                this.writePrompt(terminal);
                return true;
                
            case '/exit':
                this.closeTerminal(terminalId);
                return true;
                
            case '/status':
                this.showTerminalStatus(terminal, terminalId);
                return true;
                
                
            case '/font':
                if (parts[1]) {
                    this.setTerminalFont(terminal, parseInt(parts[1]));
                } else {
                    terminal.writeln('\r\nUsage: /font <size>');
                    this.writePrompt(terminal);
                }
                return true;
                
            default:
                return false; // Not a local command
        }
    }
    
    navigateHistory(terminal, terminalData, direction, currentInput) {
        if (terminalData.history.length === 0) return currentInput;
        
        const newIndex = terminalData.historyIndex + direction;
        
        if (newIndex >= 0 && newIndex < terminalData.history.length) {
            // Clear current input
            if (currentInput.length > 0) {
                terminal.write('\b'.repeat(currentInput.length) + ' '.repeat(currentInput.length) + '\b'.repeat(currentInput.length));
            }
            
            // Set new command
            terminalData.historyIndex = newIndex;
            const newCommand = terminalData.history[newIndex];
            terminal.write(newCommand);
            return newCommand;
            
        } else if (newIndex === terminalData.history.length) {
            // Clear to empty input
            if (currentInput.length > 0) {
                terminal.write('\b'.repeat(currentInput.length) + ' '.repeat(currentInput.length) + '\b'.repeat(currentInput.length));
            }
            
            terminalData.historyIndex = newIndex;
            return '';
        }
        
        return currentInput;
    }
    
    writePrompt(terminal) {
        terminal.write('\r\n\x1b[32m$\x1b[0m ');
    }
    
    showTerminalHelp(terminal) {
        terminal.writeln('\r\n\x1b[36mTerminal Commands:\x1b[0m');
        terminal.writeln('  /help     - Show this help message');
        terminal.writeln('  /clear    - Clear terminal screen');
        terminal.writeln('  /exit     - Close terminal');
        terminal.writeln('  /status   - Show terminal status');
        terminal.writeln('  /font     - Change font size');
        terminal.writeln('\r\n\x1b[36mKeyboard Shortcuts:\x1b[0m');
        terminal.writeln('  Ctrl+C    - Interrupt current command');
        terminal.writeln('  Ctrl+L    - Clear screen');
        terminal.writeln('  Ctrl+D    - Send EOF');
        terminal.writeln('  ↑/↓       - Navigate command history');
        terminal.writeln('  Ctrl+`    - Toggle terminal');
        this.writePrompt(terminal);
    }
    
    showTerminalStatus(terminal, terminalId) {
        const terminalData = this.terminals.get(terminalId);
        if (!terminalData) return;
        
        terminal.writeln('\r\n\x1b[36mTerminal Status:\x1b[0m');
        terminal.writeln(`  ID: ${terminalId}`);
        terminal.writeln(`  Type: ${terminalData.isClaudeTerminal ? 'Claude Code' : 'Standard'}`);
        terminal.writeln(`  Project: ${terminalData.projectId || 'None'}`);
        terminal.writeln(`  History: ${terminalData.history.length} commands`);
        terminal.writeln(`  Connection: ${socket.isConnected() ? 'Connected' : 'Disconnected'}`);
        this.writePrompt(terminal);
    }
    
    getCurrentTheme() {
        // Check if light theme is active
        if (document.body.classList.contains('theme-light')) {
            return 'light';
        }
        return 'dark'; // Default to dark theme
    }
    
    updateTerminalTheme() {
        const currentTheme = this.getCurrentTheme();
        const themeConfig = this.getThemeConfig(currentTheme);
        
        // Update all active terminals with the new theme
        this.terminals.forEach((terminalData, terminalId) => {
            const terminal = terminalData.terminal;
            if (terminal && terminal.options) {
                terminal.options.theme = themeConfig;
                // Force terminal to refresh with new theme
                terminal.refresh(0, terminal.rows - 1);
            }
        });
    }
    
    calculateTerminalSize(fontSize = 14) {
        try {
            // Get container dimensions
            const container = this.container;
            if (!container) {
                return { rows: 24, cols: 80 }; // Default fallback
            }
            
            // Calculate available space
            const containerRect = container.getBoundingClientRect();
            const availableWidth = containerRect.width || window.innerWidth * 0.6; // Fallback to 60% of window width
            const availableHeight = containerRect.height || window.innerHeight * 0.6; // Fallback to 60% of window height
            
            // Character dimensions based on font size
            const charWidth = fontSize * 0.6; // Approximate character width
            const charHeight = fontSize * 1.2; // Line height
            
            // Calculate rows and columns with padding
            const padding = 32; // Account for padding
            const cols = Math.max(80, Math.floor((availableWidth - padding) / charWidth));
            const rows = Math.max(24, Math.floor((availableHeight - padding) / charHeight));
            
            return { rows, cols };
        } catch (error) {
            console.warn('Failed to calculate terminal size:', error);
            return { rows: 24, cols: 80 }; // Safe fallback
        }
    }
    
    // Get actual terminal dimensions with DOM stability check
    getActualTerminalDimensions(terminalData) {
        // Priority 1: Calculate based on container with stability verification
        const calculated = this.calculateTerminalSizeStable();
        if (calculated && calculated.cols && calculated.rows && calculated.rows >= 20) {
            return calculated;
        }
        
        // Priority 2: Get from terminal object if available and reasonable
        if (terminalData && terminalData.terminal && terminalData.terminal.cols && terminalData.terminal.rows > 20) {
            return {
                cols: terminalData.terminal.cols,
                rows: terminalData.terminal.rows
            };
        }
        
        // Priority 3: Use a reasonable estimated size based on viewport
        const estimated = this.estimateTerminalSize();
        return estimated;
    }
    
    // Calculate terminal size with DOM stability check
    calculateTerminalSizeStable() {
        try {
            const container = this.container;
            if (!container) {
                return null;
            }
            
            const containerRect = container.getBoundingClientRect();
            
            // Check if container has reasonable dimensions (DOM is stable)
            if (containerRect.height < 200 || containerRect.width < 400) {
                return null;
            }
            
            const availableWidth = containerRect.width;
            const availableHeight = containerRect.height;
            
            // More accurate character dimensions
            const fontSize = parseFloat(getComputedStyle(container).fontSize) || 14;
            const charWidth = fontSize * 0.6;
            const charHeight = fontSize * 1.2;
            
            const padding = 32;
            const cols = Math.max(80, Math.floor((availableWidth - padding) / charWidth));
            const rows = Math.max(24, Math.floor((availableHeight - padding) / charHeight));
            
            return { rows, cols };
        } catch (error) {
            console.warn('Failed to calculate stable terminal size:', error);
            return null;
        }
    }
    
    // Estimate terminal size based on viewport when container is not ready
    estimateTerminalSize() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Estimate available space (accounting for sidebar, header, etc.)
        const estimatedWidth = viewportWidth * 0.7;  // ~70% for terminal area
        const estimatedHeight = viewportHeight * 0.8; // ~80% for terminal area
        
        const fontSize = 14; // Default font size
        const charWidth = fontSize * 0.6;
        const charHeight = fontSize * 1.2;
        
        const padding = 32;
        const cols = Math.max(80, Math.floor((estimatedWidth - padding) / charWidth));
        const rows = Math.max(24, Math.floor((estimatedHeight - padding) / charHeight));
        
        return { cols, rows };
    }
    
    // Wait for DOM to be completely stable before proceeding
    async waitForDOMStability(maxRetries = 10) {
        return new Promise((resolve) => {
            let retryCount = 0;
            
            const checkStability = () => {
                const container = this.container;
                if (!container) {
                    if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(() => requestAnimationFrame(checkStability), 200);
                        return;
                    } else {
                        resolve();
                        return;
                    }
                }
                
                const rect = container.getBoundingClientRect();
                
                // Check if container has reasonable dimensions
                if (rect.height >= 200 && rect.width >= 400) {
                    resolve();
                } else {
                    if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(() => requestAnimationFrame(checkStability), 200);
                    } else {
                        resolve();
                    }
                }
            };
            
            // Start checking after a small initial delay to allow for layout
            setTimeout(() => requestAnimationFrame(checkStability), 100);
        });
    }
    
    getThemeConfig(themeName) {
        const themes = {
            dark: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#ffffff',
                cursorAccent: '#1e1e1e',
                selection: '#264f78',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#e5e5e5'
            },
            light: {
                background: '#ffffff',
                foreground: '#333333',
                cursor: '#000000',
                cursorAccent: '#ffffff',
                selection: '#add6ff',
                black: '#333333',
                red: '#cd3131',
                green: '#00bc00',
                yellow: '#949800',
                blue: '#0451a5',
                magenta: '#bc05bc',
                cyan: '#0598bc',
                white: '#333333',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#14ce14',
                brightYellow: '#b5ba00',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#333333'
            },
            'high-contrast': {
                background: '#000000',
                foreground: '#ffffff',
                cursor: '#ffffff',
                cursorAccent: '#000000',
                selection: '#ffffff',
                black: '#000000',
                red: '#ff4444',
                green: '#44ff44',
                yellow: '#ffff44',
                blue: '#6666ff',
                magenta: '#ff44ff',
                cyan: '#44ffff',
                white: '#ffffff',
                brightBlack: '#888888',
                brightRed: '#ff6666',
                brightGreen: '#66ff66',
                brightYellow: '#ffff66',
                brightBlue: '#8888ff',
                brightMagenta: '#ff66ff',
                brightCyan: '#66ffff',
                brightWhite: '#ffffff'
            },
            'solarized-dark': {
                background: '#002b36',
                foreground: '#839496',
                cursor: '#93a1a1',
                cursorAccent: '#002b36',
                selection: '#073642',
                black: '#073642',
                red: '#dc322f',
                green: '#859900',
                yellow: '#b58900',
                blue: '#268bd2',
                magenta: '#d33682',
                cyan: '#2aa198',
                white: '#eee8d5',
                brightBlack: '#002b36',
                brightRed: '#cb4b16',
                brightGreen: '#586e75',
                brightYellow: '#657b83',
                brightBlue: '#839496',
                brightMagenta: '#6c71c4',
                brightCyan: '#93a1a1',
                brightWhite: '#fdf6e3'
            },
            'solarized-light': {
                background: '#fdf6e3',
                foreground: '#657b83',
                cursor: '#586e75',
                cursorAccent: '#fdf6e3',
                selection: '#eee8d5',
                black: '#073642',
                red: '#dc322f',
                green: '#859900',
                yellow: '#b58900',
                blue: '#268bd2',
                magenta: '#d33682',
                cyan: '#2aa198',
                white: '#eee8d5',
                brightBlack: '#002b36',
                brightRed: '#cb4b16',
                brightGreen: '#586e75',
                brightYellow: '#657b83',
                brightBlue: '#839496',
                brightMagenta: '#6c71c4',
                brightCyan: '#93a1a1',
                brightWhite: '#fdf6e3'
            },
            monokai: {
                background: '#272822',
                foreground: '#f8f8f2',
                cursor: '#f8f8f2',
                cursorAccent: '#272822',
                selection: '#49483e',
                black: '#272822',
                red: '#f92672',
                green: '#a6e22e',
                yellow: '#f4bf75',
                blue: '#66d9ef',
                magenta: '#ae81ff',
                cyan: '#a1efe4',
                white: '#f8f8f2',
                brightBlack: '#75715e',
                brightRed: '#f92672',
                brightGreen: '#a6e22e',
                brightYellow: '#f4bf75',
                brightBlue: '#66d9ef',
                brightMagenta: '#ae81ff',
                brightCyan: '#a1efe4',
                brightWhite: '#f9f8f5'
            }
        };
        return themes[themeName] || themes.dark;
    }

    
    setTerminalFont(terminal, fontSize) {
        if (fontSize >= 8 && fontSize <= 32) {
            terminal.options.fontSize = fontSize;
            terminal.writeln(`\r\nFont size changed to: ${fontSize}px`);
            Storage.set('terminal-font-size', fontSize);
            
            // Refit terminal
            const terminalData = this.terminals.get(this.activeTerminal);
            if (terminalData && terminalData.fitAddon) {
                terminalData.fitAddon.fit();
            }
        } else {
            terminal.writeln('\r\nFont size must be between 8 and 32');
        }
        this.writePrompt(terminal);
    }
    
    setupMobileTouchGestures(terminalWrapper, terminal) {
        // Only add touch gestures on mobile devices
        if (window.innerWidth > 768) return;
        
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        
        // Double tap to focus/unfocus terminal
        terminalWrapper.addEventListener('touchstart', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - touchStartTime;
            
            if (tapLength < 500 && tapLength > 0) {
                // Double tap detected
                e.preventDefault();
                if (document.activeElement === terminal.textarea) {
                    terminal.blur();
                } else {
                    terminal.focus();
                }
            }
            
            touchStartTime = currentTime;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });
        
        // Long press to show context menu (copy/paste)
        let longPressTimer;
        terminalWrapper.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                // Trigger browser's native selection/copy menu
                const selection = terminal.getSelection();
                if (selection) {
                    Utils.copyToClipboard(selection);
                    notifications.success('Copied to clipboard');
                }
            }, 500);
        });
        
        terminalWrapper.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });
        
        terminalWrapper.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        });
        
        // Prevent default touch behaviors that interfere with terminal
        terminalWrapper.addEventListener('touchmove', (e) => {
            // Allow scrolling but prevent other gestures
            if (Math.abs(e.touches[0].clientY - touchStartY) > 10) {
                // Vertical scroll is allowed
            } else {
                e.preventDefault();
            }
        });
    }
    
    createTerminalTab(terminalId, projectId, isClaudeTerminal) {
        const tab = DOM.create('button', {
            className: 'terminal-tab',
            attributes: { 'data-terminal-id': terminalId }
        });
        
        const icon = DOM.create('span', {
            className: 'icon',
            text: isClaudeTerminal ? '🤖' : '💻'
        });
        
        const title = DOM.create('span', {
            className: 'title',
            text: projectId ? `${projectId}` : `Terminal ${this.terminalCounter}`
        });
        
        const closeBtn = DOM.create('button', {
            className: 'close-btn',
            text: '×',
            events: {
                click: (e) => {
                    e.stopPropagation();
                    this.closeTerminal(terminalId);
                }
            }
        });
        
        tab.appendChild(icon);
        tab.appendChild(title);
        tab.appendChild(closeBtn);
        
        // Tab click handler
        DOM.on(tab, 'click', () => {
            this.setActiveTerminal(terminalId);
        });
        
        this.tabsContainer.appendChild(tab);
        
        return tab;
    }
    
    createStatusBar(terminalId, projectId) {
        const statusBar = DOM.create('div', {
            className: 'terminal-status'
        });
        
        const statusLeft = DOM.create('div', {
            className: 'terminal-status-left'
        });
        
        const statusRight = DOM.create('div', {
            className: 'terminal-status-right'
        });
        
        // Left side status items
        const connectionStatus = DOM.create('div', {
            className: 'terminal-status-item',
            id: `connection-${terminalId}`
        });
        
        const connectionIcon = DOM.create('span', {
            className: 'icon',
            text: '🔗'
        });
        
        const connectionText = DOM.create('span', {
            text: socket.isConnected() ? 'Connected' : 'Disconnected'
        });
        
        connectionStatus.appendChild(connectionIcon);
        connectionStatus.appendChild(connectionText);
        statusLeft.appendChild(connectionStatus);
        
        if (projectId) {
            const projectStatus = DOM.create('div', {
                className: 'terminal-status-item',
                id: `project-${terminalId}`
            });
            
            const projectIcon = DOM.create('span', {
                className: 'icon',
                text: '📁'
            });
            
            const projectText = DOM.create('span', {
                text: projectId
            });
            
            projectStatus.appendChild(projectIcon);
            projectStatus.appendChild(projectText);
            statusLeft.appendChild(projectStatus);
        }
        
        // Right side status items
        const timeStatus = DOM.create('div', {
            className: 'terminal-status-item',
            id: `time-${terminalId}`
        });
        
        const timeIcon = DOM.create('span', {
            className: 'icon',
            text: '🕐'
        });
        
        const timeText = DOM.create('span', {
            text: new Date().toLocaleTimeString()
        });
        
        timeStatus.appendChild(timeIcon);
        timeStatus.appendChild(timeText);
        statusRight.appendChild(timeStatus);
        
        statusBar.appendChild(statusLeft);
        statusBar.appendChild(statusRight);
        
        // Update time every second
        setInterval(() => {
            timeText.textContent = new Date().toLocaleTimeString();
        }, 1000);
        
        return statusBar;
    }
    
    setActiveTerminal(terminalId) {
        // Deactivate current terminal
        if (this.activeTerminal) {
            const currentData = this.terminals.get(this.activeTerminal);
            if (currentData) {
                currentData.isActive = false;
                if (currentData.element) {
                    DOM.removeClass(currentData.element, 'active');
                }
                if (currentData.tab) {
                    DOM.removeClass(currentData.tab, 'active');
                }
            }
        }
        
        // Activate new terminal
        const terminalData = this.terminals.get(terminalId);
        if (terminalData) {
            this.activeTerminal = terminalId;
            terminalData.isActive = true;
            
            // Handle both old-style and session-style terminals
            if (terminalData.element) {
                DOM.addClass(terminalData.element, 'active');
            }
            
            // Force fit terminal when activated to ensure proper sizing
            if (terminalData.fitAddon) {
                setTimeout(() => {
                    try {
                        terminalData.fitAddon.fit();
                        console.log(`Terminal ${terminalId} fitted on activation`);
                    } catch (error) {
                        console.warn(`Failed to fit terminal ${terminalId} on activation:`, error);
                    }
                }, 50); // Small delay to ensure DOM is updated
            }
            if (terminalData.tab) {
                DOM.addClass(terminalData.tab, 'active');
            }
            
            // Fit and focus terminal (if created)
            if (terminalData.fitAddon) {
                terminalData.fitAddon.fit();
            }
            if (terminalData.terminal) {
                terminalData.terminal.focus();
            }
            
            // Note: Removed circular call to selectSessionTab to fix double activation system
            // Session-style terminals will be handled by the unified activation mechanism
            
            // Sync project selection when terminal is activated
            if (terminalData.projectId && window.projectManager) {
                const currentProject = window.projectManager.getCurrentProject();
                if (!currentProject || currentProject.id !== terminalData.projectId) {
                    // Prevent infinite loop
                    if (window.projectManager.selectProject !== arguments.callee) {
                        window.projectManager.selectProject(terminalData.projectId);
                    }
                }
            }
            
            this.emit('terminal_activated', { terminalId });
        }
    }
    
    closeTerminal(terminalId) {
        const terminalData = this.terminals.get(terminalId);
        if (!terminalData) return;
        
        // Clean up
        if (terminalData.resizeObserver) {
            terminalData.resizeObserver.disconnect();
        }
        
        // Clear timeout handlers
        if (terminalData.resizeTimeout) {
            clearTimeout(terminalData.resizeTimeout);
        }
        if (terminalData.windowResizeTimeout) {
            clearTimeout(terminalData.windowResizeTimeout);
        }
        
        // Remove window resize handler
        if (terminalData.windowResizeHandler) {
            window.removeEventListener('resize', terminalData.windowResizeHandler);
        }
        
        terminalData.terminal.dispose();
        
        // Remove elements
        if (terminalData.element.parentNode) {
            terminalData.element.parentNode.removeChild(terminalData.element);
        }
        
        if (terminalData.tab.parentNode) {
            terminalData.tab.parentNode.removeChild(terminalData.tab);
        }
        
        // Remove from map
        this.terminals.delete(terminalId);
        
        // If this was the active terminal, switch to another
        if (this.activeTerminal === terminalId) {
            this.activeTerminal = null;
            
            // Find another terminal to activate
            const remainingTerminals = Array.from(this.terminals.keys());
            if (remainingTerminals.length > 0) {
                this.setActiveTerminal(remainingTerminals[0]);
            } else {
                // Show welcome screen if no terminals left
                if (this.welcomeScreen) {
                    DOM.show(this.welcomeScreen);
                }
            }
        }
        
        this.emit('terminal_closed', { terminalId });
    }
    
    clearActiveTerminal() {
        if (this.activeTerminal) {
            const terminalData = this.terminals.get(this.activeTerminal);
            if (terminalData) {
                terminalData.terminal.clear();
                this.writePrompt(terminalData.terminal);
            }
        }
    }
    
    fitTerminalSafely(fitAddon, terminalWrapper, terminalId, retryCount = 0, isSessionRestore = false) {
        const maxRetries = 3;
        const retryDelay = 100;
        
        // Check if container has valid dimensions
        const hasValidDimensions = () => {
            return terminalWrapper.offsetWidth > 0 && terminalWrapper.offsetHeight > 0;
        };
        
        // Perform the fit operation
        const performFit = () => {
            try {
                if (hasValidDimensions()) {
                    fitAddon.fit();
                    console.log(`Terminal ${terminalId} fitted successfully${isSessionRestore ? ' (session restore)' : ''}`);
                    
                    // If this is a session restore, ensure cursor is at bottom after fit
                    if (isSessionRestore) {
                        const terminalData = this.terminals.get(terminalId);
                        if (terminalData && terminalData.terminal) {
                            setTimeout(() => {
                                this.scrollToBottom(terminalData.terminal);
                                console.log(`🔄 Cursor position fixed after session restore fit: ${terminalId}`);
                            }, 50);
                        }
                    }
                } else {
                    throw new Error('Container dimensions not ready');
                }
            } catch (error) {
                console.warn(`Failed to fit terminal ${terminalId}:`, error.message);
                
                if (retryCount < maxRetries) {
                    setTimeout(() => {
                        this.fitTerminalSafely(fitAddon, terminalWrapper, terminalId, retryCount + 1, isSessionRestore);
                    }, retryDelay);
                } else {
                    console.error(`Failed to fit terminal ${terminalId} after ${maxRetries} retries`);
                }
            }
        };
        
        // Use requestAnimationFrame to ensure DOM is rendered
        if (retryCount === 0) {
            requestAnimationFrame(() => {
                // Add a small delay to ensure layout is complete
                setTimeout(performFit, 10);
            });
        } else {
            performFit();
        }
    }
    
    performEnhancedResize(terminalData, terminalId) {
        
        if (!terminalData) {
            return;
        }
        
        const maxRetries = 5;
        const stages = [
            { delay: 50, description: 'Initial layout settlement' },
            { delay: 100, description: 'DOM reflow completion' },
            { delay: 200, description: 'Final layout stabilization' }
        ];
        
        let currentStage = 0;
        
        const performStage = () => {
            if (currentStage >= stages.length) {
                return;
            }
            
            const stage = stages[currentStage];
            
            setTimeout(() => {
                try {
                    // Validate layout before resize
                    if (!this.validateTerminalLayout(terminalData, terminalId)) {
                    }
                    
                    // Perform resize
                    if (terminalData.fitAddon) {
                        terminalData.fitAddon.fit();
                    }
                    
                    // Validate status bar position after resize
                    this.validateStatusBarLayout();
                    
                    currentStage++;
                    performStage();
                    
                } catch (error) {
                    
                    // Try next stage anyway
                    currentStage++;
                    performStage();
                }
            }, stage.delay);
        };
        
        // Start the resize process
        performStage();
    }
    
    
    validateTerminalLayout(terminalData, terminalId) {
        try {
            const wrapper = terminalData.terminal.element?.parentElement;
            if (!wrapper) {
                return false;
            }
            
            const hasValidDimensions = wrapper.offsetWidth > 0 && wrapper.offsetHeight > 0;
            const isVisible = wrapper.style.display !== 'none' && wrapper.offsetParent !== null;
            
            if (!hasValidDimensions) {
            }
            
            if (!isVisible) {
            }
            
            // 检查xterm内部元素的尺寸一致性
            this.validateXtermInternalLayout(terminalData, terminalId);
            
            return hasValidDimensions && isVisible;
            
        } catch (error) {
            return false;
        }
    }
    
    validateXtermInternalLayout(terminalData, terminalId) {
        try {
            const xtermElement = terminalData.terminal.element;
            if (!xtermElement) return;
            
            const xtermViewport = xtermElement.querySelector('.xterm-viewport');
            const xtermScreen = xtermElement.querySelector('.xterm-screen');
            
            if (!xtermViewport || !xtermScreen) return;
            
            const viewportRect = xtermViewport.getBoundingClientRect();
            const screenRect = xtermScreen.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            
            // 如果screen溢出窗口，强制修复
            if (screenRect.bottom > windowHeight || screenRect.height > viewportRect.height + 50) {
                this.fixXtermScreenOverflow(terminalData, terminalId);
            }
            
        } catch (error) {
        }
    }
    
    fixXtermScreenOverflow(terminalData, terminalId) {
        try {
            
            // 方法1: 强制调整终端行数
            const terminal = terminalData.terminal;
            const currentRows = terminal.rows;
            const currentCols = terminal.cols;
            
            // 减少行数以适应可用空间
            const newRows = Math.max(10, currentRows - 5);
            
            terminal.resize(currentCols, newRows);
            
            // 方法2: 强制重新fit
            setTimeout(() => {
                if (terminalData.fitAddon) {
                    terminalData.fitAddon.fit();
                }
            }, 100);
            
            // 方法3: 强制设置最大高度
            const xtermScreen = terminal.element?.querySelector('.xterm-screen');
            if (xtermScreen) {
                const maxHeight = window.innerHeight - 150; // 留出余量
                xtermScreen.style.maxHeight = `${maxHeight}px`;
                xtermScreen.style.overflow = 'hidden';
            }
            
        } catch (error) {
        }
    }
    
    validateStatusBarLayout() {
        try {
            const statusBar = document.querySelector('.status-indicators');
            if (!statusBar) {
                return true; // Status bar might not exist, that's okay
            }
            
            const statusBarRect = statusBar.getBoundingClientRect();
            const isPositionValid = statusBarRect.bottom > 0 && statusBarRect.right > 0;
            
            // Always force a layout refresh after terminal restart to prevent browser rendering issues
            // This mimics the effect of F12 dev tools open/close that fixes the layout
            this.forceLayoutRefresh();
            
            if (!isPositionValid) {
                console.warn('Status bar position validation failed, attempting additional fixes...');
            }
            
            return true; // Always return true since we're forcing refresh anyway
            
        } catch (error) {
            console.error('Status bar layout validation error:', error);
            return false;
        }
    }
    
    forceLayoutRefresh() {
        // Multiple strategies to force browser layout refresh, similar to F12 toggle effect
        
        // Strategy 1: Force reflow on body
        document.body.style.display = 'none';
        document.body.offsetHeight; // Trigger reflow
        document.body.style.display = '';
        
        // Strategy 2: Force reflow on all status elements
        const statusElements = document.querySelectorAll('.status-indicators, .header, .terminal-wrapper');
        statusElements.forEach(element => {
            const originalTransform = element.style.transform;
            element.style.transform = 'translateZ(0)';
            element.offsetHeight; // Trigger reflow
            element.style.transform = originalTransform;
        });
        
        // Strategy 3: Force window resize event (similar to viewport change from F12)
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
        
        // Strategy 4: Force style recalculation
        setTimeout(() => {
            const computedStyle = window.getComputedStyle(document.body);
        }, 100);
    }
    
    setActiveTerminalSafely(terminalId, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 50;
        
        const terminalData = this.terminals.get(terminalId);
        if (!terminalData) {
            console.error(`Cannot set active terminal: ${terminalId} not found`);
            return;
        }
        
        // Perform the activation
        const performActivation = () => {
            try {
                // Set active terminal
                if (this.activeTerminal && this.activeTerminal !== terminalId) {
                    const currentTerminalData = this.terminals.get(this.activeTerminal);
                    if (currentTerminalData) {
                        currentTerminalData.isActive = false;
                        DOM.removeClass(currentTerminalData.element, 'active');
                        DOM.removeClass(currentTerminalData.tab, 'active');
                    }
                }
                
                this.activeTerminal = terminalId;
                terminalData.isActive = true;
                DOM.addClass(terminalData.element, 'active');
                DOM.addClass(terminalData.tab, 'active');
                
                // Force fit terminal when set as active to ensure proper sizing
                if (terminalData.fitAddon) {
                    setTimeout(() => {
                        try {
                            terminalData.fitAddon.fit();
                            console.log(`Terminal ${terminalId} fitted in setActiveTerminalSafely`);
                        } catch (error) {
                            console.warn(`Failed to fit terminal ${terminalId} in setActiveTerminalSafely:`, error);
                        }
                    }, 50); // Small delay to ensure DOM is updated
                }
                
                // Verify visibility
                const isVisible = terminalData.element.offsetWidth > 0 && terminalData.element.offsetHeight > 0;
                if (!isVisible && retryCount < maxRetries) {
                        setTimeout(() => {
                        this.setActiveTerminalSafely(terminalId, retryCount + 1);
                    }, retryDelay);
                    return;
                }
                
                // Fit and focus terminal
                if (terminalData.fitAddon) {
                    terminalData.fitAddon.fit();
                }
                terminalData.terminal.focus();
                
                // Sync project selection when terminal is activated
                if (terminalData.projectId && projectManager) {
                    projectManager.selectProject(terminalData.projectId);
                }
                
                
            } catch (error) {
                console.error(`Failed to activate terminal ${terminalId}:`, error);
                if (retryCount < maxRetries) {
                    setTimeout(() => {
                        this.setActiveTerminalSafely(terminalId, retryCount + 1);
                    }, retryDelay);
                }
            }
        };
        
        // Use requestAnimationFrame for better timing
        if (retryCount === 0) {
            requestAnimationFrame(performActivation);
        } else {
            performActivation();
        }
    }
    
    hideWelcomeScreenSafely() {
        const hideWelcome = () => {
            // Try multiple selectors
            const selectors = ['welcome-screen', '.welcome-screen', '#welcome-screen'];
            let welcomeElement = null;
            
            for (const selector of selectors) {
                welcomeElement = selector.startsWith('.') || selector.startsWith('#') 
                    ? DOM.query(selector) 
                    : DOM.get(selector);
                if (welcomeElement) break;
            }
            
            if (welcomeElement) {
                DOM.hide(welcomeElement);
                } else {
                }
        };
        
        // Try immediately and with small delay as fallback
        hideWelcome();
        setTimeout(hideWelcome, 10);
    }
    
    sendTerminalInputSafely(projectId, data, terminalId, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 200;
        
        try {
            const success = socket.sendTerminalInput(projectId, data);
            if (!success && retryCount < maxRetries) {
                setTimeout(() => {
                    this.sendTerminalInputSafely(projectId, data, terminalId, retryCount + 1);
                }, retryDelay);
                return;
            }
            
            if (!success && retryCount >= maxRetries) {
                this.showTerminalError(terminalId, 'Failed to process terminal input. Please check your connection.');
            }
            
        } catch (error) {
            
            if (retryCount < maxRetries) {
                setTimeout(() => {
                    this.sendTerminalInputSafely(projectId, data, terminalId, retryCount + 1);
                }, retryDelay);
            } else {
                this.showTerminalError(terminalId, 'Failed to process terminal input');
            }
        }
    }
    
    showTerminalError(terminalId, message) {
        // Show user-friendly error notification
        notifications.error(message, { duration: 3000 });
        
        // Optionally write error to terminal
        const terminalData = this.terminals.get(terminalId);
        if (terminalData && terminalData.terminal) {
            terminalData.terminal.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
        }
        
    }
    
    updateTerminalSize(terminalId) {
        const terminalData = this.terminals.get(terminalId);
        if (terminalData && terminalData.projectId && socket.isConnected()) {
            const { cols, rows } = terminalData.terminal;
            socket.resizeTerminal(terminalData.projectId, cols, rows);
        }
    }
    
    toggleTerminal() {
        const terminalContainer = DOM.get('terminal-container');
        if (terminalContainer) {
            DOM.toggleClass(terminalContainer, 'collapsed');
        }
    }
    
    switchToNextTerminal() {
        const terminalIds = Array.from(this.terminals.keys());
        const currentIndex = terminalIds.indexOf(this.activeTerminal);
        const nextIndex = (currentIndex + 1) % terminalIds.length;
        
        if (terminalIds[nextIndex]) {
            this.setActiveTerminal(terminalIds[nextIndex]);
        }
    }
    
    switchToPreviousTerminal() {
        const terminalIds = Array.from(this.terminals.keys());
        const currentIndex = terminalIds.indexOf(this.activeTerminal);
        const prevIndex = currentIndex === 0 ? terminalIds.length - 1 : currentIndex - 1;
        
        if (terminalIds[prevIndex]) {
            this.setActiveTerminal(terminalIds[prevIndex]);
        }
    }
    
    switchToTerminal(index) {
        const terminalIds = Array.from(this.terminals.keys());
        if (terminalIds[index]) {
            this.setActiveTerminal(terminalIds[index]);
        }
    }
    
    splitTerminal() {
        if (this.activeTerminal) {
            const terminalData = this.terminals.get(this.activeTerminal);
            if (terminalData) {
                this.createTerminal(terminalData.projectId);
            }
        } else {
            this.createTerminal();
        }
    }
    
    showTerminalSettings() {
        // Open terminal settings modal with terminal tab active
        if (window.app && window.app.showSettings) {
            window.app.showSettings('terminal');
        } else {
            modals.open('settings-modal');
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                DOM.query('.settings-tab[data-tab="terminal"]')?.click();
            }, 100);
        }
    }
    
    // Socket event handlers
    handleTerminalOutput(data) {
        const { sessionName, data: output } = data;
        
        // Route directly by sessionName 
        if (sessionName) {
            const terminalData = this.terminals.get(sessionName);
            if (terminalData && terminalData.terminal) {
                // Simplified logging - only log when debug is needed
                // console.log(`📝 Writing output to ${sessionName}: ${output.length} chars`);
                
                // Server handles formatting, just write the output directly
                // The backend already sends properly formatted content with correct line endings
                terminalData.terminal.write(output);
                
                // Mark as attached if we receive output (indicates successful connection)
                if (!terminalData.isAttached) {
                    terminalData.isAttached = true;
                }
            } else {
                console.warn(`❌ No terminal found for session ${sessionName}`);
            }
        } else {
            console.warn('❌ Received output without sessionName:', data);
        }
    }
    
    handleTerminalInputError(data) {
        const { projectId, sessionName, message, details } = data;
        const identifier = sessionName || projectId;
        console.error(`Terminal input error for ${identifier}: ${message}`, details);
        
        // Find terminal for this session or project
        for (const [terminalId, terminalData] of this.terminals.entries()) {
            if (terminalData.sessionName === sessionName || terminalData.projectId === projectId) {
                this.showTerminalError(terminalId, message);
                
                // If it's a session not found error, try to reconnect
                if (details && details.includes('Terminal session needs to be created')) {
                    console.log(`Attempting to recreate terminal session for ${identifier}`);
                    // For session-based terminals, try to reconnect to session
                    if (sessionName) {
                        setTimeout(() => {
                            this.attachToSession(sessionName);
                        }, 1000);
                    } else if (projectManager && projectManager.currentProject === projectId) {
                        // Legacy project-based reconnection
                        setTimeout(() => {
                            projectManager.selectProject(projectId);
                        }, 1000);
                    }
                }
                break;
            }
        }
    }
    
    // Helper function to escape special regex characters
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    handleClaudeResponse(data) {
        const { projectId, data: response, type } = data;
        
        // Find Claude terminal for this project
        for (const [terminalId, terminalData] of this.terminals.entries()) {
            if (terminalData.projectId === projectId && terminalData.isClaudeTerminal) {
                if (type === 'command_sent') {
                    terminalData.terminal.writeln('\r\n\x1b[36mCommand sent to Claude\x1b[0m');
                } else {
                    terminalData.terminal.write(response);
                }
                // Don't write prompt, let server handle it
                // this.writePrompt(terminalData.terminal);
                break;
            }
        }
    }
    
    handleProjectStatus(data) {
        const { projectId, status } = data;
        
        // Update terminal status based on project status
        for (const [terminalId, terminalData] of this.terminals.entries()) {
            if (terminalData.projectId === projectId) {
                this.updateTerminalProjectStatus(terminalData, status, terminalId);
            }
        }
    }
    
    updateTerminalProjectStatus(terminalData, status, terminalId) {
        // Status bar has been removed to prevent overlap with tmux status bar
        // Only handle terminal output now
        switch (status) {
            case 'claude_started':
                terminalData.terminal.writeln('\r\n\x1b[32mClaude session started\x1b[0m');
                break;
            case 'claude_stopped':
                terminalData.terminal.writeln('\r\n\x1b[33mClaude session stopped\x1b[0m');
                break;
            case 'terminal_restarted':
                
                // Clear terminal without showing disruptive message
                terminalData.terminal.clear();
                
                // Show non-intrusive notification instead of terminal message
                notifications.success('Terminal session restarted successfully');
                
                // Enhanced resize with proper timing and validation
                this.performEnhancedResize(terminalData, terminalId);
                break;
            // terminal_created and terminal_destroyed don't need terminal output
        }
    }
    
    // Public API methods
    getActiveTerminal() {
        return this.activeTerminal ? this.terminals.get(this.activeTerminal) : null;
    }
    
    getTerminal(terminalId) {
        return this.terminals.get(terminalId);
    }
    
    getAllTerminals() {
        return Array.from(this.terminals.values());
    }
    
    getTerminalsByProject(projectId) {
        return Array.from(this.terminals.values()).filter(t => t.projectId === projectId);
    }
    
    hasTerminalsForProject(projectId) {
        return this.getTerminalsByProject(projectId).length > 0;
    }
    
    createTerminalForProject(projectId, isClaudeTerminal = false) {
        return this.createTerminal(projectId, { isClaudeTerminal });
    }
    
    closeTerminalsForProject(projectId) {
        const terminals = this.getTerminalsByProject(projectId);
        terminals.forEach(terminalData => {
            this.closeTerminal(terminalData.id);
        });
    }
    
    async attachSession(projectId) {
        socket.socket.emit('terminal:attach-session', { projectId });
    }
    
    async detachSession(projectId) {
        socket.socket.emit('terminal:detach-session', { projectId });
    }
    
    async loadAllSessions() {
        try {
            const response = await fetch('/api/sessions');
            const data = await response.json();
            
            if (data.success) {
                // Filter only claude-web sessions
                const claudeWebSessions = data.sessions.filter(session => 
                    session.name.startsWith('claude-web-')
                );
                this.displayAllSessions(claudeWebSessions);
                
                // Select first session by default when no target is specified
                if (claudeWebSessions.length > 0) {
                    // Wait for DOM to be completely stable before activating first session
                    await this.waitForDOMStability();
                    await this.selectSessionTab(claudeWebSessions[0].name);
                }
            } else {
                console.error('Failed to load sessions:', data.error);
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }
    
    async loadAllSessionsAndSelect(targetSessionName) {
        try {
            // API call to get session info
            const response = await fetch('/api/sessions');
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Sessions API response:', data.sessions);
                
                // Filter only claude-web sessions
                const claudeWebSessions = data.sessions.filter(session => 
                    session.name.startsWith('claude-web-')
                );
                
                console.log('🔍 Filtered claude-web sessions:', claudeWebSessions.map(s => s.name));
                
                this.displayAllSessions(claudeWebSessions);
                
                // Auto-select the target session if it exists
                if (targetSessionName) {
                    const targetSession = claudeWebSessions.find(session => 
                        session.name === targetSessionName
                    );
                    if (targetSession) {
                        console.log('🎯 Found target session, selecting:', targetSessionName);
                        // Wait for DOM stability before selecting the session
                        await this.waitForDOMStability();
                        await this.selectSessionTab(targetSessionName);
                    } else {
                        console.warn(`❌ Target session ${targetSessionName} not found in loaded sessions:`, claudeWebSessions.map(s => s.name));
                        // Fallback to first session if target not found
                        if (claudeWebSessions.length > 0) {
                            console.log('🔄 Falling back to first session:', claudeWebSessions[0].name);
                            await this.waitForDOMStability();
                            await this.selectSessionTab(claudeWebSessions[0].name);
                        }
                    }
                } else {
                    // If no target specified, select first session
                    if (claudeWebSessions.length > 0) {
                        await this.waitForDOMStability();
                        await this.selectSessionTab(claudeWebSessions[0].name);
                    }
                }
            } else {
                console.error('Failed to load sessions:', data.error);
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }
    
    displayAllSessions(sessions) {
        // Clear existing tabs
        this.tabsContainer.innerHTML = '';
        this.terminals.clear();
        
        // Create tabs for all sessions - now based on session name, not project
        sessions.forEach(session => {
            this.createSessionTab(session);
        });
        
        // Hide welcome screen if we have sessions
        if (sessions.length > 0) {
            this.hideWelcomeScreen();
            // Don't auto-select first session - let caller decide which session to select
        } else {
            this.showWelcomeScreen();
        }
    }
    
    /**
     * Extract project information from session name
     * Expected format: claude-web-{projectName}-{number}
     */
    extractProjectInfoFromSessionName(sessionName) {
        try {
            // Default return values
            const defaultReturn = {
                projectId: null,
                projectName: null
            };
            
            if (!sessionName || !sessionName.startsWith('claude-web-')) {
                return defaultReturn;
            }
            
            // Extract project name using regex: claude-web-{projectName}-{number}
            const match = sessionName.match(/^claude-web-(.+)-\d+$/);
            if (!match || !match[1]) {
                return defaultReturn;
            }
            
            const projectName = match[1];
            
            // Find project ID by name
            let projectId = null;
            if (window.projectManager && window.projectManager.getAllProjects) {
                const projects = window.projectManager.getAllProjects();
                const project = projects.find(p => p.name === projectName);
                if (project) {
                    projectId = project.id;
                }
            }
            
            return {
                projectId: projectId,
                projectName: projectName
            };
        } catch (error) {
            console.warn('Failed to extract project info from session name:', sessionName, error);
            return {
                projectId: null,
                projectName: null
            };
        }
    }
    
    createSessionTab(session) {
        const tabId = `tab-${session.name}`;
        const isActive = this.activeTerminal === null; // First tab is active
        
        const tabElement = document.createElement('div');
        tabElement.className = `terminal-tab ${isActive ? 'active' : ''}`;
        tabElement.id = tabId;
        tabElement.innerHTML = `
            <span class="tab-title">${session.name}</span>
            <button class="tab-close" onclick="terminalManager.showDeleteConfirmation('${session.name}')">
                ✕
            </button>
        `;
        
        // Add click handler for tab selection
        tabElement.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.selectSessionTab(session.name);
            }
        });
        
        this.tabsContainer.appendChild(tabElement);
        
        // Extract project information from session name
        const projectInfo = this.extractProjectInfoFromSessionName(session.name);
        
        // Create terminal instance for this session - now purely session-based
        const terminalData = {
            id: session.name,
            sessionName: session.name,
            projectId: projectInfo.projectId, // Add projectId for file sending functionality
            projectName: projectInfo.projectName, // Add projectName for reference
            element: null,
            terminal: null,
            isActive: isActive,
            isAttached: false, // Track if session is already attached to prevent duplicates
            isConnecting: false // Track if session is currently connecting to prevent race conditions
        };
        
        this.terminals.set(session.name, terminalData);
        
        if (isActive) {
            this.activeTerminal = session.name;
            this.activateSessionTab(session.name);
        }
    }
    
    async createNewSession() {
        // Create a new session without project concept using calculated dimensions
        const dimensions = this.getActualTerminalDimensions(null);
        socket.socket.emit('terminal:create-new-session', { 
            cols: dimensions.cols, 
            rows: dimensions.rows 
        });
    }
    
    async deleteSession(sessionName) {
        try {
            if (!socket || !socket.isConnected()) {
                notifications.error('Connection lost. Please refresh the page.');
                return;
            }
            
            if (!sessionName || !sessionName.startsWith('claude-web-')) {
                notifications.error('Invalid session name format');
                return;
            }
            
            // Show deleting notification
            notifications.info(`Deleting session ${sessionName}...`);
            
            // Send delete request
            socket.socket.emit('terminal:delete-session', { sessionName });
            
            // Set up timeout for deletion
            setTimeout(() => {
                // Check if session still exists after 5 seconds
                const sessionTab = document.getElementById(`tab-${sessionName}`);
                if (sessionTab) {
                    notifications.error(`Failed to delete session ${sessionName}. Please try again.`);
                }
            }, 5000);
            
        } catch (error) {
            notifications.error('Failed to delete session: ' + error.message);
        }
    }
    
    showDeleteConfirmation(sessionName) {
        const confirmed = confirm(`Are you sure you want to delete session "${sessionName}"?\n\nThis will permanently delete the tmux session and all its data.`);
        
        if (confirmed) {
            this.deleteSession(sessionName);
        }
    }
    
    async selectSessionTab(sessionName) {
        // Deactivate current tab
        const currentTab = this.tabsContainer.querySelector('.terminal-tab.active');
        if (currentTab) {
            currentTab.classList.remove('active');
        }
        
        // Activate selected tab
        const selectedTab = document.getElementById(`tab-${sessionName}`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            this.activeTerminal = sessionName;
            
            // Update file display area based on terminal's corresponding project
            this.updateFileDisplayForTerminal(sessionName);
            
            await this.activateSessionTab(sessionName);
        }
    }
    
    async activateSessionTab(sessionName) {
        const terminalData = this.terminals.get(sessionName);
        if (!terminalData) return;
        
        console.log('🎯 Activating session tab:', sessionName);
        
        // Set all terminals as inactive
        this.terminals.forEach((data, id) => {
            data.isActive = false;
        });
        
        // Set this terminal as active
        terminalData.isActive = true;
        
        // Hide all terminal elements
        this.container.querySelectorAll('.terminal-wrapper').forEach(wrapper => {
            wrapper.style.display = 'none';
        });
        
        // Show or create terminal for this session
        if (!terminalData.element) {
            this.createTerminalElement(terminalData);
        } else {
            terminalData.element.style.display = 'block';
            // Fit and focus if terminal exists
            if (terminalData.fitAddon) {
                setTimeout(() => {
                    try {
                        terminalData.fitAddon.fit();
                    } catch (error) {
                        console.warn(`Failed to fit session terminal ${sessionName} on tab activation:`, error);
                    }
                }, 100);
            }
            if (terminalData.terminal) {
                terminalData.terminal.focus();
            }
        }
        
        // Only attach to session if not already attached or connecting
        if (!terminalData.isAttached && !terminalData.isConnecting) {
            terminalData.isConnecting = true;
            try {
                // Ensure DOM is stable before attaching (critical for size calculation)
                await this.waitForDOMStability();
                
                await this.attachToSessionWithRetry(sessionName);
                terminalData.isAttached = true;
            } catch (error) {
                console.error('❌ Failed to attach session:', sessionName, error);
                terminalData.isAttached = false;
            } finally {
                terminalData.isConnecting = false;
            }
        }
    }
    
    createTerminalElement(terminalData) {
        try {
            console.log('Creating terminal element for:', terminalData.sessionName);
            
            // Check if required classes are available
            if (typeof Terminal === 'undefined') {
                console.error('Terminal class not available - xterm.js not loaded');
                return;
            }
            
            if (typeof FitAddon === 'undefined' || typeof FitAddon.FitAddon === 'undefined') {
                console.error('FitAddon class not available - xterm-addon-fit.js not loaded');
                return;
            }
            
            const wrapper = document.createElement('div');
            wrapper.className = 'terminal-wrapper';
            wrapper.id = `terminal-${terminalData.id}`;
            
            const terminalElement = document.createElement('div');
            terminalElement.className = 'terminal';
            
            wrapper.appendChild(terminalElement);
            
            if (!this.container) {
                console.error('Terminal container not found');
                return;
            }
            
            this.container.appendChild(wrapper);
            
            // Make sure wrapper is visible
            wrapper.style.display = 'block';
            
            // Don't manually calculate rows/cols - let FitAddon handle it
            
            // Create xterm.js terminal
            const terminal = new Terminal({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                // rows and cols will be calculated by FitAddon
                theme: {
                    background: '#1e1e1e',
                    foreground: '#d4d4d4',
                    cursor: '#d4d4d4'
                }
            });
            
            const fitAddon = new FitAddon.FitAddon();
            terminal.loadAddon(fitAddon);
            
            terminal.open(terminalElement);
            
            // Store references first
            terminalData.element = wrapper;
            terminalData.terminal = terminal;
            terminalData.fitAddon = fitAddon;
            
            // Fit terminal with proper timing
            setTimeout(() => {
                try {
                    fitAddon.fit();
                } catch (error) {
                    console.warn(`Failed to fit session terminal ${terminalData.sessionName} on creation:`, error);
                }
            }, 100);
            
            // Additional fit after DOM is rendered
            setTimeout(() => {
                try {
                    fitAddon.fit();
                } catch (error) {
                    console.warn(`Failed to force-fit session terminal ${terminalData.sessionName}:`, error);
                }
            }, 300);
            
            // Setup terminal events (this will handle input properly)
            this.setupTerminalEvents(terminal, terminalData.sessionName, null);
            
            // Handle resize with debouncing
            const handleResize = () => {
                try {
                    clearTimeout(terminalData.windowResizeTimeout);
                    terminalData.windowResizeTimeout = setTimeout(() => {
                        fitAddon.fit();
                    }, 150);
                } catch (error) {
                    console.warn(`Failed to fit session terminal ${terminalData.sessionName} on window resize:`, error);
                }
            };
            
            window.addEventListener('resize', handleResize);
            terminalData.windowResizeHandler = handleResize;
            
            console.log('Terminal element created successfully for:', terminalData.sessionName);
            this.hideWelcomeScreen();
            
            // Start attachment process for newly created terminal
            setTimeout(async () => {
                if (!terminalData.isAttached && !terminalData.isConnecting) {
                    console.log('🔗 Auto-attaching newly created terminal:', terminalData.sessionName);
                    terminalData.isConnecting = true;
                    try {
                        await this.attachToSessionWithRetry(terminalData.sessionName);
                        terminalData.isAttached = true;
                    } catch (error) {
                        console.error('❌ Failed to auto-attach new terminal:', error);
                        terminalData.isAttached = false;
                    } finally {
                        terminalData.isConnecting = false;
                    }
                }
            }, 500);
            
        } catch (error) {
            console.error('Error creating terminal element:', error);
        }
    }
    
    attachToSession(sessionName) {
        const terminalData = this.terminals.get(sessionName);
        if (!terminalData) return;
        
        // Get current terminal dimensions for size synchronization using smart fallback
        const dimensions = this.getActualTerminalDimensions(terminalData);
        
        // Directly attach to the session using its name with current dimensions
        socket.socket.emit('terminal:attach-session', {
            sessionName: sessionName,
            currentCols: dimensions.cols,
            currentRows: dimensions.rows
        });
    }
    
    async attachToSessionWithRetry(sessionName, maxRetries = 3) {
        const terminalData = this.terminals.get(sessionName);
        if (!terminalData) {
            throw new Error('Terminal data not found');
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`🔄 Attach attempt ${attempt}/${maxRetries} for session:`, sessionName);
            
            try {
                // Get current terminal dimensions for size synchronization using smart fallback
                const dimensions = this.getActualTerminalDimensions(terminalData);
                
                // Send attach request with current dimensions
                socket.socket.emit('terminal:attach-session', {
                    sessionName: sessionName,
                    currentCols: dimensions.cols,
                    currentRows: dimensions.rows
                });
                
                // Wait for confirmation or timeout
                const attached = await this.waitForAttachment(sessionName, 5000);
                if (attached) {
                    console.log('✅ Session attached successfully on attempt', attempt);
                    return true;
                }
                
                if (attempt < maxRetries) {
                    console.log(`⏳ Attach attempt ${attempt} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            } catch (error) {
                console.error(`❌ Attach attempt ${attempt} error:`, error);
                if (attempt === maxRetries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        
        throw new Error(`Failed to attach session after ${maxRetries} attempts`);
    }
    
    waitForAttachment(sessionName, timeout = 5000) {
        return new Promise((resolve) => {
            // Listen for the session-attached event
            const attachHandler = (data) => {
                if (data.sessionName === sessionName) {
                    socket.socket.off('terminal:session-attached', attachHandler);
                    resolve(true);
                }
            };
            
            socket.socket.on('terminal:session-attached', attachHandler);
            
            // Set timeout
            setTimeout(() => {
                socket.socket.off('terminal:session-attached', attachHandler);
                console.warn('⏰ Attachment timeout for session:', sessionName);
                resolve(false);
            }, timeout);
        });
    }
    
    handleSessionsList(data) {
        const { sessions } = data;
        
        // If we're restoring from a reconnect, automatically restore sessions
        if (this.isRestoringFromReconnect) {
            this.autoRestoreSessions(sessions);
            this.isRestoringFromReconnect = false;
        }
        // Note: Manual session management dialog has been removed
    }
    
    autoRestoreSessions(sessions) {
        console.log('🔄 Auto-restoring sessions after reconnection:', sessions);
        
        let restoredCount = 0;
        let failedCount = 0;
        
        // Find and restore sessions for existing terminals
        this.terminals.forEach((terminalData, terminalId) => {
            if (terminalData.sessionName && terminalData.sessionName.startsWith('claude-web-')) {
                // Find matching session from server
                const matchingSession = sessions.find(session => 
                    session.name === terminalData.sessionName || 
                    session.sessionName === terminalData.sessionName
                );
                
                if (matchingSession) {
                    console.log(`✅ Restoring session: ${terminalData.sessionName}`);
                    
                    // Get current terminal dimensions for size synchronization using smart fallback
                    const dimensions = this.getActualTerminalDimensions(terminalData);
                    
                    // Re-attach to the session with current dimensions
                    socket.socket.emit('terminal:attach-session', {
                        sessionName: terminalData.sessionName,
                        terminalId: terminalId,
                        currentCols: dimensions.cols,
                        currentRows: dimensions.rows
                    });
                    
                    // Ensure project room membership (important for terminal input routing)
                    const currentProject = projectManager.getCurrentProject();
                    if (currentProject && socket.isConnected()) {
                        socket.joinProject(currentProject.id);
                    }
                    
                    // Mark as attached
                    terminalData.isAttached = true;
                    restoredCount++;
                } else {
                    console.warn(`❌ Session not found on server: ${terminalData.sessionName}`);
                    failedCount++;
                }
            }
        });
        
        // Show restoration results
        if (restoredCount > 0) {
            notifications.success(`Restored ${restoredCount} terminal session(s)`, { duration: 3000 });
        }
        
        if (failedCount > 0) {
            notifications.warning(`Failed to restore ${failedCount} terminal session(s). They may have been closed.`, { 
                duration: 5000 
            });
        }
        
        if (restoredCount === 0 && failedCount === 0) {
            console.log('No terminal sessions to restore');
        }
    }
    
    handleSessionAttached(data) {
        const { projectId, isReconnect } = data;
        
        if (isReconnect) {
            // Find terminal for this project
            const terminals = this.getTerminalsByProject(projectId);
            if (terminals.length === 0) {
                // Create new terminal tab for reconnected session
                this.createTerminalForProject(projectId);
            }
            
            notifications.success(`Reconnected to existing session for project ${projectId}`, { duration: 3000 });
        }
    }
    
    handleSessionDetached(data) {
        const { projectId } = data;
        
        notifications.info(`Detached from session. Session remains active in background.`, { duration: 3000 });
    }
    
    handleSessionCreated(data) {
        const { sessionName, sessionId, tmuxSession, projectName, sequenceNumber } = data;
        const displayName = sessionName || tmuxSession;
        
        // Use a retry mechanism to ensure session is fully ready
        this.loadSessionsWithRetry(displayName, 0);
        
        notifications.success(projectName 
            ? `New terminal session created for "${projectName}": ${displayName}`
            : `New terminal session created: ${displayName}`);
    }
    
    async loadSessionsWithRetry(targetSessionName, retryCount = 0) {
        const maxRetries = 5;
        const retryDelay = 500;
        
        try {
            const response = await fetch('/api/sessions');
            const data = await response.json();
            
            if (data.success) {
                const claudeWebSessions = data.sessions.filter(session => 
                    session.name.startsWith('claude-web-')
                );
                
                // Check if target session exists in the response
                const targetExists = claudeWebSessions.find(session => 
                    session.name === targetSessionName
                );
                
                if (targetExists) {
                    this.displayAllSessions(claudeWebSessions);
                    
                    // Select the target session after a short delay
                    setTimeout(async () => {
                        await this.selectSessionTab(targetSessionName);
                    }, 100);
                    return;
                } else if (retryCount < maxRetries) {
                    setTimeout(() => {
                        this.loadSessionsWithRetry(targetSessionName, retryCount + 1);
                    }, retryDelay);
                    return;
                } else {
                    // Target session not found after max retries, load all sessions
                    this.displayAllSessions(claudeWebSessions);
                    if (claudeWebSessions.length > 0) {
                        // Wait for DOM stability before selecting first session
                        (async () => {
                            await this.waitForDOMStability();
                            await this.selectSessionTab(claudeWebSessions[0].name);
                        })();
                    }
                }
            } else {
                throw new Error(data.error || 'Failed to load sessions');
            }
        } catch (error) {
            if (retryCount < maxRetries) {
                setTimeout(() => {
                    this.loadSessionsWithRetry(targetSessionName, retryCount + 1);
                }, retryDelay);
            } else {
                notifications.error('Failed to refresh terminal sessions. Please refresh the page.');
            }
        }
    }
    
    handleSessionDeleted(data) {
        const { sessionName, success } = data;
        
        if (!sessionName) {
            return;
        }
        
        try {
            // Remove the tab
            const tabElement = document.getElementById(`tab-${sessionName}`);
            if (tabElement) {
                tabElement.remove();
            }
            
            // Remove terminal data and clean up
            const terminalData = this.terminals.get(sessionName);
            if (terminalData) {
                if (terminalData.element) {
                    terminalData.element.remove();
                }
                
                // Clear timeout handlers for session terminals
                if (terminalData.windowResizeTimeout) {
                    clearTimeout(terminalData.windowResizeTimeout);
                }
                
                // Remove window resize handler for session terminals
                if (terminalData.windowResizeHandler) {
                    window.removeEventListener('resize', terminalData.windowResizeHandler);
                }
                
                // Clean up attachment state
                terminalData.isAttached = false;
            }
            
            this.terminals.delete(sessionName);
            
            // If this was the active terminal, select another one
            if (this.activeTerminal === sessionName) {
                this.activeTerminal = null;
                const remainingTabs = this.tabsContainer.querySelectorAll('.terminal-tab');
                if (remainingTabs.length > 0) {
                    const firstTab = remainingTabs[0];
                    const firstSessionName = firstTab.id.replace('tab-', '');
                    (async () => await this.selectSessionTab(firstSessionName))();
                } else {
                    this.showWelcomeScreen();
                }
            }
            
            // Show success message
            notifications.success(`Session "${sessionName}" deleted successfully`);
            
        } catch (error) {
            notifications.error(`Error cleaning up deleted session: ${error.message}`);
        }
    }
    
    showWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'flex';
        }
        
        // Hide all terminal wrappers
        this.container.querySelectorAll('.terminal-wrapper').forEach(wrapper => {
            wrapper.style.display = 'none';
        });
    }
    
    hideWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'none';
        }
    }
    
    // Error handling methods
    handleSocketError(error) {
        console.error('🔌 Socket error:', error);
        notifications.error('Connection error: ' + (error.message || 'Unknown error'), { duration: 5000 });
    }
    
    handleConnectionError(error) {
        console.error('🔌 Connection error:', error);
        notifications.error('Failed to connect to server. Please check your connection.', { duration: 5000 });
    }
    
    handleDisconnection(reason) {
        console.warn('🔌 Disconnected from server:', reason);
        
        if (reason === 'io server disconnect') {
            // Server disconnected the client
            notifications.warning('Disconnected from server. Please refresh the page.', { duration: 8000 });
        } else {
            // Client disconnected
            notifications.info('Connection lost. Attempting to reconnect...', { duration: 3000 });
        }
        
        // Mark all terminals as disconnected
        this.terminals.forEach((terminalData) => {
            if (terminalData.isAttached) {
                terminalData.isAttached = false;
            }
        });
    }
    
    handleReconnection(attemptNumber) {
        console.log('🔌 Reconnected to server, attempt:', attemptNumber);
        notifications.success('Reconnected to server. Restoring terminal sessions...', { duration: 3000 });
        
        // Delay session restoration to ensure server is ready
        setTimeout(() => {
            this.restoreTerminalSessions();
        }, 2000);
    }
    
    async restoreTerminalSessions() {
        try {
            console.log('🔄 Restoring terminal sessions after reconnection...');
            
            // Get current project if any
            const currentProject = projectManager.getCurrentProject();
            if (!currentProject) {
                console.log('No current project, skipping session restoration');
                return;
            }
            
            // Set restoration flag
            this.isRestoringFromReconnect = true;
            
            // Set a timeout to reset the flag if restoration takes too long
            setTimeout(() => {
                if (this.isRestoringFromReconnect) {
                    console.warn('⚠️ Terminal session restoration timeout, resetting flag');
                    this.isRestoringFromReconnect = false;
                }
            }, 10000); // 10 second timeout
            
            // Request fresh session list from server
            socket.socket.emit('terminal:list-sessions', { projectId: currentProject.id });
            
            // Mark all existing terminals as needing restoration
            this.terminals.forEach((terminalData, terminalId) => {
                if (terminalData.sessionName && terminalData.sessionName.startsWith('claude-web-')) {
                    console.log(`🔄 Preparing to restore session: ${terminalData.sessionName}`);
                    terminalData.isAttached = false; // Will be restored when session list arrives
                }
            });
            
            // Show restoration status
            if (this.terminals.size > 0) {
                notifications.info('Restoring terminal sessions...', { duration: 2000 });
            }
            
        } catch (error) {
            console.error('❌ Failed to restore terminal sessions:', error);
            this.isRestoringFromReconnect = false;
            notifications.error('Failed to restore some terminal sessions. You may need to refresh the page.', { 
                duration: 8000 
            });
        }
    }
    
    // Enhanced error handling for terminal operations
    handleTerminalOperationError(operation, sessionName, error) {
        console.error(`❌ Terminal ${operation} failed:`, { sessionName, error });
        
        let message = `Failed to ${operation}`;
        if (sessionName) {
            message += ` for session "${sessionName}"`;
        }
        message += ': ' + (error.message || error);
        
        notifications.error(message, { duration: 5000 });
    }
    
    // Utility method to check connection status
    isConnected() {
        return socket && socket.isConnected();
    }
    
    // Utility method to ensure connection before operations
    ensureConnection(operationName = 'operation') {
        if (!this.isConnected()) {
            notifications.error(`Cannot perform ${operationName}: Not connected to server`);
            return false;
        }
        return true;
    }
    
    /**
     * Update file display area when terminal tab is selected
     */
    updateFileDisplayForTerminal(sessionName) {
        if (!sessionName || !window.projectManager || !window.fileManager) {
            return;
        }
        
        // Validate terminal name format
        if (!this.isValidTerminalName(sessionName)) {
            return;
        }
        
        // Extract project name from terminal name
        const projectName = this.extractProjectNameFromTerminalName(sessionName);
        if (!projectName) {
            return;
        }
        
        // Find the corresponding project in projectManager
        const project = this.findProjectByName(projectName);
        if (!project) {
            return;
        }
        
        // Trigger file display update for the corresponding project
        if (window.fileManager) {
            document.dispatchEvent(new CustomEvent('projectChanged', {
                detail: { projectId: project.id, project: project }
            }));
        }
    }
    
    /**
     * Extract project name from terminal name
     * Expected format: claude-web-{projectName}-{number}
     */
    extractProjectNameFromTerminalName(terminalName) {
        if (!terminalName || !this.isValidTerminalName(terminalName)) {
            return null;
        }
        
        // Parse: claude-web-{projectName}-{number}
        const match = terminalName.match(/^claude-web-(.+)-\d+$/);
        if (match) {
            return match[1];
        }
        
        return null;
    }
    
    /**
     * Validate terminal name format
     */
    isValidTerminalName(terminalName) {
        if (!terminalName || typeof terminalName !== 'string') {
            return false;
        }
        
        // Check naming rule: claude-web-{projectName}-{number}
        return /^claude-web-.+-\d+$/.test(terminalName);
    }
    
    /**
     * Find project by name in projectManager
     */
    findProjectByName(projectName) {
        if (!window.projectManager || !projectName) {
            return null;
        }
        
        const projects = window.projectManager.getAllProjects();
        return projects.find(project => project.name === projectName);
    }
    
    /**
     * Gently scroll terminal to bottom if needed
     * Only uses safe xterm.js APIs without manual cursor manipulation
     */
    scrollToBottom(terminal) {
        if (!terminal) {
            return;
        }
        
        try {
            // Only use xterm.js native scrollToBottom method - no manual intervention
            if (typeof terminal.scrollToBottom === 'function') {
                terminal.scrollToBottom();
            }
        } catch (error) {
            console.warn('Failed to scroll terminal to bottom:', error);
        }
    }
    
    /**
     * Simple method to ensure terminal is properly fitted and scrolled
     * No aggressive cursor manipulation
     */
    ensureCursorAtBottom(terminalId) {
        const terminalData = this.terminals.get(terminalId);
        if (!terminalData || !terminalData.terminal) {
            return;
        }
        
        // Only perform safe operations: fit and gentle scroll
        if (terminalData.fitAddon) {
            try {
                terminalData.fitAddon.fit();
            } catch (error) {
                console.warn(`Failed to fit terminal ${terminalId}:`, error);
            }
        }
        
        // Gentle scroll to bottom - no monitoring, no force
        this.scrollToBottom(terminalData.terminal);
    }
}

// Initialize terminal manager
const terminalManager = new TerminalManager();

// Make terminal manager globally available immediately
window.terminalManager = terminalManager;

// Setup terminal UI after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add event listener for new terminal button
    const newTerminalBtn = document.getElementById('welcome-new-terminal');
    if (newTerminalBtn) {
        newTerminalBtn.addEventListener('click', () => {
            terminalManager.createNewSession();
        });
    }
    
    // Add event listener for terminal header new terminal button
    const headerNewTerminalBtn = document.getElementById('new-terminal-btn');
    if (headerNewTerminalBtn) {
        headerNewTerminalBtn.addEventListener('click', () => {
            terminalManager.createNewSession();
        });
    }
    
    // Load all sessions after DOM is ready and socket is connected
    const loadSessionsWhenReady = () => {
        if (socket && socket.isConnected()) {
            console.log('🔄 Socket connected, loading sessions...');
            terminalManager.loadAllSessions();
        } else {
            console.log('⏳ Waiting for socket connection...');
            setTimeout(loadSessionsWhenReady, 500);
        }
    };
    
    setTimeout(loadSessionsWhenReady, 1000);
});

// Export for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TerminalManager };
}