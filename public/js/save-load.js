// save-load.js - 保存載入功能管理器
console.log('📄 載入 save-load.js 模組');

class SaveLoadManager {
    constructor() {
        this.currentUser = null;
        this.roomId = null;
        this.isInitialized = false;
        
        console.log('💾 SaveLoadManager 初始化');
    }

    // 顯示提示訊息的備用函數
    showMessage(message, type = 'info') {
        if (window.UI && window.UI.showMessage) {
            window.UI.showMessage(message, type);
        } else {
            // 備用方案：使用 console 和 alert
            console.log(`${type.toUpperCase()}: ${message}`);
            if (type === 'error' || type === 'warning') {
                alert(message);
            }
        }
    }

    // 初始化
    init(user, roomId) {
        this.currentUser = user;
        this.roomId = roomId;
        this.isInitialized = true;
        
        console.log(`💾 SaveLoadManager 已初始化 - 用戶: ${user.name}, 房間: ${roomId}`);
    }

    // 檢查是否已初始化
    checkInitialized() {
        if (!this.isInitialized) {
            const message = "SaveLoadManager尚未初始化。請先加入房間。";
            console.warn(message);
            this.showMessage(message, 'warning');
            return false;
        }
        return true;
    }

    // 保存當前代碼
    saveCode() {
        console.log("💾 開始保存代碼");
        if (!this.checkInitialized() || !window.editor) {
            this.showMessage("編輯器未準備好或未加入房間，無法保存。", "error");
            return;
        }
        
        const code = Editor.getCode();
        if (!code || code.trim() === '') {
            this.showMessage('程式碼內容為空，無法保存', 'warning');
            return;
        }

        // 顯示保存對話框
        this.showSaveDialog(code);
    }

