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
const wss = new WebSocket.Server({ server });

// 環境變數配置
// 動態檢測 URL，適用於多種部署環境
const PUBLIC_URL = process.env.PUBLIC_URL || 
                   process.env.VERCEL_URL || 
                   process.env.ZEABUR_URL ||
                   'http://localhost:8080'; // 默認本地開發

const WEBSOCKET_URL = PUBLIC_URL ? PUBLIC_URL.replace('https://', 'wss://').replace('http://', 'ws://') : '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// 數據庫配置（全部使用環境變數）
const dbConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'python_collaboration',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
let isDatabaseAvailable = false; // 新增：追蹤數據庫可用性

try {
    pool = mysql.createPool(dbConfig);
    console.log('✅ MySQL 連接池建立成功！');

    // 測試連接並初始化數據庫表格
    pool.getConnection()
        .then(async connection => { // 將這裡的函數標記為 async
            console.log('🔗 成功連接到 MySQL 數據庫！');
            await initializeDatabase(connection); // 呼叫初始化函數
            connection.release(); // 釋放連接
            isDatabaseAvailable = true; // 設置數據庫可用
            console.log('🎯 MySQL 數據庫模式：啟用 - 所有數據將持久化到數據庫');
        })
        .catch(err => {
            console.error('❌ 無法連接到 MySQL 數據庫:', err.message);
            isDatabaseAvailable = false; // 設置數據庫不可用
            console.log('🔄 降級到本地模式：使用內存 + localStorage 存儲');
            console.log('💡 提示：部署到 Zeabur 時配置 MySQL 環境變數即可啟用數據庫模式');
        });

} catch (error) {
    console.error('❌ 建立 MySQL 連接池失敗:', error.message);
    isDatabaseAvailable = false; // 設置數據庫不可用
    console.log('🔄 降級到本地模式：使用內存 + localStorage 存儲');
}

// 數據庫初始化函數
async function initializeDatabase(connection) {
    try {
        console.log('⏳ 檢查並初始化數據庫表格...');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ 表格 \'users\' 已準備就緒。');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS rooms (
                id VARCHAR(255) PRIMARY KEY,
                owner_user_id INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                current_code_version INT DEFAULT 0,
                current_code_content LONGTEXT,
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
            );
        `);
        console.log('✅ 表格 \'rooms\' 已準備就緒。');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS code_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(255) NOT NULL,
                user_id INT NOT NULL,
                code_content LONGTEXT NOT NULL,
                version INT NOT NULL,
                save_name VARCHAR(255),
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ 表格 \'code_history\' 已準備就緒。');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(255) NOT NULL,
                user_id INT NOT NULL,
                message_content TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ 表格 \'chat_messages\' 已準備就緒。');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ai_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                room_id VARCHAR(255),
                request_type VARCHAR(255) NOT NULL,
                request_payload LONGTEXT,
                response_payload LONGTEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
            );
        `);
        console.log('✅ 表格 \'ai_logs\' 已準備就緒。');

        console.log('👍 所有數據庫表格初始化完成。');
    } catch (err) {
        console.error('❌ 初始化數據庫表格失敗:', err.message);
        throw err; // 將錯誤重新拋出，讓外部的 catch 處理
    }
}

// 數據持久化文件路徑
const DATA_DIR = process.env.DATA_DIR || __dirname;
const BACKUP_FILE = path.join(DATA_DIR, 'collaboration_data.json');
const AUTO_SAVE_INTERVAL = parseInt(process.env.AUTO_SAVE_INTERVAL) || 30000;
const MAX_BACKUP_FILES = parseInt(process.env.MAX_BACKUP_FILES) || 5;

// 系統配置參數（全部使用環境變數）
const MAX_CONCURRENT_USERS = parseInt(process.env.MAX_CONCURRENT_USERS) || 60;
const WEBSOCKET_TIMEOUT = parseInt(process.env.WEBSOCKET_TIMEOUT) || 30000;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL) || 300000;
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS) || 20;
const MAX_USERS_PER_ROOM = parseInt(process.env.MAX_USERS_PER_ROOM) || 5;

// 全域變數
const rooms = new Map();
const users = new Map();
const teacherMonitors = new Set();
let userCounter = 1;
let connectionCount = 0;
let peakConnections = 0;
let totalConnections = 0;
let serverStartTime = Date.now();
let conflictCounter = 0;
let activeEditors = new Set();

// 載入AI配置
let aiConfig = {};
try {
    // 優先使用環境變數配置（適合生產環境）
    if (process.env.OPENAI_API_KEY) {
        aiConfig = {
            openai_api_key: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 500,
            temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
            timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000,
            enabled: true,
            features: {
                code_analysis: true,
                code_review: true,
                debug_assistance: true,
                improvement_suggestions: true,
                collaboration_guidance: true
            },
            prompts: {
                system_role: "你是一個專業的Python程式設計助教，專門協助學生學習程式設計。請用繁體中文回答，語氣要友善且具教育性。",
                analysis_prompt: "請分析這段Python程式碼，提供建設性的回饋和學習建議。",
                review_prompt: "請審查這段Python程式碼的品質、效能和最佳實踐。",
                debug_prompt: "請檢查這段Python程式碼是否有錯誤，並提供修正建議。",
                improve_prompt: "請提供這段Python程式碼的改進建議，讓程式碼更優雅、更有效率。",
                guide_prompt: "在協作程式設計環境中，請提供團隊程式設計的建議和指導。"
            }
        };
        console.log('✅ 使用環境變數AI配置');
        console.log(`🔑 API密鑰狀態: 已設定`);
        console.log(`🤖 模型: ${aiConfig.model}`);
        console.log(`⚙️ AI功能狀態: 啟用`);
    } else {
        // 如果沒有環境變數，嘗試載入配置文件
        const configPath = path.join(__dirname, 'ai_config.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            aiConfig = JSON.parse(configData);
            console.log('✅ AI配置檔案載入成功');
            console.log(`🔑 API密鑰狀態: ${aiConfig.openai_api_key ? '已設定' : '未設定'}`);
            console.log(`🤖 模型: ${aiConfig.model || 'gpt-3.5-turbo'}`);
            console.log(`⚙️ AI功能狀態: ${aiConfig.enabled ? '啟用' : '停用'}`);
        } else {
            console.log('⚠️ 未設定AI配置，AI助教功能將停用');
            aiConfig = {
                openai_api_key: '',
                model: 'gpt-3.5-turbo',
                enabled: false
            };
        }
    }
} catch (error) {
    console.error('❌ 載入AI配置失敗:', error.message);
    aiConfig = {
        openai_api_key: '',
        model: 'gpt-3.5-turbo',
        enabled: false
    };
}

// 靜態文件服務
app.use(express.static('public'));
app.use(express.json());

// CORS 設定
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// 基本路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/teacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'teacher-dashboard.html'));
});

// API狀態端點
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        uptime: Date.now() - serverStartTime,
        connections: connectionCount,
        rooms: rooms.size,
        version: '2.1.0'
    });
});

// API配置端點
app.get('/api/config', (req, res) => {
    // 動態檢測當前請求的host
    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
    
    // 完全使用動態檢測
    const currentUrl = PUBLIC_URL || `${protocol}://${host}`;
    const currentWsUrl = WEBSOCKET_URL || `${wsProtocol}://${host}`;
    
    res.json({
        websocketUrl: currentWsUrl,
        publicUrl: currentUrl,
        maxUsers: MAX_CONCURRENT_USERS,
        maxRooms: MAX_ROOMS,
        maxUsersPerRoom: MAX_USERS_PER_ROOM,
        host: host,
        protocol: protocol,
        isProduction: process.env.NODE_ENV === 'production',
        
        // 簡化的連接信息
        detectedUrl: `${protocol}://${host}`,
        detectedWsUrl: `${wsProtocol}://${host}`
    });
});

