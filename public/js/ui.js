// 界面控制和通用功能管理
class UIManager {
    constructor() {
        this.currentTab = 'ai'; // 'ai' 或 'chat'
        this.collaborationAlert = null;
    }

    // 初始化界面功能
    initialize() {
        this.collaborationAlert = document.getElementById('collaborationAlert');
        
        // 生成隨機用戶名
        const nameInput = document.getElementById('nameInput');
        if (nameInput) {
            nameInput.value = `學生${Math.floor(Math.random() * 1000)}`;
        }
    }

    // 加入房間
    joinRoom() {
        const roomInput = document.getElementById('roomInput');
        const nameInput = document.getElementById('nameInput');
        const loginSection = document.getElementById('loginSection');
        const workspaceSection = document.getElementById('workspaceSection');
        const currentRoomEl = document.getElementById('currentRoom');

        if (!roomInput || !nameInput || !loginSection || !workspaceSection || !currentRoomEl) {
            console.error('❌ 加入房間所需的某些UI元素未找到!');
            alert('頁面錯誤，請刷新後重試。');
            return;
        }

        const roomName = roomInput.value.trim();
        const userName = nameInput.value.trim();
        
        if (!roomName || !userName) {
            alert('請輸入房間名稱和您的名稱');
            return;
        }

        // 連接WebSocket
        wsManager.connect(roomName, userName);
        
        // 切換界面
        loginSection.style.display = 'none';
        workspaceSection.style.display = 'block';
        currentRoomEl.textContent = roomName;
    }

    // 離開房間
    leaveRoom() {
        wsManager.leaveRoom();
        
        const loginSection = document.getElementById('loginSection');
        const workspaceSection = document.getElementById('workspaceSection');

        if (loginSection) loginSection.style.display = 'block';
        else console.error('❌ UI.leaveRoom: loginSection not found');

        if (workspaceSection) workspaceSection.style.display = 'none';
        else console.error('❌ UI.leaveRoom: workspaceSection not found');
        
        // 重置狀態
        Editor.codeVersion = 0;
        Editor.collaboratingUsers.clear();
        this.hideCollaborationAlert();
        
        // 清除內容
        Editor.clearOutput();
        Chat.clearChat();
        AIAssistant.clearResponse();
    }

    // 顯示加入房間表單（用於名稱重複時重新顯示）
    showJoinForm() {
        const loginSection = document.getElementById('loginSection');
        const workspaceSection = document.getElementById('workspaceSection');
        const nameInput = document.getElementById('nameInput');

        if (loginSection) loginSection.style.display = 'block';
        else console.error('❌ UI.showJoinForm: loginSection not found');

        if (workspaceSection) workspaceSection.style.display = 'none';
        else console.error('❌ UI.showJoinForm: workspaceSection not found');
        
        // 清空並聚焦到名稱輸入框
        if (nameInput) {
            nameInput.value = '';
            nameInput.focus();
            nameInput.style.borderColor = '#dc3545'; // 紅色邊框提示
            
            // 3秒後恢復正常邊框
            setTimeout(() => {
                nameInput.style.borderColor = '';
            }, 3000);
        }
        
        // 重置連接狀態
        this.updateConnectionStatus('未連接', 'secondary');
    }

