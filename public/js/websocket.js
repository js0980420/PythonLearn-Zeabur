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
            wsUrl = `ws://${window.location.hostname}:${window.location.port || 3000}`;
        } else {
            // 雲端環境（如 Zeabur）
            console.log('☁️ 檢測到雲端環境');
            wsUrl = `wss://${window.location.host}`;
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
            case 'pong':
                this.lastHeartbeat = Date.now();
                break;
            case 'error':
                console.error('❌ 收到服務器錯誤消息:', message.error, message.details);
                if (window.UI) {
                    window.UI.showToast('服務器錯誤', message.error || '發生未知錯誤', 'error');
                }
                break;
            case 'save_code_success':
            case 'save_code_error':
            case 'load_code_success':
            case 'load_code_error':
            case 'history_data':
            case 'user_saved_code':
            case 'code_loaded_notification':
                // 委託給 SaveLoadManager 處理
                if (window.SaveLoadManager && typeof window.SaveLoadManager.handleMessage === 'function') {
                    window.SaveLoadManager.handleMessage(message);
                } else {
                    console.warn('⚠️ SaveLoadManager 未就緒，無法處理消息:', message.type);
                }
                break;
            default:
                console.warn('⚠️ 未知消息類型:', message.type);
        }
    }

    // 處理加入房間錯誤
    handleJoinRoomError(message) {
        console.error('❌ 加入房間失敗:', message.message);
        
        // 顯示錯誤提示
        alert(message.message);
        
        if (message.error === 'name_duplicate') {
            // 清空並聚焦到用戶名稱輸入框
            const nameInput = document.getElementById('nameInput');
            if (nameInput) {
                nameInput.value = '';
                nameInput.focus();
                nameInput.style.borderColor = '#dc3545';
                setTimeout(() => {
                    nameInput.style.borderColor = '';
                }, 3000);
            }
        }
        
        // 重置連接狀態
        this.currentRoom = null;
        this.currentUser = null;
        
        // 確保留在登入畫面
        const loginSection = document.getElementById('loginSection');
        const workspaceSection = document.getElementById('workspaceSection');
        if (loginSection && workspaceSection) {
            loginSection.style.display = 'block';
            workspaceSection.style.display = 'none';
        }
    }

    // 處理加入房間成功
    handleRoomJoined(message) {
        console.log('✅ 成功加入房間:', message);
        this.currentRoom = message.roomId;
        this.currentUser = message.userName;
        
        // 切換到工作區界面
        const loginSection = document.getElementById('loginSection');
        const workspaceSection = document.getElementById('workspaceSection');
        if (loginSection && workspaceSection) {
            loginSection.style.display = 'none';
            workspaceSection.style.display = 'block';
        }
        
        // 更新房間信息
        const currentRoomEl = document.getElementById('currentRoom');
        const currentUserNameEl = document.getElementById('currentUserName');
        if (currentRoomEl) currentRoomEl.textContent = message.roomId;
        if (currentUserNameEl) currentUserNameEl.textContent = message.userName;
        
        // 更新用戶列表
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.updateUserList(message.users);
            });
        } else {
            this.updateUserList(message.users);
        }
        
        // 如果是重連，顯示重連成功消息
        if (message.isReconnect && window.UI) {
            window.UI.showToast('重連成功', '已重新連接到房間', 'success');
        } else if (window.UI) {
            window.UI.showToast('加入成功', `已加入房間 "${message.roomId}"`, 'success');
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
        
        // 從當前用戶列表中移除離開的用戶
        if (message.users) {
            // 使用新的用戶列表更新UI
            this.updateUserList(message.users);
        } else {
            // 如果沒有收到新的用戶列表，手動從現有列表中移除用戶
            const onlineUsersElement = document.getElementById('onlineUsers');
            if (onlineUsersElement) {
                const userElements = onlineUsersElement.getElementsByClassName('user-indicator');
                for (let i = userElements.length - 1; i >= 0; i--) {
                    const userElement = userElements[i];
                    if (userElement.textContent.includes(message.userName)) {
                        userElement.remove();
                        break;
                    }
                }
                
                // 如果沒有用戶了，顯示"無在線用戶"
                if (userElements.length === 0) {
                    onlineUsersElement.innerHTML = '<strong>在線用戶:</strong> <span class="text-muted">無</span>';
                }
            }
        }
        
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
        if (window.Editor && typeof window.Editor.handleRemoteCursorChange === 'function') {
            window.Editor.handleRemoteCursorChange(message);
        } else {
            console.log('💡 編輯器不支援光標位置同步（正常）');
        }
    }

    // 處理聊天消息
    handleChatMessage(message) {
        if (window.Chat) {
            const { userName, roomName, message: chatText, isTeacher } = message;
            window.Chat.addMessage(userName, chatText, false, isTeacher, roomName);
        }
    }

    // 處理AI回應
    handleAIResponse(message) {
        console.log('🤖 處理AI回應:', message.type);
        console.log('   - 動作:', message.action);
        console.log('   - 請求ID:', message.requestId);
        console.log('   - 錯誤:', message.error);
        
        // 檢查是否為衝突分析回應
        if (message.action === 'conflict_analysis') {
            console.log('🔍 處理AI衝突分析回應...');
            
            // 顯示在AI助教面板中
            if (typeof AIAssistant !== 'undefined' && AIAssistant && typeof AIAssistant.showResponse === 'function') {
                const analysisResult = message.response || '❌ AI衝突分析無回應';
                const formattedResponse = `
                    <h6><i class="fas fa-exclamation-triangle text-warning"></i> AI協作衝突分析</h6>
                    <div class="alert alert-info">
                        ${AIAssistant.formatAIResponse ? AIAssistant.formatAIResponse(analysisResult) : analysisResult}
                    </div>
                `;
                AIAssistant.showResponse(formattedResponse);
                console.log('✅ AI衝突分析結果已顯示在助教面板');
            }
            
            // 同時也顯示在衝突解決器中
            if (typeof ConflictResolver !== 'undefined' && ConflictResolver && typeof ConflictResolver.displayAIAnalysis === 'function') {
                ConflictResolver.displayAIAnalysis(message.response);
                console.log('✅ AI衝突分析結果已顯示在衝突解決器');
            }
            
            return;
        }
        
        // 處理一般AI回應
        console.log('🔍 檢查AI助教實例可用性...');
        console.log('   - typeof AIAssistant:', typeof AIAssistant);
        console.log('   - AIAssistant 存在:', !!AIAssistant);
        console.log('   - window.AIAssistant 存在:', !!(window.AIAssistant));
        console.log('   - handleAIResponse 方法存在:', !!(AIAssistant && typeof AIAssistant.handleAIResponse === 'function'));
        
        // 優先檢查window.AIAssistant，然後檢查AIAssistant
        const aiInstance = window.AIAssistant || AIAssistant;
        
        if (aiInstance && typeof aiInstance.handleAIResponse === 'function') {
            console.log('✅ 調用AIAssistant處理一般AI回應');
            console.log('🔍 傳遞給AI助教的回應數據:', {
                type: typeof message.response,
                length: message.response ? message.response.length : 0,
                preview: message.response ? message.response.substring(0, 100) + '...' : 'null'
            });
            aiInstance.handleAIResponse(message.response || message);
        } else if (typeof aiManager !== 'undefined' && aiManager && typeof aiManager.handleResponse === 'function') {
            // 保持向後相容性
            console.log('✅ 調用舊版aiManager處理AI回應');
            aiManager.handleResponse(message);
        } else {
            console.error('❌ AI助教管理器未找到或方法不存在');
            console.log('   - typeof AIAssistant:', typeof AIAssistant);
            console.log('   - AIAssistant 存在:', !!AIAssistant);
            console.log('   - window.AIAssistant 存在:', !!(window.AIAssistant));
            console.log('   - typeof aiManager:', typeof aiManager);
            console.log('   - aiManager 存在:', !!aiManager);
            
            // 緊急降級處理：直接顯示AI回應
            if (message.response) {
                console.log('🆘 使用緊急降級方式顯示AI回應');
                const responseContainer = document.getElementById('aiResponse');
                if (responseContainer) {
                    responseContainer.innerHTML = `
                        <div class="alert alert-success">
                            <h6><i class="fas fa-robot"></i> AI助教回應</h6>
                            <div style="white-space: pre-wrap;">${message.response}</div>
                        </div>
                    `;
                    console.log('✅ AI回應已通過緊急降級方式顯示');
                } else {
                    console.error('❌ 找不到aiResponse容器，無法顯示AI回應');
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

    // 處理衝突通知 - 增強版
    handleConflictNotification(message) {
        console.log('🚨 收到衝突通知:', message);
        
        if (message.targetUser === this.currentUser) {
            // 主改方的衝突等待界面
            if (window.ConflictResolver) {
                // 準備詳細的衝突信息
                const conflictInfo = {
                    ...message,
                    isSender: true,
                    localCode: message.conflictData?.localCode || '',
                    remoteCode: message.conflictData?.remoteCode || '',
                    localVersion: message.conflictData?.localVersion || 0,
                    remoteVersion: message.conflictData?.remoteVersion || 0,
                    changeDetails: message.conflictDetails || {},
                    timestamp: Date.now()
                };
                
                // 顯示主改方的等待界面
                window.ConflictResolver.showSenderWaitingModal(conflictInfo);
                console.log('✅ 主改方衝突等待界面已顯示（含詳細信息）');
                
                // 在聊天室顯示詳細狀態
                if (window.Chat) {
                    const changeInfo = message.conflictDetails?.changeType || {};
                    window.Chat.addSystemMessage(
                        `⚠️ 協作衝突通知:\n` +
                        `• ${message.conflictWith} 正在處理您的代碼修改\n` +
                        `• 變更類型: ${changeInfo.description || '未知'}\n` +
                        `• 修改行數: +${changeInfo.addedLines || 0}/-${changeInfo.removedLines || 0}\n` +
                        `• 時間差: ${Math.round((message.conflictDetails?.timeDiff || 0)/1000)}秒\n` +
                        `請等待對方處理或在聊天室討論...`
                    );
                }
            } else {
                // 降級處理
                if (window.UI) {
                    window.UI.showToast(
                        '協作衝突',
                        `${message.conflictWith} 正在處理您的代碼修改，請稍候...`,
                        'warning',
                        5000
                    );
                }
            }
        }
    }

    // 處理教師廣播消息
    handleTeacherBroadcast(message) {
        console.log('📢 收到教師廣播:', message);
        
        const broadcastMessage = message.message || message.data?.message || '教師廣播消息';
        const messageType = message.messageType || message.data?.messageType || 'info';
        
        // 顯示廣播消息
        if (window.UI && typeof window.UI.showToast === 'function') {
            // 根據消息類型選擇不同的圖標和顏色
            let toastType = 'info';
            let title = '📢 教師通知';
            
            switch (messageType) {
                case 'warning':
                    toastType = 'warning';
                    title = '⚠️ 教師警告';
                    break;
                case 'error':
                    toastType = 'error';
                    title = '❌ 教師提醒';
                    break;
                case 'success':
                    toastType = 'success';
                    title = '✅ 教師表揚';
                    break;
                default:
                    toastType = 'info';
                    title = '📢 教師通知';
                    break;
            }
            
            window.UI.showToast(title, broadcastMessage, toastType, 8000); // 8秒顯示
        } else {
            // 降級處理：使用原生alert
            alert(`📢 教師廣播：\n${broadcastMessage}`);
        }
        
        // 在聊天區域顯示廣播消息
        if (window.Chat && typeof window.Chat.addSystemMessage === 'function') {
            window.Chat.addSystemMessage(`📢 教師廣播：${broadcastMessage}`, 'teacher-broadcast');
        } else if (window.chatManager && typeof window.chatManager.addSystemMessage === 'function') {
            window.chatManager.addSystemMessage(`📢 教師廣播：${broadcastMessage}`, 'teacher-broadcast');
        }
        
        // 播放提示音（如果可用）
        try {
            if (window.AudioContext || window.webkitAudioContext) {
                // 生成簡單的提示音
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            }
        } catch (error) {
            console.log('🔇 無法播放提示音:', error.message);
        }
        
        console.log('✅ 教師廣播消息已處理');
    }

    // 更新用戶列表
    updateUserList(users) {
        // 確保 DOM 已加載
        const waitForElement = (elementId, callback, maxAttempts = 10) => {
            let attempts = 0;
            const checkElement = () => {
                attempts++;
                const element = document.getElementById(elementId);
                if (element) {
                    callback(element);
                } else if (attempts < maxAttempts) {
                    setTimeout(checkElement, 100);
                } else {
                    console.error(`❌ 找不到用戶列表元素 (${elementId}) - 已重試 ${maxAttempts} 次`);
                }
            };
            checkElement();
        };

        waitForElement('onlineUsers', (onlineUsersElement) => {
            if (!users || users.length === 0) {
                onlineUsersElement.innerHTML = '<strong>在線用戶:</strong> <span class="text-muted">無</span>';
                return;
            }

            // 創建用戶列表HTML
            let userListHTML = '<strong>在線用戶:</strong> ';
            const userNames = users.map(user => {
                const userName = user.userName || user.name || '匿名用戶';
                const isCurrentUser = userName === this.currentUser;
                const status = user.isActive ? '🟢' : '🔴';
                const userClass = isCurrentUser ? 'user-indicator current-user' : 'user-indicator';
                return `<span class="${userClass}">${status} ${userName}${isCurrentUser ? ' (你)' : ''}</span>`;
            });
            
            userListHTML += userNames.join(' ');
            onlineUsersElement.innerHTML = userListHTML;
        });
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

// 暴露到全域 window 對象
window.wsManager = wsManager; 