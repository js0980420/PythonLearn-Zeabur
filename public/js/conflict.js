// 衝突檢測和解決管理
class ConflictResolverManager {
    constructor() {
        this.conflictData = null;
        this.modal = null;
        this.modalElement = null;
    }

    // 初始化衝突解決器
    initialize() {
        this.modalElement = document.getElementById('conflictModal');
        if (!this.modalElement) {
            console.error('❌ Conflict modal element #conflictModal not found during initialization!');
        }
        // Bootstrap modal instance (this.modal) will be managed in showConflictModal
        console.log('✅ ConflictResolver initialized. Modal element cached.');
    }

    // 顯示衝突模態窗口
    showConflictModal(conflictMessage) {
        console.log("[ConflictResolver DEBUG] Attempting to show conflict modal. Data:", conflictMessage);
        this.conflictData = conflictMessage;
        
        // 使用 this.modalElement (在 initialize 中快取)
        if (!this.modalElement) {
            console.error("[ConflictResolver ERROR] Modal element #conflictModal NOT FOUND when trying to show!");
            this.showEditorWarning();
            return;
        }

        try {
            // 嘗試獲取現有實例，如果沒有則創建新的
            this.modal = bootstrap.Modal.getInstance(this.modalElement);
            if (!this.modal) {
                console.log("[ConflictResolver DEBUG] No existing Bootstrap Modal instance found for #conflictModal. Creating new one...");
                this.modal = new bootstrap.Modal(this.modalElement);
            } else {
                console.log("[ConflictResolver DEBUG] Existing Bootstrap Modal instance found for #conflictModal.");
            }
            
            console.log("[ConflictResolver DEBUG] Bootstrap Modal instance to be used:", this.modal);

            if (this.modal && typeof this.modal.show === 'function') {
                console.log("[ConflictResolver DEBUG] Calling modal.show()...");
                this.modal.show();
                console.log("[ConflictResolver DEBUG] modal.show() called.");
            } else {
                console.error("[ConflictResolver ERROR] Modal instance is invalid or show method is missing. Modal object:", this.modal);
                this.modalElement.style.display = 'block';
                this.modalElement.classList.add('show');
                document.body.classList.add('modal-open');
            }
        } catch (error) {
            console.error("[ConflictResolver ERROR] Error during Bootstrap Modal operation:", error);
            if(this.modalElement) this.modalElement.style.display = 'block'; 
        }
        
        this.showEditorWarning();
    }

    // 顯示編輯器警告
    showEditorWarning() {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'editor-conflict-warning';
        warningDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 檢測到程式碼衝突！請解決衝突後繼續編輯';
        document.getElementById('editorContainer').appendChild(warningDiv);
    }

    // 移除編輯器警告
    removeEditorWarning() {
        const warning = document.querySelector('.editor-conflict-warning');
        if (warning) {
            warning.remove();
        }
    }

    // 解決衝突
    resolveConflict(solution) {
        console.log(`[ConflictResolver DEBUG] Resolving conflict with solution: ${solution}`);
        try {
            // 執行解決方案的特定處理
            switch (solution) {
                case 'reload':
                    this.handleReloadSolution();
                    break;
                case 'force':
                    this.handleForceSolution();
                    break;
                case 'discuss':
                    this.handleDiscussSolution();
                    break;
            }

            // 清除衝突狀態
            if (Editor) {
                Editor.isEditing = false; // 允許再次編輯
            }
            this.conflictData = null; // 清除已存儲的衝突數據

            // 隱藏模態框的增強邏輯
            if (this.modal && typeof this.modal.hide === 'function') {
                console.log("[ConflictResolver DEBUG] Calling modal.hide()...");
                this.modal.hide();
                console.log("[ConflictResolver DEBUG] modal.hide() called.");
                
                // 監聽 Bootstrap Modal 的 hidden 事件，確保在完全隱藏後再清理
                // 但為了避免事件監聽器重複綁定，我們先移除舊的
                if (this.modalElement) {
                    this.modalElement.removeEventListener('hidden.bs.modal', this.handleModalHidden.bind(this));
                    this.modalElement.addEventListener('hidden.bs.modal', this.handleModalHidden.bind(this), { once: true });
                } else {
                    // 如果 modalElement 異常不存在，直接執行清理
                    this.cleanupModalDOM();
                }
            } else {
                console.warn("[ConflictResolver WARN] No valid modal instance or hide method to call. Attempting direct DOM manipulation for cleanup.");
                this.cleanupModalDOM(); // 直接清理DOM
            }

        } catch (error) {
            console.error('解決衝突時發生錯誤:', error);
            this.cleanupModalDOM(); // 緊急清理
        }
    }

    // 新增：處理模態框完全隱藏後的清理工作
    handleModalHidden() {
        console.log("[ConflictResolver DEBUG] 'hidden.bs.modal' event fired. Proceeding with DOM cleanup.");
        this.cleanupModalDOM();
    }

