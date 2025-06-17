const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
    console.log('✅ 連接成功');
    
    // 發送加入房間請求
    ws.send(JSON.stringify({
        type: 'join_room',
        room: 'test-room',
        userName: '測試用戶'
    }));
});

ws.on('message', (data) => {
    console.log('📨 收到消息:', data.toString());
});

ws.on('close', () => {
    console.log('👋 連接關閉');
});

ws.on('error', (error) => {
    console.error('❌ 錯誤:', error);
}); 