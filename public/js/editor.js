// 代碼編輯器管理
class EditorManager {
    constructor() {
        this.editor = null;
        this.isEditing = false;
        this.codeVersion = 0; // 確保版本號從0開始
        this.collaboratingUsers = new Set();
        this.editStartTime = 0;
        this.editingTimeout = null;
        this.changeTimeout = null;
        this.lastAutoSave = 0;
        this.codeHistory = JSON.parse(localStorage.getItem('codeHistory') || '[]');
        this.maxHistorySize = 10;
        this.lastRemoteChangeTime = null;
        this.isInitialized = false;
        
        console.log('🔧 編輯器管理器已創建，初始版本號:', this.codeVersion);
    }

    // 初始化 CodeMirror 編輯器
    initialize() {
        const textArea = document.getElementById('codeEditor');
        if (!textArea) {
            console.error('❌ 找不到編輯器 textarea 元素 #codeEditor');
            return;
        }

        console.log('🔧 正在初始化 CodeMirror 編輯器...');
        
        this.editor = CodeMirror.fromTextArea(textArea, {
            mode: 'python',
            theme: 'default',
            lineNumbers: true,
            indentUnit: 4,
            autoCloseBrackets: true,
            matchBrackets: true,
            lineWrapping: true,
            autofocus: true,
            extraKeys: {
                "Ctrl-S": (cm) => {
                    this.saveCode();
                    return false;
                },
                "Ctrl-Enter": (cm) => {
                    this.runCode();
                    return false;
                },
                "Ctrl-/": "toggleComment",
                "Tab": function(cm) {
                    cm.replaceSelection("    ");
                },
                "Cmd-/": "toggleComment"
            }
        });

        // 確保編輯器已創建
        if (!this.editor) {
            console.error('❌ CodeMirror 編輯器初始化失敗');
            return;
        }

        // 動態設置編輯器樣式
        this.setupEditorStyles();

        // 統一編輯狀態管理
        this.setupEditingStateTracking();

        // 設置自動保存
        this.setupAutoSave();
        
        // 載入歷史記錄
        this.loadHistoryFromStorage();

        // 延遲聚焦和初始化完成標記
        setTimeout(() => {
            if (this.editor) {
                this.editor.refresh();
                this.editor.focus();
                this.isInitialized = true;
                console.log('✅ 編輯器已初始化並聚焦，可以開始輸入');
            }
        }, 100);

        console.log('✅ 編輯器初始化完成');
    }