    // 新增：集中的DOM清理邏輯
    cleanupModalDOM() {
        console.log("[ConflictResolver DEBUG] Starting cleanupModalDOM...");
        
        // 移除編輯器頂部的警告信息
        this.removeEditorWarning();

        // 強制移除 body 上的 class 和樣式
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        console.log("[ConflictResolver DEBUG] Body classes and styles reset.");

        // 確保模態框元素本身被隱藏
        if (this.modalElement) {
            this.modalElement.style.display = 'none';
            this.modalElement.classList.remove('show');
            console.log("[ConflictResolver DEBUG] Modal element hidden and 'show' class removed.");
        }

        // 移除背景遮罩
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            try {
                backdrop.remove();
                console.log("[ConflictResolver DEBUG] Modal backdrop removed.");
            } catch (e) {
                console.warn("[ConflictResolver WARN] Failed to remove modal backdrop directly, trying parentNode.removeChild:", e);
                if (backdrop.parentNode) {
                    backdrop.parentNode.removeChild(backdrop);
                    console.log("[ConflictResolver DEBUG] Modal backdrop removed via parentNode.");
                } else {
                    backdrop.style.display = 'none'; // 最後手段
                    console.log("[ConflictResolver DEBUG] Modal backdrop hidden as a fallback.");
                }
            }
        }
        console.log("[ConflictResolver DEBUG] cleanupModalDOM finished.");
    }

    // 處理重新載入解決方案
    handleReloadSolution() {
        Editor.setVersion(this.conflictData.version);
        Editor.setCode(this.conflictData.code);
        
        Chat.addSystemMessage(`${wsManager.currentUser} 選擇使用最新版本解決衝突`);
        UI.showSuccessToast('已重新載入最新版本');
    }

    // 處理強制更新解決方案
    handleForceSolution() {
        const currentCode = Editor.getCode();
        
        wsManager.sendMessage({
            type: 'code_change',
            code: currentCode,
            version: this.conflictData.version,
            forceUpdate: true
        });
        
        Chat.addSystemMessage(`${wsManager.currentUser} 選擇強制更新解決衝突`);
        UI.showSuccessToast('已強制更新代碼');
    }

    // 處理討論解決方案
    handleDiscussSolution() {
        const myCode = Editor.getCode();
        const conflictMessage = `
=== 程式碼衝突討論 ===
我的版本 (${Editor.codeVersion}):
${myCode}

服務器版本 (${this.conflictData.version}):
${this.conflictData.code}

請大家討論如何合併這兩個版本。`;
        
        wsManager.sendMessage({
            type: 'chat_message',
            message: conflictMessage
        });
        
        UI.showSuccessToast('衝突代碼已複製到聊天室');
    }

    // AI衝突協助分析
    requestAIAnalysis() {
        if (!this.conflictData) return;
        
        const analysisDiv = document.getElementById('conflictAIAnalysis');
        analysisDiv.innerHTML = `
            <div class="alert alert-info mt-3">
                <div class="text-center">
                    <i class="fas fa-robot fa-spin"></i> AI正在分析衝突...
                </div>
            </div>`;
        
        // 準備衝突數據
        const myCode = Editor.getCode();
        const serverCode = this.conflictData.code;
        const myVersion = Editor.codeVersion;
        const serverVersion = this.conflictData.version;
        
        // 調用真實的AI API
        wsManager.sendMessage({
            type: 'ai_request',
            action: 'conflict_analysis',
            data: {
                userCode: myCode,
                serverCode: serverCode,
                userVersion: myVersion,
                serverVersion: serverVersion,
                conflictUser: this.conflictData.userName || '其他用戶',
                roomId: wsManager.currentRoom
            }
        });
    }

    // 顯示AI分析結果 - 這個方法現在由WebSocket響應調用
    displayAIAnalysis(aiAnalysis) {
        const analysisDiv = document.getElementById('conflictAIAnalysis');
        
        if (!aiAnalysis || aiAnalysis.error) {
            analysisDiv.innerHTML = `
                <div class="alert alert-warning mt-3">
                    <h6><i class="fas fa-exclamation-triangle"></i> AI分析暫時無法使用</h6>
                    <p>錯誤原因: ${aiAnalysis?.error || 'API連接問題'}</p>
                    <p>請使用手動方式解決衝突：</p>
                    <ul>
                        <li>在聊天室討論選擇哪個版本</li>
                        <li>手動合併兩個版本的優點</li>
                        <li>使用重新載入或強制更新選項</li>
                    </ul>
                    <button class="btn btn-outline-secondary btn-sm" onclick="ConflictResolver.hideAIAnalysis()">
                        <i class="fas fa-times"></i> 關閉
                    </button>
                </div>`;
            return;
        }
        
        const analysis = `
            <div class="ai-analysis alert alert-light border">
                <h6><i class="fas fa-robot text-primary"></i> 🤖 AI衝突分析結果</h6>
                
                <div class="ai-content">
                    ${aiAnalysis}
                </div>
                
                <div class="text-center mt-3">
                    <button class="btn btn-success btn-sm me-2" onclick="ConflictResolver.resolveConflict('discuss')">
                        <i class="fas fa-comments"></i> 複製到聊天討論
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="ConflictResolver.hideAIAnalysis()">
                        <i class="fas fa-times"></i> 關閉分析
                    </button>
                </div>
            </div>`;
        
        analysisDiv.innerHTML = analysis;
    }

    // 隱藏AI分析
    hideAIAnalysis() {
        document.getElementById('conflictAIAnalysis').innerHTML = '';
    }
}

// 全局衝突解決器實例
const ConflictResolver = new ConflictResolverManager();

// 全局函數供HTML調用
function resolveConflict(solution) {
    ConflictResolver.resolveConflict(solution);
}

function askAIForConflictHelp() {
    ConflictResolver.requestAIAnalysis();
} 