// 教師監控API端點
app.get('/api/teacher/rooms', (req, res) => {
    // 先進行數據清理
    cleanupInvalidData();
    
    const roomsData = Array.from(rooms.entries()).map(([roomId, room]) => {
        // 過濾有效用戶
        const validUsers = Array.from(room.users.values()).filter(user => {
            const globalUser = users.get(user.id);
            return globalUser && globalUser.ws && globalUser.ws.readyState === WebSocket.OPEN;
        });
        
        return {
            id: roomId,
            userCount: validUsers.length,
            users: validUsers.map(user => ({
                id: user.id,
                name: user.name,
                lastActivity: user.lastActivity
            })),
            lastActivity: room.lastActivity,
            createdAt: room.createdAt,
            version: room.version,
            codeLength: room.code ? room.code.length : 0,
            chatCount: room.chatHistory ? room.chatHistory.length : 0
        };
    }).filter(room => room.userCount > 0 || room.codeLength > 0); // 只顯示有用戶或有代碼的房間
    
    // 計算實際連接數
    const actualConnections = Array.from(users.values()).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN
    ).length;
    
    // 計算房間內學生總數
    const studentsInRooms = roomsData.reduce((total, room) => total + room.userCount, 0);
    
    // 計算非教師用戶數（排除教師監控連接）
    const nonTeacherUsers = Array.from(users.values()).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN && !user.isTeacher
    ).length;
    
    console.log(`📊 教師監控統計 - 總連接: ${actualConnections}, 房間學生: ${studentsInRooms}, 非教師用戶: ${nonTeacherUsers}`);
    
    res.json({
        rooms: roomsData,
        totalRooms: roomsData.length,
        totalUsers: actualConnections, // 總連接數
        studentsInRooms: studentsInRooms, // 房間內學生數
        nonTeacherUsers: nonTeacherUsers, // 非教師用戶數
        serverStats: {
            uptime: Date.now() - serverStartTime,
            peakConnections: peakConnections,
            totalConnections: totalConnections,
            actualConnections: actualConnections,
            registeredUsers: users.size,
            teacherMonitors: teacherMonitors.size
        }
    });
});

// 獲取特定房間詳細信息
app.get('/api/teacher/room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.get(roomId);
    
    if (!room) {
        return res.status(404).json({ error: '房間不存在' });
    }
    
    res.json({
        id: roomId,
        users: Array.from(room.users.values()),
        code: room.code,
        version: room.version,
        lastEditedBy: room.lastEditedBy,
        chatHistory: room.chatHistory || [],
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        codeHistory: room.codeHistory || []
    });
});

// 數據持久化功能
function saveDataToFile() {
    try {
        // 確保數據目錄存在
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        const data = {
            rooms: Array.from(rooms.entries()).map(([roomId, room]) => [
                roomId,
                {
                    ...room,
                    users: Array.from(room.users.entries())
                }
            ]),
            timestamp: Date.now(),
            version: '2.1.0',
            serverInfo: {
                startTime: serverStartTime,
                totalConnections: totalConnections,
                peakConnections: peakConnections
            }
        };
        
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 協作數據已保存: ${rooms.size} 個房間`);
    } catch (error) {
        console.error('❌ 保存數據失敗:', error.message);
    }
}

function loadDataFromFile() {
    try {
        if (fs.existsSync(BACKUP_FILE)) {
            const data = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
            
            if (data.rooms && Array.isArray(data.rooms)) {
                data.rooms.forEach(([roomId, roomData]) => {
                    const room = {
                        ...roomData,
                        users: new Map()
                    };
                    
                    if (roomData.users && Array.isArray(roomData.users)) {
                        roomData.users.forEach(([userId, userData]) => {
                            room.users.set(userId, userData);
                        });
                    }
                    
                    rooms.set(roomId, room);
                });
                
                console.log(`📂 成功恢復 ${rooms.size} 個房間的協作數據`);
                if (data.timestamp) {
                    console.log(`⏰ 數據時間: ${new Date(data.timestamp).toLocaleString()}`);
                }
            }
        } else {
            console.log('📂 首次啟動，將創建新的協作數據文件');
        }
    } catch (error) {
        console.error('❌ 載入協作數據失敗:', error.message);
        console.log('📂 將從空數據開始，新的協作數據將自動保存');
    }
}

// 創建房間
async function createRoom(roomId) { // 將函數改為異步
    console.log(`🏠 創建房間: ${roomId}`);
    
    const room = {
        id: roomId,
        users: new Map(),
        code: '',
        version: 0,
        chatHistory: [],
        lastActivity: Date.now(),
        createdAt: Date.now()
    };
    
    if (isDatabaseAvailable) {
        // 數據庫模式：將房間記錄保存到數據庫
        try {
            await pool.execute(
                'INSERT INTO rooms (id, current_code_content, current_code_version) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_activity = CURRENT_TIMESTAMP',
                [roomId, '', 0]
            );
            console.log(`✅ 房間 ${roomId} 已創建並保存到數據庫`);
        } catch (error) {
            console.error(`❌ 創建房間到數據庫失敗 (${roomId}):`, error.message);
            // 即使數據庫創建失敗，也返回內存房間對象
        }
    } else {
        // 本地模式：只創建內存房間對象
        console.log(`🔄 本地模式：房間 ${roomId} 已創建到內存`);
    }
    
    return room;
}

// WebSocket連接處理
wss.on('connection', (ws, req) => {
    if (connectionCount >= MAX_CONCURRENT_USERS) {
        console.log(`🚫 拒絕連接：已達到最大用戶數限制 (${MAX_CONCURRENT_USERS})`);
        ws.close(1013, '服務器已達到最大用戶連接數，請稍後再試');
        return;
    }
    
    // 簡化的IP地址解析
    const getClientIP = () => {
        const xForwardedFor = req.headers['x-forwarded-for'];
        const xRealIP = req.headers['x-real-ip'];
        const connectionIP = req.connection.remoteAddress;
        const socketIP = req.socket.remoteAddress;
        
        let clientIP = '127.0.0.1';
        
        if (xForwardedFor) {
            clientIP = xForwardedFor.split(',')[0].trim();
        } else if (xRealIP) {
            clientIP = xRealIP.trim();
        } else if (connectionIP) {
            clientIP = connectionIP;
        } else if (socketIP) {
            clientIP = socketIP;
        }
        
        // 清理IPv6映射的IPv4地址
        if (clientIP.startsWith('::ffff:')) {
            clientIP = clientIP.substring(7);
        }
        
        return clientIP;
    };
    
    const clientIP = getClientIP();
    console.log(`🌐 新連接來自IP: ${clientIP}`);
    
    // 直接創建新用戶，不進行任何重用或替換邏輯
    const userId = `user_${userCounter++}`;
    connectionCount++;
    totalConnections++;
    
    if (connectionCount > peakConnections) {
        peakConnections = connectionCount;
    }
    
    const userInfo = {
        id: userId,
        ws: ws,
        roomId: null,
        name: `學生${Math.floor(Math.random() * 1000)}`,
        cursor: { line: 0, ch: 0 },
        lastActivity: Date.now(),
        connectionTime: Date.now(),
        isTeacher: false,
        clientIP: clientIP
    };
    
    users.set(userId, userInfo);
    ws.userId = userId;
    
    console.log(`✅ 創建新用戶: ${userId} (IP: ${clientIP})`);
    console.log(`[Server DEBUG] 👤 WebSocket connection established for: ${userId} (${userInfo.name})`);
    
    // 發送歡迎消息
    ws.send(JSON.stringify({
        type: 'welcome',
        userId: userId,
        userName: userInfo.name,
        isReconnect: false
    }));
    
    // 處理消息
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(userId, message);
        } catch (error) {
            console.error(`[Server ERROR] Error processing message from ${userId}:`, error);
        }
    });
    
    // 改善的斷線處理
    ws.on('close', (code, reason) => {
        console.log(`👋 用戶斷線: ${userId} (${userInfo.name}) - Code: ${code}, Reason: ${reason}`);
        
        // 立即減少連接計數
        connectionCount = Math.max(0, connectionCount - 1);
        console.log(`📊 用戶斷線後連接數: ${connectionCount}`);
        
        // 立即處理用戶斷線
        handleUserDisconnect(userId);
        
        // 從用戶列表中移除
        users.delete(userId);
        console.log(`🧹 用戶 ${userId} 已從用戶列表中移除，剩餘用戶數: ${users.size}`);
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket錯誤 (${userId}):`, error);
    });
    
    // 心跳機制
    const heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
            userInfo.lastActivity = Date.now();
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 30000);
    
    ws.on('pong', () => {
        userInfo.lastActivity = Date.now();
    });
});