    // 更新連接狀態
    updateConnectionStatus(status, type) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `badge bg-${type}`;
        }
    }

    // 更新在線用戶列表
    updateOnlineUsers(users) {
        const container = document.getElementById('onlineUsers');
        if (!container) {
            console.error('❌ UI.updateOnlineUsers: onlineUsers container not found');
            return;
        }
        
        // 添加調試日誌
        console.log('🔍 updateOnlineUsers 被調用，用戶數據:', users);
        console.log('🔍 用戶數量:', users ? users.length : 'undefined');
        
        container.innerHTML = '<strong>在線用戶:</strong> ';
        
        if (users && users.length > 0) {
            users.forEach((user, index) => {
                console.log(`🔍 處理用戶 ${index}:`, user);
                const span = document.createElement('span');
                span.className = 'user-indicator';
                span.textContent = user.userName || user.name || '未知用戶';
                container.appendChild(span);
            });
        } else {
            const span = document.createElement('span');
            span.className = 'user-indicator';
            span.textContent = '無在線用戶';
            container.appendChild(span);
        }
    }

    // 切換到AI助教
    switchToAI() {
        const aiSection = document.getElementById('aiSection');
        const chatSection = document.getElementById('chatSection');
        const aiTabBtn = document.getElementById('aiTabBtn');
        const chatTabBtn = document.getElementById('chatTabBtn');
        
        if (!aiSection || !chatSection || !aiTabBtn || !chatTabBtn) {
            console.error('❌ UI.switchToAI: 某些切換分頁所需的UI元素未找到!');
            return;
        }
        
        // 顯示AI區域，隱藏聊天區域
        aiSection.style.display = 'block';
        chatSection.style.display = 'none';
        
        // 更新按鈕狀態
        aiTabBtn.classList.add('active');
        aiTabBtn.classList.remove('btn-outline-primary');
        aiTabBtn.classList.add('btn-primary');
        
        chatTabBtn.classList.remove('active');
        chatTabBtn.classList.remove('btn-success');
        chatTabBtn.classList.add('btn-outline-success');
        
        this.currentTab = 'ai';
        
        // 切換到AI助教時顯示使用說明
        if (typeof AIAssistant !== 'undefined' && AIAssistant.showAIIntroduction) {
            AIAssistant.showAIIntroduction();
        }
    }

    // 切換到聊天室
    switchToChat() {
        console.log('🔍 切換到聊天室');
        
        const aiSection = document.getElementById('aiSection');
        const chatSection = document.getElementById('chatSection');
        const aiTabBtn = document.getElementById('aiTabBtn');
        const chatTabBtn = document.getElementById('chatTabBtn');
        
        if (!aiSection || !chatSection || !aiTabBtn || !chatTabBtn) {
            console.error('❌ UI.switchToChat: 某些切換分頁所需的UI元素未找到!');
            return;
        }
        
        // 顯示聊天區域，隱藏AI區域
        aiSection.style.display = 'none';
        chatSection.style.display = 'block';
        
        // 更新按鈕狀態
        chatTabBtn.classList.add('active');
        chatTabBtn.classList.remove('btn-outline-success');
        chatTabBtn.classList.add('btn-success');
        
        aiTabBtn.classList.remove('active');
        aiTabBtn.classList.remove('btn-primary');
        aiTabBtn.classList.add('btn-outline-primary');
        
        this.currentTab = 'chat';
        
        // 強制刷新聊天容器顯示
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            // 觸發重新渲染
            chatContainer.style.display = 'none';
            setTimeout(() => {
                chatContainer.style.display = 'block';
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 10);
        }
        
        // 自動聚焦到輸入框
        setTimeout(() => {
            if (Chat && Chat.focusInput) {
                Chat.focusInput();
            }
        }, 100);
    }

    // 顯示協作提醒
    showCollaborationAlert(collaboratingUsers) {
        if (!this.collaborationAlert) return;
        
        const usersDiv = document.getElementById('collaboratingUsers');
        if (usersDiv) {
            usersDiv.innerHTML = '';
            collaboratingUsers.forEach(user => {
                const span = document.createElement('span');
                span.className = 'user-indicator';
                span.textContent = user;
                usersDiv.appendChild(span);
            });
        }
        
        this.collaborationAlert.style.display = 'block';
        
        // 5秒後自動隱藏
        setTimeout(() => {
            if (collaboratingUsers.size === 0) {
                this.hideCollaborationAlert();
            }
        }, 5000);
    }

    // 隱藏協作提醒
    hideCollaborationAlert() {
        if (this.collaborationAlert) {
            this.collaborationAlert.style.display = 'none';
        }
    }

    // 顯示成功提示
    showSuccessToast(message) {
        const toast = document.createElement('div');
        toast.className = 'success-toast';
        toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    // 顯示錯誤提示
    showErrorToast(message) {
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    // 顯示教師廣播
    showTeacherBroadcast(message) {
        const broadcast = document.createElement('div');
        broadcast.className = `teacher-broadcast broadcast-${message.messageType}`;
        broadcast.innerHTML = `
            <h5><i class="fas fa-bullhorn"></i> 教師通知</h5>
            <p class="mb-0">${message.message}</p>
        `;
        document.body.appendChild(broadcast);
        
        setTimeout(() => {
            broadcast.remove();
        }, 8000);
    }

    // 顯示房間關閉通知
    showRoomClosedNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'teacher-broadcast broadcast-error';
        notification.innerHTML = `
            <h5><i class="fas fa-times-circle"></i> 房間已關閉</h5>
            <p>${message.message}</p>
            <div class="text-center">
                <div id="countdown">${message.countdown}</div>
            </div>
        `;
        document.body.appendChild(notification);
        
        let countdown = message.countdown;
        const countdownInterval = setInterval(() => {
            countdown--;
            const countdownEl = document.getElementById('countdown');
            if (countdownEl) {
                countdownEl.textContent = countdown;
            }
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                this.leaveRoom();
                notification.remove();
            }
        }, 1000);
    }

    // 打開教師監控後台
    openTeacherDashboard() {
        window.open('/teacher', '_blank');
    }

    // 顯示操作教學
    showTutorial() {
        const aiResponseDiv = document.getElementById('aiResponse');
        if (!aiResponseDiv) {
            console.error('❌ AI回應容器未找到');
            return;
        }
        
        const tutorialContent = `
            <div class="tutorial-content">
                <h6><i class="fas fa-graduation-cap"></i> 平台操作教學</h6>
                
                <div class="tutorial-section">
                    <h6 class="text-primary"><i class="fas fa-door-open"></i> 1. 加入房間</h6>
                    <p>• 輸入房間名稱和您的姓名<br>
                    • 點擊「加入房間」開始協作<br>
                    • 房間會自動創建，其他人用相同房間名可加入</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-success"><i class="fas fa-code"></i> 2. 編程協作</h6>
                    <p>• <strong>編輯代碼</strong>：直接在編輯器中輸入Python代碼<br>
                    • <strong>即時同步</strong>：您的修改會即時同步給其他人<br>
                    • <strong>運行代碼</strong>：點擊「運行」按鈕執行Python代碼<br>
                    • <strong>保存代碼</strong>：點擊「保存」或按Ctrl+S保存</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-info"><i class="fas fa-robot"></i> 3. AI助教功能</h6>
                    <p>• <strong>代碼審查</strong>：AI分析您的代碼品質<br>
                    • <strong>檢查錯誤</strong>：AI幫您找出程式錯誤<br>
                    • <strong>改進建議</strong>：AI提供程式優化建議</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-warning"><i class="fas fa-comments"></i> 4. 聊天溝通</h6>
                    <p>• 點擊「聊天室」標籤切換到聊天功能<br>
                    • 與其他協作者即時討論問題<br>
                    • 教師可以發送消息給所有學生</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-danger"><i class="fas fa-exclamation-triangle"></i> 5. 衝突處理</h6>
                    <p>• 當多人同時編輯時可能出現版本衝突<br>
                    • 系統會彈出衝突解決視窗<br>
                    • 選擇載入最新版、強制更新或討論解決</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-secondary"><i class="fas fa-keyboard"></i> 6. 快捷鍵</h6>
                    <p>• <strong>Ctrl+S</strong>：保存代碼<br>
                    • <strong>Ctrl+Enter</strong>：運行代碼<br>
                    • <strong>Ctrl+/</strong>：註釋/取消註釋</p>
                </div>
                
                <div class="alert alert-info mt-3">
                    <small><i class="fas fa-lightbulb"></i> <strong>小貼士</strong>：
                    建議先熟悉基本操作，再嘗試多人協作功能。有問題可以使用AI助教或在聊天室向老師求助！</small>
                </div>
            </div>
        `;
        
        // 顯示教學內容
        aiResponseDiv.innerHTML = tutorialContent;
        
        // 確保AI面板是顯示狀態
        this.switchToAI();
        
        console.log('✅ 操作教學已顯示');
    }
}

// 全局UI管理器實例
const UI = new UIManager();

// 全局函數供HTML調用
function joinRoom() {
    UI.joinRoom();
}

function leaveRoom() {
    UI.leaveRoom();
}

function switchToAI() {
    UI.switchToAI();
}

function switchToChat() {
    console.log('🔍 全局 switchToChat() 函數被調用！');
    console.log('🔍 UI對象存在:', !!UI);
    console.log('🔍 UI.switchToChat方法存在:', !!(UI && UI.switchToChat));
    UI.switchToChat();
}

function openTeacherDashboard() {
    UI.openTeacherDashboard();
}

function saveCode() {
    Editor.saveCode();
}

function loadCode() {
    Editor.loadCode();
}

function runCode() {
    Editor.runCode();
}

function clearOutput() {
    Editor.clearOutput();
}