    // 檢查編輯器是否已初始化
    isReady() {
        return this.editor && this.isInitialized;
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
                cursor: text !important; /* 確保顯示文本輸入游標 */
            `;
        }

        // 確保編輯器不是只讀模式
        this.editor.setOption('readOnly', false);
        console.log('🔧 編輯器設置為可編輯模式');
        
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
            if (window.UI && typeof window.UI.showErrorToast === 'function') {
                window.UI.showErrorToast("無法保存代碼：請先加入房間。");
            } else {
                console.error("無法保存代碼：請先加入房間。");
            }
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
            saveName: customName // 修改為 saveName 以匹配後端
        });

        // 保存後重置編輯狀態
        this.resetEditingState();

        if (window.UI && typeof window.UI.showSuccessToast === 'function') {
            window.UI.showSuccessToast(`代碼已保存: ${customName}`);
        } else {
            console.log(`代碼已保存: ${customName}`);
        }
        this.updateVersionDisplay(); // 保持版本號更新
    }

    // 重置編輯狀態
    resetEditingState() {
        this.isEditing = false;
        console.log('🔄 編輯狀態已重置: isEditing = false');
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
            if (window.UI && typeof window.UI.showSuccessToast === 'function') {
                window.UI.showSuccessToast(`已載入 ${historyItem.name} 的代碼版本`);
            } else {
                console.log(`已載入 ${historyItem.name} 的代碼版本`);
            }
        }
    }

    // 載入 - 修改為智能載入最新版本
    loadCode(loadType = 'latest') {
        if (!wsManager.isConnected()) {
            if (window.UI && typeof window.UI.showErrorToast === 'function') {
                window.UI.showErrorToast('未連接到服務器，無法載入');
            } else {
                console.error('未連接到服務器，無法載入');
            }
            return;
        }
        
        if (!wsManager.currentRoom) {
            if (window.UI && typeof window.UI.showErrorToast === 'function') {
                window.UI.showErrorToast('請先加入房間');
            } else {
                console.error('請先加入房間');
            }
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
        
        if (window.UI && typeof window.UI.showSuccessToast === 'function') {
            window.UI.showSuccessToast('正在檢查最新代碼...');
        } else {
            console.log('正在檢查最新代碼...');
        }
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

    // 處理遠端代碼變更 - 簡化版衝突檢測
    handleRemoteCodeChange(message) {
        console.log('📨 收到遠程代碼變更:', message);
        
        // 🔧 記錄遠程變更時間（用於衝突預警）
        this.lastRemoteChangeTime = message.timestamp || Date.now();
        
        console.log('🔍 本地編輯狀態詳細檢查:');
        console.log(`   - isEditing: ${this.isEditing}`);
        console.log(`   - editStartTime: ${this.editStartTime}`);
        console.log(`   - 編輯持續時間: ${this.editStartTime ? (Date.now() - this.editStartTime) / 1000 : 0}秒`);
        console.log(`   - 本地版本: ${this.codeVersion}`);
        console.log(`   - 遠程版本: ${message.version}`);
        console.log(`   - 本地用戶: \"${wsManager.currentUser}\"`);
        console.log(`   - 遠程用戶: \"${message.userName}\"`);
        console.log(`   - 強制更新: ${message.forceUpdate}`);
        console.log(`   - 有衝突預警: ${message.hasConflictWarning}`);
        
        // 如果是強制更新，直接應用，不檢測衝突
        if (message.forceUpdate) {
            console.log('🔥 強制更新模式，直接應用代碼');
            this.applyRemoteCode(message);
            if (window.UI && typeof window.UI.showInfoToast === 'function') {
                window.UI.showInfoToast(`${message.userName} 強制更新了代碼`);
            } else {
                console.log(`${message.userName} 強制更新了代碼`);
            }
            return;
        }
        
        // 🔧 衝突檢測邏輯 V6 - 增強雙方提醒
        const recentlyEdited = this.editStartTime && (Date.now() - this.editStartTime) < 5000;
        const isConflict = (this.isEditing || recentlyEdited) && 
                          message.userName !== wsManager.currentUser;
        
        console.log(`🔍 衝突檢測結果:`);
        console.log(`   - 最近編輯: ${recentlyEdited}`);
        console.log(`   - 編輯狀態: ${this.isEditing}`);
        console.log(`   - 不同用戶: ${message.userName !== wsManager.currentUser}`);
        console.log(`   - 發現衝突: ${isConflict}`);
        
        if (isConflict) {
            console.log('🚨 檢測到協作衝突！啟動雙方處理流程...');
            
            // 🔧 通知發送方（主改方）：對方需要處理衝突
            this.notifyRemoteUserAboutConflict(message);
            
            // 🔧 顯示本地衝突解決界面（被改方）
            if (window.ConflictResolver && typeof window.ConflictResolver.showConflictModal === 'function') {
                const localCode = this.editor.getValue();
                console.log('🔄 調用增強衝突解決器...');
                window.ConflictResolver.showConflictModal(
                    localCode,           // 本地代碼（您的版本）
                    message.code,        // 遠程代碼（對方版本）
                    message.userName,    // 遠程用戶名
                    this.codeVersion,    // 本地版本號
                    message.version      // 遠程版本號
                );
            } else {
                console.error('❌ ConflictResolver 未找到，使用後備衝突處理');
                this.fallbackConflictHandling(message);
            }
            
            // 在聊天室顯示衝突提醒
            if (window.Chat && typeof window.Chat.addSystemMessage === 'function') {
                window.Chat.addSystemMessage(
                    `⚠️ 協作衝突：${message.userName} 和 ${wsManager.currentUser} 同時在修改代碼`
                );
            }
            
        } else {
            // 沒有衝突，正常應用代碼
            console.log('✅ 無衝突，正常應用遠程代碼變更');
            this.applyRemoteCode(message);
            
            // 🔧 如果對方有衝突預警，顯示協作提醒
            if (message.hasConflictWarning) {
                if (window.UI && typeof window.UI.showInfoToast === 'function') {
                    window.UI.showInfoToast(`⚠️ ${message.userName} 在衝突預警後仍選擇發送了修改`);
                } else {
                    console.log(`⚠️ ${message.userName} 在衝突預警後仍選擇發送了修改`);
                }
            } else {
                if (window.UI && typeof window.UI.showInfoToast === 'function') {
                    window.UI.showInfoToast(`📝 ${message.userName} 更新了代碼`);
                } else {
                    console.log(`📝 ${message.userName} 更新了代碼`);
                }
            }
        }
    }

