// 代碼編輯器管理
class EditorManager {
    constructor() {
        this.editor = null;
        this.codeVersion = 0;
        this.isEditing = false;
        this.lastAutoSave = 0;
        this.collaboratingUsers = new Set();
        this.codeHistory = []; // 代碼歷史記錄，最多保存5個版本
        this.maxHistorySize = 5;
    }

    // 初始化 CodeMirror 編輯器
    initialize() {
        this.editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
            mode: 'python',
            theme: 'default',
            lineNumbers: true,
            indentUnit: 4,
            autoCloseBrackets: true,
            matchBrackets: true,
            lineWrapping: true,
            extraKeys: {
                "Ctrl-S": (cm) => {
                    this.saveCode();
                    return false;
                },
                "Ctrl-Enter": (cm) => {
                    this.runCode();
                    return false;
                },
                "Ctrl-/": "toggleComment"
            }
        });

        // 動態設置編輯器樣式
        this.setupEditorStyles();

        // 監聽編輯事件
        this.editor.on('changes', (cm, changes) => {
            console.log('📝 Editor "changes" event triggered. Origin:', changes[0].origin, 'Changes:', changes);

            if (wsManager.isConnected() && changes.length > 0 && changes[0].origin !== 'setValue') {
                this.isEditing = true;
                this.lastAutoSave = Date.now();
                
                const code = this.editor.getValue();
                this.codeVersion++; 

                console.log(`📤 Preparing to send code_change. Version: ${this.codeVersion}, User: ${wsManager.currentUser}`);
                wsManager.sendMessage({
                    type: 'code_change',
                    code: code,
                    version: this.codeVersion,
                    userName: wsManager.currentUser
                });
                this.updateVersionDisplay();

                if (this.collaboratingUsers.size > 0) {
                    UI.showCollaborationAlert(this.collaboratingUsers);
                }
            } else if (!wsManager.isConnected() && changes.length > 0 && changes[0].origin !== 'setValue') {
                // Only log warning if the change was user-initiated and not from setValue
                console.warn('Editor changes detected, but WebSocket is not connected. Code change not sent.');
            }
        });

        // 監聽游標變化
        this.editor.on('cursorActivity', (cm) => {
            if (wsManager.isConnected() && wsManager.currentRoom) {
                const cursor = cm.getCursor();
                // console.log('📤 Sending cursor_change', cursor); // 這個日誌可以按需啟用，避免過多訊息
                wsManager.sendMessage({
                    type: 'cursor_change',
                    cursor: cursor,
                    userName: wsManager.currentUser // 確保發送用戶名
                });
            }
        });

        // 設置自動保存 - 5分鐘一次
        this.setupAutoSave();
        
        // 載入歷史記錄
        this.loadHistoryFromStorage();
    }

    // 動態設置編輯器樣式
    setupEditorStyles() {
        console.log('🎨 開始設置編輯器樣式 (V2)...');
        
        const editorElement = this.editor.getWrapperElement();
        const gutters = editorElement.querySelector('.CodeMirror-gutters');
        const scrollElement = editorElement.querySelector('.CodeMirror-scroll');
        const linesElement = editorElement.querySelector('.CodeMirror-lines');
        
        // 設置編輯器容器樣式 (div.CodeMirror)
        editorElement.style.cssText = `
            height: 500px !important;
            border-radius: 10px !important;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace !important;
            font-size: 14px !important;
            line-height: 1.5 !important;
            border: 1px solid #ddd !important;
            background: #FFFFFF !important; /* 強制白色背景 */
            color: #333333 !important; /* 預設深色文字 */
        `;
        
        // 設置行號區域樣式
        if (gutters) {
            gutters.style.cssText = `
                background: #f8f9fa !important; /* 淺灰色背景 */
                border-right: 1px solid #e9ecef !important;
                width: 60px !important;
            `;
            
            const lineNumbers = gutters.querySelectorAll('.CodeMirror-linenumber');
            lineNumbers.forEach(lineNum => {
                lineNum.style.cssText = `
                    color: #6c757d !important; /* 行號文字顏色 */
                    padding: 0 8px 0 0 !important;
                    text-align: right !important;
                    font-size: 13px !important;
                `;
            });
        }
        
        // 設置滾動區域樣式
        if (scrollElement) {
            scrollElement.style.cssText = `
                background: transparent !important; /* 透明背景，顯示 editorElement 的白色 */
            `;
        }
        
        // 設置程式碼行容器樣式
        if (linesElement) {
            linesElement.style.cssText = `
                padding-left: 70px !important; /* 為行號留出空間 */
                margin-left: 0 !important;
                background: transparent !important; /* 透明背景 */
            `;
        }
        
        // 監聽編輯器內容變化，動態調整新行的樣式 (主要針對行號文字)
        this.editor.on('update', () => {
            this.applyDynamicStyles();
        });
        
        // 首次強制刷新編輯器，確保樣式應用
        if (this.editor) {
            this.editor.refresh();
        }
        
        console.log('✅ 編輯器樣式設置完成 (V2)');
    }
    
    // 動態應用樣式到新生成的行號
    applyDynamicStyles() {
        const editorElement = this.editor.getWrapperElement();
        const gutters = editorElement.querySelector('.CodeMirror-gutters');
        
        if (gutters) {
            const lineNumbers = gutters.querySelectorAll('.CodeMirror-linenumber');
            lineNumbers.forEach(lineNum => {
                if (!lineNum.hasAttribute('data-styled')) {
                    lineNum.style.cssText = `
                        color: #6c757d !important;
                        padding: 0 8px 0 0 !important;
                        text-align: right !important;
                        font-size: 13px !important;
                    `;
                    lineNum.setAttribute('data-styled', 'true');
                }
            });
        }
    }

    // 設置自動保存 - 改為5分鐘
    setupAutoSave() {
        setInterval(() => {
            if (wsManager.isConnected() && this.editor && this.isEditing && 
                Date.now() - this.lastAutoSave > 10000) { // 10秒無操作後才自動保存
                this.saveCode(true); // 標記為自動保存
                console.log('🔄 自動保存代碼');
            }
        }, 300000); // 5分鐘 = 300000毫秒
    }

    // 保存代碼
    saveCode(isAutoSave = false) {
        if (!wsManager.isConnected()) {
            UI.showErrorToast("無法保存代碼：請先加入房間。");
            return;
        }
        
        const code = this.editor.getValue();
        let customName = null;

        // 如果是手動保存，則彈出輸入框讓用戶命名
        if (!isAutoSave) {
            let name = prompt("請為您的代碼版本命名 (留空則自動命名): ");
            if (name === null) { // 用戶點擊了取消
                console.log("用戶取消保存操作。");
                return;
            }
            customName = name.trim();
        }

        // 生成默認名稱（如果沒有提供或為空）
        if (customName === null || customName === '') {
            const now = new Date();
            customName = isAutoSave ? 
                         `自動保存 ${now.toLocaleString('zh-TW', { hour12: false })}` :
                         `手動保存 ${now.toLocaleString('zh-TW', { hour12: false })}`;
        }
        
        this.saveToHistory(code, customName); // 將名稱傳遞給 saveToHistory

        wsManager.sendMessage({
            type: 'save_code',
            code: code,
            name: customName // 發送名稱到服務器
        });

        UI.showSuccessToast(`代碼已保存: ${customName}`);
        this.updateVersionDisplay(); // 保持版本號更新
    }

    // 保存代碼到歷史記錄
    saveToHistory(code, name) {
        const currentCode = code;
        const now = new Date();

        const historyItem = {
            code: currentCode,
            timestamp: now.toISOString(),
            name: name // 包含名稱
        };

        this.codeHistory.unshift(historyItem);

        if (this.codeHistory.length > this.maxHistorySize) {
            this.codeHistory.pop();
        }

        localStorage.setItem('codeHistory', JSON.stringify(this.codeHistory));
        console.log(`✅ 代碼已保存到本地歷史記錄: ${name}`);

        this.updateHistoryUI();
    }

    // 從歷史記錄載入代碼
    loadFromHistory(index) {
        if (index >= 0 && index < this.codeHistory.length) {
            const historyItem = this.codeHistory[index];
            this.editor.setValue(historyItem.code);
            UI.showSuccessToast(`已載入 ${historyItem.name} 的代碼版本`);
        }
    }

    // 更新歷史記錄UI
    updateHistoryUI() {
        const loadCodeOptions = document.getElementById('loadCodeOptions');
        if (!loadCodeOptions) {
            console.error('❌ 載入代碼選項的UI元素未找到!');
            return;
        }

        // 清除現有的歷史版本選項，但保留第一個（載入最新代碼）和分割線
        // 從 loadDropdownBtn 的 li 子元素中移除除了第一個和 class 為 dropdown-divider 的元素
        const existingItems = Array.from(loadCodeOptions.children);
        existingItems.forEach(item => {
            if (item.tagName === 'LI' && item.firstElementChild && item.firstElementChild.className.includes('dropdown-item')) {
                // 這是歷史版本條目
                item.remove();
            } else if (item.tagName === 'LI' && item.className === 'dropdown-header' && item.textContent === '歷史版本') {
                item.remove(); // 移除舊的「歷史版本」標題
            } else if (item.tagName === 'LI' && item.querySelector('span.dropdown-item-text')) {
                item.remove(); // 移除舊的「無歷史版本」消息
            }
        });

        // 重新添加「歷史版本」標題和「無歷史版本」消息
        const historyHeaderLi = document.createElement('li');
        historyHeaderLi.innerHTML = '<h6 class="dropdown-header">歷史版本</h6>';
        loadCodeOptions.appendChild(historyHeaderLi);

        const historyEmptyMessageLi = document.createElement('li');
        historyEmptyMessageLi.id = 'historyEmptyMessage';
        historyEmptyMessageLi.innerHTML = '<span class="dropdown-item-text text-muted">無歷史版本</span>';
        loadCodeOptions.appendChild(historyEmptyMessageLi);


        const historyEmptyMessage = document.getElementById('historyEmptyMessage');
        if (historyEmptyMessage) {
            historyEmptyMessage.style.display = 'none'; // 預設隱藏空消息
        }

        if (this.codeHistory.length > 0) {
            this.codeHistory.forEach((item, index) => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.className = 'dropdown-item';
                a.href = '#';
                // 使用保存時的名稱顯示
                a.textContent = `${item.name} (${new Date(item.timestamp).toLocaleString('zh-TW', { hour12: false })})`;
                a.onclick = (e) => {
                    e.preventDefault();
                    this.loadFromHistory(index);
                };
                li.appendChild(a);
                // 插入到正確的位置，在「歷史版本」標題之後，但要在「無歷史版本」之前
                loadCodeOptions.insertBefore(li, historyEmptyMessage);
            });
        } else {
            if (historyEmptyMessage) {
                historyEmptyMessage.style.display = 'block'; // 顯示空消息
            }
        }
    }

    // 初始化時載入歷史記錄
    loadHistoryFromStorage() {
        try {
            const stored = localStorage.getItem('codeHistory');
            if (stored) {
                this.codeHistory = JSON.parse(stored);
                this.updateHistoryUI();
            }
        } catch (error) {
            console.warn('無法載入歷史記錄:', error);
            this.codeHistory = [];
        }
    }

    // 載入 - 修改為智能載入最新版本
    loadCode(loadType = 'latest') {
        if (!wsManager.isConnected()) {
            UI.showErrorToast('未連接到服務器，無法載入');
            return;
        }
        
        if (!wsManager.currentRoom) {
            UI.showErrorToast('請先加入房間');
            return;
        }
        
        // 智能載入邏輯：先檢查是否已是最新版本
        console.log('🔍 檢查代碼版本狀態...');
        
        // 請求載入房間最新代碼（服務器會返回最新版本信息）
        wsManager.sendMessage({
            type: 'load_code',
            roomId: wsManager.currentRoom,
            currentVersion: this.codeVersion // 發送當前版本號給服務器比較
        });
        
        UI.showSuccessToast('正在檢查最新代碼...');
    }

    // 運行代碼
    runCode() {
        const code = this.editor.getValue().trim();
        
        if (!code) {
            this.showOutput('錯誤：請先輸入Python代碼', 'error');
            return;
        }
        
        // 顯示運行中狀態
        this.showOutput('正在運行代碼...', 'info');
        
        // 發送運行請求到服務器
        if (wsManager.isConnected()) {
            wsManager.sendMessage({
                type: 'run_code',
                code: code,
                roomId: wsManager.currentRoom,
                userName: wsManager.currentUser
            });
        } else {
            this.showOutput('錯誤：未連接到服務器', 'error');
        }
    }

    // 處理遠端代碼變更
    handleRemoteCodeChange(message) {
        console.log(`📥 Received remote code_change from ${message.userName}. Local version: ${this.codeVersion}, Remote version: ${message.version}`);
        
        // 檢測衝突: 只有當本地有未保存的編輯 (isEditing) 且遠程版本號大於本地時，才視為衝突
        if (this.isEditing && message.version > this.codeVersion) {
            console.warn('🚨 衝突檢測：準備顯示衝突解決模態框');
            console.log('🔍 檢查ConflictResolver模組:');
            console.log('   - typeof ConflictResolver:', typeof ConflictResolver);
            
            if (typeof ConflictResolver !== 'undefined') {
                console.log('   - ConflictResolver對象:', ConflictResolver);
                console.log('   - showConflictModal方法:', typeof ConflictResolver.showConflictModal);
                
                if (typeof ConflictResolver.showConflictModal === 'function') {
                    console.log('✅ 正在調用ConflictResolver.showConflictModal');
                    ConflictResolver.showConflictModal(message);
                } else {
                    console.error('❌ ConflictResolver.showConflictModal不是函數');
                    this.handleFallbackConflict(message);
                }
            } else {
                console.error('❌ ConflictResolver模組未定義');
                this.handleFallbackConflict(message);
            }
        } else if (message.version > this.codeVersion || (message.version === this.codeVersion && this.editor.getValue() !== message.code)) {
            // 如果遠程版本更高，或者版本相同但內容不同，則更新編輯器
            console.log('🔄 應用遠程代碼變更，更新編輯器內容和版本');
            this.editor.setValue(message.code);
            this.codeVersion = message.version;
            this.isEditing = false; // 遠程更新後，清除本地編輯狀態
            this.updateVersionDisplay();
        } else if (message.version < this.codeVersion) {
            console.warn('⚠️ 收到過時的代碼變更，本地版本更新。忽略遠程變更。');
        } else {
            console.log('📝 遠程代碼變更版本不更新或內容相同，無需操作');
        }
        
        // 標記用戶正在協作
        this.collaboratingUsers.add(message.userName);
        setTimeout(() => {
            this.collaboratingUsers.delete(message.userName);
            if (this.collaboratingUsers.size === 0) {
                UI.hideCollaborationAlert();
            }
        }, 5000);
    }
    
    // 衝突處理的回退方案
    handleFallbackConflict(message) {
        console.log('🚨 使用回退方案處理衝突');
        const shouldReload = confirm(`檢測到代碼衝突！\n\n其他用戶：${message.userName}\n版本：${message.version}\n\n是否載入最新版本？\n\n確定=載入最新版本，取消=保持當前版本`);
        
        if (shouldReload) {
            this.editor.setValue(message.code);
            this.codeVersion = message.version;
            this.isEditing = false;
            this.updateVersionDisplay();
            UI.showSuccessToast('已載入最新版本解決衝突');
        } else {
            UI.showWarningToast('保持當前版本，請注意版本差異');
        }
    }

    // 處理代碼載入響應
    handleCodeLoaded(message) {
        if (message.success) {
            const isAlreadyLatest = message.isAlreadyLatest;
            const hasChanges = this.editor.getValue().trim() !== '';
            
            if (isAlreadyLatest) {
                // 當前已是最新版本
                if (this.codeHistory.length > 0) {
                    // 有歷史版本，詢問用戶是否要查看
                    const viewHistory = confirm(
                        `✅ 您當前的代碼已是最新版本！\n\n` +
                        `當前版本：${this.codeVersion}\n` +
                        `是否要查看歷史版本？\n\n` +
                        `確定 = 打開歷史版本選單\n` +
                        `取消 = 保持當前代碼`
                    );
                    
                    if (viewHistory) {
                        // 觸發下拉選單打開
                        const dropdownBtn = document.getElementById('loadDropdownBtn');
                        if (dropdownBtn) {
                            dropdownBtn.click();
                        }
                        UI.showInfoToast('請從下拉選單中選擇要載入的歷史版本');
                    } else {
                        UI.showSuccessToast('保持當前最新代碼');
                    }
                } else {
                    // 沒有歷史版本
                    UI.showInfoToast('您的代碼已是最新版本，且無歷史版本可載入');
                }
            } else {
                // 不是最新版本，需要載入
                if (hasChanges) {
                    // 用戶有未保存的變更，詢問確認
                    const shouldLoad = confirm(
                        `🔄 檢測到服務器有更新的代碼！\n\n` +
                        `當前版本：${this.codeVersion}\n` +
                        `最新版本：${message.version}\n\n` +
                        `載入最新代碼將覆蓋當前內容，確定要繼續嗎？\n\n` +
                        `確定 = 載入最新代碼\n` +
                        `取消 = 保持當前內容`
                    );
                    
                    if (!shouldLoad) {
                        UI.showWarningToast('已取消載入，保持當前內容');
                        return;
                    }
                }
                
                // 載入最新代碼
                this.editor.setValue(message.code || '');
                this.codeVersion = message.version || 0;
                this.updateVersionDisplay();
                UI.showSuccessToast(`代碼已更新到最新版本 ${message.version}！`);
            }
        } else {
            UI.showErrorToast(message.error || '代碼載入失敗');
        }
    }

    // 處理運行結果
    handleExecutionResult(result) {
        console.log('🔍 收到代碼執行結果:', result);
        console.log('   - 成功狀態:', result.success);
        console.log('   - 消息內容:', result.message);
        console.log('   - 時間戳:', result.timestamp);
        
        if (result.success) {
            this.showOutput(result.message, 'success');
        } else {
            this.showOutput(result.message, 'error');
        }
    }

    // 顯示輸出結果
    showOutput(content, type = 'success') {
        const outputDiv = document.getElementById('codeOutput');
        const outputContent = document.getElementById('outputContent');
        
        // 顯示輸出區域
        outputDiv.style.display = 'block';
        
        // 根據類型設置樣式
        let icon = '';
        switch (type) {
            case 'success': icon = '✅'; break;
            case 'error': icon = '❌'; break;
            case 'info': icon = 'ℹ️'; break;
            default: icon = '📝'; break;
        }
        
        // 添加時間戳
        const timestamp = new Date().toLocaleTimeString();
        const output = `[${timestamp}] ${icon} ${content}\n`;
        
        // 追加到輸出內容
        outputContent.innerHTML += output;
        
        // 滾動到底部
        outputContent.scrollTop = outputContent.scrollHeight;
    }

    // 清除輸出
    clearOutput() {
        const outputContent = document.getElementById('outputContent');
        outputContent.innerHTML = '';
        
        const outputDiv = document.getElementById('codeOutput');
        outputDiv.style.display = 'none';
    }

    // 設置代碼
    setCode(code) {
        this.editor.setValue(code);
    }

    // 獲取代碼
    getCode() {
        return this.editor.getValue();
    }

    // 設置版本
    setVersion(version) {
        this.codeVersion = version;
        this.updateVersionDisplay();
    }

    // 更新版本顯示
    updateVersionDisplay() {
        document.getElementById('codeVersion').textContent = `版本: ${this.codeVersion}`;
    }

    // 移除協作用戶
    removeCollaboratingUser(userName) {
        this.collaboratingUsers.delete(userName);
        if (this.collaboratingUsers.size === 0) {
            UI.hideCollaborationAlert();
        }
    }
}

// 全局編輯器管理器實例
const Editor = new EditorManager(); 