// 處理用戶消息
async function handleMessage(userId, message) { // 將函數改為異步
    const user = users.get(userId);
    if (!user) {
        console.error(`[Server ERROR] User ${userId} not found`);
        return;
    }
    
    user.lastActivity = Date.now();
    
    console.log(`[Server DEBUG] handleMessage CALLED for ${userId} (${user.name}). Type: '${message.type}'.`);

    switch (message.type) {
        case 'teacher_monitor':
            handleTeacherMonitor(userId, message);
            break;
        case 'join_room':
            await handleJoinRoom(userId, message.room, message.userName); // 等待異步的 handleJoinRoom 完成
            break;
        case 'leave_room':
            handleLeaveRoom(userId);
            break;
        case 'code_change':
            await handleCodeChange(userId, message); // 也需要異步處理代碼保存
            break;
        case 'cursor_change':
            handleCursorChange(userId, message);
            break;
        case 'chat_message':
            await handleChatMessage(userId, message); // 也需要異步處理聊天消息保存
            break;
        case 'teacher_broadcast':
            handleTeacherBroadcast(userId, message);
            break;
        case 'teacher_chat':
            handleTeacherChat(userId, message);
            break;
        case 'ai_request':
            await handleAIRequest(userId, message); // 也需要異步處理 AI 記錄保存
            break;
        case 'run_code':
            handleRunCode(userId, message);
            break;
        case 'save_code':
            await handleSaveCode(userId, message);
            break;
        case 'load_code':
            await handleLoadCode(userId, message);
            break;
        case 'ping':
            user.ws.send(JSON.stringify({ type: 'pong' }));
            break;
        default:
            console.log(`未知消息類型: ${message.type}`);
    }
}

// 教師監控處理
function handleTeacherMonitor(userId, message) {
    teacherMonitors.add(userId);
    const user = users.get(userId);
    if (user) {
        user.isTeacher = true;
    }
    console.log(`👨‍🏫 教師監控註冊: ${userId}`);
}

// 加入房間處理
async function handleJoinRoom(userId, roomId, userName) { // 將函數改為異步
    const user = users.get(userId);
    if (!user) return;
    
    // 驗證房間名稱，防止null或無效房間
    if (!roomId || roomId === 'null' || roomId === 'undefined' || roomId.trim() === '') {
        console.log(`❌ 無效的房間名稱: ${roomId}, 用戶: ${user.name}`);
        user.ws.send(JSON.stringify({
            type: 'join_room_error',
            error: 'invalid_room_name',
            message: '房間名稱無效，請輸入有效的房間名稱'
        }));
        return;
    }
    
    // 清理房間名稱
    roomId = roomId.trim();
    
    let dbUserId;
    
    if (isDatabaseAvailable) {
        // 數據庫模式：處理用戶創建/更新
        try {
            // 檢查用戶是否存在於數據庫，如果不存在則創建
            const [existingUsers] = await pool.execute('SELECT id FROM users WHERE username = ?', [userName]);
            
            if (existingUsers.length > 0) {
                dbUserId = existingUsers[0].id;
                // 更新用戶活動時間
                await pool.execute('UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', [dbUserId]);
                console.log(`👤 用戶 ${userName} (DB ID: ${dbUserId}) 已存在，更新活動時間。`);
            } else {
                const [newUserResult] = await pool.execute('INSERT INTO users (username) VALUES (?)', [userName]);
                dbUserId = newUserResult.insertId;
                console.log(`🆕 用戶 ${userName} (DB ID: ${dbUserId}) 已創建。`);
            }
            // 將數據庫用戶ID存儲到 WebSocket 用戶對象中
            user.dbUserId = dbUserId;

        } catch (error) {
            console.error(`❌ 處理用戶數據庫失敗 (${userName}):`, error.message);
            user.ws.send(JSON.stringify({
                type: 'join_room_error',
                error: 'database_error',
                message: '處理用戶信息時發生數據庫錯誤，請稍後再試。'
            }));
            return;
        }
    } else {
        // 本地模式：使用 WebSocket userId 作為模擬的 dbUserId
        user.dbUserId = userId;
        console.log(`🔄 本地模式：用戶 ${userName} 使用 WebSocket ID ${userId} 作為模擬數據庫ID`);
    }

    // 創建房間（如果不存在）
    if (!rooms.has(roomId)) {
        try {
            const newRoomData = await createRoom(roomId); // 等待異步的 createRoom 完成
            rooms.set(roomId, newRoomData);
            console.log(`🏠 服務器內部新房間實例化: ${roomId}`);
        } catch (error) {
            console.error(`❌ 服務器內部實例化房間失敗 ${roomId}:`, error.message);
            user.ws.send(JSON.stringify({
                type: 'join_room_error',
                error: 'room_creation_error',
                message: '創建房間時發生錯誤，請稍後再試。'
            }));
            return;
        }
    }
    
    const room = rooms.get(roomId);
    
    if (isDatabaseAvailable) {
        // 數據庫模式：從數據庫載入房間最新代碼和聊天記錄
        let latestCode = '';
        let latestVersion = 0;
        let chatHistory = [];
        try {
            // 載入最新代碼
            const [roomRows] = await pool.execute('SELECT current_code_content, current_code_version FROM rooms WHERE id = ?', [roomId]);
            if (roomRows.length > 0) {
                latestCode = roomRows[0].current_code_content || '';
                latestVersion = roomRows[0].current_code_version || 0;
                room.code = latestCode; // 更新內存中的房間代碼
                room.version = latestVersion; // 更新內存中的房間版本
                console.log(`📜 房間 ${roomId} 從數據庫載入最新代碼 (版本: ${latestVersion})`);
            }

            // 載入聊天歷史
            const [chatRows] = await pool.execute(
                'SELECT cm.message_content, cm.timestamp, u.username, u.id as user_id FROM chat_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.room_id = ? ORDER BY cm.timestamp ASC',
                [roomId]
            );
            chatHistory = chatRows.map(row => ({
                id: row.timestamp, // 使用 timestamp 作為 id，簡化處理
                userId: `db_user_${row.user_id}`, // 添加前綴以區分 WebSocket ID
                userName: row.username,
                message: row.message_content,
                timestamp: new Date(row.timestamp).getTime(),
                isHistory: true
            }));
            room.chatHistory = chatHistory; // 更新內存中的聊天歷史
            console.log(`💬 房間 ${roomId} 從數據庫載入 ${chatHistory.length} 條聊天記錄`);

        } catch (error) {
            console.error(`❌ 從數據庫載入房間數據失敗 (${roomId}):`, error.message);
            user.ws.send(JSON.stringify({
                type: 'join_room_error',
                error: 'database_load_error',
                message: '載入房間數據時發生數據庫錯誤，請稍後再試。'
            }));
            // 繼續執行，但代碼和聊天歷史可能不完整
        }
    } else {
        // 本地模式：使用內存中的房間數據
        console.log(`🔄 本地模式：房間 ${roomId} 使用內存數據 - 代碼版本: ${room.version}, 聊天記錄: ${room.chatHistory.length} 條`);
    }
    
    // 更新用戶信息
    if (userName && userName.trim()) {
        user.name = userName.trim();
    }
    
    // 檢查用戶是否已經在房間中（重連情況）
    const isReconnect = room.users.has(userId);
    
    // 添加或更新用戶到房間
    room.users.set(userId, {
        id: userId,
        dbUserId: user.dbUserId, // 儲存數據庫用戶 ID
        name: user.name,
        cursor: user.cursor,
        lastActivity: Date.now()
    });
    
    user.roomId = roomId;
    console.log(`👤 ${user.name} ${isReconnect ? '重連到' : '加入'} 房間: ${roomId}`);
    console.log(`📊 房間 ${roomId} 現有用戶數: ${room.users.size}`);
    
    // 發送房間狀態給加入的用戶
    user.ws.send(JSON.stringify({
        type: 'room_joined',
        roomId: roomId,
        code: room.code, // 發送從數據庫載入的最新代碼
        version: room.version, // 發送從數據庫載入的最新版本
        users: Array.from(room.users.values()),
        chatHistory: room.chatHistory || [], // 發送從數據庫載入的聊天歷史
        isReconnect: isReconnect
    }));
    
    // 如果有聊天歷史，發送給用戶
    if (room.chatHistory && room.chatHistory.length > 0) {
        console.log(`📜 發送 ${room.chatHistory.length} 條歷史聊天記錄給 ${user.name}`);
        room.chatHistory.forEach(chatMsg => {
            user.ws.send(JSON.stringify({
                type: 'chat_message',
                ...chatMsg,
                isHistory: true
            }));
        });
    }
    
    // 通知其他用戶
    if (isReconnect) {
        broadcastToRoom(roomId, {
            type: 'user_reconnected',
            userName: user.name,
            userId: userId,
            users: Array.from(room.users.values())
        }, userId);
    } else {
        broadcastToRoom(roomId, {
            type: 'user_joined',
            userName: user.name,
            userId: userId,
            users: Array.from(room.users.values())
        }, userId);
    }
    
    // 向教師監控推送統計更新
    broadcastStatsToTeachers();
}

