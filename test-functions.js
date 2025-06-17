const WebSocket = require('ws');

console.log('🧪 開始測試 teacher_broadcast 和 run_code 功能...');

// 模擬教師連接
function testTeacherBroadcast() {
    return new Promise((resolve, reject) => {
        const teacherWs = new WebSocket('ws://localhost:3000');
        
        teacherWs.on('open', () => {
            console.log('👨‍🏫 教師 WebSocket 連接已建立');
            
            // 1. 先註冊為教師
            const teacherMonitorMessage = {
                type: 'teacher_monitor',
                action: 'register'
            };
            
            console.log('📤 發送教師監控註冊消息:', teacherMonitorMessage);
            teacherWs.send(JSON.stringify(teacherMonitorMessage));
            
            // 等待一秒後發送廣播
            setTimeout(() => {
                const broadcastMessage = {
                    type: 'teacher_broadcast',
                    data: {
                        targetRoom: 'test-room',
                        message: '這是一條測試廣播消息',
                        messageType: 'info'
                    }
                };
                
                console.log('📤 發送教師廣播消息:', broadcastMessage);
                teacherWs.send(JSON.stringify(broadcastMessage));
                
                // 5秒後關閉連接
                setTimeout(() => {
                    teacherWs.close();
                    resolve('teacher_broadcast 測試完成');
                }, 5000);
            }, 1000);
        });
        
        teacherWs.on('message', (data) => {
            const message = JSON.parse(data);
            console.log('👨‍🏫 教師收到消息:', message);
        });
        
        teacherWs.on('error', (error) => {
            console.error('❌ 教師 WebSocket 錯誤:', error);
            reject(error);
        });
    });
}

// 模擬學生連接並測試run_code
function testStudentRunCode() {
    return new Promise((resolve, reject) => {
        const studentWs = new WebSocket('ws://localhost:3000');
        
        studentWs.on('open', () => {
            console.log('👨‍🎓 學生 WebSocket 連接已建立');
            
            // 1. 先加入房間
            const joinMessage = {
                type: 'join_room',
                room: 'test-room',
                userName: '測試學生'
            };
            
            console.log('📤 學生加入房間:', joinMessage);
            studentWs.send(JSON.stringify(joinMessage));
            
            // 等待2秒後發送run_code
            setTimeout(() => {
                const runCodeMessage = {
                    type: 'run_code',
                    room: 'test-room',
                    code: 'print("Hello from test!")'
                };
                
                console.log('📤 發送代碼執行消息:', runCodeMessage);
                studentWs.send(JSON.stringify(runCodeMessage));
                
                // 5秒後關閉連接
                setTimeout(() => {
                    studentWs.close();
                    resolve('run_code 測試完成');
                }, 5000);
            }, 2000);
        });
        
        studentWs.on('message', (data) => {
            const message = JSON.parse(data);
            console.log('👨‍🎓 學生收到消息:', message);
        });
        
        studentWs.on('error', (error) => {
            console.error('❌ 學生 WebSocket 錯誤:', error);
            reject(error);
        });
    });
}

// 執行測試
async function runTests() {
    try {
        console.log('\n=== 測試1: 教師廣播功能 ===');
        await testTeacherBroadcast();
        
        console.log('\n=== 測試2: 學生代碼執行功能 ===');
        await testStudentRunCode();
        
        console.log('\n✅ 所有測試完成');
        process.exit(0);
    } catch (error) {
        console.error('❌ 測試失敗:', error);
        process.exit(1);
    }
}

// 等待服務器準備就緒後開始測試
setTimeout(runTests, 2000); 