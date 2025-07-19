// 简化的终端管理器 - 使用ttyd iframe替代xterm.js
class TTYdTerminalManager {
    constructor() {
        this.sessions = new Map(); // 存储真实的tmux session信息
        this.activeSessionName = null;
        this.iframe = null;
        this.isInitialized = false;
        this.refreshInterval = null;
        this._isRestoring = false; // 标记是否正在恢复session
        
        // 绑定事件处理程序
        this.bindEvents();
    }

    bindEvents() {
        // 新建终端按钮
        document.getElementById('new-terminal-btn')?.addEventListener('click', () => {
            this.createNewTerminal();
        });

        // 欢迎屏幕按钮
        document.getElementById('welcome-new-terminal')?.addEventListener('click', () => {
            this.createNewTerminal();
        });

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    init() {
        if (this.isInitialized) return;

        console.log('🚀 Initializing TTYd Terminal Manager...');
        
        // 获取iframe元素
        this.iframe = document.getElementById('ttyd-terminal');
        
        if (!this.iframe) {
            console.error('❌ TTYd terminal iframe not found');
            return;
        }

        // 动态设置TTYd服务器地址
        this.setupTTYdURL();

        // 监听iframe加载
        this.iframe.onload = () => {
            console.log('✅ TTYd terminal iframe loaded');
            this.isInitialized = true;
            
            // 页面刷新时触发：添加延迟以确保TTYd客户端完全准备好
            console.log('⏱️ Waiting for TTYd client to be fully ready...');
            setTimeout(() => {
                this.refreshSessionList();
            }, 2000); // 延迟2秒确保TTYd客户端完全建立连接
        };

        // 监听iframe错误
        this.iframe.onerror = (error) => {
            console.error('❌ TTYd terminal iframe error:', error);
            this.showError('Failed to load terminal');
        };

        // 监听session事件
        this.setupSessionEventListeners();

        console.log('✅ TTYd Terminal Manager initialized');
    }

    setupTTYdURL() {
        // 使用代理路由而不是直接访问7681端口
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;
        const baseURL = `${protocol}//${hostname}${port ? ':' + port : ''}`;
        const ttydURL = `${baseURL}/terminal`;
        
        console.log('🔗 Setting TTYd URL to:', ttydURL);
        
        // 设置iframe的src
        this.iframe.src = ttydURL;
    }

    setupSessionEventListeners() {
        if (!window.socket) {
            console.warn('⚠️ Socket.IO not available, session events will not work');
            return;
        }

        // 监听session创建事件
        window.socket.onTerminalSessionCreated((data) => {
            console.log('🎉 Session created event received:', data);
            this.showNotification(`Terminal session created: ${data.sessionName}`);
            
            // 创建新的终端后触发：更新session列表并自动激活新创建的session
            this.refreshSessionList(data.sessionName);
        });

        // 监听session删除事件
        window.socket.onTerminalSessionDeleted((data) => {
            console.log('🗑️ Session deleted event received:', data);
            this.showNotification(`Terminal session deleted: ${data.sessionName}`);
            
            // 删除某个终端时触发：智能选择下一个要激活的session
            this.handleSessionDeleted(data.sessionName);
        });

        // 监听session切换事件
        window.socket.onTerminalSessionSwitched((data) => {
            console.log('🔄 Session switched event received:', data);
            this.showNotification(`Switched to session: ${data.sessionName}`);
            
            // 更新活跃session
            this.activeSessionName = data.sessionName;
            this.updateTabStyles();
            
            // 使用tmux命令切换，无需刷新iframe
            console.log('✅ Session switched using tmux command, no iframe refresh needed');
        });
    }

    async refreshSessionList(sessionToActivate = null) {
        if (!window.socket) {
            console.warn('⚠️ Socket.IO not available, cannot refresh session list');
            return;
        }

        try {
            console.log('🔄 Refreshing session list...', sessionToActivate ? `(will activate: ${sessionToActivate})` : '');
            
            // 获取当前所有的claude-web session
            const sessions = await window.socket.getTerminalSessions();
            
            // 过滤掉base-session和非claude-web sessions
            const filteredSessions = sessions.filter(session => {
                return session.name.startsWith('claude-web-') && session.name !== 'base-session';
            });
            
            // 清空现有的session信息
            this.sessions.clear();
            
            // 更新session信息
            filteredSessions.forEach(session => {
                this.sessions.set(session.name, {
                    name: session.name,
                    projectId: session.projectId,
                    identifier: session.identifier,
                    created: session.created,
                    attached: session.attached
                });
            });
            
            console.log('✅ Session list refreshed, found sessions:', Array.from(this.sessions.keys()));
            
            // 重新构建标签页
            this.rebuildTabs();
            
            // 优先激活指定的session (新创建的session)
            if (sessionToActivate && this.sessions.has(sessionToActivate)) {
                console.log('🎯 Auto-activating newly created session:', sessionToActivate);
                setTimeout(() => {
                    this.switchToSession(sessionToActivate);
                }, 1000); // 延迟1秒确保TTYd稳定
            }
            // 如果没有活跃session但有sessions存在，延迟激活第一个(但不在恢复模式下)
            else if (!this.activeSessionName && this.sessions.size > 0 && !this._isRestoring) {
                const firstSession = Array.from(this.sessions.keys())[0];
                console.log('⏱️ Delaying auto-switch to first session to ensure TTYd stability...');
                setTimeout(() => {
                    this.switchToSession(firstSession);
                }, 1000); // 额外延迟1秒确保系统稳定
            } else if (this._isRestoring) {
                console.log('🔄 In restore mode - skipping auto-switch to first session');
            }
            
            // 如果没有任何session，显示欢迎屏幕
            if (this.sessions.size === 0) {
                this.showWelcomeScreen();
                // 如果在恢复模式下没有session，也要清除恢复模式
                if (this._isRestoring) {
                    this._isRestoring = false;
                    console.log('✅ No sessions found during restore, disabled restore mode');
                }
            } else {
                this.hideWelcomeScreen();
                this.showIframe();
            }
            
        } catch (error) {
            console.error('❌ Failed to refresh session list:', error);
            this.showError('Failed to refresh session list');
        }
    }

    // 处理session删除事件，智能选择下一个要激活的session
    async handleSessionDeleted(deletedSessionName) {
        console.log('🧠 Handling intelligent session deletion for:', deletedSessionName);
        
        // 获取删除前的session列表顺序
        const sessionKeys = Array.from(this.sessions.keys());
        const deletedSessionIndex = sessionKeys.indexOf(deletedSessionName);
        
        // 从session列表中移除被删除的session
        this.sessions.delete(deletedSessionName);
        
        // 刷新session列表
        await this.refreshSessionList();
        
        // 如果没有其他session了，显示欢迎屏幕
        if (this.sessions.size === 0) {
            console.log('📋 No more sessions, showing welcome screen');
            this.showWelcomeScreen();
            return;
        }
        
        // 智能选择下一个要激活的session
        let nextSessionToActivate = null;
        const currentSessionKeys = Array.from(this.sessions.keys());
        
        if (deletedSessionIndex >= 0 && sessionKeys.length > 1) {
            // 如果删除的不是最后一个session，选择左侧的第一个终端
            if (deletedSessionIndex > 0) {
                // 找到被删除session左侧的第一个还存在的session
                for (let i = deletedSessionIndex - 1; i >= 0; i--) {
                    const candidateSession = sessionKeys[i];
                    if (this.sessions.has(candidateSession)) {
                        nextSessionToActivate = candidateSession;
                        break;
                    }
                }
            }
            
            // 如果没有找到左侧的session，选择右侧的第一个
            if (!nextSessionToActivate && deletedSessionIndex < sessionKeys.length - 1) {
                for (let i = deletedSessionIndex + 1; i < sessionKeys.length; i++) {
                    const candidateSession = sessionKeys[i];
                    if (this.sessions.has(candidateSession)) {
                        nextSessionToActivate = candidateSession;
                        break;
                    }
                }
            }
        }
        
        // 如果还是没有找到，就选择第一个可用的session
        if (!nextSessionToActivate && currentSessionKeys.length > 0) {
            nextSessionToActivate = currentSessionKeys[0];
        }
        
        // 激活选中的session
        if (nextSessionToActivate) {
            console.log('🎯 Intelligently switching to session:', nextSessionToActivate);
            setTimeout(() => {
                this.switchToSession(nextSessionToActivate);
            }, 500); // 短暂延迟确保UI更新完成
        }
    }

    rebuildTabs() {
        const tabsContainer = document.getElementById('terminal-tabs');
        if (!tabsContainer) return;
        
        // 清空现有标签页
        tabsContainer.innerHTML = '';
        
        // 为每个session创建标签页
        this.sessions.forEach((session, sessionName) => {
            this.createSessionTab(session);
        });
        
        // 更新标签页样式
        this.updateTabStyles();
    }

    createSessionTab(session) {
        const tabsContainer = document.getElementById('terminal-tabs');
        if (!tabsContainer) return;
        
        // 创建标签页元素
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.sessionName = session.name;
        
        // 简化session名称显示
        const displayName = this.getDisplayName(session.name);
        
        tab.innerHTML = `
            <span class="tab-title">${displayName}</span>
            <button class="tab-close" title="Close Terminal">×</button>
        `;

        // 添加点击事件 - 切换session
        tab.addEventListener('click', (e) => {
            if (!e.target.matches('.tab-close')) {
                this.switchToSession(session.name);
            }
        });

        // 添加关闭事件
        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeSession(session.name);
        });

