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
        const currentUserNameEl = document.getElementById('currentUserName');

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
        
        // 🆕 顯示當前用戶名稱
        if (currentUserNameEl) {
            currentUserNameEl.textContent = userName;
        }
        
        // 🎯 新用戶加入房間後自動顯示操作教學
        setTimeout(() => {
            try {
                console.log('🎯 準備顯示操作教學...');
                this.showTutorial();
                console.log('✅ 操作教學顯示完成');
            } catch (error) {
                console.error('❌ 顯示操作教學時發生錯誤:', error);
            }
        }, 2000); // 延遲2秒確保所有模組都已載入
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
        const roomInput = document.getElementById('roomInput');

        if (loginSection) {
            loginSection.style.display = 'block';
            loginSection.classList.add('shake-animation'); // 添加抖動效果
            setTimeout(() => loginSection.classList.remove('shake-animation'), 500);
        } else {
            console.error('❌ UI.showJoinForm: loginSection not found');
        }

        if (workspaceSection) {
            workspaceSection.style.display = 'none';
        } else {
            console.error('❌ UI.showJoinForm: workspaceSection not found');
        }
        
        // 保持房間名稱不變，但聚焦到名稱輸入框
        if (nameInput) {
            nameInput.style.borderColor = '#dc3545'; // 紅色邊框提示
            nameInput.focus();
            nameInput.select(); // 選中當前文字
            
            // 添加輸入提示
            nameInput.setAttribute('title', '此名稱已被使用，請選擇其他名稱');
            nameInput.setAttribute('data-bs-toggle', 'tooltip');
            nameInput.setAttribute('data-bs-placement', 'top');
            
            // 監聽輸入事件，當用戶開始輸入時恢復正常樣式
            const resetStyle = () => {
                nameInput.style.borderColor = '';
                nameInput.removeAttribute('title');
                nameInput.removeAttribute('data-bs-toggle');
                nameInput.removeAttribute('data-bs-placement');
                nameInput.removeEventListener('input', resetStyle);
            };
            nameInput.addEventListener('input', resetStyle);
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
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.focus();
        }
    }

    // 🆕 新增：顯示工作區
    showWorkspace() {
        const loginSection = document.getElementById('loginSection');
        const workspaceSection = document.getElementById('workspaceSection');
        if (loginSection) loginSection.style.display = 'none';
        if (workspaceSection) workspaceSection.style.display = 'block';
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

    // 顯示信息提示
    showInfoToast(message) {
        const toast = document.createElement('div');
        toast.className = 'info-toast';
        toast.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 4000);
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
                <h6><i class="fas fa-graduation-cap"></i> Python多人協作教學平台 - 操作教學</h6>
                
                <div class="tutorial-section">
                    <h6 class="text-primary"><i class="fas fa-door-open"></i> 1. 加入協作房間</h6>
                    <p>• 輸入房間名稱和您的姓名<br>
                    • 點擊「加入房間」開始協作學習<br>
                    • 房間會自動創建，其他同學使用相同房間名可一起加入<br>
                    • 您的姓名會顯示在界面上方，方便識別</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-success"><i class="fas fa-code"></i> 2. 多人編程協作</h6>
                    <p>• <strong>編輯代碼</strong>：直接在編輯器中輸入Python代碼<br>
                    • <strong>即時同步</strong>：您的修改會即時同步給房間內所有人<br>
                    • <strong>運行代碼</strong>：點擊「運行」按鈕執行Python代碼<br>
                    • <strong>保存代碼</strong>：點擊「保存」或按Ctrl+S保存到本地<br>
                    • <strong>下載代碼</strong>：點擊「下載」下載.py檔案</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-info"><i class="fas fa-robot"></i> 3. AI助教功能詳解</h6>
                    <p><strong>基本AI功能：</strong><br>
                    • <strong>解釋程式</strong>：AI分析您的代碼邏輯和功能<br>
                    • <strong>檢查錯誤</strong>：AI幫您找出程式中的錯誤和問題<br>
                    • <strong>改進建議</strong>：AI提供代碼優化和改進建議<br><br>
                    
                    <strong>進階衝突分析：</strong><br>
                    • <strong>衝突分析</strong>：當多人協作出現問題時，可隨時使用此功能<br>
                    • <strong>測試衝突</strong>：模擬協作衝突情況，學習如何處理<br>
                    • <strong>查看歷史</strong>：查看過去的衝突處理記錄和學習經驗<br>
                    • <strong>AI協助解決</strong>：在真實衝突時，AI會提供具體的解決建議</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-warning"><i class="fas fa-comments"></i> 4. 聊天室溝通</h6>
                    <p>• 點擊「聊天室」標籤切換到聊天功能<br>
                    • 與其他協作者即時討論程式問題<br>
                    • 教師可以發送通知給所有學生<br>
                    • AI分析結果可一鍵分享到聊天室討論</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-danger"><i class="fas fa-code-branch"></i> 5. 協作衝突處理</h6>
                    <p>• <strong>衝突預警</strong>：當您要修改別人正在編輯的代碼時會提醒<br>
                    • <strong>衝突檢測</strong>：系統自動檢測同時編輯產生的衝突<br>
                    • <strong>雙方界面</strong>：被修改方看到差異對比，修改方看到等待狀態<br>
                    • <strong>代碼差異</strong>：清楚顯示您的版本 vs 對方版本的差別<br>
                    • <strong>AI協助分析</strong>：點擊「請AI協助分析」獲得專業建議<br>
                    • <strong>解決選擇</strong>：可選擇「接受對方修改」或「拒絕對方修改」</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-secondary"><i class="fas fa-keyboard"></i> 6. 快捷鍵操作</h6>
                    <p>• <strong>Ctrl+S</strong>：保存代碼到本地<br>
                    • <strong>Ctrl+Enter</strong>：運行Python代碼<br>
                    • <strong>Ctrl+/</strong>：註釋/取消註釋選中行<br>
                    • <strong>Tab</strong>：增加縮排<br>
                    • <strong>Shift+Tab</strong>：減少縮排</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-purple"><i class="fas fa-chalkboard-teacher"></i> 7. 教師功能</h6>
                    <p>• <strong>監控後台</strong>：教師可開啟專用後台監控所有房間<br>
                    • <strong>廣播消息</strong>：向特定房間或所有學生發送通知<br>
                    • <strong>房間管理</strong>：查看各房間學習狀況和在線人數<br>
                    • <strong>關閉房間</strong>：課程結束時可統一關閉所有房間</p>
                </div>
                
                <div class="alert alert-success mt-3">
                    <i class="fas fa-lightbulb"></i> <strong>學習建議</strong>：
                    <ul class="mb-0 mt-2">
                        <li>初學者建議先熟悉基本編程功能，再嘗試多人協作</li>
                        <li>善用AI助教功能學習程式設計技巧和最佳實踐</li>
                        <li>遇到衝突時保持冷靜，使用AI分析功能幫助理解和解決</li>
                        <li>多在聊天室與同學討論，協作學習效果更佳</li>
                        <li>有問題隨時向老師求助或使用教學功能</li>
                    </ul>
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

// 🟢 新增：創建並導出 UIManager 實例
const UI = new UIManager();
window.UI = UI;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    if (window.UI) {
        window.UI.initialize();
    }
});