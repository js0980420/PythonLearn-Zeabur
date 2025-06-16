// WebSocket 連接和通訊管理
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.isConnected = false;
        this.activeUsers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.messageQueue = [];
        this.heartbeatInterval = null;
        this.lastHeartbeat = Date.now();
        console.log('🔧 WebSocketManager 已創建');
    }

    // 獲取當前房間的活躍用戶列表
    getActiveUsers() {
        return Array.from(this.activeUsers.values());
    }

    // 更新用戶狀態
    updateUserStatus(userData) {
        const { userName, isEditing, position } = userData;
        
        if (userName === this.currentUser) return;
        
        // 更新或添加用戶
        this.activeUsers.set(userName, {
            userName,
            isEditing: isEditing || false,
            position: position || null,
            lastActivity: Date.now()
        });
        
        // 通知編輯器更新協作狀態
        if (window.editorManager) {
            editorManager.updateCollaboratorStatus(userData);
        }
        
        console.log(`👥 更新用戶狀態: ${userName}, 編輯中: ${isEditing}`);
    }
    
    // 移除用戶
    removeUser(userName) {
        if (this.activeUsers.has(userName)) {
            this.activeUsers.delete(userName);
            console.log(`👋 用戶離開: ${userName}`);
            
            // 清除相關的衝突警告
            if (window.conflictManager) {
                conflictManager.clearConflictWarning(userName);
            }
        }
    }
    
    // 處理用戶消息
    handleUserMessage(message) {
        switch (message.type) {
            case 'user_join':
                this.updateUserStatus({
                    userName: message.userName,
                    isEditing: false
                });
                break;
                
            case 'user_leave':
                this.removeUser(message.userName);
                break;
                
            case 'editing_status':
                this.updateUserStatus(message);
                break;
        }
    }
    
    // 清理非活躍用戶
    cleanupInactiveUsers() {
        const now = Date.now();
        const timeout = 30000; // 30 秒超時
        
        for (const [userName, userData] of this.activeUsers) {
            if (now - userData.lastActivity > timeout) {
                this.removeUser(userName);
            }
        }
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
            wsUrl = `ws://${window.location.hostname}:${window.location.port || 3000}`;
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
        if (!this.ws) {
            console.log('📝 WebSocket 未初始化，消息已加入隊列');
            this.messageQueue.push(message);
            return;
        }

        if (this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                console.log('📤 發送消息:', message.type);
            } catch (error) {
                console.error('❌ 發送消息失敗:', error);
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
            case 'teacher_broadcast':
                this.handleTeacherBroadcast(message);
                break;
            case 'notification_sent':
                console.log('📧 衝突通知已發送確認:', message);
                // 可以在這裡添加用戶反饋，例如顯示"通知已發送"的提示
                if (window.UI && typeof window.UI.showInfoToast === 'function') {
                    window.UI.showInfoToast('衝突通知已發送給對方');
                }
                break;
            case 'save_success':
                 window.uiManager.showToast(message.isAutoSave ? '✅ 已自動保存' : '✅ 保存成功', 'success');
                if(window.editorManager) {
                    window.editorManager.updateHistoryUI();
                }
                break;
            case 'save_error':
                 window.uiManager.showToast(`❌ 保存失敗: ${message.error}`, 'error');
                break;
            case 'load_success':
                 window.editorManager.setCode(message.code, message.version, 'load');
                 window.uiManager.showToast('✅ 代碼載入成功', 'success');
                break;
            case 'load_error':
                 window.uiManager.showToast(`❌ 載入失敗: ${message.error}`, 'error');
                break;
            case 'history_updated':
                if (window.editorManager) {
                    window.editorManager.updateHistoryUI(message.history);
                }
                break;
            default:
                console.warn('未知消息類型:', message.type);
        }
    }

    handleJoinRoomError(message) {
        window.uiManager.showToast(`❌ 加入房間失敗: ${message.error}`, 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    }

    // 處理房間加入成功
    handleRoomJoined(message) {
        console.log('✅ 房間加入成功:', message);
        this.isConnected = true;

        const { room, users, history } = message.data;

        // 更新房間和用戶信息
        this.updateRoomInfo(room.id, users);
        
        // 更新用戶列表
        this.activeUsers = new Map(users.map(u => [u.userName, u]));
        window.uiManager.updateUserList(this.getActiveUsers());

        // 設置初始代碼
        if (window.editorManager && room.code) {
            console.log('✅ 房間加入成功，正在設置初始代碼...');
            // 初始加入不觸發廣播
            window.editorManager.setCode(room.code, room.version, 'join');
        }

        // 載入聊天記錄
        if (window.chatManager && room.chatHistory) {
            window.chatManager.loadHistory(room.chatHistory);
        }
        
        // 更新歷史版本下拉菜單
        if (window.editorManager && history) {
            window.editorManager.updateHistoryUI(history);
        }
        
        window.uiManager.showToast(`✅ 已加入房間: ${room.id}`, 'success');
    }

    // 處理新用戶加入
    handleUserJoined(message) {
        console.log(`👋 ${message.userName} 已加入房間`);
        this.activeUsers.set(message.userName, {
            userName: message.userName,
            isEditing: false,
            position: null,
            lastActivity: Date.now()
        });
        window.uiManager.updateUserList(this.getActiveUsers());
        window.uiManager.showToast(`${message.userName} 加入了房間`, 'info');
    }

    // 處理用戶離開
    handleUserLeft(message) {
        console.log(`👋 ${message.userName} 已離開房間`);
        this.activeUsers.delete(message.userName);
        window.uiManager.updateUserList(this.getActiveUsers());
        window.uiManager.showToast(`${message.userName} 離開了房間`, 'info');
    }

    // 處理代碼變更
    handleCodeChange(message) {
        if (!window.editorManager) return;
        
        const { code, version, userName, force, operation } = message;
        
        if (userName === this.currentUser && !force) {
            return;
        }

        console.log(`📥 收到代碼變更 from ${userName || 'server'}, 版本: ${version}, 強制: ${force}, 操作: ${operation}`);
        
        window.editorManager.setCode(code, version, operation || 'remote');
        
        if (userName && userName !== this.currentUser) {
            this.updateUserStatus({
                userName: userName,
                lastActivity: Date.now()
            });
        }
        
        if (force && (operation === 'load' || operation === 'import')) {
            window.uiManager.showToast(`✅ ${userName || '你'} 已${operation === 'load' ? '載入' : '導入'}了新的程式碼`, 'success');
        }
    }

    handleCursorChange(message) {
        if (message.userName !== this.currentUser && window.editorManager) {
            // editorManager.updateUserCursor(message.userName, message.position);
        }
    }

    handleChatMessage(message) {
        if (window.chatManager) {
            window.chatManager.displayMessage(message);
        }
    }

    handleAIResponse(message) {
        if(window.aiAssistant) {
            window.aiAssistant.handleResponse(message);
        }
    }

    handleCodeExecutionResult(message) {
        if (window.editorManager) {
            window.editorManager.handleExecutionResult(message);
        }
    }

    handleConflictNotification(message) {
        if(window.conflictManager) {
            window.conflictManager.displayConflictNotification(message);
        }
    }

    handleTeacherBroadcast(message) {
        window.uiManager.showToast(`來自老師的廣播: ${message.message}`, 'teacher');
    }

    // 更新房間UI信息
    updateRoomInfo(roomId, users) {
        this.currentRoom = roomId;
        const roomNameElement = document.getElementById('room-name-display');
        if (roomNameElement) {
            roomNameElement.textContent = roomId;
        }
        
        this.activeUsers = new Map(users.map(u => [u.userName, u]));
        window.uiManager.updateUserList(this.getActiveUsers());
    }

    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendMessage(message);
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.sendMessage({ type: 'heartbeat' });
                this.lastHeartbeat = Date.now();
            } else {
                 // 如果連接斷開，嘗試重連
                 console.log("💓 心跳檢測：連接已斷開，停止心跳。");
                 this.stopHeartbeat();
            }
        }, 25000);
         console.log('💓 心跳已啟動');
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('💔 心跳已停止');
        }
    }

    leaveRoom() {
        if (this.isConnected()) {
            this.sendMessage({ type: 'leave_room' });
            this.ws.close(1000, 'User leaving room');
        }
        this.currentUser = null;
        this.currentRoom = null;
    }

    // 暴露給 editorManager 的接口
    sendCodeChange(code, forced = false, operation = null) {
        this.sendMessage({
            type: 'code_change',
            code: code,
            version: window.editorManager.codeVersion,
            force: forced,
            operation: operation
        });
    }
}

// 全局 WebSocket 管理器實例
const wsManager = new WebSocketManager(); 

// 暴露到全域 window 對象
window.wsManager = wsManager; 