    // 🆕 通知遠程用戶關於衝突的情況
    notifyRemoteUserAboutConflict(message) {
        console.log('📡 通知遠程用戶關於衝突...');
        
        // 發送衝突通知消息給服務器，服務器會轉發給相關用戶
        const conflictNotification = {
            type: 'conflict_notification',
            targetUser: message.userName,  // 發送給主改方
            conflictWith: wsManager.currentUser,  // 被改方（自己）
            message: `${wsManager.currentUser} 正在處理您剛才發送的代碼修改衝突`,
            timestamp: Date.now(),
            conflictData: {
                localUser: wsManager.currentUser,
                remoteUser: message.userName,
                localCode: this.editor.getValue(),
                remoteCode: message.code
            }
        };
        
        if (wsManager.isConnected()) {
            wsManager.sendMessage(conflictNotification);
            console.log('✅ 衝突通知已發送給:', message.userName);
        }
    }

    // 🆕 備用衝突處理方法
    fallbackConflictHandling(message) {
        console.log('🔧 執行備用衝突處理');
        
        const userChoice = confirm(
            `🔔 檢測到代碼衝突！\n\n` +
            `${message.userName} 正在修改代碼，但您也在編輯中。\n\n` +
            `您的代碼長度: ${this.getCode().length} 字符\n` +
            `${message.userName} 的代碼長度: ${(message.code || '').length} 字符\n\n` +
            `點擊「確定」載入 ${message.userName} 的版本\n` +
            `點擊「取消」保持您的版本\n\n` +
            `建議：與 ${message.userName} 在聊天室協商`
        );
        
        if (userChoice) {
            // 用戶選擇載入遠程版本
            this.applyRemoteCode(message);
            this.resetEditingState();
            console.log('🔄 用戶選擇載入遠程版本');
            
            // 通知聊天室
            if (window.Chat && typeof window.Chat.addSystemMessage === 'function') {
                window.Chat.addSystemMessage(`${wsManager.currentUser} 選擇載入 ${message.userName} 的代碼版本`);
            }
        } else {
            // 用戶選擇保持本地版本，強制發送本地代碼
            console.log('🔒 用戶選擇保持本地版本，發送本地代碼');
            
            // 通知聊天室
            if (window.Chat && typeof window.Chat.addSystemMessage === 'function') {
                window.Chat.addSystemMessage(`${wsManager.currentUser} 選擇保持自己的代碼版本`);
            }
            
            setTimeout(() => {
                this.sendCodeChange(true); // 強制發送
            }, 100);
        }
    }

