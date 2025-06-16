// 衝突檢測和解決管理
class ConflictResolverManager {
    constructor() {
        this.conflictData = null;
        this.modal = null;
        this.modalElement = null;
        this.activeConflicts = new Map();
        this.warningContainer = null;
        this.lastConflictTimes = new Map(); // 記錄每行最後的衝突時間
        this.massiveChangeOperations = new Set(['load', 'import', 'paste', 'cut']); // 大量修改操作類型
        console.log('🔧 ConflictResolverManager 已創建');
        this.initializeUI();
    }

    // 初始化衝突解決器
    initialize() {
        // 確保 DOM 已載入
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeModal();
            });
        } else {
            this.initializeModal();
        }
        console.log('✅ ConflictResolver initialized');
    }
    
    // 初始化模態框元素
    initializeModal() {
        this.modalElement = document.getElementById('conflictModal');
        if (!this.modalElement) {
            console.error('❌ Conflict modal element #conflictModal not found during initialization!');
            // 嘗試在後續操作中重新獲取
            setTimeout(() => {
                this.modalElement = document.getElementById('conflictModal');
                if (this.modalElement) {
                    console.log('✅ ConflictResolver modal element found after retry');
                } else {
                    console.error('❌ ConflictResolver modal element still not found');
                }
            }, 1000);
        } else {
            console.log('✅ ConflictResolver modal element found');
        }
    }

    // 初始化 UI
    initializeUI() {
        // 創建衝突警告容器
        this.warningContainer = document.createElement('div');
        this.warningContainer.id = 'conflictWarning';
        this.warningContainer.className = 'conflict-warning';
        document.body.appendChild(this.warningContainer);
    }

    // 顯示衝突警告
    showConflictWarning(conflictingUsers, operation = null, lineNumber = null) {
        if (!this.warningContainer) return;
        
        // 檢查是否是大量修改操作
        const isMassiveChange = operation && this.massiveChangeOperations.has(operation);
        
        // 生成衝突鍵值（包含行號和用戶）
        const conflictKey = lineNumber 
            ? `line-${lineNumber}-${conflictingUsers.map(u => u.userName).sort().join(',')}`
            : conflictingUsers.map(u => u.userName).sort().join(',');
        
        // 檢查時間限制
        const now = Date.now();
        const lastTime = this.lastConflictTimes.get(conflictKey) || 0;
        
        // 如果同一行的上次衝突警告在一分鐘內，則不顯示
        if (now - lastTime < 60000) { // 60000ms = 1分鐘
            console.log('⏱️ 忽略頻繁的衝突警告:', {
                conflictKey,
                timeSinceLastWarning: now - lastTime,
                lineNumber,
                users: conflictingUsers.map(u => u.userName)
            });
            return;
        }
        
        // 更新最後衝突時間
        this.lastConflictTimes.set(conflictKey, now);
        
        // 清理過期的時間記錄（超過1分鐘的記錄）
        for (const [key, time] of this.lastConflictTimes.entries()) {
            if (now - time > 60000) {
                this.lastConflictTimes.delete(key);
            }
        }
        
        // 檢查是否已經顯示相同的警告
        if (this.activeConflicts.has(conflictKey)) {
            console.log('⚠️ 已存在相同的衝突警告');
            return;
        }
        
        // 創建警告元素
        const warningElement = document.createElement('div');
        warningElement.className = 'alert alert-warning alert-dismissible fade show';
        warningElement.setAttribute('role', 'alert');
        
        const userNames = conflictingUsers.map(user => user.userName).join('、');
        
        // 根據操作類型顯示不同的警告訊息
        let warningMessage = '';
        if (isMassiveChange) {
            warningMessage = `<strong>⚠️ 重要修改警告！</strong>
                <p>用戶 ${userNames} 正在進行大量程式碼修改 (${operation})。</p>`;
        } else {
            warningMessage = `<strong>⚠️ 衝突警告！</strong>
                <p>用戶 ${userNames} 正在編輯${lineNumber ? `第 ${lineNumber} 行附近的` : '相同的'}程式碼區域。</p>`;
        }
        
        warningElement.innerHTML = `
            <div class="alert-content">
                ${warningMessage}
                <div class="btn-group mt-2">
                    <button type="button" class="btn btn-sm btn-outline-warning accept-changes">
                        接受變更
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-warning reject-changes">
                        拒絕變更
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-warning share-code">
                        分享代碼
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-warning analyze-conflict">
                        AI 分析
                    </button>
                </div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // 添加事件監聽器
        warningElement.querySelector('.accept-changes').addEventListener('click', () => {
            this.handleAcceptChanges(conflictKey);
        });
        
        warningElement.querySelector('.reject-changes').addEventListener('click', () => {
            this.handleRejectChanges(conflictKey);
        });
        
        warningElement.querySelector('.share-code').addEventListener('click', () => {
            this.handleShareCode(conflictKey);
        });
        
        warningElement.querySelector('.analyze-conflict').addEventListener('click', () => {
            this.handleAnalyzeConflict(conflictingUsers);
        });
        
        warningElement.querySelector('.btn-close').addEventListener('click', () => {
            this.clearConflictWarning(conflictKey);
        });
        
        // 保存警告
        this.activeConflicts.set(conflictKey, {
            element: warningElement,
            users: conflictingUsers,
            lineNumber: lineNumber,
            operation: operation,
            timestamp: now
        });
        
        // 顯示警告
        this.warningContainer.appendChild(warningElement);
        
        // 自動消失計時器（大量修改操作延長顯示時間）
        setTimeout(() => {
            this.clearConflictWarning(conflictKey);
        }, isMassiveChange ? 60000 : 30000); // 大量修改 60 秒，一般衝突 30 秒
    }

    // 清除特定衝突警告
    clearConflictWarning(key) {
        const conflict = this.activeConflicts.get(key);
        if (conflict) {
            const { element } = conflict;
            element.classList.remove('show');
            setTimeout(() => {
                element.remove();
                this.activeConflicts.delete(key);
            }, 150);
        }
    }

    // 清除所有衝突警告
    clearAllWarnings() {
        for (const key of this.activeConflicts.keys()) {
            this.clearConflictWarning(key);
        }
    }

    // 處理接受變更
    handleAcceptChanges(conflictKey) {
        console.log('✅ 接受變更:', conflictKey);
        // TODO: 實現接受變更邏輯
        this.clearConflictWarning(conflictKey);
    }

    // 處理拒絕變更
    handleRejectChanges(conflictKey) {
        console.log('❌ 拒絕變更:', conflictKey);
        // TODO: 實現拒絕變更邏輯
        this.clearConflictWarning(conflictKey);
    }

    // 處理分享代碼
    handleShareCode(conflictKey) {
        console.log('📤 分享代碼:', conflictKey);
        // TODO: 實現代碼分享邏輯
    }

    // 處理 AI 分析
    handleAnalyzeConflict(conflictingUsers) {
        console.log('🤖 AI 分析衝突:', conflictingUsers);
        if (window.aiAssistant) {
            aiAssistant.analyzeConflict(conflictingUsers);
        }
    }

    // 顯示衝突解決模態框
    showConflict(message) {
        try {
            // Store conflict data
            this.conflictData = message;
            
            // Update conflict user name
            const conflictUserSpan = document.getElementById('conflictUserName');
            const otherUserSpan = document.getElementById('otherUserName');
            
            if (conflictUserSpan) {
                conflictUserSpan.textContent = message.userName || '其他同學';
            }
            if (otherUserSpan) {
                otherUserSpan.textContent = message.userName || '其他同學';
            }
            
            // Update code versions
            const myCodeVersion = document.getElementById('myCodeVersion');
            const otherCodeVersion = document.getElementById('otherCodeVersion');
            
            if (myCodeVersion) {
                myCodeVersion.textContent = window.Editor.getValue() || '';
            }
            if (otherCodeVersion) {
                otherCodeVersion.textContent = message.code || '';
            }
            
            // Update severity indicator
            const severityBadge = document.getElementById('conflictSeverity');
            if (severityBadge) {
                const severityClass = {
                    'high': 'bg-danger',
                    'medium': 'bg-warning',
                    'low': 'bg-info'
                }[message.severity || 'medium'];
                
                severityBadge.className = `badge ${severityClass} me-2`;
                severityBadge.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    ${message.severity === 'high' ? '嚴重衝突' : message.severity === 'medium' ? '中度衝突' : '輕微衝突'}
                    (差異: ${message.diffPercentage}%)
                `;
            }
            
            // Update diff summary
            const diffSummary = document.getElementById('diffSummary');
            if (diffSummary) {
                diffSummary.innerHTML = `
                    <div class="d-flex align-items-center">
                        <div class="flex-grow-1">
                            <strong>衝突分析：</strong>
                            <span class="text-muted">代碼差異 ${message.diffPercentage}%</span>
                        </div>
                        <button class="btn btn-sm btn-outline-primary" onclick="askAIForConflictHelp()">
                            <i class="fas fa-robot"></i> 請AI協助分析
                        </button>
                    </div>
                `;
            }
            
            // Hide AI analysis area initially
            const aiAnalysis = document.getElementById('conflictAIAnalysis');
            if (aiAnalysis) {
                aiAnalysis.style.display = 'none';
            }
            
            // Show modal
            const modal = document.getElementById('conflictModal');
            if (modal) {
                const bsModal = new bootstrap.Modal(modal, { backdrop: 'static' });
                bsModal.show();
                console.log('✅ 協作衝突模態框已顯示 V5');
            } else {
                console.error('❌ 找不到衝突模態框元素');
                // Fallback to alert
                alert(`協作衝突！${message.userName || '其他同學'}也在修改程式碼。請重新載入頁面獲取最新版本。`);
            }
        } catch (error) {
            console.error('❌ 顯示衝突模態框時發生錯誤:', error);
            // Fallback
            alert(`協作衝突！${message.userName || '其他同學'}也在修改程式碼。請重新載入頁面。`);
        }
    }

    // 🔧 新增：顯示代碼差異對比
    displayCodeDifference(myCode, otherCode, otherUserName) {
        console.log('🔍 顯示代碼差異對比 V5...');
        console.log(`📝 我的代碼長度: ${myCode?.length || 0}`);
        console.log(`📝 ${otherUserName}代碼長度: ${otherCode?.length || 0}`);

        // 🔧 修復：確保代碼內容正確顯示
        const myCodeElement = document.getElementById('myCodeVersion');
        const otherCodeElement = document.getElementById('otherCodeVersion');
        
        if (myCodeElement) {
            myCodeElement.textContent = myCode || '(空白)';
            console.log('✅ 已設置我的代碼內容');
        } else {
            console.error('❌ 找不到 myCodeVersion 元素');
        }
        
        if (otherCodeElement) {
            otherCodeElement.textContent = otherCode || '(空白)';
            console.log('✅ 已設置對方代碼內容');
        } else {
            console.error('❌ 找不到 otherCodeVersion 元素');
        }

        // 🔧 進行簡單的本地差異分析（不調用AI）
        const diffAnalysis = this.performLocalDiffAnalysis(myCode, otherCode);
        this.displayDiffSummary(diffAnalysis, otherUserName);
        
        console.log('✅ 代碼差異對比顯示完成 V5');
    }

    // 🔧 新增：本地差異分析（不調用AI API）
    performLocalDiffAnalysis(code1, code2) {
        console.log('🔍 執行本地差異分析...');
        
        const text1 = (code1 || '').trim();
        const text2 = (code2 || '').trim();
        
        const lines1 = text1.split('\n');
        const lines2 = text2.split('\n');
        
        const analysis = {
            myLines: lines1.length,
            otherLines: lines2.length,
            myChars: text1.length,
            otherChars: text2.length,
            isSame: text1 === text2,
            addedLines: 0,
            removedLines: 0,
            modifiedLines: 0,
            hasSignificantChanges: false,
            changeType: 'unknown'
        };

        if (analysis.isSame) {
            analysis.changeType = 'identical';
            return analysis;
        }

        // 簡單的行級比較
        const maxLines = Math.max(lines1.length, lines2.length);
        for (let i = 0; i < maxLines; i++) {
            const line1 = (lines1[i] || '').trim();
            const line2 = (lines2[i] || '').trim();
            
            if (line1 !== line2) {
                if (!line1 && line2) {
                    analysis.addedLines++;
                } else if (line1 && !line2) {
                    analysis.removedLines++;
                } else if (line1 && line2) {
                    analysis.modifiedLines++;
                }
            }
        }

        // 判斷變更類型
        if (analysis.addedLines > 0 && analysis.removedLines === 0 && analysis.modifiedLines === 0) {
            analysis.changeType = 'addition';
        } else if (analysis.addedLines === 0 && analysis.removedLines > 0 && analysis.modifiedLines === 0) {
            analysis.changeType = 'deletion';
        } else if (analysis.addedLines === 0 && analysis.removedLines === 0 && analysis.modifiedLines > 0) {
            analysis.changeType = 'modification';
        } else {
            analysis.changeType = 'complex';
        }

        // 判斷是否有重大變更
        analysis.hasSignificantChanges = 
            analysis.addedLines > 2 || 
            analysis.removedLines > 2 || 
            analysis.modifiedLines > 3 ||
            Math.abs(analysis.myChars - analysis.otherChars) > 50;

        console.log('📊 本地差異分析結果:', analysis);
        return analysis;
    }

    // 🔧 改進：顯示差異摘要
    displayDiffSummary(analysis, otherUserName) {
        const summaryElement = document.getElementById('diffSummary');
        if (!summaryElement) {
            console.error('❌ 找不到差異摘要元素');
            return;
        }

        let summaryText = '';
        let summaryIcon = '';
        
        if (analysis.isSame) {
            summaryIcon = '🟢';
            summaryText = '代碼內容相同，可能是編輯時序問題';
        } else {
            // 根據變更類型生成摘要
            const changes = [];
            if (analysis.addedLines > 0) changes.push(`新增 ${analysis.addedLines} 行`);
            if (analysis.removedLines > 0) changes.push(`刪除 ${analysis.removedLines} 行`);
            if (analysis.modifiedLines > 0) changes.push(`修改 ${analysis.modifiedLines} 行`);
            
            // 選擇合適的圖標和描述
            if (analysis.hasSignificantChanges) {
                summaryIcon = '🔴';
                summaryText = `重大差異: ${changes.join(', ')}`;
            } else {
                summaryIcon = '🟡';
                summaryText = `輕微差異: ${changes.join(', ')}`;
            }
            
            // 添加詳細信息
            summaryText += ` | 您: ${analysis.myLines} 行 (${analysis.myChars} 字符) vs ${otherUserName}: ${analysis.otherLines} 行 (${analysis.otherChars} 字符)`;
            
            // 添加變更類型提示
            switch (analysis.changeType) {
                case 'addition':
                    summaryText += ' | 類型: 主要是新增內容';
                    break;
                case 'deletion':
                    summaryText += ' | 類型: 主要是刪除內容';
                    break;
                case 'modification':
                    summaryText += ' | 類型: 主要是修改現有內容';
                    break;
                case 'complex':
                    summaryText += ' | 類型: 複雜變更 (新增+刪除+修改)';
                    break;
            }
        }

        summaryElement.textContent = `${summaryIcon} ${summaryText}`;
        console.log('📊 差異摘要已更新 V5:', summaryText);
    }

    // 顯示衝突模態窗口 - 新的參數格式
    showConflictModal(localCode, remoteCode, remoteUserName, localVersion, remoteVersion) {
        console.log('🚨 [ConflictResolver] showConflictModal 被調用 V5');
        console.log('📝 參數詳情:', { 
            localCode: localCode?.length, 
            remoteCode: remoteCode?.length, 
            remoteUserName, 
            localVersion, 
            remoteVersion 
        });
        
        // 存儲衝突數據 (新格式)
        this.conflictData = {
            localCode: localCode || '',
            remoteCode: remoteCode || '',
            remoteUserName: remoteUserName || '其他同學',
            localVersion: localVersion || 0,
            remoteVersion: remoteVersion || 0,
            isSender: true // 新增：標記為主改方
        };
        
        // 🔧 同時設置 currentConflict (向後兼容)
        this.currentConflict = {
            userCode: localCode || '',
            serverCode: remoteCode || '',
            userVersion: localVersion || 0,
            serverVersion: remoteVersion || 0,
            conflictUser: remoteUserName || '其他同學',
            roomId: wsManager?.currentRoom || 'unknown',
            isSender: true, // 新增：標記為主改方
            // 兼容舊格式
            code: remoteCode || '',
            userName: remoteUserName,
            version: remoteVersion
        };
        
        console.log('💾 衝突數據已存儲:', this.conflictData);
        
        // 🔧 更新模態框內容 - 顯示代碼差異對比
        this.displayCodeDifference(localCode || '', remoteCode || '', remoteUserName || '其他同學');
        
        // 更新用戶名稱顯示
        const conflictUserSpan = document.getElementById('conflictUserName');
        const otherUserSpan = document.getElementById('otherUserName');
        if (conflictUserSpan) {
            conflictUserSpan.textContent = remoteUserName || '其他同學';
        }
        if (otherUserSpan) {
            otherUserSpan.textContent = remoteUserName || '其他同學';
        }
        
        // 更新版本信息
        const versionInfo = document.getElementById('conflictVersionInfo');
        if (versionInfo) {
            versionInfo.innerHTML = `
                <i class="fas fa-info-circle"></i> 
                版本信息: 您的版本 ${localVersion || 'unknown'} vs ${remoteUserName || '對方'}版本 ${remoteVersion || 'unknown'}
            `;
        }
        
        // 隱藏AI分析區域（初始狀態）
        const aiAnalysis = document.getElementById('conflictAIAnalysis');
        if (aiAnalysis) {
            aiAnalysis.style.display = 'none';
        }
        
        // 顯示模態框
        if (!this.modalElement) {
            console.warn('⚠️ 模態框元素未初始化，嘗試重新獲取...');
            this.modalElement = document.getElementById('conflictModal');
        }
        
        if (!this.modalElement) {
            console.error('❌ 模態框元素未找到');
            this.showEditorWarning();
            // 降級處理：使用 alert
            alert(`協作衝突！${remoteUserName || '其他同學'}也在修改程式碼。請檢查差異後決定如何處理。`);
            return;
        }
        
        // 更新模態框按鈕文字
        const acceptBtn = document.getElementById('acceptChangesBtn');
        const rejectBtn = document.getElementById('rejectChangesBtn');
        const discussBtn = document.getElementById('discussChangesBtn');
        
        if (acceptBtn) acceptBtn.textContent = '接受我的修改';
        if (rejectBtn) rejectBtn.textContent = '接受對方修改';
        if (discussBtn) discussBtn.textContent = '在聊天室討論';
        
        // 顯示模態框
        const modal = new bootstrap.Modal(this.modalElement);
        modal.show();
        
        console.log('✅ 衝突模態框已顯示（主改方模式）');
    }
    
    // 更新模態框內容
    updateModalContent() {
        if (!this.conflictData) return;
        
        // 更新模態框中的用戶信息
        const userNameElement = document.getElementById('conflictUserName');
        if (userNameElement) {
            userNameElement.textContent = this.conflictData.remoteUserName;
        }
        
        // 更新版本信息
        const versionElement = document.getElementById('conflictVersionInfo');
        if (versionElement) {
            versionElement.textContent = `本地版本: ${this.conflictData.localVersion}, 遠程版本: ${this.conflictData.remoteVersion}`;
        }
        
        console.log('✅ 模態框內容已更新');
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

    // 🆕 隱藏衝突模態框
    hideConflictModal() {
        console.log('🔧 [ConflictResolver] 隱藏衝突模態框');
        
        try {
            // 優先使用 Bootstrap Modal API
            if (this.modal && typeof this.modal.hide === 'function') {
                this.modal.hide();
                console.log('✅ 使用 Bootstrap Modal API 隱藏模態框');
                return;
            }
            
            // 回退到直接操作 DOM
            if (this.modalElement) {
                // 移除 Bootstrap 類別和樣式
                this.modalElement.style.display = 'none';
                this.modalElement.classList.remove('show');
                document.body.classList.remove('modal-open');
                
                // 移除背景遮罩
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.remove();
                }
                
                console.log('✅ 手動隱藏模態框');
            } else {
                console.warn('⚠️ 無法找到模態框元素');
            }
        } catch (error) {
            console.error('❌ 隱藏模態框失敗:', error);
            
            // 最後的回退方案
            const modal = document.getElementById('conflictModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
                document.body.classList.remove('modal-open');
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) backdrop.remove();
            }
        }
    }

    // 🆕 解決衝突 - 新增歷史記錄
    resolveConflict(choice) {
        console.log('✅ [ConflictResolver] 用戶選擇解決方案:', choice);
        
        if (!this.currentConflict) {
            console.error('❌ 沒有當前衝突數據');
            return;
        }
        
        const conflictData = this.currentConflict;
        let resolution;
        
        // 根據用戶選擇設置解決方案
        switch (choice) {
            case 'accept':
                // 接受自己的修改
                console.log('✅ 選擇接受自己的修改解決衝突');
                resolution = 'accepted_own';
                // 發送自己的代碼到服務器
                if (window.Editor) {
                    window.Editor.sendCodeChange(true);
                }
                break;
            case 'reject':
                // 接受對方修改
                if (window.Editor && conflictData.serverCode) {
                    window.Editor.applyRemoteCode(conflictData.serverCode, conflictData.serverVersion);
                }
                console.log('✅ 選擇接受對方修改解決衝突');
                resolution = 'accepted_other';
                break;
            case 'discuss':
                console.log('✅ 選擇討論解決衝突');
                resolution = 'discussed';
                // 打開聊天室進行討論
                this.openChatForDiscussion();
                break;
            case 'ai_analysis':
                console.log('✅ 請求AI協助分析衝突');
                this.requestAIAnalysis();
                return; // 不關閉模態框，等待AI分析結果
            default:
                console.warn('⚠️ 未知的衝突解決選項:', choice);
                resolution = 'unknown';
                break;
        }
        
        // 記錄衝突歷史
        try {
            if (this.lastAIAnalysis) {
                this.addConflictRecord(conflictData, resolution, this.lastAIAnalysis);
            } else {
                this.addConflictRecord(conflictData, resolution);
            }
        } catch (error) {
            console.warn('⚠️ 衝突歷史記錄失敗:', error);
        }
        
        // 關閉模態框
        this.hideConflictModal();
        
        // 通知成功
        let message;
        switch (choice) {
            case 'accept':
                message = '已接受自己的修改';
                break;
            case 'reject':
                message = '已接受對方修改';
                break;
            case 'discuss':
                message = '已選擇討論解決衝突';
                break;
            default:
                message = '衝突處理完成';
                break;
        }
        
        if (window.UI && window.UI.showToast) {
            window.UI.showToast(message, 'success');
        } else {
            alert(message);
        }
        
        // 清理衝突狀態
        this.currentConflict = null;
        this.lastAIAnalysis = null;
        this.conflictData = null; // 新增：清理 conflictData
        
        // 重置編輯器狀態
        if (window.Editor) {
            window.Editor.resetEditingState();
            window.Editor.setEnabled(true); // 新增：確保編輯器可用
        }
        
        // 移除所有相關模態框
        const modals = ['conflictModal', 'senderWaitingModal', 'conflictHistoryModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) bsModal.hide();
            }
        });
    }

    // 🎯 AI分析回應處理
    handleAIAnalysisResponse(responseData) {
        console.log('🤖 [ConflictResolver] 收到AI分析回應:', responseData);
        
        if (responseData.success) {
            this.lastAIAnalysis = responseData.response; // 保存AI分析結果
            this.displayAIAnalysis(responseData.response, 'conflict');
            
            // 隱藏載入狀態
            const loadingDiv = document.getElementById('aiAnalysisLoading');
            if (loadingDiv) {
                loadingDiv.style.display = 'none';
            }
        } else {
            console.error('❌ AI分析失敗:', responseData.error);
            this.displayAIAnalysis('😅 AI分析暫時無法使用，但您仍可以手動比較代碼差異來解決衝突。建議在聊天室與同學討論最佳解決方案。', 'conflict');
            
            // 隱藏載入狀態
            const loadingDiv = document.getElementById('aiAnalysisLoading');
            if (loadingDiv) {
                loadingDiv.style.display = 'none';
            }
        }
    }

    // AI衝突協助分析 - 只有在用戶主動請求時才調用
    requestAIAnalysis() {
        console.log('🤖 用戶主動請求AI協助分析衝突...');
        
        // 檢查是否有存儲的衝突數據
        if (!this.currentConflict && !this.conflictData) {
            console.warn('❌ 無存儲的衝突數據，無法進行AI分析');
            UI.showErrorToast('沒有衝突數據，無法進行AI分析');
            return;
        }
        
        // 優先使用新格式數據，回退到舊格式
        const conflictInfo = this.conflictData || this.currentConflict;
        const userCode = conflictInfo.localCode || conflictInfo.userCode || '';
        const serverCode = conflictInfo.remoteCode || conflictInfo.serverCode || '';
        const conflictUser = conflictInfo.remoteUserName || conflictInfo.conflictUser || '其他同學';
        
        console.log('📊 準備AI分析的數據:');
        console.log(`   - 用戶代碼長度: ${userCode.length} 字符`);
        console.log(`   - 衝突用戶代碼長度: ${serverCode.length} 字符`);
        console.log(`   - 衝突用戶: ${conflictUser}`);
        
        // 顯示AI分析區域並設置載入狀態
        const aiAnalysis = document.getElementById('conflictAIAnalysis');
        const aiContent = document.getElementById('aiAnalysisContent');
        
        if (aiAnalysis && aiContent) {
            aiAnalysis.style.display = 'block';
            aiContent.innerHTML = `
                <div class="text-center py-3">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">載入中...</span>
                    </div>
                    <h6 class="mt-2 mb-0"><i class="fas fa-robot me-2"></i>AI 正在分析協作衝突...</h6>
                </div>
                <div class="mt-2 small text-muted border-top pt-2">
                    <div class="row">
                        <div class="col-6">
                            <i class="fas fa-user text-info"></i> 您的代碼: ${userCode.length} 字符
                        </div>
                        <div class="col-6">
                            <i class="fas fa-users text-warning"></i> ${conflictUser}: ${serverCode.length} 字符
                        </div>
                    </div>
                    <div class="text-center mt-2">
                        <small><i class="fas fa-clock"></i> 預計分析時間: 3-10 秒</small>
                    </div>
                </div>
            `;
        }
        
        // 確保WebSocket連接存在
        if (!wsManager || !wsManager.isConnected()) {
            console.error('❌ WebSocket未連接，無法發送AI請求');
            this.displayAIAnalysisError('WebSocket連接失敗，請檢查網路連接');
            return;
        }
        
        // 準備發送給AI的數據 - 修正為服務器期望的格式
        const analysisData = {
            userCode: userCode,
            serverCode: serverCode, // 服務器端期望這個字段名
            userName: wsManager.currentUser || 'Unknown',
            conflictUser: conflictUser,
            userVersion: conflictInfo.localVersion || conflictInfo.userVersion || 0,
            serverVersion: conflictInfo.remoteVersion || conflictInfo.serverVersion || 0,
            roomId: wsManager.currentRoom || 'unknown'
        };

        console.log('📤 發送AI分析請求數據:', {
            action: analysisData.action,
            userCodeLength: analysisData.userCode.length,
            conflictCodeLength: analysisData.conflictCode.length,
            userName: analysisData.userName,
            conflictUser: analysisData.conflictUser
        });

        // 發送WebSocket請求
        try {
            wsManager.sendMessage({
                type: 'ai_request',
                action: 'conflict_analysis',
                data: analysisData
            });
            console.log('✅ AI衝突分析請求已發送');
        } catch (error) {
            console.error('❌ 發送AI請求失敗:', error);
            this.displayAIAnalysisError('發送AI請求失敗: ' + error.message);
        }
    }

    // 🔧 新增：顯示AI分析錯誤
    displayAIAnalysisError(errorMessage) {
        const aiContent = document.getElementById('aiAnalysisContent');
        if (!aiContent) return;

        aiContent.innerHTML = `
            <div class="alert alert-warning mb-0">
                <h6><i class="fas fa-exclamation-triangle"></i> AI分析失敗</h6>
                <p class="mb-2">${errorMessage}</p>
                <hr class="my-2">
                <div class="small">
                    <strong>💡 手動解決建議：</strong><br>
                    • 仔細比較上方的代碼差異<br>
                    • 在聊天室與${this.conflictData?.remoteUserName || '同學'}討論<br>
                    • 選擇功能更完整或更正確的版本<br>
                    • 考慮手動合併兩個版本的優點
                </div>
                <div class="mt-2 text-end">
                    <button class="btn btn-outline-primary btn-sm" onclick="ConflictResolver.requestAIAnalysis()">
                        <i class="fas fa-redo"></i> 重試AI分析
                    </button>
                </div>
            </div>
        `;
    }

    // 🔧 顯示AI分析結果到UI界面（不是後端日誌）
    displayAIAnalysis(analysisText, target = 'conflict') {
        console.log('🤖 [ConflictResolver] 顯示AI分析結果到UI:', analysisText);
        
        const aiAnalysis = document.getElementById('conflictAIAnalysis');
        const aiContent = document.getElementById('aiAnalysisContent');
        
        if (!aiAnalysis || !aiContent) {
            console.error('❌ AI分析顯示區域未找到');
            return;
        }
        
        // 確保AI分析區域可見
        aiAnalysis.style.display = 'block';
        
        if (analysisText && analysisText.trim()) {
            // 格式化AI分析結果
            const formattedAnalysis = this.formatAIAnalysisForUI(analysisText);
            aiContent.innerHTML = formattedAnalysis;
            
            // 添加分享到聊天室的按鈕
            const shareButton = document.createElement('button');
            shareButton.className = 'btn btn-outline-primary btn-sm mt-2';
            shareButton.innerHTML = '<i class=\"fas fa-share\"></i> 分享AI分析到聊天室';
            shareButton.onclick = () => this.shareAIAnalysis(analysisText);
            aiContent.appendChild(shareButton);
            
            console.log('✅ AI分析結果已成功顯示在UI中');
        } else {
            // 顯示錯誤信息
            aiContent.innerHTML = `
                <div class=\"alert alert-warning\">
                    <i class=\"fas fa-exclamation-triangle\"></i> AI分析失敗或回應為空
                    <div class=\"mt-2 small\">
                        建議手動分析代碼差異：<br>
                        • 檢查變數命名是否衝突<br>
                        • 確認邏輯修改是否會影響其他部分<br>
                        • 查看是否有重複的功能實現
                    </div>
                </div>
            `;
            console.warn('⚠️ AI分析結果為空，顯示降級信息');
        }
    }

    // 🎯 改進的AI分析結果格式化
    formatAIAnalysisForUI(analysisText) {
        if (!analysisText) return '';
        
        // 分段處理，保持段落結構
        let formatted = analysisText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // 粗體
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // 斜體
            .replace(/`([^`]+)`/g, '<code class="bg-light px-1 rounded">$1</code>') // 行內代碼
            .replace(/```python\n([\s\S]*?)\n```/g, '<pre class="bg-dark text-light p-2 rounded"><code>$1</code></pre>') // Python代碼塊
            .replace(/```([\s\S]*?)```/g, '<pre class="bg-light p-2 rounded"><code>$1</code></pre>') // 一般代碼塊
            .replace(/^\d+\.\s/gm, '<br>$&') // 數字列表
            .replace(/^-\s/gm, '<br>• ') // 無序列表
            .replace(/\n\n/g, '</p><p>') // 段落分隔
            .replace(/\n/g, '<br>'); // 換行

        // 包裝在段落標籤中
        if (!formatted.startsWith('<p>')) {
            formatted = '<p>' + formatted;
        }
        if (!formatted.endsWith('</p>')) {
            formatted = formatted + '</p>';
        }

        return formatted;
    }

    // 📱 顯示AI分析結果在UI中 (移除重複方法，保留完整版本)

    // 🆕 分享AI分析結果到聊天室
    shareAIAnalysis(analysisResult) {
        if (window.Chat && typeof window.Chat.addChatMessage === 'function') {
            const summary = analysisResult.length > 200 ? 
                           analysisResult.substring(0, 200) + '...' : 
                           analysisResult;
            
            window.Chat.addChatMessage(
                `🤖 AI協作衝突分析：${summary}`,
                wsManager.currentUser
            );
            
            UI.showSuccessToast('AI分析已分享到聊天室');
            console.log('✅ AI分析結果已分享到聊天室');
        } else {
            UI.showErrorToast('聊天功能不可用，無法分享');
        }
    }

    // 🆕 顯示主改方的等待界面 - 增強版
    showSenderWaitingModal(conflictData) {
        console.log('⏳ [ConflictResolver] 顯示主改方等待界面:', conflictData);
        
        // 創建或獲取等待模態框
        let waitingModal = document.getElementById('senderWaitingModal');
        if (!waitingModal) {
            this.createSenderWaitingModal();
            waitingModal = document.getElementById('senderWaitingModal');
        }
        
        // 更新等待信息
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            const diffAnalysis = conflictData.conflictDetails?.diffAnalysis || {};
            waitingMessage.innerHTML = `
                <div class="alert alert-info">
                    <h5 class="alert-heading">
                        <i class="fas fa-hourglass-half text-warning"></i> 
                        協作衝突處理中
                    </h5>
                    <p><strong>${conflictData.conflictWith}</strong> 正在處理與您的代碼修改衝突</p>
                    <hr>
                    <div class="small">
                        <p class="mb-1">📊 變更分析：</p>
                        <ul class="list-unstyled">
                            <li>• 變更類型：${diffAnalysis.changeType?.description || '未知'}</li>
                            <li>• 變更摘要：${diffAnalysis.summary || '無法分析'}</li>
                            <li>• 時間差：${Math.round((conflictData.conflictDetails?.timeDiff || 0)/1000)}秒</li>
                        </ul>
                    </div>
                </div>
            `;
        }
        
        // 在主改方界面顯示代碼差異對比
        this.displayDetailedDiffInWaiting(
            conflictData.localCode || '',
            conflictData.remoteCode || '',
            conflictData.conflictWith || '其他同學',
            conflictData.conflictDetails?.diffAnalysis
        );
        
        // 顯示模態框
        const modal = new bootstrap.Modal(waitingModal);
        modal.show();
        
        console.log('✅ 主改方等待界面已顯示（含詳細分析）');
    }

    // 在等待界面中顯示詳細的代碼差異
    displayDetailedDiffInWaiting(myCode, otherCode, otherUserName, diffAnalysis) {
        const myCodeElement = document.getElementById('waitingMyCodeVersion');
        const otherCodeElement = document.getElementById('waitingOtherCodeVersion');
        const diffSummaryElement = document.getElementById('waitingDiffSummary');
        
        // 顯示代碼
        if (myCodeElement) {
            myCodeElement.innerHTML = this.highlightCode(myCode, diffAnalysis?.changes, 'local');
        }
        
        if (otherCodeElement) {
            otherCodeElement.innerHTML = this.highlightCode(otherCode, diffAnalysis?.changes, 'remote');
        }
        
        // 顯示詳細的差異摘要
        if (diffSummaryElement) {
            const changes = diffAnalysis?.changes || {};
            let summaryHTML = `
                <div class="p-2">
                    <h6 class="mb-2"><i class="fas fa-info-circle"></i> 代碼差異分析</h6>
                    <div class="row g-2">
                        <div class="col-md-4">
                            <div class="p-2 border rounded bg-light">
                                <small class="text-muted d-block mb-1">變更類型：</small>
                                <span class="badge bg-${this.getChangeTypeBadgeColor(diffAnalysis?.changeType?.type)}">
                                    ${diffAnalysis?.changeType?.description || '未知'}
                                </span>
                            </div>
                        </div>
                        <div class="col-md-8">
                            <div class="p-2 border rounded bg-light">
                                <small class="text-muted d-block mb-1">變更統計：</small>
                                <span class="badge bg-success me-1">+${changes.added?.length || 0} 新增</span>
                                <span class="badge bg-danger me-1">-${changes.removed?.length || 0} 刪除</span>
                                <span class="badge bg-warning me-1">~${changes.modified?.length || 0} 修改</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            diffSummaryElement.innerHTML = summaryHTML;
        }
    }

    // 代碼高亮顯示
    highlightCode(code, changes, type) {
        if (!code) return '<em class="text-muted">(空白)</em>';
        
        const lines = code.split('\n');
        let html = '<div class="code-container">';
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            let lineClass = '';
            let lineContent = this.escapeHtml(line);
            
            if (changes) {
                if (type === 'local') {
                    // 本地代碼高亮
                    if (changes.removed.some(c => c.line === lineNumber)) {
                        lineClass = 'bg-danger bg-opacity-10';
                        lineContent = `<del>${lineContent}</del>`;
                    } else if (changes.modified.some(c => c.line === lineNumber)) {
                        lineClass = 'bg-warning bg-opacity-10';
                    }
                } else {
                    // 遠程代碼高亮
                    if (changes.added.some(c => c.line === lineNumber)) {
                        lineClass = 'bg-success bg-opacity-10';
                        lineContent = `<ins>${lineContent}</ins>`;
                    } else if (changes.modified.some(c => c.line === lineNumber)) {
                        lineClass = 'bg-warning bg-opacity-10';
                    }
                }
            }
            
            html += `
                <div class="code-line ${lineClass}">
                    <span class="line-number text-muted small">${lineNumber}</span>
                    <span class="line-content">${lineContent || '&nbsp;'}</span>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    // HTML 轉義
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 根據變更類型獲取對應的 Bootstrap 顏色
    getChangeTypeBadgeColor(type) {
        switch (type) {
            case 'addition':
                return 'success';
            case 'deletion':
                return 'danger';
            case 'modification':
                return 'warning';
            case 'mixed':
                return 'info';
            default:
                return 'secondary';
        }
    }

    // 🆕 創建主改方等待模態框 - 新增代碼差異對比區域
    createSenderWaitingModal() {
        const modalHTML = `
            <div class="modal fade" id="senderWaitingModal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title">
                                <i class="fas fa-hourglass-half"></i> 協作衝突處理中
                            </h5>
                        </div>
                        <div class="modal-body">
                            <div id="waitingMessage">
                                <!-- 動態內容將在這裡插入 -->
                            </div>
                            
                            <!-- 🆕 代碼差異對比區域 -->
                            <div class="card mb-3">
                                <div class="card-header bg-light">
                                    <h6 class="mb-0"><i class="fas fa-code-branch"></i> 代碼差異對比</h6>
                                </div>
                                <div class="card-body p-0">
                                    <div class="row g-0">
                                        <div class="col-md-6">
                                            <div class="bg-info bg-opacity-10 p-2 border-end">
                                                <h6 class="text-info mb-2"><i class="fas fa-user"></i> 您的版本</h6>
                                                <pre id="waitingMyCodeVersion" class="bg-white p-2 rounded border" style="max-height: 200px; overflow-y: auto; font-size: 0.9em; white-space: pre-wrap;"></pre>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="bg-warning bg-opacity-10 p-2">
                                                <h6 class="text-warning mb-2"><i class="fas fa-users"></i> <span id="waitingOtherUserName">對方</span>的版本</h6>
                                                <pre id="waitingOtherCodeVersion" class="bg-white p-2 rounded border" style="max-height: 200px; overflow-y: auto; font-size: 0.9em; white-space: pre-wrap;"></pre>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- 差異摘要 -->
                                    <div class="bg-light p-2 border-top">
                                        <small class="text-muted">
                                            <i class="fas fa-info-circle"></i> 
                                            <span id="waitingDiffSummary">正在分析差異...</span>
                                        </small>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="alert alert-warning">
                                <strong>您可以：</strong><br>
                                • 等待對方處理完成並查看結果<br>
                                • 在聊天室討論解決方案<br>
                                • 查看過去的衝突處理歷史
                            </div>
                            
                            <div class="text-center mt-3">
                                <div class="spinner-border text-warning" role="status">
                                    <span class="visually-hidden">處理中...</span>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="ConflictResolver.dismissSenderWaiting()">
                                <i class="fas fa-times"></i> 關閉
                            </button>
                            <button type="button" class="btn btn-info" onclick="ConflictResolver.showConflictHistory()">
                                <i class="fas fa-history"></i> 查看衝突歷史
                            </button>
                            <button type="button" class="btn btn-primary" onclick="ConflictResolver.openChatForDiscussion()">
                                <i class="fas fa-comments"></i> 在聊天室討論
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        console.log('✅ 主改方等待模態框已創建（包含代碼差異對比）');
    }

    // 🆕 關閉主改方等待界面
    dismissSenderWaiting() {
        const waitingModal = document.getElementById('senderWaitingModal');
        if (waitingModal) {
            const modal = bootstrap.Modal.getInstance(waitingModal);
            if (modal) {
                modal.hide();
            }
        }
    }

    // 🆕 打開聊天室進行討論
    openChatForDiscussion() {
        // 關閉等待模態框
        this.dismissSenderWaiting();
        
        // 獲取當前衝突數據
        const conflictData = this.currentConflict;
        if (!conflictData) {
            console.error('❌ 無法打開聊天室討論：沒有當前衝突數據');
            return;
        }

        const myCode = conflictData.localCode || '';
        const otherCode = conflictData.remoteCode || '';
        const otherUserName = conflictData.remoteUserName || '其他同學';

        // 執行本地差異分析
        const analysis = this.performLocalDiffAnalysis(myCode, otherCode);

        let diffSummary = '無明顯差異';
        if (analysis) {
            const added = analysis.addedLines || 0;
            const removed = analysis.removedLines || 0;
            const modified = analysis.modifiedLines || 0;
            diffSummary = `差異摘要：新增 ${added} 行，刪除 ${removed} 行，修改 ${modified} 行`;
        }

        // 在聊天室發送詳細的衝突信息
        if (window.Chat && typeof window.Chat.addChatMessage === 'function') {
            window.Chat.addChatMessage(
                `💬 我們來討論一下代碼衝突的解決方案吧！`,
                wsManager.currentUser
            );
            window.Chat.addChatMessage(
                `--- 您的代碼 ---\\n\`\`\`python\\n${myCode}\\n\`\`\`\\n\\n--- ${otherUserName} 的代碼 ---\\n\`\`\`python\\n${otherCode}\\n\`\`\`\\n\\n${diffSummary}`,
                '系統' // 作為系統消息發送
            );
        }
        
        // 滾動到聊天區域（如果存在）
        const chatContainer = document.querySelector('.chat-container, #chatContainer, .chat-messages');
        if (chatContainer) {
            chatContainer.scrollIntoView({ behavior: 'smooth' });
        }
        
        console.log('✅ 已打開聊天室並發送衝突討論信息');
    }

    // 🆕 添加衝突分析測試功能和歷史記錄
    testConflictAnalysis() {
        console.log('🧪 開始衝突分析測試...');
        
        // 模擬衝突數據
        const testData = {
            userCode: Editor ? Editor.getCode() : 'print("我的測試代碼")',
            serverCode: '# 其他同學的代碼\nprint("歡迎使用")\n\n# 計算乘積\ndef calculate_product(x, y):\n    return x * y\n\nresult = calculate_product(5, 3)\nprint(f"乘積: {result}")',
            userVersion: Math.floor(Math.random() * 10),
            serverVersion: Math.floor(Math.random() * 10) + 5,
            conflictUser: '測試同學',
            roomId: wsManager?.currentRoom || 'test-room'
        };
        
        // 保存到衝突歷史
        this.saveConflictToHistory(testData);
        
        // 發送AI分析請求
        wsManager.sendMessage({
            type: 'ai_request',
            action: 'conflict_analysis',
            data: testData
        });
        
        console.log('✅ 衝突分析測試請求已發送');
        UI.showSuccessToast('衝突分析測試請求已發送');
    }

    // 🆕 保存衝突到歷史記錄
    saveConflictToHistory(conflictData) {
        let conflictHistory = JSON.parse(localStorage.getItem('conflict_history') || '[]');
        
        const historyEntry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            userCode: conflictData.userCode,
            serverCode: conflictData.serverCode,
            conflictUser: conflictData.conflictUser,
            roomId: conflictData.roomId,
            resolved: false
        };
        
        conflictHistory.unshift(historyEntry); // 新的在前
        
        // 限制歷史記錄數量
        if (conflictHistory.length > 20) {
            conflictHistory = conflictHistory.slice(0, 20);
        }
        
        localStorage.setItem('conflict_history', JSON.stringify(conflictHistory));
        console.log('💾 衝突記錄已保存到歷史');
    }

    // 🆕 顯示衝突歷史
    showConflictHistory() {
        const conflictHistory = JSON.parse(localStorage.getItem('conflict_history') || '[]');
        
        if (conflictHistory.length === 0) {
            UI.showInfoToast('暫無衝突歷史記錄');
            return;
        }
        
        // 創建歷史模態框
        this.createConflictHistoryModal(conflictHistory);
    }

    // 🆕 創建衝突歷史模態框
    createConflictHistoryModal(history) {
        // 移除舊的歷史模態框
        const oldModal = document.getElementById('conflictHistoryModal');
        if (oldModal) {
            oldModal.remove();
        }
        
        const historyHTML = history.map((entry, index) => `
            <div class="card mb-2">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span><i class="fas fa-clock"></i> ${new Date(entry.timestamp).toLocaleString()}</span>
                    <span class="badge ${entry.resolved ? 'bg-success' : 'bg-warning'}">
                        ${entry.resolved ? '已解決' : '未解決'}
                    </span>
                </div>
                <div class="card-body">
                    <p><strong>衝突對象:</strong> ${entry.conflictUser}</p>
                    <p><strong>房間:</strong> ${entry.roomId}</p>
                    <button class="btn btn-sm btn-outline-primary" onclick="ConflictResolver.viewConflictDetails(${index})">
                        <i class="fas fa-eye"></i> 查看詳情
                    </button>
                </div>
            </div>
        `).join('');
        
        const modalHTML = `
            <div class="modal fade" id="conflictHistoryModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-history"></i> 衝突處理歷史
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="max-height: 500px; overflow-y: auto;">
                            ${historyHTML}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-danger" onclick="ConflictResolver.clearConflictHistory()">
                                <i class="fas fa-trash"></i> 清除歷史
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        const modal = new bootstrap.Modal(document.getElementById('conflictHistoryModal'));
        modal.show();
    }

    // 🆕 查看衝突詳情
    viewConflictDetails(index) {
        const conflictHistory = JSON.parse(localStorage.getItem('conflict_history') || '[]');
        const entry = conflictHistory[index];
        
        if (!entry) {
            UI.showErrorToast('衝突記錄不存在');
            return;
        }
        
        // 在衝突模態框中顯示歷史衝突
        this.showConflictModal(
            entry.userCode,
            entry.serverCode, 
            entry.conflictUser,
            0, 0  // 歷史記錄不需要版本號
        );
        
        // 關閉歷史模態框
        const historyModal = document.getElementById('conflictHistoryModal');
        if (historyModal) {
            const modal = bootstrap.Modal.getInstance(historyModal);
            if (modal) modal.hide();
        }
    }

    // 🆕 清除衝突歷史
    clearConflictHistory() {
        if (confirm('確定要清除所有衝突歷史記錄嗎？')) {
            localStorage.removeItem('conflict_history');
            UI.showSuccessToast('衝突歷史已清除');
            
            // 關閉歷史模態框
            const historyModal = document.getElementById('conflictHistoryModal');
            if (historyModal) {
                const modal = bootstrap.Modal.getInstance(historyModal);
                if (modal) modal.hide();
            }
        }
    }

    // 🆕 添加衝突記錄到歷史
    addConflictRecord(conflictData, resolution, aiAnalysis = null) {
        console.log('📝 添加衝突記錄到歷史:', { resolution, hasAI: !!aiAnalysis });
        
        let conflictHistory = JSON.parse(localStorage.getItem('conflict_history') || '[]');
        
        const historyEntry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            userCode: conflictData.localCode || conflictData.userCode || '',
            serverCode: conflictData.remoteCode || conflictData.serverCode || '',
            conflictUser: conflictData.remoteUserName || conflictData.conflictUser || '未知用戶',
            roomId: conflictData.roomId || wsManager?.currentRoom || 'unknown',
            resolution: resolution,
            aiAnalysis: aiAnalysis,
            resolved: true
        };
        
        conflictHistory.unshift(historyEntry); // 新的在前
        
        // 限制歷史記錄數量
        if (conflictHistory.length > 20) {
            conflictHistory = conflictHistory.slice(0, 20);
        }
        
        localStorage.setItem('conflict_history', JSON.stringify(conflictHistory));
        console.log('✅ 衝突記錄已添加到歷史，總記錄數:', conflictHistory.length);
    }

    // 檢查衝突
    checkConflict() {
        const mainCode = this.getValue();
        const otherCode = this.getOtherValue();
        
        // Calculate diff percentage
        const diffPercentage = this.calculateDiffPercentage(mainCode, otherCode);
        
        // If both sides have changes and they're different
        if (mainCode !== this.lastMainCode && otherCode !== this.lastOtherCode) {
            // Show conflict indicators
            document.getElementById('mainConflictIndicator').style.display = 'block';
            document.getElementById('otherConflictIndicator').style.display = 'block';
            
            // Update version numbers
            this.mainVersion++;
            this.otherVersion++;
            document.getElementById('mainVersion').textContent = this.mainVersion;
            document.getElementById('otherVersion').textContent = this.otherVersion;
            
            // Show conflict resolution window with severity level
            if (window.ConflictResolver) {
                window.ConflictResolver.showConflict({
                    code: otherCode,
                    userName: '被改方',
                    version: this.otherVersion,
                    severity: this.calculateConflictSeverity(diffPercentage),
                    diffPercentage: diffPercentage
                });
            }
        }
    }

    // Calculate the percentage difference between two code versions
    calculateDiffPercentage(code1, code2) {
        if (!code1 || !code2) return 100;
        
        const lines1 = code1.split('\n');
        const lines2 = code2.split('\n');
        let differences = 0;
        
        const maxLines = Math.max(lines1.length, lines2.length);
        const minLines = Math.min(lines1.length, lines2.length);
        
        // Count line differences
        for (let i = 0; i < minLines; i++) {
            if (lines1[i] !== lines2[i]) {
                differences++;
            }
        }
        
        // Add remaining lines as differences
        differences += maxLines - minLines;
        
        return Math.round((differences / maxLines) * 100);
    }

    // Calculate conflict severity based on diff percentage
    calculateConflictSeverity(diffPercentage) {
        if (diffPercentage >= 70) return 'high';
        if (diffPercentage >= 30) return 'medium';
        return 'low';
    }
}

// 全局衝突解決器實例
const ConflictResolver = new ConflictResolverManager();
window.ConflictResolver = ConflictResolver;

// 全域函數供HTML調用
function resolveConflict(solution) {
    ConflictResolver.resolveConflict(solution);
}

function askAIForConflictHelp() {
    if (ConflictResolver) {
    ConflictResolver.requestAIAnalysis();
    } else {
        console.error('ConflictResolver not available');
    }
} 

// 全域函數（與HTML中的按鈕onclick事件對應）
function globalAskAIForConflictHelp() {
    if (window.ConflictResolver) {
        window.ConflictResolver.requestAIAnalysis();
    } else {
        console.error("ConflictResolver 尚未初始化");
        if (typeof showToast === 'function') {
            showToast('衝突解決器尚未載入完成，請稍後再試', 'warning');
        }
    }
}

// 將全域函數設置到window物件
window.globalAskAIForConflictHelp = globalAskAIForConflictHelp; 

console.log('✅ 全域 ConflictResolver 實例已創建:', window.ConflictResolver); 