// 離開房間處理
function handleLeaveRoom(userId) {
    const user = users.get(userId);
    if (!user || !user.roomId) return;
    
    const room = rooms.get(user.roomId);
    if (room) {
        const userName = user.name;
        const roomId = user.roomId;
        
        // 從房間中移除用戶
        room.users.delete(userId);
        
        // 通知其他用戶有用戶離開，並發送更新後的用戶列表
        broadcastToRoom(roomId, {
            type: 'user_left',
            userName: userName,
            userId: userId,
            users: Array.from(room.users.values())
        }, userId);
        
        console.log(`👋 ${userName} 離開房間: ${roomId}`);
        
        // 延長房間清理時間，避免測試期間被清理
        if (room.users.size === 0) {
            console.log(`⏰ 房間 ${roomId} 已空，將在 10 分鐘後清理`);
            setTimeout(() => {
                if (rooms.has(roomId) && rooms.get(roomId).users.size === 0) {
                    rooms.delete(roomId);
                    console.log(`🧹 清理空房間: ${roomId}`);
                    // 房間被清理時也更新統計
                    broadcastStatsToTeachers();
                }
            }, 600000); // 10分鐘後清理
        }
        
        // 向教師監控推送統計更新
        broadcastStatsToTeachers();
    }
    
    user.roomId = null;
}

// 代碼變更處理
async function handleCodeChange(userId, message) {
    const user = users.get(userId);
    if (!user || !user.roomId) return;
    
    const room = rooms.get(user.roomId);
    if (!room) return;
    
    const { code, version, operation, saveName } = message;
    let responseType = 'code_changed';
    
    // 處理自動同步（操作類型 = 'change'）
    if (operation === 'change') {
        console.log(`🔄 自動同步: ${user.name} 在房間 ${user.roomId}`);
        
        // 只更新內存，不保存到數據庫
        room.code = code;
        room.version = version || 0;
        room.lastModified = Date.now();
        
        // 標記用戶為活躍編輯者
        activeEditors.add(userId);
        setTimeout(() => activeEditors.delete(userId), 5000);
        
        responseType = 'code_synced';
    }
    
    // 處理手動保存（操作類型 = 'save'）
    else if (operation === 'save') {
        console.log(`💾 手動保存: ${user.name} 在房間 ${user.roomId}${saveName ? ` (名稱: ${saveName})` : ''}`);
        
        // 更新房間的代碼和版本
        room.code = code;
        room.version = (room.version || 0) + 1;
        room.lastModified = Date.now();
        
        if (isDatabaseAvailable) {
            // 數據庫模式：保存到數據庫
            try {
                // 更新房間的當前代碼
                await pool.execute(
                    'UPDATE rooms SET current_code_content = ?, current_code_version = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
                    [code, room.version, user.roomId]
                );
                
                // 保存到代碼歷史記錄
                await pool.execute(
                    'INSERT INTO code_history (room_id, user_id, code_content, version, save_name) VALUES (?, ?, ?, ?, ?)',
                    [user.roomId, user.dbUserId, code, room.version, saveName || null]
                );
                
                console.log(`✅ 代碼已保存到數據庫: 房間 ${user.roomId}, 版本 ${room.version}, 用戶 ${user.name}`);
            } catch (error) {
                console.error(`❌ 保存代碼到數據庫失敗:`, error.message);
                user.ws.send(JSON.stringify({
                    type: 'save_error',
                    error: 'database_save_failed',
                    message: '保存到數據庫失敗，代碼已保存到內存中'
                }));
            }
        } else {
            // 本地模式：使用原有的 localStorage 同步機制
            console.log(`🔄 本地模式：代碼已保存到內存，版本 ${room.version}`);
            
            // 保存到 JSON 文件以便重啟後恢復
            saveDataToFile();
        }
        
        responseType = 'code_saved';
    }
    
    // 廣播代碼變更
    broadcastToRoom(user.roomId, {
        type: responseType,
        code,
        version: room.version,
        userId: userId,
        userName: user.name,
        operation: operation,
        saveName: saveName,
        timestamp: Date.now()
    }, userId);
    
    // 教師監控更新
    broadcastToRoom(user.roomId, {
        type: 'teacher_code_update',
        roomId: user.roomId,
        code,
        version: room.version,
        userId: userId,
        userName: user.name,
        operation: operation,
        timestamp: Date.now()
    });
}

// 游標變更處理
function handleCursorChange(userId, message) {
    const user = users.get(userId);
    if (!user || !user.roomId) return;
    
    user.cursor = message.cursor;
    
    const room = rooms.get(user.roomId);
    if (room && room.users.has(userId)) {
        room.users.get(userId).cursor = message.cursor;
    }
    
    // 廣播游標變更
    broadcastToRoom(user.roomId, {
        type: 'cursor_changed',
        userId: userId,
        cursor: message.cursor,
        userName: user.name
    }, userId);
}

// 聊天消息處理
async function handleChatMessage(userId, message) { // 也需要異步處理聊天消息保存
    const user = users.get(userId);
    if (!user || !user.roomId) return;
    
    const room = rooms.get(user.roomId);
    if (!room) return;
    
    const chatMessage = {
        id: Date.now() + Math.random(), // 使用時間戳和隨機數生成唯一ID
        userId: userId,
        userName: user.name,
        message: message.message,
        timestamp: Date.now(),
        isHistory: false
    };
    
    if (isDatabaseAvailable) {
        // 數據庫模式：保存聊天消息到數據庫
        try {
            await pool.execute(
                'INSERT INTO chat_messages (room_id, user_id, message_content) VALUES (?, ?, ?)',
                [user.roomId, user.dbUserId, message.message]
            );
            console.log(`💬 聊天消息已保存到數據庫: 房間 ${user.roomId}, 用戶 ${user.name}`);
        } catch (error) {
            console.error(`❌ 保存聊天消息到數據庫失敗:`, error.message);
            // 繼續執行，即使數據庫保存失敗，也要發送消息
        }
    } else {
        // 本地模式：保存到內存
        console.log(`🔄 本地模式：聊天消息已保存到內存`);
    }
    
    // 無論數據庫是否可用，都要保存到內存以便即時顯示
    if (!room.chatHistory) {
        room.chatHistory = [];
    }
    room.chatHistory.push(chatMessage);
    
    // 限制聊天歷史記錄數量（保留最近500條）
    if (room.chatHistory.length > 500) {
        room.chatHistory = room.chatHistory.slice(-500);
    }
    
    console.log(`💬 ${user.name}: ${message.message}`);
    
    // 廣播聊天消息
    broadcastToRoom(user.roomId, {
        type: 'chat_message',
        ...chatMessage
    });
}

// 教師廣播處理
function handleTeacherBroadcast(userId, message) {
    if (!teacherMonitors.has(userId)) return;
    
    const { targetRoom, message: broadcastMessage, messageType } = message.data;
    
    console.log(`📢 教師廣播到房間 ${targetRoom}: ${broadcastMessage}`);
    
    if (targetRoom && rooms.has(targetRoom)) {
        broadcastToRoom(targetRoom, {
            type: 'teacher_broadcast',
            message: broadcastMessage,
            messageType: messageType || 'info',
            timestamp: Date.now()
        });
    }
}