    // 🔧 安全應用遠程代碼，避免觸發編輯狀態
    applyRemoteCode(message) {
        console.log('🔄 安全應用遠程代碼...');
        console.log(`📝 代碼內容預覽: "${(message.code || '').substring(0, 50)}..."`);
        console.log(`🔢 版本號: ${message.version}`);
        
        // 暫停編輯狀態檢測，避免循環觸發
        const wasEditing = this.isEditing;
        this.isEditing = false;
        
        // 清除所有超時計時器
        clearTimeout(this.changeTimeout);
        clearTimeout(this.editingTimeout);
        
        try {
            // 設置代碼內容，使用 setValue 避免觸發編輯事件
            this.editor.setValue(message.code || '');
            
            // 更新版本號
            if (message.version !== undefined) {
                this.codeVersion = message.version;
                this.updateVersionDisplay();
                console.log(`✅ 遠程代碼已應用 - 長度: ${(message.code || '').length}, 版本: ${this.codeVersion}`);
            }
            
        } catch (error) {
            console.error('❌ 應用遠程代碼時出錯:', error);
        }
        
        // 🔧 短暫延遲後處理編輯狀態
        setTimeout(() => {
            if (message.userName === wsManager.currentUser) {
                // 自己的更新，完全重置編輯狀態
                this.isEditing = false;
                console.log('🔄 自己的更新，重置編輯狀態');
            } else if (wasEditing && !message.forceUpdate) {
                // 其他用戶更新但用戶之前在編輯，可能需要觸發衝突檢測
                // 這裡不恢復編輯狀態，讓用戶決定
                this.isEditing = false;
                console.log('🔄 其他用戶更新，暫時重置編輯狀態');
            } else {
                // 正常情況，保持重置狀態
                this.isEditing = false;
                console.log('🔄 正常狀態，編輯狀態已重置');
            }
        }, 200);
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
        const outputElement = document.getElementById('codeOutput');
        if (outputElement) {
            outputElement.style.display = 'none';
            document.getElementById('outputContent').innerHTML = '';
        }
    }