    // 顯示保存對話框
    showSaveDialog(code) {
        const modalHTML = `
            <div class="modal fade" id="saveCodeModal" tabindex="-1" aria-labelledby="saveCodeModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-success text-white">
                            <h5 class="modal-title" id="saveCodeModalLabel">
                                <i class="fas fa-save"></i> 保存程式碼
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label for="saveTitle" class="form-label">保存標題</label>
                                <input type="text" class="form-control" id="saveTitle" 
                                       placeholder="輸入保存標題（可選）" 
                                       value="程式碼保存 - ${new Date().toLocaleString()}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">程式碼預覽</label>
                                <pre class="bg-light p-2 rounded border" style="max-height: 150px; overflow-y: auto; font-size: 0.9em;">${this.escapeHtml(code)}</pre>
                            </div>
                            <div class="text-muted small">
                                <i class="fas fa-info-circle"></i> 
                                保存後其他房間成員將收到通知
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-success" onclick="SaveLoadManager.executeSave()">
                                <i class="fas fa-save"></i> 確認保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 移除舊的模態框
        const existingModal = document.getElementById('saveCodeModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 添加新的模態框
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 顯示模態框
        const modal = new bootstrap.Modal(document.getElementById('saveCodeModal'));
        modal.show();
    }

    // 執行保存
    executeSave() {
        const title = document.getElementById('saveTitle').value.trim();
        const code = Editor.getCode();

        const saveData = {
            type: 'save_code',
            code: code,
            title: title || `程式碼保存 - ${new Date().toLocaleString()}`,
            roomId: this.roomId,
            author: this.currentUser.name,
            timestamp: Date.now()
        };

        console.log('💾 發送保存請求:', saveData);

        // 通過 WebSocket 發送保存請求
        if (window.wsManager && window.wsManager.isConnected()) {
            window.wsManager.send(saveData);
            
            // 關閉模態框
            const modal = bootstrap.Modal.getInstance(document.getElementById('saveCodeModal'));
            if (modal) modal.hide();
            
            this.showMessage('保存請求已發送...', 'info');
        } else {
            this.showMessage('WebSocket 連接未建立，無法保存', 'error');
        }
    }

    // 顯示載入對話框
    showLoadDialog() {
        console.log("📂 顯示載入對話框");
        if (!this.checkInitialized()) {
            this.showMessage("未加入房間，無法載入歷史記錄。", "error");
            return;
        }
        this.requestHistory((history) => {
            this.displayLoadDialog(history);
        });
    }

    // 顯示載入界面
    displayLoadDialog(history) {
        let historyHTML = '';
        
        if (history.length === 0) {
            historyHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-inbox text-muted" style="font-size: 2rem;"></i>
                    <p class="text-muted mt-2">尚無保存的程式碼</p>
                    <small class="text-muted">請先保存一些程式碼再進行載入</small>
                </div>
            `;
        } else {
            historyHTML = history.map(item => `
                <div class="card mb-2 load-item" data-id="${item.id}">
                    <div class="card-body py-2">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <h6 class="mb-1">${this.escapeHtml(item.title)}</h6>
                                <small class="text-muted">
                                    <i class="fas fa-user"></i> ${this.escapeHtml(item.author)}
                                    <i class="fas fa-clock ms-2"></i> ${new Date(item.timestamp).toLocaleString()}
                                    <i class="fas fa-code-branch ms-2"></i> v${item.version}
                                </small>
                                <div class="mt-1">
                                    <small class="text-muted">
                                        程式碼預覽: ${item.code.split('\\n')[0].substring(0, 50)}...
                                    </small>
                                </div>
                            </div>
                            <div class="btn-group-vertical btn-group-sm">
                                <button class="btn btn-outline-primary btn-sm" 
                                        onclick="SaveLoadManager.loadSpecificCode('${item.id}')"
                                        title="載入此版本">
                                    <i class="fas fa-download"></i>
                                </button>
                                <button class="btn btn-outline-info btn-sm"
                                        onclick="SaveLoadManager.previewCode('${item.id}')"
                                        title="預覽程式碼">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        const modalHTML = `
            <div class="modal fade" id="loadCodeModal" tabindex="-1" aria-labelledby="loadCodeModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="loadCodeModalLabel">
                                <i class="fas fa-folder-open"></i> 載入程式碼
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h6 class="mb-0">選擇要載入的程式碼版本</h6>
                                <div>
                                    ${history.length > 0 ? `
                                        <button class="btn btn-success btn-sm" onclick="SaveLoadManager.loadLatestCode()">
                                            <i class="fas fa-star"></i> 載入最新版本
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <div style="max-height: 400px; overflow-y: auto;">
                                ${historyHTML}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 移除舊的模態框
        const existingModal = document.getElementById('loadCodeModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 添加新的模態框
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 顯示模態框
        const modal = new bootstrap.Modal(document.getElementById('loadCodeModal'));
        modal.show();
    }

    // 載入最新版本
    loadLatestCode() {
        console.log('📂 載入最新版本');
        
        const loadData = {
            type: 'load_code',
            roomId: this.roomId,
            loadLatest: true
        };

        this.sendLoadRequest(loadData);
    }

    // 載入特定版本
    loadSpecificCode(saveId) {
        console.log('📂 載入特定版本:', saveId);
        
        const loadData = {
            type: 'load_code',
            roomId: this.roomId,
            saveId: saveId
        };

        this.sendLoadRequest(loadData);
    }

    // 發送載入請求
    sendLoadRequest(loadData) {
        if (window.wsManager && window.wsManager.isConnected()) {
            window.wsManager.send(loadData);
            
            // 關閉模態框
            const modal = bootstrap.Modal.getInstance(document.getElementById('loadCodeModal'));
            if (modal) modal.hide();
            
            this.showMessage('載入請求已發送...', 'info');
        } else {
            this.showMessage('WebSocket 連接未建立，無法載入', 'error');
        }
    }

    // 預覽程式碼
    previewCode(saveId) {
        console.log('👁️ 預覽程式碼:', saveId);
        
        // 獲取歷史記錄找到對應項目
        this.requestHistory((history) => {
            const item = history.find(h => h.id === saveId);
            if (item) {
                this.showCodePreview(item);
            } else {
                this.showMessage('找不到對應的程式碼版本', 'error');
            }
        });
    }

    // 顯示程式碼預覽
    showCodePreview(item) {
        const modalHTML = `
            <div class="modal fade" id="codePreviewModal" tabindex="-1" aria-labelledby="codePreviewModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-light">
                            <h5 class="modal-title" id="codePreviewModalLabel">
                                <i class="fas fa-eye"></i> 程式碼預覽
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <h6>${this.escapeHtml(item.title)}</h6>
                                <small class="text-muted">
                                    <i class="fas fa-user"></i> ${this.escapeHtml(item.author)}
                                    <i class="fas fa-clock ms-2"></i> ${new Date(item.timestamp).toLocaleString()}
                                    <i class="fas fa-code-branch ms-2"></i> 版本 ${item.version}
                                </small>
                            </div>
                            <div class="border rounded">
                                <pre class="p-3 mb-0" style="max-height: 400px; overflow-y: auto; background-color: #f8f9fa; font-size: 0.9em;"><code class="language-python">${this.escapeHtml(item.code)}</code></pre>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>
                            <button type="button" class="btn btn-primary" onclick="SaveLoadManager.loadSpecificCode('${item.id}')">
                                <i class="fas fa-download"></i> 載入此版本
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 移除舊的模態框
        const existingModal = document.getElementById('codePreviewModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 添加新的模態框
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 顯示模態框
        const modal = new bootstrap.Modal(document.getElementById('codePreviewModal'));
        modal.show();
    }

    // 顯示歷史記錄對話框
    showHistoryDialog() {
        console.log("📜 顯示歷史記錄對話框");
        if (!this.checkInitialized()) {
            this.showMessage("未加入房間，無法顯示歷史記錄。", "error");
            return;
        }
        this.requestHistory((history) => {
            this.displayHistoryDialog(history);
        });
    }

    // 顯示歷史記錄界面
    displayHistoryDialog(history) {
        const stats = this.calculateStats(history);
        
        let historyHTML = '';
        if (history.length === 0) {
            historyHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-archive text-muted" style="font-size: 2rem;"></i>
                    <p class="text-muted mt-2">尚無歷史記錄</p>
                </div>
            `;
        } else {
            historyHTML = history.map((item, index) => `
                <div class="card mb-2">
                    <div class="card-body py-2">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center">
                                    <span class="badge bg-primary me-2">#${history.length - index}</span>
                                    <h6 class="mb-1">${this.escapeHtml(item.title)}</h6>
                                </div>
                                <small class="text-muted">
                                    <i class="fas fa-user"></i> ${this.escapeHtml(item.author)}
                                    <i class="fas fa-clock ms-2"></i> ${new Date(item.timestamp).toLocaleString()}
                                    <i class="fas fa-code-branch ms-2"></i> v${item.version}
                                </small>
                            </div>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" 
                                        onclick="SaveLoadManager.loadSpecificCode('${item.id}')"
                                        title="載入">
                                    <i class="fas fa-download"></i>
                                </button>
                                <button class="btn btn-outline-info"
                                        onclick="SaveLoadManager.previewCode('${item.id}')"
                                        title="預覽">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        const modalHTML = `
            <div class="modal fade" id="historyModal" tabindex="-1" aria-labelledby="historyModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title" id="historyModalLabel">
                                <i class="fas fa-history"></i> 程式碼歷史記錄
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <!-- 統計信息 -->
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <div class="card bg-light">
                                        <div class="card-body text-center py-2">
                                            <h5 class="text-primary mb-1">${stats.total}</h5>
                                            <small class="text-muted">總保存次數</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card bg-light">
                                        <div class="card-body text-center py-2">
                                            <h5 class="text-success mb-1">${stats.authors}</h5>
                                            <small class="text-muted">參與人數</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card bg-light">
                                        <div class="card-body text-center py-2">
                                            <h5 class="text-info mb-1">${stats.latest}</h5>
                                            <small class="text-muted">最新版本</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 歷史記錄列表 -->
                            <div style="max-height: 400px; overflow-y: auto;">
                                ${historyHTML}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>
                            ${history.length > 0 ? `
                                <button type="button" class="btn btn-success" onclick="SaveLoadManager.loadLatestCode()">
                                    <i class="fas fa-star"></i> 載入最新版本
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 移除舊的模態框
        const existingModal = document.getElementById('historyModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 添加新的模態框
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 顯示模態框
        const modal = new bootstrap.Modal(document.getElementById('historyModal'));
        modal.show();
    }

    // 請求歷史記錄
    requestHistory(callback) {
        const requestData = {
            type: 'get_history',
            roomId: this.roomId
        };

        console.log('📚 請求歷史記錄:', requestData);

        // 設置回調函數
        this.requestedHistoryCallback = callback;

        if (window.wsManager && window.wsManager.isConnected()) {
            window.wsManager.send(requestData);
        } else {
            this.showMessage('WebSocket 連接未建立，無法獲取歷史記錄', 'error');
            callback([]);
        }
    }

    // 處理來自服務器的消息
    handleMessage(message) {
        console.log('💾 SaveLoadManager 收到消息:', message.type);

        switch (message.type) {
            case 'save_success':
                this.handleSaveSuccess(message);
                break;
            case 'save_error':
                this.handleSaveError(message);
                break;
            case 'load_success':
                this.handleLoadSuccess(message);
                break;
            case 'load_error':
                this.handleLoadError(message);
                break;
            case 'history_data':
                this.handleHistoryData(message);
                break;
            case 'code_saved_notification':
                this.handleCodeSavedNotification(message);
                break;
            case 'code_loaded_notification':
                this.handleCodeLoadedNotification(message);
                break;
        }
    }

    // 處理保存成功
    handleSaveSuccess(message) {
        console.log('✅ 程式碼保存成功:', message);
        this.showMessage(message.message || `程式碼已成功保存 (版本 ${message.version || '未知'})`, 'success');
        if (this.modal) this.modal.hide();
    }

    // 處理保存錯誤
    handleSaveError(message) {
        console.error('❌ 程式碼保存失敗:', message);
        this.showMessage(message.error || '保存程式碼時發生錯誤。', 'error');
    }

    // 處理載入成功
    handleLoadSuccess(message) {
        console.log('✅ 程式碼載入成功:', message);
        this.showMessage(message.message || `程式碼已成功載入 (版本 ${message.version || '未知'})`, 'success');
        if (window.editor && message.code !== undefined) {
            window.editor.setValue(message.code);
        }
        if (this.modal) this.modal.hide();
    }

    // 處理載入錯誤
    handleLoadError(message) {
        console.error('❌ 程式碼載入失敗:', message);
        this.showMessage(message.error || '載入程式碼時發生錯誤。', 'error');
    }

    // 處理歷史數據
    handleHistoryData(message) {
        console.log('📜 收到歷史記錄:', message);
        if (this.requestedHistoryCallback) {
            this.requestedHistoryCallback(message.history || []);
            this.requestedHistoryCallback = null; // Reset callback
        } else {
            this.showMessage("收到歷史數據，但沒有設定回調。", "warning");
        }
    }

    // 處理程式碼保存通知
    handleCodeSavedNotification(message) {
        console.log('🔔 其他用戶保存了代碼:', message);
        const notificationMessage = `${message.userName || message.author || '某位用戶'} 保存了代碼版本 "${message.title || '未命名版本'}"`;
        this.showMessage(notificationMessage, 'info');
    }

    // 處理程式碼載入通知
    handleCodeLoadedNotification(message) {
        console.log('🔔 其他用戶載入了代碼:', message);
        const notificationMessage = `${message.userName || message.author || '某位用戶'} 載入了代碼版本 "${message.title || '未命名版本'}"`;
        this.showMessage(notificationMessage, 'info');
    }

    // 計算統計信息
    calculateStats(history) {
        const authors = new Set(history.map(item => item.author));
        const latestVersion = Math.max(...history.map(item => item.version), 0);
        
        return {
            total: history.length,
            authors: authors.size,
            latest: latestVersion
        };
    }

    // HTML 轉義
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 創建全域實例
window.SaveLoadManager = new SaveLoadManager();

console.log('✅ SaveLoadManager 模組載入完成'); 