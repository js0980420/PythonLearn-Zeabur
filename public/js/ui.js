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
                    <h6 class="text-success"><i class="fas fa-code"></i> 2. 程式編輯與運行</h6>
                    <p>• <strong>編輯代碼</strong>：直接在編輯器中輸入Python代碼，支援語法高亮和自動縮排<br>
                    • <strong>即時同步</strong>：您的修改會即時同步給房間內所有人（每秒同步）<br>
                    • <strong><i class="fas fa-play text-success"></i> 運行代碼</strong>：點擊綠色「運行」按鈕或按 Ctrl+Enter 執行Python代碼<br>
                    • <strong>查看結果</strong>：運行結果會顯示在編輯器下方的輸出區域<br>
                    • <strong>清除輸出</strong>：點擊「清除」按鈕可清空運行結果</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-info"><i class="fas fa-save"></i> 3. 代碼儲存與管理</h6>
                    <p>• <strong><i class="fas fa-save text-primary"></i> 保存功能</strong>：<br>
                    &nbsp;&nbsp;- 點擊「保存」按鈕或按 Ctrl+S 保存當前代碼<br>
                    &nbsp;&nbsp;- 支援5個儲存槽位（最新 + 槽位1-4）<br>
                    &nbsp;&nbsp;- 可為每個槽位命名便於管理<br><br>
                    • <strong><i class="fas fa-sync-alt text-info"></i> 載入功能</strong>：<br>
                    &nbsp;&nbsp;- 點擊「載入」選擇要載入的代碼版本<br>
                    &nbsp;&nbsp;- 可載入最新版本或指定槽位的代碼<br>
                    &nbsp;&nbsp;- 載入時會提示確認以避免誤操作<br><br>
                    • <strong><i class="fas fa-download text-success"></i> 下載功能</strong>：<br>
                    &nbsp;&nbsp;- 點擊「更多」→「下載 .py 檔案」<br>
                    &nbsp;&nbsp;- 自動下載為標準Python檔案格式<br>
                    &nbsp;&nbsp;- 檔案名包含時間戳便於識別<br><br>
                    • <strong><i class="fas fa-upload text-warning"></i> 導入功能</strong>：<br>
                    &nbsp;&nbsp;- 點擊「更多」→「導入檔案」<br>
                    &nbsp;&nbsp;- 支援 .py 和 .txt 檔案格式<br>
                    &nbsp;&nbsp;- 導入的內容會替換當前編輯器內容</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-warning"><i class="fas fa-robot"></i> 4. AI智能助教</h6>
                    <p>• <strong><i class="fas fa-lightbulb text-info"></i> 解釋程式</strong>：AI詳細分析您的代碼邏輯、功能和實現原理<br>
                    • <strong><i class="fas fa-bug text-danger"></i> 檢查錯誤</strong>：AI幫您找出語法錯誤、邏輯問題和潛在bug<br>
                    • <strong><i class="fas fa-lightbulb text-success"></i> 改進建議</strong>：AI提供代碼優化、重構和最佳實踐建議<br>
                    • <strong><i class="fas fa-play text-dark"></i> 運行代碼</strong>：AI協助執行程式並分析運行結果和輸出<br>
                    • <strong><i class="fas fa-share text-primary"></i> 分享回應</strong>：AI分析完成後可點擊「分享」將結果發送到聊天室與同學討論</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-success"><i class="fas fa-comments"></i> 5. 聊天室協作溝通</h6>
                    <p>• <strong>切換聊天室</strong>：點擊「聊天室」標籤切換到聊天功能<br>
                    • <strong>即時討論</strong>：與房間內其他同學即時討論程式問題和學習心得<br>
                    • <strong>教師通知</strong>：接收教師發送的重要通知和指導訊息<br>
                    • <strong>AI分享</strong>：將AI助教的分析結果一鍵分享到聊天室供大家參考<br>
                    • <strong><i class="fas fa-eye text-info"></i> 教師監控</strong>：⚠️ 提醒：所有聊天室訊息都會被教師看到，請維持良好的討論品質</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-secondary"><i class="fas fa-keyboard"></i> 6. 快捷鍵操作</h6>
                    <p>• <strong>Ctrl+S</strong>：快速保存代碼到本地儲存<br>
                    • <strong>Ctrl+Enter</strong>：執行Python代碼<br>
                    • <strong>Ctrl+/</strong>：註釋/取消註釋選中的代碼行<br>
                    • <strong>Tab</strong>：增加代碼縮排（Python必需）<br>
                    • <strong>Shift+Tab</strong>：減少代碼縮排<br>
                    • <strong>Ctrl+Z</strong>：撤銷上一步操作<br>
                    • <strong>Ctrl+Y</strong>：重做已撤銷的操作</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-danger"><i class="fas fa-chalkboard-teacher"></i> 7. 教師監控與管理</h6>
                    <p>• <strong><i class="fas fa-desktop text-primary"></i> 監控後台</strong>：教師可開啟專用後台即時監控所有房間狀況<br>
                    • <strong><i class="fas fa-eye text-info"></i> 即時監控</strong>：<br>
                    &nbsp;&nbsp;- 教師可看到每個房間的即時代碼內容<br>
                    &nbsp;&nbsp;- 監控所有學生的聊天室訊息和討論內容<br>
                    &nbsp;&nbsp;- 查看學生的程式編輯進度和活動狀況<br>
                    &nbsp;&nbsp;- 掌握各房間的在線人數和學習動態<br><br>
                    • <strong><i class="fas fa-bullhorn text-warning"></i> 廣播功能</strong>：<br>
                    &nbsp;&nbsp;- 向特定房間發送通知訊息<br>
                    &nbsp;&nbsp;- 向所有學生同時廣播重要公告<br>
                    &nbsp;&nbsp;- 支援不同類型的訊息（通知、警告、成功）<br>
                    &nbsp;&nbsp;- 學生端會以醒目方式顯示教師廣播<br><br>
                    • <strong><i class="fas fa-door-closed text-danger"></i> 房間管理</strong>：<br>
                    &nbsp;&nbsp;- 課程結束時可統一關閉所有房間<br>
                    &nbsp;&nbsp;- 管理房間設定和存取權限<br>
                    &nbsp;&nbsp;- 查看詳細的房間使用統計</p>
                </div>
                
                <div class="tutorial-section">
                    <h6 class="text-purple"><i class="fas fa-shield-alt"></i> 8. 隱私與安全須知</h6>
                    <p>• <strong><i class="fas fa-exclamation-triangle text-warning"></i> 重要提醒</strong>：<br>
                    &nbsp;&nbsp;- 您的所有代碼修改都會被即時同步給房間內其他人<br>
                    &nbsp;&nbsp;- 聊天室的所有訊息都會被教師監控和記錄<br>
                    &nbsp;&nbsp;- 教師可以看到您的完整程式編輯過程和內容<br>
                    &nbsp;&nbsp;- AI助教的所有互動記錄可能被保存用於學習分析<br><br>
                    • <strong>良好實踐</strong>：<br>
                    &nbsp;&nbsp;- 保持代碼整潔和適當的註釋<br>
                    &nbsp;&nbsp;- 在聊天室維持禮貌和專業的討論<br>
                    &nbsp;&nbsp;- 尊重其他同學的學習進度和貢獻<br>
                    &nbsp;&nbsp;- 定期保存重要的代碼進度</p>
                </div>
                
                <div class="alert alert-success mt-3">
                    <i class="fas fa-lightbulb"></i> <strong>學習建議與最佳實踐</strong>：
                    <ul class="mb-0 mt-2">
                        <li><strong>新手入門</strong>：建議先熟悉基本編程和保存功能，再嘗試多人協作</li>
                        <li><strong>AI助教</strong>：善用AI的五大功能提升程式設計技巧和學習效率</li>
                        <li><strong>協作溝通</strong>：多在聊天室與同學討論，分享AI分析結果促進互相學習</li>
                        <li><strong>代碼管理</strong>：定期使用多個槽位保存代碼，避免重要進度丟失</li>
                        <li><strong>教師互動</strong>：注意教師廣播訊息，主動在聊天室提問和參與討論</li>
                        <li><strong>學習品質</strong>：專注於代碼品質和學習效果，而非只是完成任務</li>
                    </ul>
                </div>
                
                <div class="alert alert-info mt-2">
                    <i class="fas fa-question-circle"></i> <strong>需要幫助？</strong><br>
                    如有任何操作問題，可以：<br>
                    • 在聊天室向教師或同學求助<br>
                    • 使用AI助教的「解釋程式」功能了解代碼<br>
                    • 點擊「操作教學」按鈕隨時重新查看本指南
                </div>
            </div>
        `;
        
        // 顯示教學內容
        aiResponseDiv.innerHTML = tutorialContent;
        
        // 確保AI面板是顯示狀態
        this.switchToAI();
        
        console.log('✅ 詳細操作教學已顯示 - 最新版本 v2.0 (2025-06-04)');
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