const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const mysql = require('mysql2/promise'); // 引入 mysql2/promise 用於異步操作

// 基本配置
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 1024 * 1024 * 2, // 2MB 消息大小限制，足夠處理長AI回應
    perMessageDeflate: {
        zlibDeflateOptions: {
            level: 3,
            chunkSize: 1024,
        },
        threshold: 1024,
        concurrencyLimit: 10,
        serverMaxWindowBits: 15,
        clientMaxWindowBits: 15,
        serverMaxNoContextTakeover: false,
        clientMaxNoContextTakeover: false,
        serverNoContextTakeover: false,
        clientNoContextTakeover: false,
        compress: true
    }
});

// 環境變數配置
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.VERCEL_URL || process.env.ZEABUR_URL || 'http://localhost:8080';
const WEBSOCKET_URL = PUBLIC_URL ? PUBLIC_URL.replace('https://', 'wss://').replace('http://', 'ws://') : '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// 數據庫配置
let dbConfig;
try {
    const configPath = path.join(__dirname, 'db_config.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        dbConfig = process.env.NODE_ENV === 'production' ? config.production : config.development;
        console.log('✅ 使用 db_config.json 文件配置數據庫');
    } else {
        dbConfig = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: process.env.MYSQL_DATABASE || 'python_collaboration',
            port: parseInt(process.env.MYSQL_PORT) || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
        console.log('⚠️ 未找到 db_config.json，使用環境變數或默認配置');
    }
} catch (error) {
    console.error('❌ 載入數據庫配置失敗:', error.message);
    dbConfig = {
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'python_collaboration',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
}

let pool;
let isDatabaseAvailable = false;
let isDbConnected = true;

try {
    pool = mysql.createPool(dbConfig);
    console.log('✅ MySQL 連接池建立成功！');
    pool.getConnection()
        .then(async connection => {
            console.log('🔗 成功連接到 MySQL 數據庫！');
            await initializeDatabase(connection);
            connection.release();
            isDatabaseAvailable = true;
            console.log('🎯 MySQL 數據庫模式：啟用');
        })
        .catch(err => {
            console.error('❌ 無法連接到 MySQL 數據庫:', err.message);
            console.log('🔄 暫時使用內存模式，但建議修復 MySQL 連接');
            console.log('💡 請參考生成的修復腳本或使用 MySQL Workbench');
            // 暫時允許內存模式
            isDbConnected = false;
            initializeMemoryStorage();
        });
} catch (error) {
    console.error('❌ 建立 MySQL 連接池失敗:', error.message);
    console.error('🚫 強制使用 MySQL 模式，必須修復數據庫連接');
    process.exit(1); // 強制退出，不允許降級
}

async function initializeDatabase(connection) {
    try {
        console.log('🔧 開始初始化數據庫表...');
        await connection.execute(`CREATE TABLE IF NOT EXISTS rooms (id VARCHAR(100) PRIMARY KEY, current_code_content TEXT, current_code_version INT DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
        await connection.execute(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
        await connection.execute(`CREATE TABLE IF NOT EXISTS user_names (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(100) NOT NULL, user_name VARCHAR(50) NOT NULL, room_id VARCHAR(100) NOT NULL, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY unique_user_room (user_id, room_id))`);
        await connection.execute(`CREATE TABLE IF NOT EXISTS code_history (id INT AUTO_INCREMENT PRIMARY KEY, room_id VARCHAR(100), user_id VARCHAR(100), user_name VARCHAR(100), code_content TEXT, version INT, save_name VARCHAR(100), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await connection.execute(`CREATE TABLE IF NOT EXISTS chat_messages (id INT AUTO_INCREMENT PRIMARY KEY, room_id VARCHAR(100), user_id VARCHAR(100), message_content TEXT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await connection.execute(`CREATE TABLE IF NOT EXISTS ai_requests (id INT AUTO_INCREMENT PRIMARY KEY, room_id VARCHAR(100), user_id VARCHAR(100), request_type VARCHAR(50), code_content TEXT, ai_response TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        console.log('✅ 數據庫表初始化完成');
    } catch (error) {
        console.error('❌ 數據庫表初始化失敗:', error.message);
    }
}

// 全域變數
const rooms = {};
const users = {};
const teacherMonitors = new Set();
let activityInterval;

// 啟動一個定時器，定期向教師廣播統計數據
if (!activityInterval) {
    activityInterval = setInterval(broadcastSystemStats, 5000); // 每5秒廣播一次
}

// 靜態文件服務
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());


// 載入AI配置
let aiConfig = {};
try {
    const configPath = path.join(__dirname, 'ai_config.json');
    if (fs.existsSync(configPath)) {
        aiConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ 使用 ai_config.json 文件配置');
    } else if (process.env.OPENAI_API_KEY) {
        aiConfig = { openai_api_key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo', enabled: true };
        console.log('✅ 使用環境變數AI配置');
    } else {
        aiConfig = { enabled: false };
        console.log('⚠️ 未找到 AI 配置文件或環境變數，AI 功能停用');
    }
} catch (error) {
    console.error('❌ 載入AI配置失敗:', error.message);
    aiConfig = { enabled: false };
}


wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            handleMessage(ws, parsedMessage);
    } catch (error) {
            console.error('❌ 處理消息失敗:', error);
        }
    });

    ws.on('close', () => handleUserDisconnect(ws));
    ws.on('error', (error) => console.error('❌ WebSocket 錯誤:', error));
});

