// 衝突檢測和解決管理
class ConflictResolverManager {
    constructor() {
        this.conflictData = null;
        this.modal = null;
        this.modalElement = null;
        console.log('🔧 ConflictResolverManager 已創建');
    }

    // 初始化衝突解決器
    initialize() {
        this.modalElement = document.getElementById('conflictModal');
        if (!this.modalElement) {
            console.error('❌ Conflict modal element #conflictModal not found during initialization!');
        } else {
            console.log('✅ ConflictResolver modal element found');
        }
        // Bootstrap modal instance (this.modal) will be managed in showConflictModal
        console.log('✅ ConflictResolver initialized. Modal element cached.');
    }

    // 顯示衝突解決模態框
    showConflict(message) {
        try {
            console.log('🚨 顯示協作衝突模態框 V4 - 增強差異對比', message);
            
            // 更新衝突用戶名稱顯示
            const conflictUserSpan = document.getElementById('conflictUserName');
            const otherUserSpan = document.getElementById('otherUserName');
            if (conflictUserSpan && message.userName) {
                conflictUserSpan.textContent = message.userName;
            }
            if (otherUserSpan && message.userName) {
                otherUserSpan.textContent = message.userName;
            }
            
            // 🔧 獲取代碼並分析差異
            const myCode = Editor.editor ? Editor.editor.getValue() : '';
            const otherCode = message.code || '';
            
            // 顯示代碼差異
            this.displayCodeDifference(myCode, otherCode, message.userName || '其他同學');
            
            // 添加版本信息顯示
            const versionInfo = document.getElementById('conflictVersionInfo');
            if (versionInfo) {
                versionInfo.innerHTML = `
                    <i class="fas fa-info-circle"></i> 
                    版本信息: 您的版本 ${Editor.codeVersion || 'unknown'} vs ${message.userName || '對方'}版本 ${message.version || 'unknown'}
                `;
            }
            
            // 存儲當前衝突信息，用於AI分析
            this.currentConflict = {
                userCode: myCode,
                serverCode: otherCode,
                userVersion: Editor.codeVersion || 0,
                serverVersion: message.version || 0,
                conflictUser: message.userName || '其他同學',
                roomId: wsManager.currentRoom || 'unknown',
                code: otherCode,  // 兼容性
                userName: message.userName,
                version: message.version
            };
            
            // 隱藏AI分析區域
            const aiAnalysis = document.getElementById('conflictAIAnalysis');
            if (aiAnalysis) {
                aiAnalysis.style.display = 'none';
            }
            
            // 顯示模態框
            const modal = document.getElementById('conflictModal');
            if (modal) {
                const bsModal = new bootstrap.Modal(modal, { backdrop: 'static' });
                bsModal.show();
                console.log('✅ 協作衝突模態框已顯示 V4');
            } else {
                console.error('❌ 找不到衝突模態框元素');
                // 降級處理：使用alert
                alert(`協作衝突！${message.userName || '其他同學'}也在修改程式碼。請重新載入頁面獲取最新版本。`);
            }
        } catch (error) {
            console.error('❌ 顯示衝突模態框時發生錯誤:', error);
            // 降級處理
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
            remoteVersion: remoteVersion || 0
        };
        
        // 🔧 同時設置 currentConflict (向後兼容)
        this.currentConflict = {
            userCode: localCode || '',
            serverCode: remoteCode || '',
            userVersion: localVersion || 0,
            serverVersion: remoteVersion || 0,
            conflictUser: remoteUserName || '其他同學',
            roomId: wsManager?.currentRoom || 'unknown',
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
            console.error('❌ 模態框元素未找到');
            this.showEditorWarning();
            return;
        }

        try {
            // 嘗試獲取現有實例，如果沒有則創建新的
            this.modal = bootstrap.Modal.getInstance(this.modalElement);
            if (!this.modal) {
                console.log('🔧 創建新的 Bootstrap Modal 實例');
                this.modal = new bootstrap.Modal(this.modalElement, { backdrop: 'static' });
            }

            if (this.modal && typeof this.modal.show === 'function') {
                console.log('✅ 顯示衝突模態框...');
                this.modal.show();
                console.log('✅ 衝突模態框已顯示 V5');
            } else {
                console.error('❌ Modal instance 無效');
                this.modalElement.style.display = 'block';
                this.modalElement.classList.add('show');
                document.body.classList.add('modal-open');
            }
        } catch (error) {
            console.error('❌ 顯示模態框時出錯:', error);
            if(this.modalElement) {
                this.modalElement.style.display = 'block'; 
                this.modalElement.classList.add('show');
                document.body.classList.add('modal-open');
            }
        }
        
        this.showEditorWarning();
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

    // 🆕 解決衝突 - 新增歷史記錄
    resolveConflict(choice) {
        console.log('✅ [ConflictResolver] 用戶選擇解決方案:', choice);
        
        if (!this.currentConflict) {
            console.error('❌ 沒有當前衝突數據');
            return;
        }
        
        const conflictData = this.currentConflict;
        let resolution;
        
        if (choice === 'accept') {
            // 接受對方修改
            Editor.applyRemoteCode(conflictData.serverCode, conflictData.serverVersion);
            console.log('✅ 選擇接受對方修改解決衝突');
            resolution = 'accepted';
        } else if (choice === 'reject') {
            // 拒絕對方修改，保持自己的版本
            console.log('✅ 選擇拒絕對方修改解決衝突');
            resolution = 'rejected';
        }
        
        // 🆕 記錄衝突歷史
        if (this.lastAIAnalysis) {
            conflictHistoryManager.addConflictRecord(conflictData, resolution, this.lastAIAnalysis);
        } else {
            conflictHistoryManager.addConflictRecord(conflictData, resolution);
        }
        
        // 關閉模態框
        this.hideConflictModal();
        
        // 通知成功
        const message = choice === 'accept' ? '已接受對方修改' : '已拒絕對方修改，保持我的版本';
        
        if (window.showToast) {
            window.showToast(message, 'success');
        } else {
            alert(message);
        }
        
        // 清理衝突狀態
        this.currentConflict = null;
        this.lastAIAnalysis = null;
        Editor.resetEditingState();
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
        
        // 準備發送給AI的數據
        const analysisData = {
            action: 'conflict_analysis',
            userCode: userCode,
            conflictCode: serverCode,
            userName: wsManager.currentUser || 'Unknown',
            conflictUser: conflictUser,
            version: conflictInfo.localVersion || conflictInfo.userVersion || 0,
            conflictVersion: conflictInfo.remoteVersion || conflictInfo.serverVersion || 0,
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

    // 📱 顯示AI分析結果在UI中
    displayAIAnalysis(analysisText, target = 'conflict') {
        console.log('🤖 顯示AI分析結果:', analysisText.substring(0, 100) + '...');
        
        const formatted = this.formatAIAnalysisForUI(analysisText);
        
        if (target === 'conflict') {
            // 顯示在衝突解決模態框中
            const aiAnalysisDiv = document.getElementById('conflictAIAnalysis');
            const aiContentDiv = document.getElementById('aiAnalysisContent');
            
            if (aiAnalysisDiv && aiContentDiv) {
                aiContentDiv.innerHTML = formatted;
                aiAnalysisDiv.style.display = 'block';
                
                // 添加分享按鈕
                const shareBtn = document.createElement('button');
                shareBtn.className = 'btn btn-sm btn-outline-primary mt-2';
                shareBtn.innerHTML = '<i class="fas fa-share"></i> 分享到聊天室';
                shareBtn.onclick = () => this.shareAIAnalysis(analysisText);
                
                // 如果還沒有分享按鈕，就添加一個
                if (!aiContentDiv.querySelector('.btn-outline-primary')) {
                    aiContentDiv.appendChild(shareBtn);
                }
            }
        } else {
            // 顯示在AI助教面板中
            if (window.aiAssistant && window.aiAssistant.displayResponse) {
                window.aiAssistant.displayResponse(formatted);
            }
        }
    }

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

    // 🆕 顯示主改方的等待界面 - 新增代碼差異對比
    showSenderWaitingModal(conflictData) {
        console.log('⏳ [ConflictResolver] 顯示主改方等待界面:', conflictData);
        
        // 創建等待模態框（如果不存在）
        let waitingModal = document.getElementById('senderWaitingModal');
        if (!waitingModal) {
            this.createSenderWaitingModal();
            waitingModal = document.getElementById('senderWaitingModal');
        }
        
        // 更新等待信息
        const conflictUser = document.getElementById('waitingConflictUser');
        const waitingMessage = document.getElementById('waitingMessage');
        
        if (conflictUser) {
            conflictUser.textContent = conflictData.conflictWith || '其他同學';
        }
        
        if (waitingMessage) {
            waitingMessage.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-hourglass-half text-warning"></i> 
                    <strong>${conflictData.conflictWith}</strong> 正在處理與您的代碼修改衝突...
                </div>
            `;
        }
        
        // 🆕 在主改方界面也顯示代碼差異對比
        this.displayCodeDifferenceInWaiting(
            conflictData.localCode || '', 
            conflictData.remoteCode || '', 
            conflictData.conflictWith || '其他同學'
        );
        
        // 顯示模態框
        const modal = new bootstrap.Modal(waitingModal);
        modal.show();
        
        console.log('✅ 主改方等待界面已顯示（包含代碼差異）');
    }

    // 🆕 在等待界面中顯示代碼差異
    displayCodeDifferenceInWaiting(myCode, otherCode, otherUserName) {
        const myCodeElement = document.getElementById('waitingMyCodeVersion');
        const otherCodeElement = document.getElementById('waitingOtherCodeVersion');
        const otherNameElement = document.getElementById('waitingOtherUserName');
        const diffSummaryElement = document.getElementById('waitingDiffSummary');
        
        if (myCodeElement) {
            myCodeElement.textContent = myCode || '(空白)';
        }
        
        if (otherCodeElement) {
            otherCodeElement.textContent = otherCode || '(空白)';
        }
        
        if (otherNameElement) {
            otherNameElement.textContent = otherUserName;
        }
        
        // 執行差異分析
        const analysis = this.performLocalDiffAnalysis(myCode, otherCode);
        
        if (diffSummaryElement) {
            const summaryText = `差異: +${analysis.added.length} 新增, -${analysis.removed.length} 刪除, ~${analysis.modified.length} 修改`;
            diffSummaryElement.textContent = summaryText;
        }
        
        console.log('✅ 主改方等待界面的代碼差異顯示完成');
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
        
        // 在聊天室發送預設信息
        if (window.Chat && typeof window.Chat.addChatMessage === 'function') {
            window.Chat.addChatMessage(
                '💬 我們來討論一下代碼衝突的解決方案吧',
                wsManager.currentUser
            );
        }
        
        // 滾動到聊天區域（如果存在）
        const chatContainer = document.querySelector('.chat-container, #chatContainer, .chat-messages');
        if (chatContainer) {
            chatContainer.scrollIntoView({ behavior: 'smooth' });
        }
        
        console.log('✅ 已打開聊天室進行衝突討論');
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
}

// 全局衝突解決器實例
const ConflictResolver = new ConflictResolverManager();
window.ConflictResolver = ConflictResolver;

// 全局函數供HTML調用
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

console.log('✅ 全域 ConflictResolver 實例已創建:', window.ConflictResolver); 