    // 複製代碼到剪貼簿
    copyCode() {
        const code = this.editor.getValue();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            // 現代瀏覽器支援 Clipboard API
            navigator.clipboard.writeText(code).then(() => {
                if (window.UI && typeof window.UI.showSuccessToast === 'function') {
                    window.UI.showSuccessToast('代碼已複製到剪貼簿');
                } else {
                    console.log('代碼已複製到剪貼簿');
                }
            }).catch(() => {
                this.fallbackCopy(code);
            });
        } else {
            // 回退到傳統方法
            this.fallbackCopy(code);
        }
    }

    // 回退複製方法
    fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                if (window.UI && typeof window.UI.showSuccessToast === 'function') {
                    window.UI.showSuccessToast('代碼已複製到剪貼簿');
                } else {
                    console.log('代碼已複製到剪貼簿');
                }
            } else {
                if (window.UI && typeof window.UI.showErrorToast === 'function') {
                    window.UI.showErrorToast('複製失敗，請手動複製');
                } else {
                    console.error('複製失敗，請手動複製');
                }
            }
        } catch (err) {
            console.error('複製失敗:', err);
            if (window.UI && typeof window.UI.showErrorToast === 'function') {
                window.UI.showErrorToast('複製失敗，請手動複製');
            } else {
                console.error('複製失敗，請手動複製');
            }
        }
        
        document.body.removeChild(textArea);
    }

    // 下載代碼為 .py 檔案
    downloadCode() {
        const code = this.editor.getValue();
        const filename = prompt('請輸入檔案名稱 (不需要 .py 副檔名):', 'my_python_code') || 'my_python_code';
        
        const blob = new Blob([code], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.py`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        if (window.UI && typeof window.UI.showSuccessToast === 'function') {
            window.UI.showSuccessToast(`檔案 "${filename}.py" 已下載`);
        } else {
            console.log(`檔案 "${filename}.py" 已下載`);
        }
    }

    // 觸發文件導入
    importCode() {
        const fileInput = document.getElementById('file-import');
        if (fileInput) {
            fileInput.click();
        }
    }

    // 處理文件導入
    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // 檢查文件類型
        const fileName = file.name.toLowerCase();
        const validExtensions = ['.py', '.txt'];
        const isValidFile = validExtensions.some(ext => fileName.endsWith(ext)) || 
                           file.type === 'text/plain' || 
                           file.type === 'text/x-python';
        
        if (!isValidFile) {
            if (window.UI && typeof window.UI.showErrorToast === 'function') {
                window.UI.showErrorToast('只支援 .py 和 .txt 檔案');
            } else {
                console.error('只支援 .py 和 .txt 檔案');
            }
            return;
        }
        
        // 檢查文件大小 (1MB 限制)
        if (file.size > 1024 * 1024) {
            if (window.UI && typeof window.UI.showErrorToast === 'function') {
                window.UI.showErrorToast('檔案大小不能超過 1MB');
            } else {
                console.error('檔案大小不能超過 1MB');
            }
            return;
        }
        
        // 檢查是否需要覆蓋現有內容
        if (this.editor.getValue().trim()) {
            if (!confirm('當前編輯器有內容，是否要覆蓋？')) {
                // 清除文件輸入，允許重新選擇同一文件
                event.target.value = '';
                return;
            }
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.editor.setValue(e.target.result);
            if (window.UI && typeof window.UI.showSuccessToast === 'function') {
                window.UI.showSuccessToast(`檔案 "${file.name}" 載入成功`);
            } else {
                console.log(`檔案 "${file.name}" 載入成功`);
            }
            // 清除文件輸入
            event.target.value = '';
        };
        reader.onerror = () => {
            if (window.UI && typeof window.UI.showErrorToast === 'function') {
                window.UI.showErrorToast('檔案讀取失敗');
            } else {
                console.error('檔案讀取失敗');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    // 設置代碼
    setCode(code, version = null) {
        if (this.editor) {
            // 暫時停用編輯狀態檢測，避免觸發遠程更新
            const wasEditing = this.isEditing;
            this.isEditing = false;
            
            // 設置代碼內容
            this.editor.setValue(code || '');
            
            // 更新版本號
            if (version !== null) {
                this.codeVersion = version;
                this.updateVersionDisplay();
                console.log(`✅ 代碼已設置 - 長度: ${(code || '').length}, 版本: ${this.codeVersion}`);
            }
            
            // 恢復編輯狀態（如果之前在編輯）
            setTimeout(() => {
                this.isEditing = wasEditing;
            }, 100);
        }
    }

    // 獲取代碼
    getCode() {
        return this.editor ? this.editor.getValue() : '';
    }

    // 設置版本號（移除版本號顯示功能）
    setVersion(version) {
        this.codeVersion = version;
        // 註釋掉版本號顯示功能
        // this.updateVersionDisplay();
    }

    // 更新版本號顯示（移除此功能）
    updateVersionDisplay() {
        // 註釋掉版本號顯示功能
        // const versionElement = document.getElementById('codeVersion');
        // if (versionElement) {
        //     versionElement.textContent = `版本: ${this.codeVersion}`;
        // }
    }

    // 移除協作用戶
    removeCollaboratingUser(userName) {
        this.collaboratingUsers.delete(userName);
        if (this.collaboratingUsers.size === 0) {
            UI.hideCollaborationAlert();
        }
    }

    // 強化編輯狀態管理 - 簡化且穩定的編輯狀態追蹤
    setupEditingStateTracking() {
        console.log('🔧 設置強化編輯狀態追蹤系統 (V2 - 更敏感)');
        
        // 1. 主要編輯事件監聽 - 擴大觸發範圍
        this.editor.on('change', (cm, change) => {
            console.log('📝 代碼變更事件 - 來源:', change.origin);
            
            // 🔧 擴大用戶編輯行為檢測範圍
            const userEditOrigins = ['+input', 'paste', '+delete', '*compose', 'cut'];
            const isUserEdit = userEditOrigins.includes(change.origin);
            
            if (isUserEdit) {
                // 用戶開始編輯
                this.isEditing = true;
                this.editStartTime = Date.now();
                console.log('✏️ 編輯狀態已激活 (來源:', change.origin, ')');
                
                // 🔧 立即重置編輯超時（縮短到5秒）
                this.resetEditingTimeout();
                
                // 延遲發送代碼變更
                clearTimeout(this.changeTimeout);
                this.changeTimeout = setTimeout(() => {
                    if (this.isEditing) {
                        this.sendCodeChange();
                    }
                }, 300); // 🔧 縮短延遲到300ms
                
            } else if (change.origin === 'setValue') {
                // 程式設置代碼，不觸發編輯狀態
                console.log('🔄 程式設置代碼，保持原編輯狀態');
            }
        });
        
        // 2. 🔧 強化按鍵監聽 - 幾乎所有按鍵都觸發編輯狀態
        this.editor.getWrapperElement().addEventListener('keydown', (event) => {
            // 只排除最基本的導航鍵
            const excludeKeys = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
            const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
            
            // 🔧 更寬鬆的條件：Tab, Enter, Backspace, Delete 都觸發編輯狀態
            const isEditingKey = ['Tab', 'Enter', 'Backspace', 'Delete', 'Space'].includes(event.key);
            
            if (!excludeKeys.includes(event.key) && (!isArrowKey || isEditingKey)) {
                this.isEditing = true;
                this.editStartTime = Date.now();
                console.log('⌨️ 按鍵觸發編輯狀態:', event.key);
                this.resetEditingTimeout();
            }
        });
        
        // 3. 文本選擇也觸發編輯狀態（準備編輯）
        this.editor.on('cursorActivity', () => {
            if (this.editor.somethingSelected()) {
                this.isEditing = true;
                this.editStartTime = Date.now();
                console.log('🖱️ 文本選擇觸發編輯狀態');
                this.resetEditingTimeout();
            }
        });
        
        // 4. 監聽粘貼事件
        this.editor.getWrapperElement().addEventListener('paste', () => {
            this.isEditing = true;
            this.editStartTime = Date.now();
            console.log('📋 粘貼觸發編輯狀態');
            this.resetEditingTimeout();
        });
        
        // 5. 監聽剪切事件
        this.editor.getWrapperElement().addEventListener('cut', () => {
            this.isEditing = true;
            this.editStartTime = Date.now();
            console.log('✂️ 剪切觸發編輯狀態');
            this.resetEditingTimeout();
        });
        
        // 6. 獲得焦點時也可能開始編輯
        this.editor.on('focus', () => {
            console.log('👁️ 編輯器獲得焦點');
            // 不立即設置編輯狀態，但準備好快速響應
        });
        
        // 7. 🔧 延長失去焦點的重置時間
        this.editor.on('blur', () => {
            console.log('👋 編輯器失去焦點');
            // 🔧 延遲5秒重置，給用戶時間回到編輯器
            setTimeout(() => {
                if (this.isEditing && (Date.now() - this.editStartTime) > 10000) {
                    this.isEditing = false;
                    console.log('⏹️ 失去焦點超時，重置編輯狀態');
                }
            }, 5000); // 延長到5秒
        });
        
        // 8. 🔧 調整定期狀態監控（降低頻率，延長超時）
        setInterval(() => {
            if (this.isEditing) {
                const duration = (Date.now() - this.editStartTime) / 1000;
                if (duration > 60) { // 🔧 延長到60秒自動重置
                    this.isEditing = false;
                    console.log('⏰ 編輯狀態超時自動重置 (60秒)');
                }
            }
        }, 15000); // 每15秒檢查一次
        
        console.log('✅ 強化編輯狀態追蹤系統設置完成 (V2)');
    }
    
    // 🔧 調整編輯超時計時器（縮短超時時間）
    resetEditingTimeout() {
        clearTimeout(this.editingTimeout);
        this.editingTimeout = setTimeout(() => {
            if (this.isEditing) {
                const duration = (Date.now() - this.editStartTime) / 1000;
                // 🔧 只有在10秒無活動且總編輯時間超過20秒才重置
                if (duration > 20) {
                    this.isEditing = false;
                    console.log('⏹️ 編輯狀態超時重置 (20秒總時長)');
                }
            }
        }, 10000); // 10秒超時檢查
    }

    // 發送代碼變更 - 🔧 增加衝突預警機制
    sendCodeChange(forceUpdate = false) {
        if (!wsManager.isConnected() || !this.isReady()) {
            console.error('❌ WebSocket 未連接或編輯器未初始化，無法發送代碼變更');
            return;
        }

        const currentUser = wsManager.currentUser;
        if (!currentUser) {
            console.error('❌ 未設置當前用戶，無法發送代碼變更');
            return;
        }

        console.log('📤 準備發送代碼變更 - 強制發送:', forceUpdate, '用戶:', currentUser);

        // 檢查衝突
        if (this.shouldShowConflictWarning()) {
            const { hasOtherActiveUsers, hasRecentActivity } = this.getConflictWarningInfo();
            console.log('🔍 衝突預警檢查:');
            console.log('   - 其他活躍用戶:', hasOtherActiveUsers ? '有' : '無');
            console.log('   - 最近活動:', hasRecentActivity ? '是' : '否');
        }

        // 發送代碼變更
        wsManager.sendMessage({
            type: 'code_change',
            code: this.getCode(),
            version: this.codeVersion + 1,
            forceUpdate: forceUpdate
        });
    }

    // 🆕 檢查是否需要顯示衝突預警
    shouldShowConflictWarning() {
        // 檢查是否有其他用戶正在活躍編輯
        const activeUsers = this.getActiveCollaborators();
        const hasOtherActiveUsers = activeUsers.length > 0;
        
        // 檢查最近是否收到其他用戶的代碼變更（30秒內）
        const recentActivity = this.lastRemoteChangeTime && 
                              (Date.now() - this.lastRemoteChangeTime) < 30000;
        
        console.log(`🔍 衝突預警檢查:`);
        console.log(`   - 其他活躍用戶: ${activeUsers.length > 0 ? activeUsers.join(', ') : '無'}`);
        console.log(`   - 最近活動: ${recentActivity ? '是' : '否'}`);
        
        return hasOtherActiveUsers || recentActivity;
    }

    // 🆕 獲取衝突預警信息
    getConflictWarningInfo() {
        const activeUsers = this.getActiveCollaborators();
        return {
            activeUsers: activeUsers,
            lastActivity: this.lastRemoteChangeTime ? 
                         new Date(this.lastRemoteChangeTime).toLocaleTimeString() : 
                         '未知'
        };
    }

    // 🆕 獲取當前活躍的協作者列表
    getActiveCollaborators() {
        // 這個方法需要與用戶列表管理結合
        // 目前先返回已知的協作用戶
        const collaborators = Array.from(this.collaboratingUsers || []);
        return collaborators.filter(user => user !== wsManager.currentUser);
    }

    // 載入歷史記錄從本地存儲
    loadHistoryFromStorage() {
        try {
            const historyData = localStorage.getItem('python_editor_history');
            if (historyData) {
                const history = JSON.parse(historyData);
                this.updateHistoryUI(history);
                console.log('📂 成功載入歷史記錄');
            } else {
                console.log('📂 沒有找到歷史記錄');
            }
        } catch (error) {
            console.error('❌ 載入歷史記錄失敗:', error);
        }
    }

    // 更新歷史記錄 UI
    updateHistoryUI(history) {
        if (!history || !Array.isArray(history)) {
            console.log('📝 歷史記錄為空或格式不正確');
            return;
        }

        const historyList = document.querySelector('#historyModal .list-group');
        if (!historyList) {
            console.warn('⚠️ 找不到歷史記錄列表元素');
            return;
        }

        // 清空現有列表
        historyList.innerHTML = '';

        // 添加歷史記錄項目
        history.forEach((item, index) => {
            const listItem = document.createElement('a');
            listItem.className = 'list-group-item list-group-item-action';
            listItem.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1">${item.name || `版本 ${item.version || index + 1}`}</h6>
                    <small>${item.timestamp ? new Date(item.timestamp).toLocaleString() : '未知時間'}</small>
                </div>
                <p class="mb-1">${(item.code || '').substring(0, 100)}${item.code && item.code.length > 100 ? '...' : ''}</p>
                <small>保存者: ${item.savedBy || '未知'}</small>
            `;
            
            listItem.addEventListener('click', () => {
                if (confirm('確定要載入這個歷史版本嗎？當前的變更將會被覆蓋。')) {
                    this.editor.setValue(item.code || '');
                    this.codeVersion = item.version || 0;
                    this.updateVersionDisplay();
                    
                    // 關閉模態框
                    const modal = bootstrap.Modal.getInstance(document.getElementById('historyModal'));
                    if (modal) {
                        modal.hide();
                    }
                    
                    console.log(`📂 載入歷史版本: ${item.name || '未命名'}`);
                }
            });
            
            historyList.appendChild(listItem);
        });

        console.log(`📂 更新歷史記錄 UI，共 ${history.length} 個項目`);
    }
}

// 全局編輯器管理器實例
const Editor = new EditorManager(); 

// 確保全域可訪問性 - 修復WebSocket訪問問題
window.Editor = Editor;
console.log('✅ 全域編輯器實例已創建並設置到 window.Editor:', window.Editor); 