const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

wss.on('close', () => clearInterval(interval));


function generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function handleMessage(ws, message) {
    const { type, ...data } = message;
    switch (type) {
        case 'join_room': await handleJoinRoom(ws, data); break;
        case 'leave_room': handleLeaveRoom(ws, data); break;
        case 'code_change': handleCodeChange(ws, data); break;
        case 'cursor_change': handleCursorChange(ws, data); break;
        case 'chat_message': await handleChatMessage(ws, data); break;
        case 'teacher_monitor': handleTeacherMonitor(ws, data); break;
        case 'teacher_broadcast': handleTeacherBroadcast(ws, data); break;
        case 'teacher_chat': handleTeacherChat(ws, data); break;
        case 'run_code': handleRunCode(ws, data); break;
        case 'ai_request': await handleAIRequest(ws, data); break;
        case 'load_code': await handleLoadCode(ws, data); break;
        case 'get_history': await handleGetHistory(ws, data); break;
        case 'save_code': await handleSaveCode(ws, data); break;
        case 'conflict_notification': handleConflictNotification(ws, data); break;
        default: console.warn(`⚠️ 未知消息類型: ${type}`);
    }
}

async function handleJoinRoom(ws, message) {
    const { roomId, userName } = message;
    if (!roomId || !userName) return;

    const userId = generateUserId();
    ws.userId = userId;
    ws.userName = userName;
    ws.roomId = roomId;

    if (!rooms[roomId]) {
        console.log(`🚪 房間 ${roomId} 不存在，正在創建新房間...`);
        rooms[roomId] = {
            users: new Set(),
            code: '',
            version: 1,
            chatHistory: [],
            userCursors: {},
            userVersions: {},
            modificationCount: 0,
            lastActivity: Date.now(),
            isInactive: false
        };
        console.log(`✅ 房間 ${roomId} 創建成功`);
    } else if (rooms[roomId].isInactive) {
        // 如果房間存在但處於非活躍狀態，重新激活它
        console.log(`🔄 重新激活房間 ${roomId}`);
        rooms[roomId].isInactive = false;
        delete rooms[roomId].inactiveTime;
    }

    rooms[roomId].users.add(userId);
    users[userId] = { ws, roomId, userName };
    
        ws.send(JSON.stringify({
        type: 'joined_room',
        userId,
        roomId,
        userName,
        code: rooms[roomId].code,
        version: rooms[roomId].version,
        users: Array.from(rooms[roomId].users).map(uid => users[uid]?.userName).filter(Boolean)
    }));
    
    broadcastToRoom(roomId, {
        type: 'user_joined',
        userId,
        userName,
        userCount: rooms[roomId].users.size
    }, userId);

    broadcastSystemStats();
}

function handleLeaveRoom(ws, message) {
    const { roomId } = message;
    const userId = ws.userId;

    if (roomId && rooms[roomId] && rooms[roomId].users.has(userId)) {
        rooms[roomId].users.delete(userId);
        delete rooms[roomId].userCursors[userId];
        delete users[userId];

        broadcastToRoom(roomId, {
            type: 'user_left',
            userId,
            userName: ws.userName,
            userCount: rooms[roomId].users.size
        });
        
        if (rooms[roomId].users.size === 0) {
            console.log(`❌ 房間 ${roomId} 已空，正在關閉...`);
            delete rooms[roomId];
            console.log(`✅ 房間 ${roomId} 已成功關閉。`);
            const roomClosedMessage = JSON.stringify({ type: 'room_closed', roomId });
            teacherMonitors.forEach(teacherWs => {
                if (teacherWs.readyState === WebSocket.OPEN) teacherWs.send(roomClosedMessage);
            });
        }
    }
    broadcastSystemStats();
}