// 教師聊天處理
function handleTeacherChat(userId, message) {
    if (!teacherMonitors.has(userId)) {
        console.log(`❌ 非教師用戶嘗試發送教師聊天: ${userId}`);
        return;
    }
    
    const { targetRoom, message: chatMessage, teacherName } = message.data;
    
    console.log(`💬 教師聊天到房間 ${targetRoom}: ${chatMessage}`);
    
    // 創建聊天消息對象
    const teacherChatMessage = {
        id: Date.now(),
        userId: userId,
        userName: teacherName || '教師',
        message: chatMessage,
        timestamp: Date.now(),
        isTeacher: true
    };
    
    if (targetRoom === 'all') {
        // 廣播到所有房間
        rooms.forEach((room, roomId) => {
            // 添加到房間聊天歷史
            room.chatHistory.push(teacherChatMessage);
            
            // 廣播給房間內的所有用戶
            broadcastToRoom(roomId, {
                type: 'chat_message',
                ...teacherChatMessage
            });
        });
        
        // 通知所有教師監控
        teacherMonitors.forEach(teacherId => {
            if (teacherId !== userId) { // 不發送給自己
                const teacher = users.get(teacherId);
                if (teacher && teacher.ws.readyState === WebSocket.OPEN) {
                    teacher.ws.send(JSON.stringify({
                        type: 'chat_message',
                        ...teacherChatMessage,
                        roomName: '所有房間'
                    }));
                }
            }
        });
        
        console.log(`📢 教師消息已廣播到所有房間`);
    } else if (targetRoom && rooms.has(targetRoom)) {
        // 發送到特定房間
        const room = rooms.get(targetRoom);
        room.chatHistory.push(teacherChatMessage);
        
        broadcastToRoom(targetRoom, {
            type: 'chat_message',
            ...teacherChatMessage
        });
        
        // 通知所有教師監控
        teacherMonitors.forEach(teacherId => {
            if (teacherId !== userId) { // 不發送給自己
                const teacher = users.get(teacherId);
                if (teacher && teacher.ws.readyState === WebSocket.OPEN) {
                    teacher.ws.send(JSON.stringify({
                        type: 'chat_message',
                        ...teacherChatMessage,
                        roomName: targetRoom
                    }));
                }
            }
        });
        
        console.log(`💬 教師消息已發送到房間 ${targetRoom}`);
    } else {
        console.log(`❌ 目標房間不存在: ${targetRoom}`);
    }
}

// 代碼執行處理
function handleRunCode(userId, message) {
    const user = users.get(userId);
    if (!user || !user.roomId) {
        console.log(`❌ 代碼執行失敗：用戶 ${userId} 不在房間中`);
        return;
    }
    
    const room = rooms.get(user.roomId);
    if (!room) {
        console.log(`❌ 代碼執行失敗：房間 ${user.roomId} 不存在`);
        return;
    }
    
    const code = message.code;
    console.log(`🔍 收到代碼執行請求:`);
    console.log(`   - 用戶: ${user.name} (${userId})`);
    console.log(`   - 房間: ${user.roomId}`);
    console.log(`   - 代碼長度: ${code ? code.length : 0} 字符`);
    console.log(`   - 代碼內容: "${code ? code.substring(0, 100) : 'undefined'}${code && code.length > 100 ? '...' : ''}"`);
    
    if (!code || !code.trim()) {
        console.log(`❌ 代碼為空，返回錯誤消息`);
        user.ws.send(JSON.stringify({
            type: 'code_execution_result',
            success: false,
            message: '錯誤：沒有代碼可以執行'
        }));
        return;
    }
    
    console.log(`🐍 ${user.name} 請求執行Python代碼 (${code.length} 字符)`);
    
    // 執行Python代碼
    executePythonCode(code, (result) => {
        console.log(`📤 準備發送執行結果給 ${user.name}:`, result);
        
        // 發送執行結果給請求用戶
        const responseMessage = {
            type: 'code_execution_result',
            success: result.success,
            message: result.output,
            timestamp: Date.now()
        };
        
        console.log(`📨 發送的完整消息:`, responseMessage);
        user.ws.send(JSON.stringify(responseMessage));
        
        // 廣播執行通知給房間內其他用戶（可選）
        broadcastToRoom(user.roomId, {
            type: 'user_executed_code',
            userName: user.name,
            timestamp: Date.now()
        }, userId);
        
        console.log(`✅ 代碼執行結果已發送給 ${user.name}`);
    });
}

// Python代碼執行函數
function executePythonCode(code, callback) {
    const { spawn } = require('child_process');
    
    // 檢查是否有Python解釋器
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    
    console.log(`🐍 開始執行Python代碼，使用命令: ${pythonCommand}`);
    console.log(`📝 代碼內容: ${code.substring(0, 200)}${code.length > 200 ? '...' : ''}`);
    
    // 首先測試Python是否可用
    const testPython = spawn(pythonCommand, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
    });
    
    testPython.on('close', (exitCode) => {
        if (exitCode !== 0) {
            console.log(`❌ Python解釋器測試失敗，退出代碼: ${exitCode}`);
            callback({
                success: false,
                output: `❌ 服務器環境錯誤：Python解釋器不可用 (命令: ${pythonCommand})`
            });
            return;
        }
        
        console.log(`✅ Python解釋器測試成功，開始執行用戶代碼`);
        
        // Python可用，執行用戶代碼
        executeUserCode();
    });
    
    testPython.on('error', (error) => {
        console.error(`❌ Python解釋器測試錯誤:`, error);
        callback({
            success: false,
            output: `❌ 服務器環境錯誤：無法找到Python解釋器 (${error.message})`
        });
    });
    
    function executeUserCode() {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        
        // 為複雜代碼創建臨時文件
        const tempDir = os.tmpdir();
        const tempFileName = `python_code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.py`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        try {
            // 將代碼寫入臨時文件
            console.log(`📝 將代碼寫入臨時文件: ${tempFilePath}`);
            fs.writeFileSync(tempFilePath, code, 'utf8');
            
            // 使用臨時文件執行Python代碼
            const python = spawn(pythonCommand, [tempFilePath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false
            });
            
            let output = '';
            let errorOutput = '';
            let hasTimedOut = false;
            
            // 設置手動超時
            const timeout = setTimeout(() => {
                hasTimedOut = true;
                python.kill('SIGKILL');
                // 清理臨時文件
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (e) {
                    console.warn(`⚠️ 無法刪除臨時文件: ${e.message}`);
                }
                callback({
                    success: false,
                    output: '❌ 執行超時（超過10秒），程式已被終止'
                });
            }, 10000);
            
            // 收集標準輸出
            python.stdout.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                console.log(`📤 Python輸出: ${chunk.trim()}`);
            });
            
            // 收集錯誤輸出
            python.stderr.on('data', (data) => {
                const chunk = data.toString();
                errorOutput += chunk;
                console.log(`❌ Python錯誤: ${chunk.trim()}`);
            });
            
            // 處理執行完成
            python.on('close', (exitCode) => {
                clearTimeout(timeout);
                
                // 清理臨時文件
                try {
                    fs.unlinkSync(tempFilePath);
                    console.log(`🗑️ 臨時文件已清理: ${tempFilePath}`);
                } catch (e) {
                    console.warn(`⚠️ 無法刪除臨時文件: ${e.message}`);
                }
                
                if (hasTimedOut) {
                    return; // 已經通過超時處理了
                }
                
                console.log(`🏁 Python進程結束，退出代碼: ${exitCode}`);
                
                if (exitCode === 0) {
                    // 執行成功
                    const result = output.trim() || '程式執行完成（無輸出）';
                    console.log(`✅ 執行成功: ${result}`);
                    callback({
                        success: true,
                        output: result
                    });
                } else {
                    // 執行失敗 - 處理錯誤信息，將臨時文件路徑替換為友好的信息
                    let error = errorOutput.trim() || `程式執行失敗（退出代碼: ${exitCode}）`;
                    
                    // 將臨時文件路徑替換為更友好的顯示
                    error = error.replace(new RegExp(tempFilePath.replace(/\\/g, '\\\\'), 'g'), '<您的代碼>');
                    error = error.replace(/File ".*?python_code_.*?\.py"/, 'File "<您的代碼>"');
                    
                    console.log(`❌ 執行失敗: ${error}`);
                    callback({
                        success: false,
                        output: error
                    });
                }
            });
            
            // 處理進程錯誤
            python.on('error', (error) => {
                clearTimeout(timeout);
                console.error(`🚨 Python進程錯誤:`, error);
                
                // 清理臨時文件
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (e) {
                    console.warn(`⚠️ 無法刪除臨時文件: ${e.message}`);
                }
                
                if (error.code === 'ENOENT') {
                    callback({
                        success: false,
                        output: '❌ 錯誤：服務器未安裝Python解釋器'
                    });
                } else if (error.code === 'ETIMEDOUT') {
                    callback({
                        success: false,
                        output: '❌ 執行超時，程式運行時間過長'
                    });
                } else {
                    callback({
                        success: false,
                        output: `❌ 執行錯誤: ${error.message}`
                    });
                }
            });
            
        } catch (error) {
            console.error(`🚨 臨時文件創建或Python執行異常:`, error);
            
            // 清理臨時文件（如果存在）
            try {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            } catch (e) {
                console.warn(`⚠️ 無法刪除臨時文件: ${e.message}`);
            }
            
            callback({
                success: false,
                output: `❌ 系統錯誤: ${error.message}`
            });
        }
    }
}

