// WebSocket 連接和通訊管理
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3; // 🔧 降低重連次數
        this.reconnectDelay = 2000; // 🔧 增加重連延遲
        this.messageQueue = [];
        this.heartbeatInterval = null;
        this.lastHeartbeat = 0;
        this.retryDelay = 2000; // 增加初始延遲
        this.isManualDisconnect = false; // 🆕 追蹤是否為手動斷開
        this.connectionInProgress = false; // 🆕 防止並行連接
    }

    // 檢查 WebSocket 連接狀態
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    // 建立 WebSocket 連接
    connect(roomName, userName) {
        // 🔧 防止並行連接
        if (this.connectionInProgress) {
            console.log('⚠️ 連接正在進行中，跳過重複連接');
            return;
        }
        
        this.connectionInProgress = true;
        this.isManualDisconnect = false;
        
        // 🔧 清理現有連接
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // 清理現有心跳
        this.stopHeartbeat();
        
        // 🔧 暫時禁用自動重連，避免創建大量虛擬用戶
        console.log('⚠️ 自動重連已暫時禁用');
        
        // 檢測 WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl;
        
        // 🔧 本地開發環境特殊處理
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // 本地環境
            const currentPort = window.location.port;
            if (currentPort === '8080' || currentPort === '3000') {
                wsUrl = `ws://localhost:${currentPort}`;
            } else {
                wsUrl = `ws://localhost:8080`;  // 默認8080
            }
        } else if (window.location.hostname.includes('.zeabur.app')) {
            // Zeabur 環境
            wsUrl = `${protocol}//${window.location.host}`;
        } else {
            // 其他雲端環境
            wsUrl = `${protocol}//${window.location.host}`;
        }
        
        console.log(`🔗 嘗試連接 WebSocket: ${wsUrl}`);
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
            
            // 設置連接超時
            this.connectionTimeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    console.error('❌ WebSocket 連接超時');
                    this.ws.close();
                    this.connectionInProgress = false;
                }
            }, 10000);
            
        } catch (error) {
            console.error('❌ WebSocket 連接失敗:', error);
            this.connectionInProgress = false;
        }
    }

    // 🆕 清理連接資源
    cleanup() {
        if (this.ws) {
            this.isManualDisconnect = true;
            this.stopHeartbeat();
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close(1000, 'Manual cleanup');
            }
            this.ws = null;
        }
    }

    // 🆕 手動斷開連接
    disconnect() {
        console.log('🔌 手動斷開 WebSocket 連接');
        this.isManualDisconnect = true;
        this.cleanup();
        this.clearSavedRoomInfo();
    }

    // 處理消息隊列
    processMessageQueue() {
        if (this.messageQueue.length > 0 && this.isConnected()) {
            console.log(`📝 處理消息隊列: ${this.messageQueue.length} 條消息`);
            const messages = [...this.messageQueue];
            this.messageQueue = [];
            
            messages.forEach(message => {
                try {
                    this.ws.send(JSON.stringify(message));
                    console.log('📤 重新發送排隊消息:', message.type);
                } catch (error) {
                    console.error('❌ 重新發送消息失敗:', error);
                    // 重新加入隊列
                    this.messageQueue.push(message);
                }
            });
        }
    }

    // 發送消息
    sendMessage(message) {
        if (this.isConnected()) {
            try {
                this.ws.send(JSON.stringify(message));
                console.log('📤 發送消息:', message.type);
            } catch (error) {
                console.error('❌ 發送消息失敗:', error);
                // 添加到消息隊列以便重連後發送
                this.messageQueue.push(message);
            }
        } else {
            console.log('📝 WebSocket 未連接，消息已加入隊列');
            // 🔧 限制隊列大小
            if (this.messageQueue.length < 50) {
                this.messageQueue.push(message);
            } else {
                console.warn('⚠️ 消息隊列已滿，丟棄舊消息');
                this.messageQueue.shift();
                this.messageQueue.push(message);
            }
        }
    }

    // 處理收到的消息
    handleMessage(message) {
        console.log('📨 收到消息:', message.type);
        
        switch (message.type) {
            case 'room_joined':
                this.handleRoomJoined(message);
                break;
            case 'join_room_error':
                this.handleJoinRoomError(message);
                break;
            case 'user_joined':
            case 'user_reconnected':
                this.handleUserJoined(message);
                break;
            case 'user_left':
                this.handleUserLeft(message);
                break;
            case 'code_change':
                this.handleCodeChange(message);
                break;
            case 'cursor_changed':
                this.handleCursorChange(message);
                break;
            case 'chat_message':
                this.handleChatMessage(message);
                break;
            case 'ai_response':
                this.handleAIResponse(message);
                break;
            case 'code_execution_result':
                this.handleCodeExecutionResult(message);
                break;
            case 'conflict_notification':
                this.handleConflictNotification(message);
                break;
            case 'save_code_success':
                this.handleSaveCodeSuccess(message);
                break;
            case 'save_code_error':
                this.handleSaveCodeError(message);
                break;
            case 'code_loaded':
                this.handleCodeLoaded(message);
                break;
            case 'history_data':
                this.handleHistoryData(message);
                break;
            case 'history_synced':
                this.handleHistorySynced(message);
                break;
            case 'pong':
                this.lastHeartbeat = Date.now();
                break;
            case 'error':
                console.error('❌ 收到服務器錯誤消息:', message.error, message.details);
                if (window.UI) {
                    window.UI.showToast('服務器錯誤', message.error || '發生未知錯誤', 'error');
                }
                break;
            default:
                console.warn('⚠️ 未知消息類型:', message.type);
        }
    }

    // 處理房間加入成功
    handleRoomJoined(message) {
        console.log(`✅ 成功加入房間: ${message.roomId}`);
        console.log('📥 房間數據:', message);
        console.log('   - 代碼長度:', (message.code || '').length);
        console.log('   - 版本號:', message.version);
        console.log('   - 用戶數量:', (message.users || []).length);
        
        // 更新編輯器內容 - 修復變量名稱
        if (window.Editor && message.code !== undefined) {
            console.log('🔄 設置編輯器代碼...');
            window.Editor.setCode(message.code, message.version);
            console.log('✅ 編輯器代碼已設置');
        } else {
            console.error('❌ 編輯器未找到或房間代碼為空');
            console.log('   - Editor 存在:', !!window.Editor);
            console.log('   - 代碼內容:', message.code);
        }
        
        // 更新用戶列表
        this.updateUserList(message.users);
        
        // 更新聊天歷史
        if (message.chatHistory && window.chatManager) {
            window.chatManager.loadChatHistory(message.chatHistory);
        } else if (window.Chat) {
            // 備用方案：使用 Chat 對象
            if (message.chatHistory && message.chatHistory.length > 0) {
                message.chatHistory.forEach(msg => {
                    window.Chat.addChatMessage(msg.content, msg.author, msg.timestamp);
                });
            }
        }
        
        // 更新房間信息顯示
        this.updateRoomInfo(message.roomId, message.users);
        
        // 顯示加入提示
        if (window.UI) {
            if (message.isReconnect) {
                window.UI.showToast('重連成功', '已重新連接到房間', 'success');
            } else {
                window.UI.showToast('加入成功', `已加入房間 "${message.roomId}"`, 'success');
            }
        }
    }

    // 處理加入房間錯誤
    handleJoinRoomError(message) {
        console.error('❌ 加入房間失敗:', message.message);
        
        if (message.error === 'name_duplicate') {
            // 用戶名稱重複
            if (window.UI) {
                window.UI.showToast('用戶名稱重複', message.message, 'error');
            }
            
            // 提示用戶修改用戶名稱
            const newUserName = prompt('您的用戶名稱已被使用，請輸入新的用戶名稱：', this.currentUser + '_' + Math.floor(Math.random() * 100));
            if (newUserName && newUserName.trim()) {
                this.currentUser = newUserName.trim();
                // 重新嘗試加入
                this.sendMessage({
                    type: 'join_room',
                    room: this.currentRoom,
                    userName: this.currentUser
                });
            }
        } else {
            // 其他錯誤
            if (window.UI) {
                window.UI.showToast('加入失敗', message.message, 'error');
            }
        }
    }

    // 處理用戶加入
    handleUserJoined(message) {
        console.log(`👤 用戶加入: ${message.userName}`);
        
        // 更新用戶列表
        if (message.users) {
            this.updateUserList(message.users);
        }
        
        // 顯示通知
        if (window.UI && message.userName !== this.currentUser) {
            window.UI.showToast('新用戶加入', `${message.userName} 加入了房間`, 'info');
        }
    }

    // 處理用戶離開
    handleUserLeft(message) {
        console.log(`👋 用戶離開: ${message.userName}`);
        
        // 更新用戶列表（需要從服務器獲取最新列表）
        
        // 顯示通知
        if (window.UI && message.userName !== this.currentUser) {
            window.UI.showToast('用戶離開', `${message.userName} 離開了房間`, 'info');
        }
    }

    // 處理代碼變更
    handleCodeChange(message) {
        console.log('📨 收到代碼變更消息:', message);
        console.log('   - 來源用戶:', message.userName);
        console.log('   - 版本號:', message.version);
        console.log('   - 代碼長度:', (message.code || '').length);
        
        // 確保編輯器存在並調用處理方法
        if (window.Editor && typeof window.Editor.handleRemoteCodeChange === 'function') {
            console.log('🔄 調用編輯器處理遠程代碼變更...');
            window.Editor.handleRemoteCodeChange(message);
        } else {
            console.error('❌ 編輯器未找到或方法不存在');
            console.log('   - Editor 存在:', !!window.Editor);
            console.log('   - handleRemoteCodeChange 方法存在:', !!(window.Editor && window.Editor.handleRemoteCodeChange));
            
            // 降級處理：直接更新代碼
            if (window.Editor && typeof window.Editor.setCode === 'function') {
                console.log('🔄 降級處理：直接設置代碼');
                window.Editor.setCode(message.code, message.version);
            }
        }
    }

    // 處理游標變更
    handleCursorChange(message) {
        if (window.editorManager) {
            window.editorManager.handleRemoteCursorChange(message);
        }
    }

    // 處理聊天消息
    handleChatMessage(message) {
        if (window.chatManager) {
            window.chatManager.displayMessage(message);
        }
    }

    // 處理AI回應
    handleAIResponse(message) {
        console.log('🤖 處理AI回應:', message);
        console.log('   - 動作:', message.action);
        console.log('   - 請求ID:', message.requestId);
        console.log('   - 錯誤:', message.error);
        
        // 檢查是否為衝突分析回應
        if (message.action === 'conflict_analysis') {
            console.log('🔍 處理AI衝突分析回應...');
            
            // 顯示在AI助教面板中
            if (window.AIAssistant && typeof window.AIAssistant.showResponse === 'function') {
                const analysisResult = message.response || '❌ AI衝突分析無回應';
                const formattedResponse = `
                    <h6><i class="fas fa-exclamation-triangle text-warning"></i> AI協作衝突分析</h6>
                    <div class="alert alert-info">
                        ${window.AIAssistant.formatAIResponse(analysisResult)}
                    </div>
                `;
                window.AIAssistant.showResponse(formattedResponse);
                console.log('✅ AI衝突分析結果已顯示在助教面板');
            }
            
            // 同時也顯示在衝突解決器中
            if (window.ConflictResolver && typeof window.ConflictResolver.displayAIAnalysis === 'function') {
                window.ConflictResolver.displayAIAnalysis(message.response);
                console.log('✅ AI衝突分析結果已顯示在衝突解決器');
            }
            
            return;
        }
        
        // 處理一般AI回應 - 檢查多個可能的全域實例
        let handled = false;
        
        if (window.AIAssistant && typeof window.AIAssistant.handleAIResponse === 'function') {
            console.log('✅ 調用window.AIAssistant處理AI回應');
            window.AIAssistant.handleAIResponse(message.response || message);
            handled = true;
        } else if (typeof AIAssistant !== 'undefined' && typeof AIAssistant.handleAIResponse === 'function') {
            console.log('✅ 調用全域AIAssistant處理AI回應');
            AIAssistant.handleAIResponse(message.response || message);
            handled = true;
        } else if (window.aiManager && typeof window.aiManager.handleResponse === 'function') {
            // 保持向後相容性
            console.log('✅ 調用舊版aiManager處理AI回應');
            window.aiManager.handleResponse(message);
            handled = true;
        }
        
        if (!handled) {
            console.error('❌ AI助教管理器未找到或方法不存在');
            console.log('   - window.AIAssistant 存在:', !!window.AIAssistant);
            console.log('   - window.AIAssistant.handleAIResponse 方法存在:', !!(window.AIAssistant && window.AIAssistant.handleAIResponse));
            console.log('   - 全域 AIAssistant 存在:', typeof AIAssistant !== 'undefined');
            console.log('   - aiManager 存在:', !!window.aiManager);
            
            // 降級處理：直接顯示AI回應
            if (message.response) {
                console.log('🔄 使用降級方式顯示AI回應');
                if (window.UI && window.UI.showToast) {
                    window.UI.showToast('AI回應', message.response.substring(0, 100) + '...', 'info', 5000);
                } else {
                    alert('AI回應: ' + message.response);
                }
            }
        }
    }

    // 處理代碼執行結果
    handleCodeExecutionResult(message) {
        console.log('🔍 收到代碼執行結果:', message);
        
        if (window.Editor && typeof window.Editor.handleExecutionResult === 'function') {
            console.log('🔄 調用編輯器處理執行結果...');
            window.Editor.handleExecutionResult(message);
        } else {
            console.error('❌ 編輯器未找到或方法不存在');
            console.log('   - Editor 存在:', !!window.Editor);
            console.log('   - handleExecutionResult 方法存在:', !!(window.Editor && window.Editor.handleExecutionResult));
            
            // 降級處理：直接顯示結果
            if (message.success) {
                alert(`執行成功:\n${message.message}`);
            } else {
                alert(`執行失敗:\n${message.message}`);
            }
        }
    }

    // 🆕 處理衝突通知 - 讓主改方看到衝突處理狀態
    handleConflictNotification(message) {
        console.log('🚨 收到衝突通知:', message);
        
        if (message.targetUser === this.currentUser) {
            // 顯示主改方的衝突等待界面
            if (window.ConflictResolver && typeof window.ConflictResolver.showSenderWaitingModal === 'function') {
                window.ConflictResolver.showSenderWaitingModal(message);
                console.log('✅ 主改方衝突等待界面已顯示');
            } else {
                // 降級處理：使用簡單的通知
                if (window.UI) {
                    window.UI.showToast(
                        '協作衝突', 
                        `${message.conflictWith} 正在處理您的代碼修改衝突，請稍候...`, 
                        'warning',
                        5000  // 5秒自動消失
                    );
                }
                
                // 在聊天室顯示狀態
                if (window.Chat && typeof window.Chat.addSystemMessage === 'function') {
                    window.Chat.addSystemMessage(
                        `⏳ ${message.conflictWith} 正在處理與您的協作衝突...`
                    );
                }
                
                console.log('✅ 使用降級方式顯示衝突通知');
            }
        }
    }

    // 處理代碼保存成功
    handleSaveCodeSuccess(message) {
        console.log('✅ 代碼保存成功:', message);
        
        if (window.UI) {
            window.UI.showToast('保存成功', `代碼已保存 (版本: ${message.version})`, 'success');
        }
        
        if (window.Editor && typeof window.Editor.handleSaveSuccess === 'function') {
            window.Editor.handleSaveSuccess(message);
        }
    }

    // 處理代碼保存錯誤
    handleSaveCodeError(message) {
        console.error('❌ 代碼保存失敗:', message.error);
        
        if (window.UI) {
            window.UI.showToast('保存失敗', message.error || '代碼保存失敗', 'error');
        }
    }

    // 處理代碼載入
    handleCodeLoaded(message) {
        console.log('📥 收到代碼載入結果:', message);
        
        if (message.success && window.Editor) {
            if (message.isAlreadyLatest) {
                if (window.UI) {
                    window.UI.showToast('代碼已是最新', '當前代碼已是最新版本', 'info');
                }
            } else {
                window.Editor.setCode(message.code, message.version);
                if (window.UI) {
                    window.UI.showToast('代碼已載入', `載入版本 ${message.version}`, 'success');
                }
            }
        } else if (!message.success) {
            console.error('❌ 代碼載入失敗:', message.error);
            if (window.UI) {
                window.UI.showToast('載入失敗', message.error || '代碼載入失敗', 'error');
            }
        }
    }

    // 處理歷史數據
    handleHistoryData(message) {
        console.log('📥 收到歷史數據:', message);
        
        if (window.Editor && typeof window.Editor.handleHistoryData === 'function') {
            console.log('🔄 調用編輯器處理歷史數據...');
            window.Editor.handleHistoryData(message);
        } else {
            console.error('❌ 編輯器未找到或方法不存在');
            console.log('   - Editor 存在:', !!window.Editor);
            console.log('   - handleHistoryData 方法存在:', !!(window.Editor && window.Editor.handleHistoryData));
            
            // 降級處理：直接顯示歷史數據
            if (message.data) {
                console.log('🔄 使用降級方式顯示歷史數據');
                if (window.UI && window.UI.showToast) {
                    window.UI.showToast('歷史數據', message.data.substring(0, 100) + '...', 'info', 5000);
                } else {
                    alert('歷史數據: ' + message.data);
                }
            }
        }
    }

    // 處理歷史同步完成
    handleHistorySynced(message) {
        console.log('✅ 歷史同步完成:', message);
        
        if (window.UI) {
            window.UI.showToast('歷史同步完成', '歷史數據已成功同步', 'success');
        }
    }

    // 更新用戶列表
    updateUserList(users) {
        console.log(`👥 準備更新用戶列表: ${users ? users.length : 0} 個用戶`);
        console.log(`🔍 用戶數據:`, users);
        
        // 使用正確的元素ID
        const userListElement = document.getElementById('onlineUsers');
        if (!userListElement) {
            console.warn('⚠️ 找不到 onlineUsers 元素');
            return;
        }
        
        if (!users || users.length === 0) {
            userListElement.innerHTML = '<strong>在線用戶:</strong> <span class="text-muted">無</span>';
            return;
        }
        
        // 創建用戶列表HTML
        let userListHTML = '<strong>在線用戶:</strong> ';
        const userNames = users.map(user => {
            const userName = user.userName || user.name || '匿名用戶';
            const status = user.isActive ? '🟢' : '🔴';
            return `${status} ${userName}`;
        });
        
        userListHTML += userNames.join(', ');
        userListElement.innerHTML = userListHTML;
        
        // 更新用戶計數
        const userCountElement = document.getElementById('userCount');
        if (userCountElement) {
            userCountElement.textContent = users.length;
        }
        
        console.log(`✅ 用戶列表已更新: ${users.length} 個用戶`);
        console.log(`📝 顯示內容: ${userListHTML}`);
    }

    // 更新房間信息
    updateRoomInfo(roomId, users) {
        const roomNameElement = document.getElementById('roomName');
        if (roomNameElement) {
            roomNameElement.textContent = roomId;
        }
        
        const userCountElement = document.getElementById('userCount');
        if (userCountElement && users) {
            userCountElement.textContent = users.length;
        }
    }

    // 啟動心跳
    startHeartbeat() {
        // 🔧 清理現有心跳
        this.stopHeartbeat();
        
        console.log('💓 啟動 WebSocket 心跳檢測');
        this.lastHeartbeat = Date.now();
        
        // 🔧 增加心跳間隔，降低服務器負載
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                // 檢查上次心跳響應時間
                const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
                if (timeSinceLastHeartbeat > 60000) { // 1分鐘無響應
                    console.warn('⚠️ 心跳響應超時，可能連接異常');
                    return;
                }
                
                this.sendMessage({ type: 'ping' });
            } else {
                console.log('💓 WebSocket 未連接，停止心跳');
                this.stopHeartbeat();
            }
        }, 25000); // 🔧 改為25秒間隔（之前可能太頻繁）
    }

    // 停止心跳
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            console.log('💓 停止 WebSocket 心跳檢測');
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // 離開房間
    leaveRoom() {
        console.log('🚪 準備離開房間...');
        
        if (this.currentRoom && this.isConnected()) {
            this.sendMessage({
                type: 'leave_room',
                room: this.currentRoom,
                userName: this.currentUser
            });
        }
        
        // 🔧 清理房間信息
        this.currentRoom = null;
        this.currentUser = null;
        this.clearSavedRoomInfo();
        
        // 🔧 斷開連接而不是關閉（避免自動重連）
        this.disconnect();
        
        console.log('✅ 已離開房間並斷開連接');
    }

    // 獲取保存的房間信息
    getSavedRoomInfo() {
        try {
            const roomInfo = localStorage.getItem('wsm_room_info');
            if (roomInfo) {
                return JSON.parse(roomInfo);
            }
        } catch (error) {
            console.error('❌ 獲取保存的房間信息失敗:', error);
        }
        return { room: null, user: null };
    }

    // 保存房間信息
    saveRoomInfo(roomName, userName) {
        try {
            const roomInfo = {
                room: roomName,
                user: userName,
                timestamp: Date.now()
            };
            localStorage.setItem('wsm_room_info', JSON.stringify(roomInfo));
            console.log('💾 房間信息已保存:', roomInfo);
        } catch (error) {
            console.error('❌ 保存房間信息失敗:', error);
        }
    }

    // 清除保存的房間信息
    clearSavedRoomInfo() {
        try {
            localStorage.removeItem('wsm_room_info');
            console.log('🗑️ 已清除保存的房間信息');
        } catch (error) {
            console.error('❌ 清除房間信息失敗:', error);
        }
    }

    // 加入房間
    joinRoom(roomName, userName) {
        this.currentRoom = roomName;
        this.currentUser = userName;
        this.connect(roomName, userName);
    }

    // 🔧 測試 WebSocket 連接狀態
    testConnection() {
        console.log('🧪 WebSocket 連接測試:');
        console.log('   - 當前 URL:', window.location.href);
        console.log('   - WebSocket 狀態:', this.ws ? this.ws.readyState : 'null');
        console.log('   - 是否已連接:', this.isConnected());
        console.log('   - 當前用戶:', this.currentUser);
        console.log('   - 當前房間:', this.currentRoom);
        
        if (this.isConnected()) {
            console.log('✅ WebSocket 連接正常');
            return true;
        } else {
            console.log('❌ WebSocket 未連接');
            console.log('💡 建議: 檢查服務器狀態並重新連接');
            return false;
        }
    }

    // 設置事件處理器
    setupEventHandlers() {
        this.ws.onopen = () => {
            clearTimeout(this.connectionTimeout);
            console.log('✅ WebSocket 連接已建立');
            this.connectionInProgress = false;
            this.reconnectAttempts = 0;
            
            // 🚫 不再自動加入房間 - 只有在明確調用 joinRoom 時才加入
            console.log('⚠️ 已連接，等待手動加入房間');
            
            this.startHeartbeat();
            this.processMessageQueue();
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('❌ 解析消息失敗:', error, event.data);
            }
        };

        this.ws.onclose = (event) => {
            clearTimeout(this.connectionTimeout);
            this.connectionInProgress = false;
            console.log(`🔌 WebSocket 連接關閉: ${event.code} - ${event.reason}`);
            this.stopHeartbeat();
            
            // 🚫 暫時禁用自動重連避免虛擬用戶問題
            console.log('⚠️ 連接已關閉，自動重連已禁用');
            
            if (window.onWebSocketDisconnected) {
                window.onWebSocketDisconnected();
            }
        };

        this.ws.onerror = (error) => {
            clearTimeout(this.connectionTimeout);
            this.connectionInProgress = false;
            console.error('❌ WebSocket 錯誤:', error);
        };
    }
}

// 全局 WebSocket 管理器實例
const wsManager = new WebSocketManager();

// 添加初始化方法
wsManager.initialize = function() {
    console.log('🔧 WebSocket管理器初始化完成');
    // 可以在這裡添加任何需要的初始化邏輯
    return true;
};

// 確保全域可訪問性
window.wsManager = wsManager;
console.log('✅ 全域 WebSocket 管理器實例已創建並設置到 window.wsManager:', window.wsManager); 