function handleCodeChange(ws, message) {
    const userId = ws.userId;
    const { roomId, code, version } = message;

    if (rooms[roomId] && rooms[roomId].users.has(userId)) {
        rooms[roomId].code = code;
        rooms[roomId].version = version;
        
        // 更新房間活動狀態
        rooms[roomId].modificationCount = (rooms[roomId].modificationCount || 0) + 1;
        rooms[roomId].lastActivity = Date.now();

        broadcastToRoom(roomId, {
            type: 'code_change',
            code,
            version,
            from: userId,
            userName: ws.userName
        }, userId);
        
        // 代碼變更時立即廣播系統狀態
        broadcastSystemStats();
    }
}

function handleCursorChange(ws, message) {
    const userId = ws.userId;
    const { roomId, cursor } = message;
    if (rooms[roomId] && rooms[roomId].users.has(userId)) {
        broadcastToRoom(roomId, {
            type: 'cursor_change',
            userId,
            userName: ws.userName,
            cursor
        }, userId);
    }
}

async function handleChatMessage(ws, message) {
    const { roomId, msg } = message;
    const userId = ws.userId;

    if (rooms[roomId] && rooms[roomId].users.has(userId)) {
    const chatMessage = {
            type: 'chat_message',
            userId,
        userName: ws.userName,
            msg,
            timestamp: Date.now()
        };
        broadcastToRoom(roomId, chatMessage);
    
    if (isDatabaseAvailable) {
            try {
                await pool.execute('INSERT INTO chat_messages (room_id, user_id, message_content) VALUES (?, ?, ?)', [roomId, userId, msg]);
        } catch (error) {
                console.error('❌ 寫入聊天記錄到數據庫失敗:', error.message);
            }
        }
    }
}

function handleTeacherMonitor(ws, message) {
    if (message.enable) {
        ws.isTeacher = true;
        teacherMonitors.add(ws);
        console.log(`👨‍🏫 一位教師開始監控 (目前共 ${teacherMonitors.size} 位)`);

        const activeRoomsData = Object.keys(rooms).map(id => ({
            id,
            userCount: rooms[id].users.size,
            modificationCount: rooms[id].modificationCount || 0
        }));

        ws.send(JSON.stringify({
            type: 'active_rooms_list',
            rooms: activeRoomsData
        }));

    } else {
        teacherMonitors.delete(ws);
        console.log(`👨‍🏫 一位教師停止監控 (剩下 ${teacherMonitors.size} 位)`);
    }
}

function handleTeacherBroadcast(ws, message) {
    if (!ws.isTeacher) return;
    const { msg } = message;
    const broadcastMessage = {
        type: 'chat_message',
        userId: 'teacher',
        userName: '教師廣播',
        msg,
        timestamp: Date.now()
    };
        Object.keys(rooms).forEach(roomId => {
        broadcastToRoom(roomId, broadcastMessage);
    });
}

function handleTeacherChat(ws, message) {
     if (!ws.isTeacher) return;
    const { roomId, msg } = message;
    const chatMessage = {
        type: 'chat_message',
        userId: 'teacher',
        userName: `教師(${ws.userName || '匿名'})`,
        msg,
        timestamp: Date.now()
    };
    if (roomId === 'all') {
         Object.keys(rooms).forEach(rid => broadcastToRoom(rid, chatMessage));
    } else if (rooms[roomId]) {
        broadcastToRoom(roomId, chatMessage);
    }
}

