// WebSocket 連接和通訊管理
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.messageQueue = [];
        this.isConnectedFlag = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectInterval = 3000; // 3秒
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
            // 本地開發環境：使用當前主機
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            wsUrl = `${protocol}//${host}`;
            console.log('🏠 檢測到本地開發環境');
        } else {
            // 生產環境：優先使用當前域名，除非明確配置了其他地址
            const currentDomain = window.location.host;
            
            // 檢查是否為已知的 Zeabur 域名
            if (currentDomain.includes('zeabur.app')) {
                const protocol = 'wss:';
                wsUrl = `${protocol}//${currentDomain}`;
                console.log('☁️ 檢測到 Zeabur 生產環境');
            } else {
                // 其他生產環境，使用當前域名
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                wsUrl = `${protocol}//${currentDomain}`;
                console.log('🌐 檢測到其他生產環境');
            }
        }
        
        console.log(`🔌 嘗試連接到 WebSocket: ${wsUrl}`);
        console.log(`👤 用戶: ${userName}, 🏠 房間: ${roomName}`);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('✅ WebSocket 連接成功到服務器!');
            console.log(`📍 連接地址: ${wsUrl}`);
            this.isConnectedFlag = true;
            this.reconnectAttempts = 0;
            this.sendMessage({
                type: 'join_room',
                room: this.currentRoom,
                userName: this.currentUser
            });
            this.processMessageQueue();
            if (UI) UI.updateConnectionStatus('已連接', 'success');
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('📥 WebSocket 收到消息:', message);
                this.handleMessage(message);
            } catch (error) {
                console.error('處理收到的消息時出錯:', error, '原始數據:', event.data);
            }
        };

        this.ws.onclose = (event) => {
            console.warn(`❌ WebSocket 連接已關閉。Code: ${event.code}, Reason: ${event.reason}`);
            console.log(`🔗 嘗試連接的地址是: ${wsUrl}`);
            this.isConnectedFlag = false;
            if (UI) UI.updateConnectionStatus('已斷線', 'danger');
            
            // 提供更好的錯誤提示
            this.handleConnectionError(event.code, wsUrl);
        };

        this.ws.onerror = (error) => {
            console.error('❌ WebSocket 發生錯誤:', error);
            console.log(`🔗 出錯的連接地址: ${wsUrl}`);
            console.log(`🌐 當前頁面地址: ${window.location.href}`);
            console.log(`💻 環境檢測: ${isLocalhost ? '本地開發' : '生產環境'}`);
            this.isConnectedFlag = false;
            if (UI) UI.updateConnectionStatus('連接錯誤', 'danger');
        };
    }

    // 處理連接錯誤的詳細信息
    handleConnectionError(code, attemptedUrl) {
        let errorMessage = '連接失敗';
        let suggestion = '';

        switch (code) {
            case 1006:
                errorMessage = '連接被異常關閉';
                if (attemptedUrl.includes('zeabur.app')) {
                    suggestion = '可能 Zeabur 服務器未啟動或配置錯誤。請檢查伺服器狀態。';
                } else {
                    suggestion = '請檢查伺服器是否正在運行，或嘗試重新整理頁面。';
                }
                break;
            case 1002:
                errorMessage = '協議錯誤';
                suggestion = 'WebSocket 協議不匹配，請聯繫管理員。';
                break;
            case 1003:
                errorMessage = '數據類型錯誤';
                suggestion = '服務器返回了不支持的數據類型。';
                break;
            default:
                suggestion = `錯誤代碼: ${code}。請重新整理頁面重試。`;
        }

        console.log(`❌ ${errorMessage}: ${suggestion}`);
        
        // 顯示用戶友好的錯誤信息
        if (UI && UI.showErrorToast) {
            UI.showErrorToast(`${errorMessage}。${suggestion}`);
        }
        
        // 在測試/開發模式下提供更多調試信息
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isDev) {
            console.log('🔧 開發者調試信息:');
            console.log(`- 嘗試連接: ${attemptedUrl}`);
            console.log(`- 當前頁面: ${window.location.href}`);
            console.log(`- 建議: 確保後端服務器在正確的端口運行`);
        }
    }

    // 簡化的重新連接
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 嘗試重新連接... (第 ${this.reconnectAttempts} 次)`);
            if (UI) UI.updateConnectionStatus(`重連中(${this.reconnectAttempts})...`, 'warning');
            
            setTimeout(() => {
                if (this.currentRoom && this.currentUser) {
                    this.connect(this.currentRoom, this.currentUser);
                }
            }, this.reconnectInterval);
        } else {
            console.error('❌ 已達到最大重連次數，停止重連。');
            if (UI) UI.updateConnectionStatus('重連失敗', 'danger');
            if (UI && UI.showErrorToast) UI.showErrorToast('與伺服器斷線且無法自動重連，請嘗試刷新頁面。');
        }
    }

    // 發送消息
    sendMessage(message) {
        if (this.isConnected() && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const messageString = JSON.stringify(message);
            console.log('📤 WebSocket 發送消息:', message); // 詳細日誌
            this.ws.send(messageString);
        } else {
            console.warn('WebSocket 未連接或未就緒，消息已加入隊列:', message);
            this.messageQueue.push(message);
            if (!this.isConnectedFlag && this.reconnectAttempts === 0) { // 如果從未連接成功，則嘗試連接
                 console.log('WebSocket 從未成功連接，嘗試立即連接...');
                 if (this.currentRoom && this.currentUser) {
                     this.connect(this.currentRoom, this.currentUser); 
                 }
            }
        }
    }

    processMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected() && this.ws.readyState === WebSocket.OPEN) {
            const message = this.messageQueue.shift();
            this.sendMessage(message); // 重新通過 sendMessage 發送以進行日誌記錄和狀態檢查
            console.log('📬 從隊列中發送消息:', message);
        }
    }

    // 處理接收到的消息
    handleMessage(message) {
        switch (message.type) {
            case 'welcome':
                console.log('收到歡迎消息:', message);
                if (message.isReconnect) {
                    console.log('🔄 這是重連，保持當前狀態');
                    // 重連時不需要特殊處理，因為服務器會自動發送房間狀態
                }
                break;

            case 'room_joined':
                if (Editor) {
                    Editor.setVersion(message.version || 0);
                    Editor.setCode(message.code || '');
                }
                if (UI) UI.updateOnlineUsers(message.users || []);
                if (Chat && message.chatHistory) Chat.loadHistory(message.chatHistory);
                
                if (message.isReconnect) {
                    console.log('🔄 重連到房間成功，恢復之前的狀態');
                    if (UI) UI.showSuccessToast('重連成功，已恢復協作狀態');
                } else {
                    console.log('🎉 房間加入成功並同步初始狀態!', message);
                }
                break;

            case 'join_room_error':
                if (message.error === 'name_duplicate') {
                    UI.showErrorToast(message.message);
                    // 重新顯示登入表單讓用戶修改名稱
                    UI.showJoinForm();
                } else {
                    UI.showErrorToast(message.message || '加入房間失敗');
                }
                break;

            case 'user_joined':
                Chat.addSystemMessage(`${message.userName} 加入了房間`);
                UI.updateOnlineUsers(message.users);
                break;

            case 'user_reconnected':
                // 用戶重連，不顯示加入消息，只更新用戶列表
                console.log(`🔄 ${message.userName} 重連到房間`);
                UI.updateOnlineUsers(message.users);
                break;

            case 'user_left':
                Chat.addSystemMessage(`${message.userName} 離開了房間`);
                UI.updateOnlineUsers(message.users);
                Editor.removeCollaboratingUser(message.userName);
                break;

            case 'code_change':
                if (Editor && message.userName !== this.currentUser) {
                    Editor.handleRemoteCodeChange(message);
                }
                break;

            case 'code_conflict':
                ConflictResolver.showConflictModal(message);
                break;

            case 'cursor_changed':
                // 顯示其他用戶的游標位置
                console.log(`${message.userName} 游標位置:`, message.cursor);
                break;

            case 'chat_message':
                // 檢查是否為教師消息
                const isTeacher = message.isTeacher || false;
                Chat.addMessage(message.userName, message.message, false, isTeacher);
                break;

            case 'chat_history':
                Chat.loadHistory(message.messages);
                break;

            case 'ai_response':
                if (AIAssistant && AIAssistant.handleAIResponse) {
                    AIAssistant.handleAIResponse(message.response);
                } else {
                    console.error('❌ AIAssistant.handleAIResponse 方法不存在');
                }
                break;

            case 'ai_processing':
                // AI處理中狀態已在前端請求時處理
                console.log('📝 AI正在處理請求...');
                break;

            case 'ai_error':
                if (AIAssistant && AIAssistant.handleAIError) {
                    AIAssistant.handleAIError(message.error);
                } else {
                    console.error('❌ AIAssistant.handleAIError 方法不存在');
                }
                break;

            case 'ai_conflict_analysis':
                if (ConflictResolver && ConflictResolver.displayAIAnalysis) {
                    ConflictResolver.displayAIAnalysis(message.analysis);
                } else {
                    console.error('❌ ConflictResolver.displayAIAnalysis 方法不存在');
                }
                break;

            case 'teacher_broadcast':
                UI.showTeacherBroadcast(message);
                break;

            case 'room_closed':
                UI.showRoomClosedNotification(message);
                break;

            case 'code_execution_result':
                Editor.handleExecutionResult(message);
                break;

            case 'code_loaded':
                Editor.handleCodeLoaded(message);
                break;

            case 'room_state': // 用於初始化房間狀態 (用戶列表, 代碼版本等)
                if (UI) UI.updateOnlineUsers(message.users);
                if (Editor) {
                    Editor.setCode(message.code || '');
                    Editor.setVersion(message.version || 0);
                }
                if (Chat && message.chatHistory) Chat.loadHistory(message.chatHistory);
                break;

            case 'collaboration_update': // 廣播其他人正在編輯
                if (Editor && message.userName !== this.currentUser) {
                    Editor.collaboratingUsers.add(message.userName);
                    if(UI) UI.showCollaborationAlert(Editor.collaboratingUsers);
                    setTimeout(() => {
                        Editor.collaboratingUsers.delete(message.userName);
                        if (Editor.collaboratingUsers.size === 0 && UI) {
                            UI.hideCollaborationAlert();
                        }
                    }, 3000); // 3秒後移除提示
                }
                break;

            case 'error':
                console.error('服務器錯誤:', message.message);
                if (message.action === 'duplicate_user') {
                     if(UI) {
                        UI.showErrorToast('名稱已被使用，請使用其他名稱！');
                        UI.showJoinForm(); // 重新顯示登入表單
                     }
                } else if (message.message && message.message.includes(' ROOM_NOT_FOUND')) {
                    if(UI) UI.showErrorToast('房間不存在或已關閉。');
                     // 可以考慮也調用 UI.showJoinForm();
                } else if (UI && UI.showErrorToast) {
                    UI.showErrorToast(`服務器錯誤: ${message.message || '未知錯誤'}`);
                }
                break;
        }
    }

    // 離開房間
    leaveRoom() {
        if (this.ws) {
            this.sendMessage({ type: 'leave_room', room: this.currentRoom, userName: this.currentUser });
            // 服務器會在收到 leave_room 後關閉特定客戶端的連接，或者客戶端主動關閉
            // this.ws.close(1000, "User left room"); // 正常關閉
        }
        this.currentRoom = null;
        // currentUser 保留，以便重連時使用
        this.isConnectedFlag = false;
        // 清理編輯器和聊天室等狀態應由 UI.leaveRoom 處理
        if (UI) UI.updateConnectionStatus('未連接', 'secondary');
    }

    // 檢查連接狀態
    isConnected() {
        return this.isConnectedFlag && this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// 全局 WebSocket 管理器實例
const wsManager = new WebSocketManager(); 