        tabsContainer.appendChild(tab);
    }

    getDisplayName(sessionName) {
        // 将 claude-web-session-1234567890 简化为 session-1234567890
        if (sessionName.startsWith('claude-web-session-')) {
            return sessionName.replace('claude-web-', '');
        }
        // 将 claude-web-project-123 简化为 project-123
        if (sessionName.startsWith('claude-web-')) {
            return sessionName.replace('claude-web-', '');
        }
        return sessionName;
    }

    switchToSession(sessionName, retryCount = 0, skipSocketEvent = false) {
        if (!this.sessions.has(sessionName)) {
            console.error('❌ Session not found:', sessionName);
            return;
        }

        console.log('🔄 Switching to session:', sessionName, retryCount > 0 ? `(retry ${retryCount})` : '', skipSocketEvent ? '(skip socket event)' : '');

        // 获取当前活动的session名称
        const currentSessionName = this.activeSessionName;

        // 如果已经是当前活动session，只更新UI不发送Socket事件
        if (sessionName === currentSessionName && !retryCount) {
            console.log('✅ Already active session, updating UI only');
            this.updateTabStyles();
            this.hideWelcomeScreen();
            this.showIframe();
            return;
        }

        // 更新活动session
        this.activeSessionName = sessionName;

        // 更新标签页样式
        this.updateTabStyles();

        // 隐藏欢迎屏幕
        this.hideWelcomeScreen();

        // 显示iframe
        this.showIframe();

        // Auto-select corresponding project when switching to a terminal (terminal -> project linking)
        if (!this._skipProjectAutoSelect) {
            this.autoSelectProject(sessionName);
        }

        // 只有在非跳过Socket事件模式下才发送Socket.IO请求
        if (!skipSocketEvent && window.socket && window.socket.isConnected()) {
            window.socket.switchTerminalSession(sessionName, currentSessionName);
        } else if (!skipSocketEvent) {
            console.warn('⚠️ Socket.IO not connected, session switch may not work properly');
            
            // 如果Socket.IO未连接且重试次数少于3次，延迟重试
            if (retryCount < 3) {
                console.log(`⏱️ Retrying session switch in ${(retryCount + 1) * 1000}ms...`);
                setTimeout(() => {
                    this.switchToSession(sessionName, retryCount + 1, skipSocketEvent);
                }, (retryCount + 1) * 1000);
            } else {
                console.error('❌ Max retry attempts reached for session switch');
                this.showNotification('Failed to switch session after multiple attempts', 'error');
            }
        }
    }


    closeSession(sessionName) {
        if (!this.sessions.has(sessionName)) {
            console.error('❌ Session not found:', sessionName);
            return;
        }

        console.log('🗑️ Closing session:', sessionName);

        // 通过Socket.IO请求删除session
        if (window.socket && window.socket.isConnected()) {
            window.socket.deleteTerminalSession(sessionName);
        } else {
            console.warn('⚠️ Socket.IO not connected, session deletion may not work properly');
        }
    }

    updateTabStyles() {
        const tabs = document.querySelectorAll('.terminal-tab');
        tabs.forEach(tab => {
            if (tab.dataset.sessionName === this.activeSessionName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    // 选择并激活指定的session tab (被project-manager.js调用)
    selectSessionTab(sessionName) {
        if (!sessionName) {
            console.warn('⚠️ selectSessionTab called with empty sessionName');
            return false;
        }

        if (!this.sessions.has(sessionName)) {
            console.warn('⚠️ selectSessionTab called with unknown sessionName:', sessionName);
            return false;
        }

        console.log('🎯 selectSessionTab called for session:', sessionName);
        
        // Set flag to prevent project auto-selection when triggered by project
        this._skipProjectAutoSelect = true;
        // Skip socket event to prevent duplicate notifications from bidirectional linking
        this.switchToSession(sessionName, 0, true);
        this._skipProjectAutoSelect = false;
        
        return true;
    }

    async createNewTerminal(projectName = null) {
        console.log('🔧 Creating new terminal session...');

        // 检查Socket.IO连接状态
        if (!window.socket || !window.socket.isConnected()) {
            console.error('❌ Socket.IO not connected, cannot create terminal session');
            this.showError('Not connected to server. Please check your connection.');
            return false;
        }

        // 生成session名称，使用用户要求的格式
        const timestamp = Date.now();
        const sessionName = `claude-web-session-${timestamp}`;
        
        // 创建tmux session
        const projectPath = this.getCurrentProjectPath();
        const success = window.socket.createTerminalSession(
            null, // projectName is not needed when sessionName is provided
            projectPath,
            {
                sessionName: sessionName,
                cols: 80,
                rows: 24
            }
        );
        
        if (success) {
            console.log('🎯 Terminal session creation request sent:', sessionName);
            this.showNotification(`Creating terminal session: ${sessionName}`);
            
            // 隐藏欢迎屏幕并显示iframe
            this.hideWelcomeScreen();
            this.showIframe();
            
            return sessionName;
        } else {
            console.error('❌ Failed to send terminal session creation request');
            this.showError('Failed to create terminal session');
            return false;
        }
    }
    

    hideWelcomeScreen() {
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
    }

    showIframe() {
        if (this.iframe) {
            this.iframe.style.display = 'block';
        }
    }

    showWelcomeScreen() {
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'flex';
            // 恢复默认的welcome内容
            this.resetWelcomeContent();
        }
        
        if (this.iframe) {
            this.iframe.style.display = 'none';
        }
        
        this.activeSessionName = null;
    }

    resetWelcomeContent() {
        const welcomeContent = document.querySelector('.welcome-content');
        if (welcomeContent) {
            welcomeContent.innerHTML = `
                <h2>Welcome to Claude Code Web Manager</h2>
                <p>Create a new terminal session to get started with Claude Code CLI.</p>
                <div class="welcome-actions">
                    <button class="btn btn-primary" id="welcome-new-terminal">Create New Terminal</button>
                    <button class="btn btn-secondary" id="welcome-new-project">Create New Project</button>
                </div>
            `;
        }
    }

    showRestartingStatus() {
        console.log('🔄 Showing TTYd restarting status...');
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'flex';
        }
        
        if (this.iframe) {
            this.iframe.style.display = 'none';
        }
        
        // 修改welcome screen内容显示重启状态
        const welcomeContent = document.querySelector('.welcome-content');
        if (welcomeContent) {
            welcomeContent.innerHTML = `
                <h2>🔄 TTYd Service Restarting</h2>
                <p>Please wait while the terminal service is restarting...</p>
                <div class="loading-spinner" style="margin: 20px auto; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
        }
    }

    handleResize() {
        // iframe会自动处理resize，无需特殊处理
        console.log('📏 Window resized, iframe will auto-adjust');
    }
    
    reloadTerminal() {
        console.log('🔄 Reloading TTYd terminal iframe...');
        
        if (this.iframe) {
            // Save the current active session before reload
            const currentActiveSession = this.activeSessionName;
            console.log('💾 Saving current active session for restoration:', currentActiveSession);
            
            // 显示重启状态，避免用户看到base-session
            this.showRestartingStatus();
            
            // 清空当前活动session名称，确保后续强制切换
            this.activeSessionName = null;
            // 设置恢复模式标志，避免自动切换到第一个session
            this._isRestoring = true;
            console.log('🔄 Cleared activeSessionName and enabled restore mode');
            
            // Force reload the iframe src to pick up new TTYd settings
            const currentSrc = this.iframe.src;
            this.iframe.src = '';
            
            // Small delay to ensure the src is cleared, then reload and restore session
            setTimeout(() => {
                this.iframe.src = currentSrc;
                console.log('✅ TTYd terminal iframe reloaded');
                
                // Set up iframe load listener to restore session after reload
                const restoreSession = () => {
                    console.log('🎯 TTYd iframe loaded, attempting to restore session:', currentActiveSession);
                    
                    // First refresh session list to ensure we have latest data
                    this.refreshSessionList().then(() => {
                        if (currentActiveSession && this.sessions.has(currentActiveSession)) {
                            // Wait a bit more for TTYd to be fully ready, then restore session
                            setTimeout(() => {
                                console.log('🔄 Restoring session after TTYd reload:', currentActiveSession);
                                this.switchToSession(currentActiveSession);
                                // 恢复完成后清除恢复模式标志
                                this._isRestoring = false;
                                console.log('✅ Session restore completed, disabled restore mode');
                            }, 1500); // 1.5 second delay to ensure TTYd is stable
                        } else {
                            console.log('⚠️ No session to restore or session not found');
                            // If the saved session doesn't exist, just refresh the UI
                            if (this.sessions.size > 0) {
                                const firstSession = Array.from(this.sessions.keys())[0];
                                console.log('🔄 Falling back to first available session:', firstSession);
                                setTimeout(() => {
                                    this.switchToSession(firstSession);
                                    // 恢复完成后清除恢复模式标志
                                    this._isRestoring = false;
                                    console.log('✅ Fallback restore completed, disabled restore mode');
                                }, 1500);
                            }
                        }
                    }).catch(error => {
                        console.error('❌ Failed to refresh session list after TTYd reload:', error);
                        // 即使失败也要清除恢复模式标志
                        this._isRestoring = false;
                        console.log('✅ Restore failed, disabled restore mode');
                    });
                    
                    // Remove the listener after use
                    this.iframe.removeEventListener('load', restoreSession);
                };
                
                // Listen for iframe load completion
                this.iframe.addEventListener('load', restoreSession);
                
            }, 500);
        }
    }

    showNotification(message) {
        console.log('📢 Notification:', message);
        // 集成到现有的notification系统
        if (window.notifications) {
            window.notifications.success(message);
        }
    }

    showError(message) {
        console.error('❌ Error:', message);
        // 集成到现有的notification系统
        if (window.notifications) {
            window.notifications.error(message);
        }
    }

    // 获取当前项目路径
    getCurrentProjectPath() {
        // 尝试从全局变量或项目管理器获取当前项目路径
        if (window.projectManager && window.projectManager.getCurrentProject) {
            const project = window.projectManager.getCurrentProject();
            return project?.path || null;
        }
        
        // 如果没有项目管理器，返回null，服务器会使用默认路径
        return null;
    }
    

    // 获取活动session
    getActiveSession() {
        return this.sessions.get(this.activeSessionName);
    }

    // 获取所有sessions
    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    /**
     * Auto-select corresponding project when terminal is switched (terminal -> project linking)
     */
    autoSelectProject(sessionName) {
        if (!sessionName || !window.projectManager) {
            return;
        }
        
        // Extract project name from session name
        const projectName = this.extractProjectNameFromSessionName(sessionName);
        if (!projectName) {
            console.log('🔍 No project name found for session:', sessionName, '(likely a temporary terminal)');
            return;
        }
        
        console.log(`🎯 Auto-selecting project "${projectName}" for terminal session:`, sessionName);
        
        // Select the corresponding project
        window.projectManager.selectProjectByName(projectName);
    }
    
    /**
     * Extract project name from session name
     * Expected format: claude-web-{projectName}-{number}
     * Returns null for temporary sessions (claude-web-session-{timestamp})
     */
    extractProjectNameFromSessionName(sessionName) {
        if (!sessionName || typeof sessionName !== 'string') {
            return null;
        }
        
        // Skip temporary sessions (claude-web-session-{timestamp})
        if (sessionName.startsWith('claude-web-session-')) {
            return null;
        }
        
        // Parse project sessions: claude-web-{projectName}-{number}
        const match = sessionName.match(/^claude-web-(.+)-\d+$/);
        if (match) {
            return match[1];
        }
        
        return null;
    }

    // 清理资源
    destroy() {
        console.log('🧹 Destroying TTYd Terminal Manager...');
        
        // 清理定时器
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        // 清理DOM
        const tabsContainer = document.getElementById('terminal-tabs');
        if (tabsContainer) {
            tabsContainer.innerHTML = '';
        }

        // 清理数据
        this.sessions.clear();
        this.activeSessionName = null;
        this.isInitialized = false;
    }
}

// 创建全局实例
window.terminalManager = new TTYdTerminalManager();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.terminalManager.init();
});

// 导出以供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TTYdTerminalManager;
}