function handleUserDisconnect(ws) {
    if (!ws.userId) {
        console.log("一個沒有ID的客戶端斷開了連接。");
        return;
    }
    
    const userId = ws.userId;
    const roomId = ws.roomId;

    if (roomId && rooms[roomId] && rooms[roomId].users.has(userId)) {
        rooms[roomId].users.delete(userId);
        delete rooms[roomId].userCursors[userId];
        delete users[userId];

        console.log(`👋 用戶 ${userId} (${ws.userName}) 已從房間 ${roomId} 離開。`);
        
        const remainingUsers = rooms[roomId].users.size;
        console.log(`📊 房間 ${roomId} 剩下 ${remainingUsers} 位用戶。`);

        broadcastToRoom(roomId, {
            type: 'user_left',
            userId: userId,
            userName: ws.userName,
            userCount: remainingUsers
        });

        // 如果房間空了，標記為非活躍並通知教師
        if (remainingUsers === 0) {
            console.log(`⚠️ 房間 ${roomId} 已空，標記為非活躍...`);
            rooms[roomId].isInactive = true;
            rooms[roomId].inactiveTime = Date.now();
            
            // 向教師廣播房間狀態變更消息
            const roomInactiveMessage = JSON.stringify({
                type: 'room_inactive',
                roomId: roomId,
                stats: {
                    lastModificationCount: rooms[roomId].modificationCount || 0,
                    lastActivity: rooms[roomId].lastActivity || Date.now(),
                    inactiveTime: rooms[roomId].inactiveTime
                }
            });
            
            teacherMonitors.forEach(teacherWs => {
                if (teacherWs.readyState === WebSocket.OPEN) {
                    teacherWs.send(roomInactiveMessage);
                }
            });
            
            // 立即廣播更新後的系統狀態
            broadcastSystemStats();
        }
                    } else {
        delete users[userId];
        console.log(`👋 用戶 ${userId} 已斷開連接 (未在任何房間內)。`);
    }
}

function broadcastToRoom(roomId, message, excludeUserId = null) {
    if (!rooms[roomId]) return;
    const messageString = JSON.stringify(message);
    rooms[roomId].users.forEach(userId => {
        if (userId !== excludeUserId) {
            const userWs = users[userId]?.ws;
            if (userWs && userWs.readyState === WebSocket.OPEN) {
                userWs.send(messageString);
            }
        }
    });
}

function broadcastSystemStats() {
    if (teacherMonitors.size === 0) return;

    const activeRooms = Object.keys(rooms)
        .map(id => ({
            id,
            userCount: rooms[id].users.size,
            modificationCount: rooms[id].modificationCount || 0,
            lastActivity: rooms[id].lastActivity || Date.now()
        }))
        .filter(room => room.userCount > 0 || !rooms[room.id].isInactive);

    // 找出最活躍的房間（基於修改頻率）
    let mostActiveRoomId = null;
    let highestModificationCount = -1;
    
    activeRooms.forEach(room => {
        if (room.modificationCount > highestModificationCount && room.userCount > 0) {
            highestModificationCount = room.modificationCount;
            mostActiveRoomId = room.id;
        }
    });
    
    const stats = {
        type: 'system_stats',
        activeRooms,
        totalUsers: Object.keys(users).length,
        mostActiveRoomId,
        timestamp: Date.now()
    };

    const message = JSON.stringify(stats);
    teacherMonitors.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

// --- 省略 AI 和數據庫相關的其餘函數，以保持簡潔 ---
// handleRunCode, executePythonCode, handleAIRequest, etc.
// handleLoadCode, handleGetHistory, handleSaveCode, etc.


function handleRunCode(ws, message) {
    const { code } = message;
    executePythonCode(code, (output, error) => {
    ws.send(JSON.stringify({
            type: 'code_result',
            output,
            error
        }));
    });
}

function executePythonCode(code, callback) {
    const tempFilePath = path.join(os.tmpdir(), `code_${Date.now()}.py`);
    fs.writeFile(tempFilePath, code, (err) => {
        if (err) {
            console.error('寫入臨時文件失敗:', err);
            return callback('', `伺服器錯誤：無法寫入臨時文件。`);
        }

        const pythonProcess = spawn('python', [tempFilePath]);
        let output = '';
        let error = '';

        pythonProcess.stdout.on('data', data => output += data.toString());
        pythonProcess.stderr.on('data', data => error += data.toString());

        pythonProcess.on('close', (code) => {
            fs.unlink(tempFilePath, () => {}); // 清理臨時文件
            callback(output, error);
        });
    });
}

async function handleAIRequest(ws, message) {
    if (!aiConfig.enabled) {
        ws.send(JSON.stringify({ type: 'ai_response', response: 'AI 助教功能未啟用。' }));
        return;
    }

    const { sub_type, code, conflictData } = message;
    let response;

    try {
        switch (sub_type) {
            case 'analyze': response = await getAIAnalysis(code, '請解釋這段程式碼的功能、邏輯和潛在問題。'); break;
            case 'check': response = await getAIAnalysis(code, '請檢查這段程式碼是否有語法錯誤、邏輯錯誤或潛在的 bug。'); break;
            case 'suggest': response = await getAIAnalysis(code, '請提供改進這段程式碼的建議，例如如何提高可讀性、效率或遵循最佳實踐。'); break;
            case 'resolve': response = await analyzeConflict(conflictData); break;
            default: response = '未知的 AI 請求類型。';
        }
    } catch (error) {
        console.error(`AI 請求失敗 (${sub_type}):`, error);
        response = 'AI 服務暫時無法連線，請稍後再試。';
    }

    ws.send(JSON.stringify({ type: 'ai_response', response }));
}

async function getAIAnalysis(code, prompt) {
    try {
        const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${aiConfig.openai_api_key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: aiConfig.model,
            messages: [
                    { role: 'system', content: '你是一位專業的 Python 程式設計助教，請用繁體中文回答。' },
                    { role: 'user', content: `${prompt}\n\n\`\`\`python\n${code}\n\`\`\`` }
                ],
                max_tokens: 1500,
            temperature: 0.3
        })
    });
    
        if (!response.ok) throw new Error(`OpenAI API 錯誤: ${response.statusText}`);
    
    const data = await response.json();
    return data.choices[0].message.content;
    } catch (error) {
        console.error('getAIAnalysis 錯誤:', error);
        throw error;
    }
}