// AI 請求處理函數
async function handleAIRequest(userId, message) {
    const user = users.get(userId);
    if (!user) {
        console.log(`❌ AI 請求失敗：找不到用戶 ${userId}`);
        return;
    }
    
    const { action, code } = message;
    console.log(`🤖 收到 AI 請求 - 用戶: ${user.name}, 動作: ${action}, 代碼長度: ${code ? code.length : 0}`);
    
    if (!aiConfig.enabled || !aiConfig.openai_api_key) {
        user.ws.send(JSON.stringify({
            type: 'ai_response',
            action: action,
            response: '🚫 AI 助教功能未啟用或 API 密鑰未設定',
            error: 'ai_disabled'
        }));
        return;
    }
    
    let response = '';
    let error = null;
    
    try {
        // 根據動作類型調用對應的 AI 函數
        switch (action) {
            case 'explain_code':
                response = await analyzeCode(code);
                break;
            case 'check_errors':
                response = await debugCode(code);
                break;
            case 'improve_code':
                response = await improveCode(code);
                break;
            case 'collaboration_guide':
                response = await guideCollaboration(code, { userName: user.name, roomId: user.roomId });
                break;
            default:
                response = `❓ 未知的 AI 請求類型: ${action}。支援的功能：解釋程式(explain_code/analyze)、檢查錯誤(check_errors)、改進建議(improve_code/suggest)、協作指導(collaboration_guide)`;
                error = 'unknown_action';
        }
        
        console.log(`✅ AI 回應生成成功 - 用戶: ${user.name}, 動作: ${action}, 回應長度: ${response.length}`);
        
        if (isDatabaseAvailable && user.dbUserId) {
            // 數據庫模式：記錄 AI 請求和回應
            try {
                await pool.execute(
                    'INSERT INTO ai_logs (user_id, room_id, request_type, request_payload, response_payload) VALUES (?, ?, ?, ?, ?)',
                    [user.dbUserId, user.roomId || null, action, JSON.stringify({ code }), JSON.stringify({ response })]
                );
                console.log(`📝 AI 請求記錄已保存到數據庫: 用戶 ${user.name}, 動作 ${action}`);
            } catch (error) {
                console.error(`❌ 保存 AI 請求記錄到數據庫失敗:`, error.message);
                // 繼續執行，即使記錄保存失敗也要發送 AI 回應
            }
        } else {
            // 本地模式：可以選擇將 AI 請求記錄到內存或跳過
            console.log(`🔄 本地模式：跳過 AI 請求記錄保存`);
        }
        
    } catch (err) {
        console.error(`❌ AI 請求處理失敗 - 用戶: ${user.name}, 動作: ${action}, 錯誤: ${err.message}`);
        response = '😅 抱歉，AI 助教暫時無法處理您的請求，請稍後再試。';
        error = 'ai_processing_failed';
    }
    
    // 發送 AI 回應給用戶
    user.ws.send(JSON.stringify({
        type: 'ai_response',
        action: action,
        response: response,
        error: error,
        timestamp: Date.now()
    }));
    
    console.log(`📤 AI 回應已發送給用戶 ${user.name}`);
}

