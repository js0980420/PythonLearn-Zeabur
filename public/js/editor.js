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
            autofocus: true, // 添加自動聚焦
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

        // 統一編輯狀態管理 - 只在這裡設置，避免重複
        this.setupEditingStateTracking();

        // 設置自動保存 - 5分鐘一次
        this.setupAutoSave();
        
        // 載入歷史記錄
        this.loadHistoryFromStorage();

        // 💡 確保編輯器可以輸入 - 延遲聚焦
        setTimeout(() => {
            if (this.editor) {
                this.editor.refresh();
                this.editor.focus();
                console.log('✅ 編輯器已聚焦，可以開始輸入');
            }
        }, 100);

        console.log('✅ 編輯器初始化完成');
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

    // 自動保存代碼
    setupAutoSave() {
        setInterval(() => {
            if (!window.wsManager || !window.wsManager.ws || window.wsManager.ws.readyState !== WebSocket.OPEN) {
                console.log('❌ 自動保存：WebSocket 未連接');
                return;
            }
            
            if (this.editor && this.isEditing && (Date.now() - this.lastAutoSave) > 30000) {
                this.saveCode(true);
            }
        }, 30000);
        
        console.log('✅ 自動保存已設置');
    }

    // 保存代碼
    saveCode(isAutoSave = false) {
        if (!window.wsManager || !window.wsManager.ws || window.wsManager.ws.readyState !== WebSocket.OPEN) {
            console.log('❌ 無法保存：WebSocket 未連接');
            return;
        }
        
        if (!this.editor) {
            console.log('❌ 無法保存：編輯器未初始化');
            return;
        }
        
        const code = this.editor.getValue();
        if (!code) {
            console.log('❌ 無法保存：代碼為空');
            return;
        }
        
        // 發送保存請求
        window.wsManager.sendMessage({
            type: 'save_code',
            code: code,
            isAutoSave: isAutoSave
        });
        
        this.lastAutoSave = Date.now();
        console.log(`✅ 代碼已${isAutoSave ? '自動' : '手動'}保存`);
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

    // 載入代碼
    loadCode(loadType = 'latest') {
        if (!window.wsManager || !window.wsManager.ws || window.wsManager.ws.readyState !== WebSocket.OPEN) {
            console.log('❌ 無法載入：WebSocket 未連接');
            return;
        }
        
        // 發送載入請求
        window.wsManager.sendMessage({
            type: 'load_code',
            loadType: loadType
        });
        
        console.log('📥 正在載入代碼...');
    }

    // 運行代碼
    runCode() {
        if (!window.wsManager || !window.wsManager.ws || window.wsManager.ws.readyState !== WebSocket.OPEN) {
            console.log('❌ 無法運行：WebSocket 未連接');
            return;
        }
        
        const code = this.editor.getValue();
        if (!code) {
            console.log('❌ 無法運行：代碼為空');
            return;
        }
        
        // 發送運行請求
        window.wsManager.sendMessage({
            type: 'run_code',
            code: code
        });
        
        console.log('🚀 正在運行代碼...');
    }

    // 處理遠端代碼變更
    handleRemoteCodeChange(message) {
        console.log('📨 收到遠程代碼變更:', message);
        
        try {
            // 直接設置編輯器的值
            if (this.editor) {
                // 保存當前游標位置
                const currentPosition = this.editor.getCursor();
                
                // 更新代碼
                this.editor.setValue(message.code || '');
                
                // 更新版本號
                if (message.version !== undefined) {
                    this.codeVersion = message.version;
                    this.updateVersionDisplay();
                }
                
                // 恢復游標位置
                this.editor.setCursor(currentPosition);
                
                console.log('✅ 已更新代碼，版本:', message.version);
            } else {
                console.error('❌ 編輯器實例不存在');
            }
            
            // 可選：顯示提示
            if (window.UI && message.userName !== wsManager.currentUser) {
                window.UI.showInfoToast(`${message.userName} 更新了代碼`);
            }
        } catch (error) {
            console.error('❌ 更新代碼時發生錯誤:', error);
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

    // 更新版本號顯示
    updateVersionDisplay() {
        const versionDisplay = document.getElementById('codeVersion');
        if (versionDisplay) {
            versionDisplay.textContent = `v${this.codeVersion || 0}`;
        }
    }

    // 移除協作用戶
    removeCollaboratingUser(userName) {
        this.collaboratingUsers.delete(userName);
        if (this.collaboratingUsers.size === 0) {
            UI.hideCollaborationAlert();
        }
    }

    // 編輯狀態管理
    setupEditingStateTracking() {
        console.log('🔧 設置編輯狀態追蹤系統');
        
        // 1. 主要編輯事件監聽
        this.editor.on('change', (cm, change) => {
            const userEditOrigins = ['+input', 'paste', '+delete', '*compose', 'cut'];
            const isUserEdit = userEditOrigins.includes(change.origin);
            
            if (isUserEdit) {
                this.isEditing = true;
                this.editStartTime = Date.now();
                
                clearTimeout(this.changeTimeout);
                this.changeTimeout = setTimeout(() => {
                    if (this.isEditing) {
                        // 保存當前游標位置
                        const currentPosition = this.editor.getCursor();
                        this.sendCodeChange();
                        // 恢復游標位置
                        this.editor.setCursor(currentPosition);
                    }
                }, 300);
            }
        });
        
        // 2. 按鍵監聽
        this.editor.getWrapperElement().addEventListener('keydown', (event) => {
            const excludeKeys = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock'];
            
            if (!excludeKeys.includes(event.key)) {
                this.isEditing = true;
                this.editStartTime = Date.now();
                this.resetEditingTimeout();
            }
        });
        
        // 3. 文本選擇
        this.editor.on('cursorActivity', () => {
            if (this.editor.somethingSelected()) {
                this.isEditing = true;
                this.editStartTime = Date.now();
                this.resetEditingTimeout();
            }
        });
        
        // 4. 粘貼事件
        this.editor.getWrapperElement().addEventListener('paste', () => {
            this.isEditing = true;
            this.editStartTime = Date.now();
            this.resetEditingTimeout();
        });
        
        // 5. 剪切事件
        this.editor.getWrapperElement().addEventListener('cut', () => {
            this.isEditing = true;
            this.editStartTime = Date.now();
            this.resetEditingTimeout();
        });
        
        // 6. 焦點處理
        this.editor.on('focus', () => {
            console.log('👁️ 編輯器獲得焦點');
        });
        
        this.editor.on('blur', () => {
            console.log('👋 編輯器失去焦點');
            setTimeout(() => {
                if (this.isEditing && (Date.now() - this.editStartTime) > 10000) {
                    this.isEditing = false;
                }
            }, 5000);
        });
        
        // 7. 定期狀態監控
        setInterval(() => {
            if (this.isEditing && (Date.now() - this.editStartTime) > 60000) {
                this.isEditing = false;
            }
        }, 15000);
        
        console.log('✅ 編輯狀態追蹤系統設置完成');
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

    // 發送代碼變更
    sendCodeChange(forceUpdate = false, operation = null) {
        if (!window.wsManager || !window.wsManager.ws || window.wsManager.ws.readyState !== WebSocket.OPEN || !this.editor) {
            console.log('❌ WebSocket 未連接或編輯器未初始化，無法發送代碼變更');
            return;
        }

        const code = this.editor.getValue();
        
        console.log(`📤 準備發送代碼變更 - 強制發送: ${forceUpdate}, 用戶: ${window.wsManager.currentUser}, 操作類型: ${operation || '一般編輯'}`);
        
        // 發送代碼變更到服務器
        window.wsManager.sendMessage({
            type: 'code_change',
            code: code,
            forced: forceUpdate,
            operation: operation,
            version: this.codeVersion
        });
    }

    // 確認發送代碼
    confirmSendCode() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('conflictWarningModal'));
        if (modal) {
            modal.hide();
        }
        this.sendCodeChange(true);
    }

    // 使用 AI 分析潛在衝突
    async analyzeConflictWithAI() {
        if (!window.wsManager || !window.wsManager.ws || window.wsManager.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket 未連接，無法進行 AI 分析');
            UI.showErrorToast('無法連接到服務器，請稍後再試');
            return;
        }

        const currentCode = this.editor.getValue();
        const message = {
            type: 'ai_request',
            action: 'analyze_conflict',
            code: currentCode,
            context: {
                activeUsers: Array.from(this.collaboratingUsers),
                currentUser: window.wsManager.currentUser
            }
        };

        try {
            const response = await window.wsManager.sendMessage(message);
            // AI 分析結果會通過 WebSocket 返回
            console.log('✅ AI 分析請求已發送');
        } catch (error) {
            console.error('❌ AI 分析請求失敗:', error);
            UI.showErrorToast('AI 分析請求失敗，請稍後再試');
        }
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
        return collaborators.filter(user => user !== window.wsManager.currentUser);
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

    // 檢查代碼衝突
    checkConflicts(change, operation = null) {
        if (!this.editor || !window.wsManager) return;
        
        // 獲取當前房間的用戶列表
        const activeUsers = window.wsManager.getActiveUsers();
        
        // 如果房間內只有一個用戶，不需要檢查衝突
        if (activeUsers.length <= 1) {
            console.log('👤 房間內只有一個用戶，無需檢查衝突');
            return;
        }
        
        // 獲取變更的行範圍
        const from = change.from.line;
        const to = change.to.line;
        
        // 檢查其他用戶是否正在編輯相同區域
        const conflictingUsers = [];
        activeUsers.forEach(user => {
            // 跳過自己
            if (user.userName === window.wsManager.currentUser) return;
            
            // 檢查用戶是否正在編輯
            if (user.isEditing && user.position) {
                const userLine = user.position.line;
                
                // 檢查是否在變更範圍內或附近（上下各1行）
                if (userLine >= from - 1 && userLine <= to + 1) {
                    conflictingUsers.push(user);
                }
            }
        });
        
        // 如果有衝突的用戶，顯示警告
        if (conflictingUsers.length > 0) {
            console.log('⚠️ 檢測到代碼衝突:', conflictingUsers);
            
            // 觸發衝突事件
            this.emit('conflict', {
                type: 'editing_conflict',
                users: conflictingUsers,
                range: { from, to }
            });
            
            // 顯示衝突警告
            if (window.conflictManager) {
                // 傳遞操作類型和中心行號
                const centerLine = Math.floor((from + to) / 2) + 1; // 轉換為1-based行號
                window.conflictManager.showConflictWarning(conflictingUsers, operation, centerLine);
            }
        }
    }
    
    // 更新協作用戶狀態
    updateCollaboratorStatus(userData) {
        const { userName, isEditing, position } = userData;
        
        // 如果是自己，不需要更新
        if (userName === wsManager.currentUser) return;
        
        // 更新用戶狀態
        if (isEditing) {
            // 檢查是否需要觸發衝突檢測
            if (this.isEditing && position) {
                const currentLine = this.editor.getCursor().line;
                const userLine = position.line;
                
                // 如果兩個用戶編輯的行相差在1行以內，觸發衝突檢測
                if (Math.abs(currentLine - userLine) <= 1) {
                    this.checkConflicts({
                        from: { line: Math.min(currentLine, userLine) },
                        to: { line: Math.max(currentLine, userLine) }
                    });
                }
            }
        } else {
            // 用戶停止編輯，清除相關衝突標記
            if (window.conflictManager) {
                conflictManager.clearConflictWarning(userName);
            }
        }
    }

    // 初始化編輯器事件
    initializeEditorEvents() {
        if (!this.editor) return;
        
        // 監聽編輯器變更
        this.editor.on('change', (cm, change) => {
            // 判斷操作類型
            let operation = null;
            
            // 檢查是否是大量修改操作
            if (change.origin === 'paste') {
                operation = 'paste';
            } else if (change.origin === 'cut') {
                operation = 'cut';
            } else if (change.origin === '+input' || change.origin === '+delete') {
                // 一般的輸入或刪除操作
                operation = null;
            } else if (change.origin === 'setValue') {
                operation = 'load';
            }
            
            // 檢查衝突
            this.checkConflicts(change, operation);
            
            // 發送代碼變更
            this.sendCodeChange(false, operation);
        });
        
        // 監聽游標移動
        this.editor.on('cursorActivity', () => {
            if (window.wsManager && window.wsManager.ws && window.wsManager.ws.readyState === WebSocket.OPEN) {
                const cursor = this.editor.getCursor();
                window.wsManager.sendMessage({
                    type: 'cursor_change',
                    position: cursor
                });
            }
        });
        
        // 監聽焦點變化
        this.editor.on('focus', () => {
            this.handleEditorFocus();
            if (window.wsManager && window.wsManager.ws && window.wsManager.ws.readyState === WebSocket.OPEN) {
                window.wsManager.sendMessage({
                    type: 'editor_focus',
                    focused: true
                });
            }
        });
        
        this.editor.on('blur', () => {
            this.handleEditorBlur();
            if (window.wsManager && window.wsManager.ws && window.wsManager.ws.readyState === WebSocket.OPEN) {
                window.wsManager.sendMessage({
                    type: 'editor_focus',
                    focused: false
                });
            }
        });
        
        console.log('✅ 編輯器事件已初始化');
    }

    // 處理導入操作
    handleImport(code) {
        if (!this.editor) return;
        
        // 設置新代碼
        this.editor.setValue(code);
        
        // 發送代碼變更（標記為導入操作）
        this.sendCodeChange(true, 'import');
        
        console.log('📥 代碼導入完成');
    }
}

// 全局編輯器管理器實例
const Editor = new EditorManager(); 

// 確保全域可訪問性 - 修復WebSocket訪問問題
window.Editor = Editor;
console.log('✅ 全域編輯器實例已創建並設置到 window.Editor:', window.Editor); 
console.log('✅ 全域編輯器實例已創建並設置到 window.Editor:', window.Editor); 
console.log('✅ 全域編輯器實例已創建並設置到 window.Editor:', window.Editor); 