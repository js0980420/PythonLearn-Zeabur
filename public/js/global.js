// 全局函數定義

// 加入房間
function globalJoinRoom() {
    const roomName = document.getElementById('roomInput').value.trim();
    const userName = document.getElementById('nameInput').value.trim();
    
    if (!roomName || !userName) {
        if (window.UI) {
            window.UI.showErrorToast('房間名稱和用戶名不能為空');
        } else {
            alert('房間名稱和用戶名不能為空');
        }
        return;
    }
    
    // 更新UI顯示
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('workspaceSection').style.display = 'block';
    document.getElementById('currentRoom').textContent = roomName;
    document.getElementById('currentUserName').textContent = userName;
    
    // 連接WebSocket
    if (window.wsManager) {
        wsManager.connect(roomName, userName);
    } else {
        console.error('❌ WebSocket管理器未初始化');
    }
}

// 離開房間
function globalLeaveRoom() {
    if (window.wsManager) {
        wsManager.cleanup();
    }
    
    // 重置UI
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('workspaceSection').style.display = 'none';
    document.getElementById('currentRoom').textContent = '-';
    document.getElementById('currentUserName').textContent = '-';
}

// 切換到AI助教面板
function globalSwitchToAI() {
    document.getElementById('aiSection').style.display = 'block';
    document.getElementById('chatSection').style.display = 'none';
    document.getElementById('aiTabBtn').classList.add('btn-primary');
    document.getElementById('aiTabBtn').classList.remove('btn-outline-primary');
    document.getElementById('chatTabBtn').classList.add('btn-outline-success');
    document.getElementById('chatTabBtn').classList.remove('btn-success');
}

// 切換到聊天室面板
function globalSwitchToChat() {
    document.getElementById('aiSection').style.display = 'none';
    document.getElementById('chatSection').style.display = 'block';
    document.getElementById('chatTabBtn').classList.add('btn-success');
    document.getElementById('chatTabBtn').classList.remove('btn-outline-success');
    document.getElementById('aiTabBtn').classList.add('btn-outline-primary');
    document.getElementById('aiTabBtn').classList.remove('btn-primary');
}

// 發送聊天消息
function globalSendChat() {
    if (window.chatManager) {
        window.chatManager.sendMessage();
    }
}

// 打開教師監控後台
function openTeacherDashboard() {
    window.open('/teacher', '_blank');
} 