// AI分析函數
async function analyzeCode(code) {
    if (!aiConfig.openai_api_key) {
        return '⚠️ AI助教功能需要配置OpenAI API密鑰。請聯繫管理員。';
    }
    
    if (!code.trim()) {
        return '📝 目前沒有程式碼可以分析。請先輸入一些程式碼！';
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiConfig.openai_api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: aiConfig.prompts.system_role
                    },
                    {
                        role: 'user',
                        content: `${aiConfig.prompts.analysis_prompt}\n\n${code}`
                    }
                ],
                max_tokens: aiConfig.max_tokens,
                temperature: aiConfig.temperature
            })
        });
        
        if (!response.ok) {
            throw new Error(`OpenAI API錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('AI分析錯誤:', error);
        return '抱歉，AI分析功能暫時無法使用。請檢查網路連接或稍後再試。';
    }
}

// AI代碼審查
async function reviewCode(code) {
    if (!aiConfig.openai_api_key) {
        return '⚠️ AI助教功能需要配置OpenAI API密鑰。';
    }
    
    if (!code.trim()) {
        return '📝 目前沒有程式碼可以審查。';
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiConfig.openai_api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: aiConfig.prompts.system_role
                    },
                    {
                        role: 'user',
                        content: `${aiConfig.prompts.review_prompt}\n\n${code}`
                    }
                ],
                max_tokens: aiConfig.max_tokens,
                temperature: aiConfig.temperature
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        return '代碼審查功能暫時無法使用。';
    }
}

// AI除錯
async function debugCode(code) {
    if (!aiConfig.openai_api_key) {
        return '⚠️ AI助教功能需要配置OpenAI API密鑰。';
    }
    
    if (!code.trim()) {
        return '📝 目前沒有程式碼可以除錯。';
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiConfig.openai_api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: aiConfig.prompts.system_role
                    },
                    {
                        role: 'user',
                        content: `${aiConfig.prompts.debug_prompt}\n\n${code}`
                    }
                ],
                max_tokens: aiConfig.max_tokens,
                temperature: aiConfig.temperature
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        return '除錯功能暫時無法使用。';
    }
}

// AI改進建議
async function improveCode(code) {
    if (!aiConfig.openai_api_key) {
        return '⚠️ AI助教功能需要配置OpenAI API密鑰。';
    }
    
    if (!code.trim()) {
        return '📝 目前沒有程式碼可以改進。';
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiConfig.openai_api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: aiConfig.prompts.system_role
                    },
                    {
                        role: 'user',
                        content: `${aiConfig.prompts.improve_prompt}\n\n${code}`
                    }
                ],
                max_tokens: aiConfig.max_tokens,
                temperature: aiConfig.temperature
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        return '改進建議功能暫時無法使用。';
    }
}

// AI協作指導
async function guideCollaboration(code, context) {
    if (!aiConfig.openai_api_key) {
        return '⚠️ AI助教功能需要配置OpenAI API密鑰。';
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiConfig.openai_api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: aiConfig.prompts.system_role
                    },
                    {
                        role: 'user',
                        content: `${aiConfig.prompts.guide_prompt}\n\n在協作程式設計環境中，目前的程式碼是：\n\n${code}\n\n情境：${context || '一般協作'}\n\n請提供協作指導建議。`
                    }
                ],
                max_tokens: aiConfig.max_tokens,
                temperature: aiConfig.temperature
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        return '協作指導功能暫時無法使用。';
    }
}

// AI衝突分析
async function analyzeConflict(conflictData) {
    if (!aiConfig.openai_api_key) {
        return '⚠️ AI助教功能需要配置OpenAI API密鑰。請聯繫管理員。';
    }
    
    if (!conflictData) {
        return '❌ 衝突數據不完整，無法進行分析。';
    }
    
    const { userCode, serverCode, userVersion, serverVersion, conflictUser, roomId } = conflictData;
    
    try {
        const conflictPrompt = `
作為Python程式設計助教，請分析以下程式碼衝突情況並提供解決建議：

**衝突情況：**
- 房間：${roomId || '未知房間'}
- 衝突用戶：${conflictUser || '其他用戶'}
- 用戶版本：${userVersion || 'N/A'}
- 服務器版本：${serverVersion || 'N/A'}

**用戶的程式碼版本：**
\`\`\`python
${userCode || '(空白)'}
\`\`\`

**服務器的程式碼版本：**
\`\`\`python
${serverCode || '(空白)'}
\`\`\`

請提供：
1. 衝突原因分析
2. 兩個版本的差異比較
3. 具體的解決建議
4. 如何避免未來的衝突

請用繁體中文回答，語氣要友善且具教育性。
        `;
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiConfig.openai_api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: aiConfig.prompts.system_role
                    },
                    {
                        role: 'user',
                        content: conflictPrompt
                    }
                ],
                max_tokens: aiConfig.max_tokens,
                temperature: aiConfig.temperature
            })
        });
        
        if (!response.ok) {
            throw new Error(`OpenAI API錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('AI衝突分析錯誤:', error);
        return `抱歉，AI衝突分析功能暫時無法使用。請嘗試以下手動解決方案：

**🔍 衝突原因：**
多位同學同時修改了程式碼，導致版本不一致。

**💡 解決建議：**
1. **溝通協調：** 在聊天室討論各自的修改內容
2. **版本選擇：** 比較兩個版本，選擇較好的一個
3. **手動合併：** 將兩個版本的優點結合起來
4. **分工協作：** 將不同功能分配給不同同學

**🚀 預防措施：**
- 修改前先在聊天室告知其他同學
- 頻繁保存和同步程式碼
- 使用註解標記自己負責的部分`;
    }
}

// 用戶斷線處理
function handleUserDisconnect(userId) {
    const user = users.get(userId);
    if (!user) return;
    
    console.log(`🧹 處理用戶斷線: ${userId} (${user.name || '未知'})`);
    
    // 如果用戶在房間中，處理離開房間
    if (user.roomId) {
        const room = rooms.get(user.roomId);
        if (room && room.users.has(userId)) {
            const userName = user.name;
            const roomId = user.roomId;
            
            // 從房間中移除用戶
            room.users.delete(userId);
            
            // 通知其他用戶有用戶離開，並發送更新後的用戶列表
            broadcastToRoom(roomId, {
                type: 'user_left',
                userName: userName,
                userId: userId,
                users: Array.from(room.users.values()) // 發送更新後的用戶列表
            }, userId);
            
            console.log(`👋 ${userName} 離開房間: ${roomId}`);
            
            // 如果房間空了，清理房間
            if (room.users.size === 0) {
                console.log(`⏰ 房間 ${roomId} 已空，將在 2 分鐘後清理`);
                setTimeout(() => {
                    if (rooms.has(roomId) && rooms.get(roomId).users.size === 0) {
                        rooms.delete(roomId);
                        console.log(`🧹 清理空房間: ${roomId}`);
                        // 房間被清理時也更新統計
                        broadcastStatsToTeachers();
                    }
                }, 120000);
            }
        }
    }
    
    // 如果是教師監控，移除
    if (teacherMonitors.has(userId)) {
        teacherMonitors.delete(userId);
        console.log(`👨‍🏫 移除教師監控: ${userId}`);
    }
    
    // 從用戶列表中移除
    users.delete(userId);
    console.log(`✅ 用戶 ${userId} 已完全清理`);
}

// 廣播到房間
function broadcastToRoom(roomId, message, excludeUserId = null) {
    const room = rooms.get(roomId);
    if (!room) {
        console.log(`❌ 廣播失敗：房間 ${roomId} 不存在`);
        return;
    }
    
    console.log(`📡 開始廣播到房間 ${roomId}，房間內有 ${room.users.size} 個用戶`);
    
    let successCount = 0;
    let failCount = 0;
    
    room.users.forEach((roomUser, userId) => {
        if (userId !== excludeUserId) {
            const user = users.get(userId);
            if (user && user.ws.readyState === WebSocket.OPEN) {
                user.ws.send(JSON.stringify(message));
                successCount++;
                console.log(`✅ 消息已發送給用戶 ${user.name} (${userId})`);
            } else {
                failCount++;
                console.log(`❌ 用戶 ${userId} 連接不可用`);
            }
        } else {
            console.log(`⏭️ 跳過發送者 ${excludeUserId}`);
        }
    });
    
    console.log(`📊 廣播結果：成功 ${successCount} 個，失敗 ${failCount} 個`);
}

// 自動保存定時器
setInterval(() => {
    if (rooms.size > 0) {
        saveDataToFile();
    }
}, AUTO_SAVE_INTERVAL);

// 啟動時載入數據
loadDataFromFile();

// 啟動服務器
// Zeabur 和其他雲平台的端口處理
let PORT = process.env.PORT || process.env.WEB_PORT || 8080;

// 如果 PORT 是字符串形式的環境變數引用，嘗試解析
if (typeof PORT === 'string' && PORT.includes('WEB_PORT')) {
    PORT = process.env.WEB_PORT || 8080;
}

// 確保 PORT 是數字
PORT = parseInt(PORT) || 8080;

const HOST = process.env.HOST || '0.0.0.0';

// 抑制 HTTP/2 和 HTTP/3 的 TLS 警告（這些在 Zeabur 中是正常的）
if (process.env.NODE_ENV === 'production') {
    // 在生產環境中，Zeabur 會在負載均衡器層面處理 HTTPS
    // 這些警告是正常的，可以安全忽略
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
        // 過濾掉 HTTP/2 和 HTTP/3 的 TLS 相關警告
        if (warning.message && 
            (warning.message.includes('HTTP/2') || 
             warning.message.includes('HTTP/3') || 
             warning.message.includes('TLS'))) {
            // 靜默處理這些警告
            return;
        }
        // 其他警告仍然顯示
        console.warn('⚠️ Node.js 警告:', warning.message);
    });
}

// 添加啟動前檢查
console.log(`🔍 啟動前檢查:`);
console.log(`   - Node.js 版本: ${process.version}`);
console.log(`   - 環境: ${process.env.NODE_ENV || 'development'}`);
console.log(`   - 端口: ${PORT}`);
console.log(`   - 主機: ${HOST}`);
console.log(`   - 平台: ${process.platform}`);

server.listen(PORT, HOST, () => {
    console.log(`🚀 Python協作教學平台啟動成功！`);
    console.log(`📡 服務器運行在: ${HOST}:${PORT}`);
    
    // 檢測部署環境
    const isZeabur = process.env.ZEABUR || process.env.ZEABUR_URL;
    const isRender = process.env.RENDER || process.env.RENDER_SERVICE_ID;
    const isLocal = HOST.includes('localhost') || HOST.includes('127.0.0.1');
    
    console.log(`🌍 部署環境檢測:`);
    console.log(`   - Zeabur: ${isZeabur ? '✅' : '❌'}`);
    console.log(`   - Render: ${isRender ? '✅' : '❌'}`);
    console.log(`   - 本地開發: ${isLocal ? '✅' : '❌'}`);
    
    // 系統配置信息
    console.log(`\n⚙️ 系統配置:`);
    console.log(`   - 最大並發用戶: ${MAX_CONCURRENT_USERS}`);
    console.log(`   - 最大房間數: ${MAX_ROOMS}`);
    console.log(`   - 每房間最大用戶: ${MAX_USERS_PER_ROOM}`);
    console.log(`   - 自動保存間隔: ${AUTO_SAVE_INTERVAL / 1000}秒`);
    
    // 網路配置 - 根據環境動態生成
    let publicUrl;
    if (isZeabur && process.env.ZEABUR_URL) {
        publicUrl = process.env.ZEABUR_URL;
    } else if (isRender && process.env.RENDER_EXTERNAL_URL) {
        publicUrl = process.env.RENDER_EXTERNAL_URL;
    } else if (isLocal) {
        publicUrl = `http://${HOST}:${PORT}`;
    } else {
        publicUrl = PUBLIC_URL;
    }
    
    const wsUrl = publicUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    
    console.log(`\n🌐 網路配置:`);
    console.log(`   - 學生端: ${publicUrl}`);
    console.log(`   - 教師後台: ${publicUrl}/teacher`);
    console.log(`   - API狀態: ${publicUrl}/api/status`);
    console.log(`   - WebSocket: ${wsUrl}`);
    
    // 數據配置
    console.log(`\n💾 數據配置:`);
    console.log(`   - 數據庫模式: ${isDatabaseAvailable ? '✅ MySQL' : '❌ 本地存儲'}`);
    console.log(`   - 備份文件: collaboration_data.json`);
    console.log(`   - 數據目錄: ${DATA_DIR}`);
    
    // AI 配置狀態
    console.log(`\n🤖 AI 配置:`);
    console.log(`   - AI 助教: ${aiConfig.enabled ? '✅ 啟用' : '❌ 停用'}`);
    console.log(`   - API 密鑰: ${aiConfig.openai_api_key ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`   - 模型: ${aiConfig.model || 'gpt-3.5-turbo'}`);
    
    console.log(`\n✅ 系統就緒，等待連接...`);
});

// 優雅關閉
process.on('SIGTERM', () => {
    console.log('💾 收到SIGTERM信號，正在保存數據...');
    saveDataToFile();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('💾 收到SIGINT信號，正在保存數據...');
    saveDataToFile();
    process.exit(0);
});

// 數據清理功能
function cleanupInvalidData() {
    console.log('🧹 開始數據清理...');
    
    // 清理無效房間
    const invalidRooms = [];
    rooms.forEach((room, roomId) => {
        if (!roomId || roomId === 'null' || roomId === 'undefined' || roomId.trim() === '') {
            invalidRooms.push(roomId);
        } else if (room.users.size === 0) {
            // 清理空房間
            invalidRooms.push(roomId);
        }
    });
    
    invalidRooms.forEach(roomId => {
        rooms.delete(roomId);
        console.log(`🗑️ 清理無效房間: ${roomId}`);
    });
    
    // 清理孤立用戶（WebSocket已關閉的用戶）
    const invalidUsers = [];
    users.forEach((user, userId) => {
        if (!user.ws || user.ws.readyState === WebSocket.CLOSED) {
            invalidUsers.push(userId);
        }
    });
    
    invalidUsers.forEach(userId => {
        const user = users.get(userId);
        if (user) {
            handleUserDisconnect(userId);
            users.delete(userId);
            connectionCount = Math.max(0, connectionCount - 1);
            console.log(`🗑️ 清理孤立用戶: ${userId}`);
        }
    });
    
    // 修正連接計數
    const actualConnections = Array.from(users.values()).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN
    ).length;
    
    if (connectionCount !== actualConnections) {
        console.log(`🔧 修正連接計數: ${connectionCount} -> ${actualConnections}`);
        connectionCount = actualConnections;
    }
    
    console.log(`✅ 數據清理完成 - 房間數: ${rooms.size}, 用戶數: ${users.size}, 連接數: ${connectionCount}`);
}

// 定期數據清理
setInterval(cleanupInvalidData, 300000); // 每5分鐘清理一次

// 向教師監控推送統計更新
function broadcastStatsToTeachers() {
    if (teacherMonitors.size === 0) return;
    
    // 計算當前統計
    const actualConnections = Array.from(users.values()).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN
    ).length;
    
    const activeRooms = Array.from(rooms.values()).filter(room => 
        room.users.size > 0
    ).length;
    
    const studentsInRooms = Array.from(rooms.values()).reduce((total, room) => {
        const validUsers = Array.from(room.users.values()).filter(user => {
            const globalUser = users.get(user.id);
            return globalUser && globalUser.ws && globalUser.ws.readyState === WebSocket.OPEN;
        });
        return total + validUsers.length;
    }, 0);
    
    const nonTeacherUsers = Array.from(users.values()).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN && !user.isTeacher
    ).length;
    
    const statsUpdate = {
        type: 'stats_update',
        data: {
            activeRooms: activeRooms,
            onlineStudents: studentsInRooms, // 使用房間內學生數
            totalConnections: actualConnections,
            nonTeacherUsers: nonTeacherUsers,
            editCount: 0, // 可以後續添加編輯計數
            timestamp: Date.now()
        }
    };
    
    console.log(`📊 向 ${teacherMonitors.size} 個教師推送統計更新:`, statsUpdate.data);
    
    teacherMonitors.forEach(teacherId => {
        const teacher = users.get(teacherId);
        if (teacher && teacher.ws && teacher.ws.readyState === WebSocket.OPEN) {
            teacher.ws.send(JSON.stringify(statsUpdate));
        }
    });
}

// 處理代碼載入請求
async function handleLoadCode(userId, message) {
    const user = users.get(userId);
    if (!user || !user.roomId) {
        user.ws.send(JSON.stringify({
            type: 'code_loaded',
            success: false,
            error: '請先加入房間'
        }));
        return;
    }
    
    const roomId = message.roomId || user.roomId;
    const room = rooms.get(roomId);
    
    if (!room) {
        user.ws.send(JSON.stringify({
            type: 'code_loaded',
            success: false,
            error: '房間不存在'
        }));
        return;
    }
    
    const currentVersion = message.currentVersion || 0;
    const latestVersion = room.version || 0;
    const latestCode = room.code || '';
    
    console.log(`📥 ${user.name} 請求載入 - 當前版本: ${currentVersion}, 最新版本: ${latestVersion}`);
    
    // 比較版本，判斷是否已是最新
    const isAlreadyLatest = currentVersion >= latestVersion;
    
    // 發送響應
    user.ws.send(JSON.stringify({
        type: 'code_loaded',
        success: true,
        code: latestCode,
        version: latestVersion,
        currentVersion: currentVersion,
        isAlreadyLatest: isAlreadyLatest,
        roomId: roomId
    }));
    
    if (isAlreadyLatest) {
        console.log(`✅ ${user.name} 的代碼已是最新版本 (${currentVersion})`);
    } else {
        console.log(`🔄 ${user.name} 載入最新代碼：版本 ${currentVersion} → ${latestVersion}`);
    }
}

// 處理代碼保存（手動保存）
async function handleSaveCode(userId, message) {
    const user = users.get(userId);
    if (!user || !user.roomId) {
        user?.ws.send(JSON.stringify({
            type: 'save_code_error',
            error: '用戶未在房間中'
        }));
        return;
    }

    const room = rooms.get(user.roomId);
    if (!room) {
        user.ws.send(JSON.stringify({
            type: 'save_code_error',
            error: '房間不存在'
        }));
        return;
    }

    const { code, saveName } = message;
    const timestamp = Date.now();

    // 更新房間代碼和版本
    room.code = code;
    room.version++;
    room.lastEditedBy = user.name;
    room.lastActivity = timestamp;

    if (isDatabaseAvailable && user.dbUserId) {
        // 數據庫模式：保存到數據庫
        try {
            // 保存到代碼歷史表
            await pool.execute(
                'INSERT INTO code_history (room_id, user_id, code_content, version, save_name, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                [user.roomId, user.dbUserId, code, room.version, saveName || null, new Date(timestamp)]
            );

            // 更新房間表的當前代碼
            await pool.execute(
                'UPDATE rooms SET current_code_content = ?, current_code_version = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
                [code, room.version, user.roomId]
            );

            console.log(`💾 用戶 ${user.name} 手動保存代碼到數據庫 - 房間: ${user.roomId}, 版本: ${room.version}, 名稱: ${saveName || '未命名'}`);
        } catch (error) {
            console.error(`❌ 保存代碼到數據庫失敗:`, error.message);
            user.ws.send(JSON.stringify({
                type: 'save_code_error',
                error: '保存到數據庫失敗'
            }));
            return;
        }
    } else {
        // 本地模式：保存到內存和本地文件
        if (!room.codeHistory) {
            room.codeHistory = [];
        }
        
        room.codeHistory.push({
            code: code,
            version: room.version,
            saveName: saveName || `保存-${new Date(timestamp).toLocaleString()}`,
            timestamp: timestamp,
            savedBy: user.name
        });

        // 限制歷史記錄數量（本地模式）
        if (room.codeHistory.length > 50) {
            room.codeHistory = room.codeHistory.slice(-50);
        }

        console.log(`💾 用戶 ${user.name} 手動保存代碼到本地 - 房間: ${user.roomId}, 版本: ${room.version}, 名稱: ${saveName || '未命名'}`);
    }

    // 保存到本地文件
    saveDataToFile();

    // 發送成功回應
    user.ws.send(JSON.stringify({
        type: 'save_code_success',
        version: room.version,
        saveName: saveName || `保存-${new Date(timestamp).toLocaleString()}`,
        timestamp: timestamp
    }));

    // 廣播版本更新給房間內其他用戶
    broadcastToRoom(user.roomId, {
        type: 'code_version_updated',
        version: room.version,
        savedBy: user.name,
        saveName: saveName
    }, userId);
}