async function analyzeConflict(conflictData) {
    // 衝突分析的簡化邏輯
    return `這是一個程式碼衝突。您的版本是 ${conflictData.userVersion}，伺服器上的版本是 ${conflictData.serverVersion}。請與您的同伴溝通解決。`;
}

// 數據庫操作函數 (保存/加載/歷史)
async function handleSaveCode(ws, message) {
    if (!isDatabaseAvailable) {
        ws.send(JSON.stringify({ type: 'save_code_error', error: '數據庫未連接，無法保存' }));
        return;
    }
    const { code, saveName } = message;
    const userId = ws.userId;
    const roomId = ws.roomId;
    const userName = ws.userName;
    try {
        await pool.execute(
            'INSERT INTO code_history (room_id, user_id, user_name, code_content, save_name, version) VALUES (?, ?, ?, ?, ?, (SELECT COUNT(*)+1 FROM code_history WHERE user_id = ? AND room_id = ?))',
            [roomId, userId, userName, code, saveName || `儲存於 ${new Date().toLocaleString()}`, userId, roomId]
        );
        ws.send(JSON.stringify({ type: 'save_code_success' }));
            } catch (error) {
        console.error('保存代碼失敗:', error);
        ws.send(JSON.stringify({ type: 'save_code_error', error: '保存失敗' }));
    }
}

async function handleLoadCode(ws, message) {
    if (!isDatabaseAvailable) {
        ws.send(JSON.stringify({ type: 'load_code_error', error: '數據庫未連接，無法加載' }));
        return;
    }
    const { saveId } = message; // saveId 是 code_history 表的 id
    const userId = ws.userId;
    try {
        const [rows] = await pool.execute('SELECT code_content, version FROM code_history WHERE id = ? AND user_id = ?', [saveId, userId]);
        if (rows.length > 0) {
            const { code_content, version } = rows[0];
            ws.send(JSON.stringify({ type: 'load_code_success', code: code_content, version, operation: 'load' }));
    } else {
            ws.send(JSON.stringify({ type: 'load_code_error', error: '找不到指定的儲存紀錄' }));
        }
    } catch (error) {
        console.error('加載代碼失敗:', error);
        ws.send(JSON.stringify({ type: 'load_code_error', error: '加載失敗' }));
    }
}

async function handleGetHistory(ws, message) {
    if (!isDatabaseAvailable) {
        ws.send(JSON.stringify({ type: 'history_data', history: [] }));
        return;
    }
    const userId = ws.userId;
    try {
        const [rows] = await pool.execute('SELECT id, save_name, timestamp FROM code_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20', [userId]);
        ws.send(JSON.stringify({ type: 'history_data', history: rows }));
        } catch (error) {
        console.error('獲取歷史紀錄失敗:', error);
        ws.send(JSON.stringify({ type: 'history_data', history: [] }));
    }
}

function handleConflictNotification(ws, message) {
    const { targetUserId } = message;
    const targetWs = users[targetUserId]?.ws;
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify(message));
    }
}


// 端口配置：本地開發使用 3000，Zeabur 雲端使用 8080
const isProduction = process.env.NODE_ENV === 'production';
const DEFAULT_PORT = isProduction ? 8080 : 3000;
const PORT = process.env.PORT || DEFAULT_PORT;

server.listen(PORT, () => {
    console.log(`🚀 伺服器正在監聽 port ${PORT}`);
    console.log(`🌍 環境: ${isProduction ? '生產環境 (Zeabur)' : '本地開發環境'}`);
    console.log(`📱 存取網址: http://localhost:${PORT}`);
});