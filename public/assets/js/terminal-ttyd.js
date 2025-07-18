// 简化的终端管理器 - 使用ttyd iframe替代xterm.js
class TTYdTerminalManager {
    constructor() {
        this.terminals = new Map(); // 存储标签页信息
        this.activeTerminalId = null;
        this.terminalCounter = 0;
        this.iframe = null;
        this.isInitialized = false;
        
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
            
            // 如果没有激活的终端，创建第一个
            if (this.terminals.size === 0) {
                this.createNewTerminal();
            }
        };

        // 监听iframe错误
        this.iframe.onerror = (error) => {
            console.error('❌ TTYd terminal iframe error:', error);
            this.showError('Failed to load terminal');
        };

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

    async createNewTerminal(projectName = null) {
        console.log('🔧 Creating new terminal session...');

        // 隐藏欢迎屏幕并显示iframe
        this.hideWelcomeScreen();
        this.showIframe();

        // 创建简单的终端标识
        this.terminalCounter++;
        const terminalId = `terminal-${this.terminalCounter}`;
        
        // 创建终端对象（简化版）
        const terminal = {
            id: terminalId,
            name: projectName || `Terminal ${this.terminalCounter}`,
            isActive: true,
            createdAt: Date.now()
        };

        // 添加到终端列表
        this.terminals.set(terminalId, terminal);

        // 创建标签页
        this.createTerminalTab(terminal);

        // 切换到新终端
        this.switchToTerminal(terminalId);

        return terminalId;
    }

    createTerminalTab(terminal) {
        const tabsContainer = document.getElementById('terminal-tabs');
        
        // 创建标签页元素
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.terminalId = terminal.id;
        tab.innerHTML = `
            <span class="tab-title">${terminal.name}</span>
            <button class="tab-close" title="Close Terminal">×</button>
        `;

        // 添加点击事件
        tab.addEventListener('click', (e) => {
            if (!e.target.matches('.tab-close')) {
                this.switchToTerminal(terminal.id);
            }
        });

        // 添加关闭事件
        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTerminal(terminal.id);
        });

        tabsContainer.appendChild(tab);
    }


    async switchToTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            console.error('❌ Terminal not found:', terminalId);
            return;
        }

        console.log('🔄 Switching to terminal:', terminalId);

        // 更新活动终端
        this.activeTerminalId = terminalId;

        // 更新标签页样式
        this.updateTabStyles(terminalId);

        // 隐藏欢迎屏幕
        this.hideWelcomeScreen();

        // 显示iframe
        this.showIframe();
    }


    updateTabStyles(activeTerminalId) {
        const tabs = document.querySelectorAll('.terminal-tab');
        tabs.forEach(tab => {
            if (tab.dataset.terminalId === activeTerminalId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
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

    async closeTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;

        console.log('🗑️ Closing terminal:', terminalId);

        // 删除标签页
        const tab = document.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (tab) {
            tab.remove();
        }

        // 从列表中删除
        this.terminals.delete(terminalId);

        // 如果这是活动终端，切换到其他终端
        if (this.activeTerminalId === terminalId) {
            const remainingTerminals = Array.from(this.terminals.keys());
            if (remainingTerminals.length > 0) {
                this.switchToTerminal(remainingTerminals[0]);
            } else {
                // 没有终端了，显示欢迎屏幕
                this.showWelcomeScreen();
            }
        }
    }

    showWelcomeScreen() {
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'block';
        }
        
        if (this.iframe) {
            this.iframe.style.display = 'none';
        }
        
        this.activeTerminalId = null;
    }

    handleResize() {
        // iframe会自动处理resize，无需特殊处理
        console.log('📏 Window resized, iframe will auto-adjust');
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

    // 获取活动终端
    getActiveTerminal() {
        return this.terminals.get(this.activeTerminalId);
    }

    // 获取所有终端
    getAllTerminals() {
        return Array.from(this.terminals.values());
    }

    // 清理资源
    destroy() {
        console.log('🧹 Destroying TTYd Terminal Manager...');
        
        // 清理DOM
        const tabsContainer = document.getElementById('terminal-tabs');
        if (tabsContainer) {
            tabsContainer.innerHTML = '';
        }

        // 清理数据
        this.terminals.clear();
        this.activeTerminalId = null;
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