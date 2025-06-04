// WebSocket 連接和通訊管理
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.messageQueue = [];
        this.heartbeatInterval = null;
        this.lastHeartbeat = 0;
    }

    // 檢查連接狀態
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    // 建立 WebSocket 連接
    connect(roomName, userName) {
        this.currentUser = userName;
        this.currentRoom = roomName;
        
        // 智能檢測 WebSocket URL
        let wsUrl;
        
        // 檢查是否為本地開發環境
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' || 
                           window.location.hostname.includes('192.168.');
        
        if (isLocalhost) {
            console.log('🏠 檢測到本地開發環境');
            wsUrl = `ws://${window.location.hostname}:${window.location.port || 8080}`;
        } else {
            // 雲端環境（如 Zeabur）
            console.log('☁️ 檢測到雲端環境');
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}`;
        }
        
        console.log(`🔌 嘗試連接到 WebSocket: ${wsUrl}`);
        console.log(`👤 用戶: ${userName}, 🏠 房間: ${roomName}`);
        
        try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('✅ WebSocket 連接成功到服務器!');
            console.log(`📍 連接地址: ${wsUrl}`);
            this.reconnectAttempts = 0;
                
                // 啟動心跳
                this.startHeartbeat();
                
                // 發送加入房間請求
            this.sendMessage({
                type: 'join_room',
                    room: roomName,
                    userName: userName
            });

                // 處理消息隊列
            this.processMessageQueue();
                
                // 觸發連接成功事件
                if (window.onWebSocketConnected) {
                    window.onWebSocketConnected();
                }
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
                console.log(`🔌 WebSocket 連接關閉: ${event.code} - ${event.reason}`);
                this.stopHeartbeat();
                
                // 嘗試重連
                if (this.reconnectAttempts < this.maxReconnectAttempts && event.code !== 1000) {
                    this.reconnectAttempts++;
                    console.log(`🔄 嘗試重連 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    setTimeout(() => {
                        this.connect(roomName, userName);
                    }, this.reconnectDelay * this.reconnectAttempts);
                } else {
                    console.log('❌ 重連次數已達上限或正常關閉');
                    if (window.onWebSocketDisconnected) {
                        window.onWebSocketDisconnected();
                    }
                }
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket 錯誤:', error);
            };

        } catch (error) {
            console.error('❌ 建立 WebSocket 連接失敗:', error);
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
            this.messageQueue.push(message);
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

    // 處理 AI 回應
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
        
        // 處理一般AI回應
        if (window.AIAssistant && typeof window.AIAssistant.handleAIResponse === 'function') {
            console.log('✅ 調用AIAssistant處理一般AI回應');
            window.AIAssistant.handleAIResponse(message.response || message);
        } else if (window.aiManager && typeof window.aiManager.handleResponse === 'function') {
            // 保持向後相容性
            console.log('✅ 調用舊版aiManager處理AI回應');
            window.aiManager.handleResponse(message);
        } else {
            console.error('❌ AI助教管理器未找到或方法不存在');
            console.log('   - AIAssistant 存在:', !!window.AIAssistant);
            console.log('   - aiManager 存在:', !!window.aiManager);
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

    // 處理消息隊列
    processMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected()) {
            const message = this.messageQueue.shift();
            this.sendMessage(message);
        }
    }

    // 啟動心跳
    startHeartbeat() {
        this.stopHeartbeat(); // 確保不會重複啟動
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000); // 每30秒發送一次心跳
        
        console.log('💓 心跳已啟動');
    }

    // 停止心跳
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('💔 心跳已停止');
        }
    }

    // 離開房間
    leaveRoom() {
        if (this.isConnected()) {
            this.sendMessage({
                type: 'leave_room',
                room: this.currentRoom
            });
        }
        
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close(1000, '用戶主動離開');
        }
        
        this.currentRoom = null;
        console.log('👋 已離開房間');
    }
}

// 全局 WebSocket 管理器實例
const wsManager = new WebSocketManager(); 