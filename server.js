const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const mysql = require('mysql2/promise'); // 引入 mysql2/promise 用於異步操作

const aiAssistant = require('./services/ai_assistant');

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
        console.log('🔧 開始初始化數據庫表...');
        
        // 首先創建基礎表（無外鍵依賴）
        
        // 1. 創建房間表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS rooms (
                id VARCHAR(100) PRIMARY KEY,
                current_code_content TEXT,
                current_code_version INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ 房間表創建成功');

        // 2. 創建用戶表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ 用戶表創建成功');

        // 3. 創建用戶名稱使用記錄表（無外鍵約束，避免複雜依賴）
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_names (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL,
                user_name VARCHAR(50) NOT NULL,
                room_id VARCHAR(100) NOT NULL,
                used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_room (user_id, room_id),
                INDEX idx_user_name (user_name),
                INDEX idx_room_id (room_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ 用戶名稱記錄表創建成功');

        // 4. 創建代碼歷史表（可選外鍵約束）
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS code_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(100),
                user_id VARCHAR(100),
                user_name VARCHAR(100),
                code_content TEXT,
                version INT,
                save_name VARCHAR(100),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_room_id (room_id),
                INDEX idx_user_id (user_id),
                INDEX idx_user_name (user_name),
                INDEX idx_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ 代碼歷史表創建成功');

        // 確保code_history表有所需的新字段（升級現有表）
        try {
            await connection.execute(`
                ALTER TABLE code_history 
                ADD COLUMN IF NOT EXISTS user_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ADD INDEX IF NOT EXISTS idx_user_name (user_name),
                ADD INDEX IF NOT EXISTS idx_timestamp (timestamp)
            `);
            console.log('✅ 代碼歷史表字段升級成功');
        } catch (alterError) {
            // MySQL可能不支持IF NOT EXISTS語法，嘗試單獨添加
            try {
                await connection.execute(`ALTER TABLE code_history ADD COLUMN user_name VARCHAR(100)`);
                console.log('✅ 添加user_name字段成功');
            } catch (e) {
                // 字段可能已存在，忽略錯誤
            }
            
            try {
                await connection.execute(`ALTER TABLE code_history ADD COLUMN timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
                console.log('✅ 添加timestamp字段成功');
            } catch (e) {
                // 字段可能已存在，忽略錯誤
            }
            
            try {
                await connection.execute(`ALTER TABLE code_history ADD INDEX idx_user_name (user_name)`);
                console.log('✅ 添加user_name索引成功');
            } catch (e) {
                // 索引可能已存在，忽略錯誤
            }
            
            try {
                await connection.execute(`ALTER TABLE code_history ADD INDEX idx_timestamp (timestamp)`);
                console.log('✅ 添加timestamp索引成功');
            } catch (e) {
                // 索引可能已存在，忽略錯誤
            }
        }

        // 5. 創建聊天消息表（可選外鍵約束）
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(100),
                user_id VARCHAR(100),
                message_content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_room_id (room_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ 聊天消息表創建成功');

        // 6. 創建AI請求記錄表（可選外鍵約束）
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ai_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(100),
                user_id VARCHAR(100),
                request_type VARCHAR(50),
                code_content TEXT,
                ai_response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_room_id (room_id),
                INDEX idx_user_id (user_id),
                INDEX idx_request_type (request_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ AI請求記錄表創建成功');

        console.log('✅ 數據庫表初始化完成 - 所有表創建成功');
        
        // 檢查表狀態
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`📊 當前數據庫包含 ${tables.length} 個表:`, tables.map(t => Object.values(t)[0]).join(', '));
        
    } catch (error) {
        console.error('❌ 數據庫表初始化失敗:', error.message);
        console.log('🔄 將使用本地存儲模式繼續運行');
        // 不再拋出錯誤，允許服務器繼續以本地模式運行
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
const rooms = {};  // 改回普通對象
const users = {};  // 改回普通對象
const teacherMonitors = new Set();
let userCounter = 1;
let connectionCount = 0;
let peakConnections = 0;
let totalConnections = 0;
let serverStartTime = Date.now();
let conflictCounter = 0;
let activeEditors = new Set();

// 載入AI配置 - 優先使用ai_config.json文件
let aiConfig = {};
try {
    // 優先嘗試載入配置文件（本地開發優先）
    const configPath = path.join(__dirname, 'ai_config.json');
    if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        aiConfig = JSON.parse(configData);
        console.log('✅ 使用 ai_config.json 文件配置');
        console.log(`🔑 API密鑰狀態: ${aiConfig.openai_api_key ? '已設定' : '未設定'}`);
        console.log(`🤖 模型: ${aiConfig.model || 'gpt-3.5-turbo'}`);
        console.log(`⚙️ AI功能狀態: ${aiConfig.enabled ? '啟用' : '停用'}`);
    } else if (process.env.OPENAI_API_KEY) {
        // 如果沒有配置文件，才使用環境變數配置（適合生產環境）
        aiConfig = {
            openai_api_key: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
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
        console.log('⚠️ 未找到 ai_config.json 文件且未設定環境變數，AI助教功能將停用');
            aiConfig = {
                openai_api_key: '',
                model: 'gpt-3.5-turbo',
                enabled: false
            };
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
    res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

// API狀態端點
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        version: '2.1.0',
        ai_enabled: aiConfig.enabled,
        rooms_count: Object.keys(rooms).length,
        users_count: Object.keys(users).length
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
    
    const roomsData = Object.values(rooms).map(room => {
        // 過濾有效用戶
        const validUsers = Object.values(room.users).filter(user => {
            return user.ws && user.ws.readyState === WebSocket.OPEN;
        });
        
        return {
            id: room.id,
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
    const actualConnections = Object.values(users).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN
    ).length;
    
    // 計算房間內學生總數
    const studentsInRooms = Object.values(rooms).reduce((total, room) => {
        const validUsers = Object.values(room.users || {}).filter(user => 
            user.ws && user.ws.readyState === WebSocket.OPEN
        );
        return total + validUsers.length;
    }, 0);
    
    // 計算非教師用戶數（排除教師監控連接）
    const nonTeacherUsers = Object.values(users).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN && !user.isTeacher
    ).length;
    
    console.log(`📊 教師監控統計 - 總連接: ${actualConnections}, 房間學生: ${studentsInRooms}, 非教師用戶: ${nonTeacherUsers}`);
    
    res.json({
        rooms: roomsData, // 使用處理過的房間數據而不是原始數據
        totalRooms: Object.keys(rooms).length,
        totalUsers: actualConnections, // 總連接數
        studentsInRooms: studentsInRooms, // 房間內學生數
        nonTeacherUsers: nonTeacherUsers, // 非教師用戶數
        serverStats: {
            uptime: Date.now() - serverStartTime,
            peakConnections: peakConnections,
            totalConnections: totalConnections,
            actualConnections: actualConnections,
            registeredUsers: Object.keys(users).length,
            teacherMonitors: teacherMonitors.size
        }
    });
});

// 獲取特定房間詳細信息
app.get('/api/teacher/room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms[roomId];
    
    if (!room) {
        return res.status(404).json({ error: '房間不存在' });
    }
    
    res.json({
        id: roomId,
        users: Object.values(room.users),
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
            rooms: Object.entries(rooms).map(([roomId, room]) => [
                roomId,
                {
                    ...room,
                    users: Object.values(room.users)
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
        console.log(`💾 協作數據已保存: ${Object.keys(rooms).length} 個房間`);
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
                        users: {}
                    };
                    
                    if (roomData.users && Array.isArray(roomData.users)) {
                        roomData.users.forEach(([userId, userData]) => {
                            room.users[userId] = userData;
                        });
                    }
                    
                    rooms[roomId] = room;
                });
                
                console.log(`📂 成功恢復 ${Object.keys(rooms).length} 個房間的協作數據`);
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
        users: {},
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

// WebSocket 連接處理
wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
    console.log(`🌐 新連接來自IP: ${clientIP}`);
    
    // 簡化用戶對象
    const userId = generateUserId();
    const userName = generateRandomUserName();
    
    ws.userId = userId;
    ws.userName = userName;
    ws.clientIP = clientIP;
    ws.joinTime = new Date();
    ws.isAlive = true;
    
    // 添加到全域用戶列表
    users[userId] = {
        id: userId,
        name: userName,
        ws: ws,
        joinTime: new Date(),
        isActive: true,
        roomId: null
    };
    
    console.log(`✅ 創建新用戶: ${userId} (${userName}) (IP: ${clientIP})`);
    console.log(`📊 全域用戶總數: ${Object.keys(users).length}`);
    
    // 心跳檢測
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    // 處理消息
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`[Server DEBUG] handleMessage CALLED for ${ws.userId} (${ws.userName}). Type: '${message.type}'.`);
            
            await handleMessage(ws, message);
        } catch (error) {
            console.error('❌ 解析消息失敗:', error);
            
            // 修復：使用客戶端期望的錯誤格式
            const errorMessage = {
                type: 'error',
                error: '消息格式錯誤',
                details: `JSON 解析失敗: ${error.message}`,
                timestamp: Date.now()
            };
            
            console.log(`📤 [Error] 發送錯誤消息給 ${ws.userId}:`, errorMessage);
            ws.send(JSON.stringify(errorMessage));
        }
    });
    
    // 連接關閉處理
    ws.on('close', () => {
        console.log(`👋 用戶 ${ws.userName} (${ws.userId}) 斷開連接`);
        
        // 從全域用戶列表中移除
        delete users[ws.userId];
        console.log(`🗑️ 從全域用戶列表中移除: ${ws.userId}, 剩餘用戶數: ${Object.keys(users).length}`);
        
        // 從房間中移除用戶
        if (ws.currentRoom && rooms[ws.currentRoom]) {
            const room = rooms[ws.currentRoom];
            if (room.users && room.users[ws.userId]) {
                delete room.users[ws.userId];
        
                // 廣播用戶離開消息
                broadcastToRoom(ws.currentRoom, {
                    type: 'user_left',
                    userName: ws.userName,
                    userId: ws.userId,
                    timestamp: Date.now()
                }, ws.userId);
                
                console.log(`👋 ${ws.userName} 離開房間: ${ws.currentRoom}`);
                
                // 如果房間空了，清理房間
                if (Object.keys(room.users).length === 0) {
                    console.log(`⏰ 房間 ${ws.currentRoom} 已空，將在 2 分鐘後清理`);
                    setTimeout(() => {
                        if (rooms[ws.currentRoom] && Object.keys(rooms[ws.currentRoom].users).length === 0) {
                            delete rooms[ws.currentRoom];
                            console.log(`🧹 清理空房間: ${ws.currentRoom}`);
        }
                    }, 120000);
                }
            }
        }
    });

    // 錯誤處理
    ws.on('error', (error) => {
        console.error(`❌ WebSocket 錯誤 (${ws.userId}):`, error);
    });
});

// 全局唯一的用戶ID，用於識別WebSocket連接
function generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function generateRandomUserName() {
    const adjectives = ['活躍的', '聪明的', '勇敢的', '冷静的', '好奇的', '勤奋的', '优雅的', '友好的', '慷慨的', '快乐的', '诚实的', '謙虛的', '樂觀的', '熱情的', '理性的', '可靠的', '自信的', '體貼的', '機智的', '專注的'];
    const nouns = ['貓咪', '狗狗', '小鳥', '老虎', '獅子', '大象', '猴子', '熊貓', '松鼠', '兔子', '狐狸', '海豚', '鯨魚', '企鵝', '袋鼠', '考拉', '蝴蝶', '蜜蜂', '螞蟻', '蜘蛛'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 900) + 100; // 產生 100-999 的隨機數
    return `${adjective}${noun}${number}`;
}

// 處理 WebSocket 消息
async function handleMessage(ws, message) {
    switch (message.type) {
        case 'ping':
            // 心跳回應
            ws.send(JSON.stringify({
                type: 'pong',
                timestamp: Date.now()
            }));
            break;

        case 'join_room':
            await handleJoinRoom(ws, message);
            break;

        case 'leave_room':
            handleLeaveRoom(ws, message);
            break;

        case 'code_change':
            handleCodeChange(ws, message);
            break;

        case 'cursor_change':
            handleCursorChange(ws, message);
            break;

        case 'chat_message':
            await handleChatMessage(ws, message);
            break;

        case 'ai_request':
            await handleAIRequest(ws, message);
            break;

        case 'conflict_notification':
            handleConflictNotification(ws, message);
            break;

        case 'teacher_monitor':
            handleTeacherMonitor(ws, message);
            break;

        case 'teacher_broadcast':
            handleTeacherBroadcast(ws, message);
            break;

        case 'teacher_chat':
            handleTeacherChat(ws, message);
            break;

        case 'run_code':
            handleRunCode(ws, message);
            break;

        case 'load_code':
            await handleLoadCode(ws, message);
            break;

        case 'save_code':
            await handleSaveCode(ws, message);
            break;

        case 'get_history':
            await handleGetHistory(ws, message);
            break;

        default:
            console.warn(`⚠️ 未知消息類型: ${message.type} from ${ws.userId}`);
            
            // 修復：使用客戶端期望的錯誤格式
            const errorMessage = {
                type: 'error',
                error: `未知消息類型: ${message.type}`,
                details: `服務器不支援消息類型 "${message.type}"，請檢查客戶端代碼`,
                timestamp: Date.now()
            };
            
            console.log(`📤 [Error] 發送未知消息類型錯誤給 ${ws.userId}:`, errorMessage);
            ws.send(JSON.stringify(errorMessage));
    }
}

// 處理加入房間
async function handleJoinRoom(ws, message) {
    const roomId = message.room;
    const userName = message.userName;
    
    if (!roomId || !userName) {
        ws.send(JSON.stringify({
            type: 'join_room_error',
            error: 'missing_params',
            message: '房間名稱和用戶名稱不能為空'
        }));
        return;
    }
    
    console.log(`🚀 用戶 ${userName} 嘗試加入房間 ${roomId}`);

    // 檢查房間是否存在，如果不存在則創建
    if (!rooms[roomId]) {
        const newRoom = await createRoom(roomId);
        rooms[roomId] = newRoom;
        console.log(`[Server DEBUG] 全域 rooms Map 已更新，新增房間: ${roomId}`);
    }

    const room = rooms[roomId];
    
    // 確保 room 對象及其 users 屬性存在
    if (!room || !room.users) {
        ws.send(JSON.stringify({
            type: 'join_room_error',
            error: 'room_error',
            message: '房間初始化失敗'
        }));
        return;
    }

    // 檢查用戶名是否已存在於該房間
    const isUserNameTaken = Object.values(room.users).some(user => 
        user.userName === userName && user.ws.readyState === WebSocket.OPEN
    );

    if (isUserNameTaken) {
        ws.send(JSON.stringify({
            type: 'join_room_error',
            error: 'name_duplicate',
            message: '此用戶名稱在房間中已被使用，請使用其他名稱'
        }));
        return;
    }

    // 清理房間中的無效連接
    const invalidUserIds = Object.keys(room.users).filter(userId => 
        !room.users[userId].ws || room.users[userId].ws.readyState !== WebSocket.OPEN
    );
    
    invalidUserIds.forEach(userId => {
        delete room.users[userId];
        console.log(`🧹 清理房間 ${roomId} 中的無效用戶: ${userId}`);
    });

    // 檢查用戶是否已在房間中（重連情況）
    const existingUserInRoom = room.users[ws.userId];
    const isReconnect = existingUserInRoom && existingUserInRoom.userName === userName;

    try {
        // 更新用戶信息
        ws.currentRoom = roomId;
        ws.userName = userName;
        
        // 更新全域用戶信息
        if (users[ws.userId]) {
            users[ws.userId].roomId = roomId;
            users[ws.userId].name = userName;
            console.log(`📝 更新全域用戶信息: ${ws.userId} -> 房間: ${roomId}, 名稱: ${userName}`);
        }
        
        // 添加用戶到房間
        room.users[ws.userId] = {
            userId: ws.userId,
            userName: userName,
            ws: ws,
            joinTime: new Date(),
            isActive: true,
            cursor: null
        };

        // 獲取當前有效用戶列表
        const activeUsers = Object.values(room.users)
            .filter(u => u.ws && u.ws.readyState === WebSocket.OPEN)
            .map(u => ({
                userId: u.userId,
                userName: u.userName,
                isActive: u.isActive
            }));

        // 發送加入成功消息給當前用戶
        ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: roomId,
            userName: userName,
            userId: ws.userId,
            code: room.code || '',
            version: room.version || 0,
            users: activeUsers,
            chatHistory: room.chatHistory || [],
            isReconnect: isReconnect
        }));
        
        // 廣播用戶加入消息給房間內其他用戶
        broadcastToRoom(roomId, {
            type: isReconnect ? 'user_reconnected' : 'user_joined',
            userName: userName,
            userId: ws.userId,
            users: activeUsers
        }, ws.userId);
        
        console.log(`✅ ${userName} 成功加入房間 ${roomId}，當前在線用戶: ${activeUsers.length} 人`);
    } catch (error) {
        console.error(`❌ 加入房間時發生錯誤:`, error);
        // 發生錯誤時，清理已添加的用戶信息
        if (room.users[ws.userId]) {
            delete room.users[ws.userId];
        }
        ws.currentRoom = null;
        ws.userName = null;
        
        ws.send(JSON.stringify({
            type: 'join_room_error',
            error: 'server_error',
            message: '加入房間時發生錯誤，請稍後重試'
        }));
    }
}

// 離開房間處理
function handleLeaveRoom(ws, message) {
    const roomId = ws.currentRoom;
    const userName = ws.userName;
    
    if (!roomId || !rooms[roomId]) {
        console.warn(`⚠️ 用戶嘗試離開不存在的房間: ${roomId}`);
        return;
    }
    
    const room = rooms[roomId];
    
    // 從房間中移除用戶
    if (room.users[ws.userId]) {
        delete room.users[ws.userId];
        console.log(`👋 用戶 ${userName} 離開房間 ${roomId}`);
        
        // 獲取更新後的用戶列表
        const activeUsers = Object.values(room.users)
            .filter(u => u.ws && u.ws.readyState === WebSocket.OPEN)
            .map(u => ({
                userId: u.userId,
                userName: u.userName,
                isActive: u.isActive
            }));
        
        // 廣播用戶離開消息（包含更新後的用戶列表）
        broadcastToRoom(roomId, {
            type: 'user_left',
            userName: userName,
            users: activeUsers
        });
        
        // 如果房間空了，清理房間
        if (Object.keys(room.users).length === 0) {
            console.log(`🧹 清理空房間: ${roomId}`);
            delete rooms[roomId];
        }
    }
    
    // 清理用戶的房間信息
    ws.currentRoom = null;
    ws.userName = null;
}

// 游標變更處理
function handleCursorChange(ws, message) {
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        console.error(`❌ 房間不存在: ${roomId}`);
        return;
}

    const room = rooms[roomId];
    if (room.users[ws.userId]) {
        room.users[ws.userId].cursor = message.cursor;
    }
    
    // 廣播游標變更
    broadcastToRoom(roomId, {
        type: 'cursor_changed',
        userId: ws.userId,
        cursor: message.cursor,
        userName: ws.userName
    }, ws.userId);
}

// 聊天消息處理
async function handleChatMessage(ws, message) {
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        console.error(`❌ 房間不存在: ${roomId}`);
        return;
    }

    const room = rooms[roomId];
    const chatMessage = {
        id: Date.now() + Math.random(),
        userId: ws.userId,
        userName: ws.userName,
        message: message.message,
        timestamp: Date.now(),
        isHistory: false,
        roomId: roomId  // 添加房間ID
    };

    // 添加到房間聊天歷史
    room.chatHistory = room.chatHistory || [];
    room.chatHistory.push(chatMessage);
    
    if (isDatabaseAvailable) {
        try {
            await pool.execute(
                'INSERT INTO chat_messages (room_id, user_id, message_content) VALUES (?, ?, ?)',
                [roomId, ws.userId, message.message]
            );
            console.log(`💬 聊天消息已保存到數據庫: 房間 ${roomId}, 用戶 ${ws.userName}`);
        } catch (error) {
            console.error(`❌ 保存聊天消息到數據庫失敗:`, error.message);
        }
    } else {
        saveDataToFile();
    }
    
    console.log(`💬 ${ws.userName}: ${message.message}`);
    
    // 廣播到房間內所有用戶
    broadcastToRoom(roomId, {
        type: 'chat_message',
        ...chatMessage
    });

    // 廣播到所有教師監控
    console.log(`👨‍🏫 正在廣播消息給教師，當前教師數量: ${teacherMonitors.size}`);
    teacherMonitors.forEach(teacherId => {
        const teacher = users[teacherId];
        if (teacher && teacher.ws && teacher.ws.readyState === WebSocket.OPEN) {
            try {
                teacher.ws.send(JSON.stringify({
                    type: 'chat_message',
                    ...chatMessage,
                    fromRoom: roomId  // 添加來源房間資訊
                }));
                console.log(`✅ 消息已發送給教師 ${teacherId}`);
            } catch (error) {
                console.error(`❌ 發送消息給教師 ${teacherId} 失敗:`, error);
            }
        } else {
            console.log(`⚠️ 教師 ${teacherId} 的WebSocket連接不可用`);
        }
    });
}

// 教師監控註冊處理
function handleTeacherMonitor(ws, message) {
    const action = message.data?.action || message.action || 'register'; // 兼容多種格式
    
    console.log(`👨‍🏫 [Teacher Monitor] 收到教師監控請求:`, message);
    console.log(`👨‍🏫 [Teacher Monitor] 動作:`, action);
    
    if (action === 'register') {
        // 註冊為教師監控
        teacherMonitors.add(ws.userId);
        
        // 確保用戶存在並更新狀態
        if (!users[ws.userId]) {
            users[ws.userId] = {
                ws: ws,
                userName: message.data?.teacherName || '教師',
                isTeacher: true,
                rooms: new Set()
            };
        } else {
            users[ws.userId].isTeacher = true;
            users[ws.userId].ws = ws; // 更新 WebSocket 連接
        }
        
        console.log(`👨‍🏫 教師監控已註冊: ${ws.userId}`);
        console.log(`👨‍🏫 當前教師數量: ${teacherMonitors.size}`);
        
        // 發送歡迎消息
        ws.send(JSON.stringify({
            type: 'teacher_monitor_registered',
            userId: ws.userId,
            message: '教師監控已連接',
            timestamp: Date.now()
        }));
        
        // 發送當前統計信息
        broadcastStatsToTeachers();
        
        // 發送所有房間的聊天歷史
        Object.entries(rooms).forEach(([roomId, room]) => {
            if (room.chatHistory && room.chatHistory.length > 0) {
                ws.send(JSON.stringify({
                    type: 'chat_history',
                    roomId: roomId,
                    messages: room.chatHistory
                }));
            }
        });
        
    } else if (action === 'unregister') {
        // 取消註冊教師監控
        teacherMonitors.delete(ws.userId);
        if (users[ws.userId]) {
            users[ws.userId].isTeacher = false;
        }
        
        console.log(`👨‍🏫 教師監控已取消註冊: ${ws.userId}`);
    } else {
        // 默認行為：如果沒有指定action，直接註冊為教師
        teacherMonitors.add(ws.userId);
        
        // 確保用戶存在並更新狀態
        if (!users[ws.userId]) {
            users[ws.userId] = {
                ws: ws,
                userName: message.data?.teacherName || '教師',
                isTeacher: true,
                rooms: new Set()
            };
        } else {
            users[ws.userId].isTeacher = true;
            users[ws.userId].ws = ws; // 更新 WebSocket 連接
        }
        
        console.log(`👨‍🏫 教師監控已自動註冊: ${ws.userId} (默認行為)`);
        
        // 發送歡迎消息
        ws.send(JSON.stringify({
            type: 'teacher_monitor_registered',
            userId: ws.userId,
            message: '教師監控已連接',
            timestamp: Date.now()
        }));
        
        // 發送當前統計信息
        broadcastStatsToTeachers();
        
        // 發送所有房間的聊天歷史
        Object.entries(rooms).forEach(([roomId, room]) => {
            if (room.chatHistory && room.chatHistory.length > 0) {
                ws.send(JSON.stringify({
                    type: 'chat_history',
                    roomId: roomId,
                    messages: room.chatHistory
                }));
            }
        });
    }
}

// 教師廣播處理
function handleTeacherBroadcast(ws, message) {
    console.log(`📢 [Teacher Broadcast] 收到教師廣播請求:`, message);
    console.log(`📢 [Teacher Broadcast] 用戶 ${ws.userId} 是否為教師:`, teacherMonitors.has(ws.userId));
    
    if (!teacherMonitors.has(ws.userId)) {
        console.log(`❌ 非教師用戶嘗試發送廣播: ${ws.userId}`);
        ws.send(JSON.stringify({
            type: 'error',
            error: '權限不足',
            message: '只有教師可以發送廣播消息'
        }));
        return;
    }
    
    const { targetRoom, message: broadcastMessage, messageType } = message.data || message;
    
    console.log(`📢 教師廣播到房間 ${targetRoom}: ${broadcastMessage}`);
    
    if (targetRoom === 'all') {
        // 廣播到所有房間
        Object.keys(rooms).forEach(roomId => {
            broadcastToRoom(roomId, {
                type: 'teacher_broadcast',
                message: broadcastMessage,
                messageType: messageType || 'info',
                timestamp: Date.now(),
                from: 'teacher'
            });
        });
        console.log(`📢 已廣播到所有房間: ${Object.keys(rooms).length} 個房間`);
    } else if (targetRoom && rooms[targetRoom]) {
        broadcastToRoom(targetRoom, {
            type: 'teacher_broadcast',
            message: broadcastMessage,
            messageType: messageType || 'info',
            timestamp: Date.now(),
            from: 'teacher'
        });
        console.log(`📢 已廣播到房間 ${targetRoom}`);
    } else {
        console.log(`❌ 目標房間不存在: ${targetRoom}`);
        ws.send(JSON.stringify({
            type: 'error',
            error: '房間不存在',
            message: `房間 "${targetRoom}" 不存在`
        }));
    }
}

// 教師聊天處理
function handleTeacherChat(ws, message) {
    if (!teacherMonitors.has(ws.userId)) {
        console.log(`❌ 非教師用戶嘗試發送教師聊天: ${ws.userId}`);
        ws.send(JSON.stringify({
            type: 'error',
            error: '權限不足',
            message: '只有教師可以發送教師消息'
        }));
        return;
    }
    
    const { targetRoom, message: chatMessage, teacherName } = message.data;
    
    console.log(`💬 教師聊天到房間 ${targetRoom}: ${chatMessage}`);
    
    // 創建聊天消息對象
    const teacherChatMessage = {
        id: Date.now(),
        userId: ws.userId,
        userName: teacherName || '教師',
        message: chatMessage,
        timestamp: Date.now(),
        isTeacher: true,
        roomName: targetRoom === 'all' ? '所有房間' : targetRoom
    };
    
    if (targetRoom === 'all') {
        // 廣播到所有房間
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            if (!room.chatHistory) {
                room.chatHistory = [];
            }
            
            // 添加到房間聊天歷史
            room.chatHistory.push({
                ...teacherChatMessage,
                roomName: roomId
            });
            
            // 廣播給房間內的所有用戶
            broadcastToRoom(roomId, {
                type: 'chat_message',
                ...teacherChatMessage,
                roomName: roomId
            });
        });
        
        // 通知所有教師監控
        teacherMonitors.forEach(teacherId => {
            if (teacherId !== ws.userId) { // 不發送給自己
                const teacher = users[teacherId];
                if (teacher && teacher.ws && teacher.ws.readyState === WebSocket.OPEN) {
                    teacher.ws.send(JSON.stringify({
                        type: 'chat_message',
                        ...teacherChatMessage
                    }));
                }
            }
        });
        
        console.log(`📢 教師消息已廣播到所有房間`);
    } else if (rooms[targetRoom]) {
        // 發送到特定房間
        const room = rooms[targetRoom];
        if (!room.chatHistory) {
            room.chatHistory = [];
        }
        
        room.chatHistory.push(teacherChatMessage);
        
        broadcastToRoom(targetRoom, {
            type: 'chat_message',
            ...teacherChatMessage
        });
        
        // 通知所有教師監控
        teacherMonitors.forEach(teacherId => {
            if (teacherId !== ws.userId) { // 不發送給自己
                const teacher = users[teacherId];
                if (teacher && teacher.ws && teacher.ws.readyState === WebSocket.OPEN) {
                    teacher.ws.send(JSON.stringify({
                        type: 'chat_message',
                        ...teacherChatMessage
                    }));
                }
            }
        });
        
        console.log(`💬 教師消息已發送到房間 ${targetRoom}`);
    } else {
        console.log(`❌ 目標房間不存在: ${targetRoom}`);
        ws.send(JSON.stringify({
            type: 'error',
            error: '房間不存在',
            message: `房間 "${targetRoom}" 不存在`
        }));
    }
}

// 代碼執行處理
function handleRunCode(ws, message) {
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        console.log(`❌ 代碼執行失敗：用戶 ${ws.userId} 不在房間中`);
        return;
    }
    
    const room = rooms[roomId];
    if (!room) {
        console.log(`❌ 代碼執行失敗：房間 ${roomId} 不存在`);
        return;
    }
    
    const code = message.code;
    console.log(`🔍 收到代碼執行請求:`);
    console.log(`   - 用戶: ${ws.userName} (${ws.userId})`);
    console.log(`   - 房間: ${roomId}`);
    console.log(`   - 代碼長度: ${code ? code.length : 0} 字符`);
    console.log(`   - 代碼內容: "${code ? code.substring(0, 100) : 'undefined'}${code && code.length > 100 ? '...' : ''}"`);
    
    if (!code || !code.trim()) {
        console.log(`❌ 代碼為空，返回錯誤消息`);
        ws.send(JSON.stringify({
            type: 'code_execution_result',
            success: false,
            message: '錯誤：沒有代碼可以執行'
        }));
        return;
    }
    
    console.log(`🐍 ${ws.userName} 請求執行Python代碼 (${code.length} 字符)`);
    
    // 執行Python代碼
    executePythonCode(code, (result) => {
        console.log(`📤 準備發送執行結果給 ${ws.userName}:`, result);
        
        // 發送執行結果給請求用戶
        const responseMessage = {
            type: 'code_execution_result',
            success: result.success,
            message: result.output,
            timestamp: Date.now()
        };
        
        console.log(`📨 發送的完整消息:`, responseMessage);
        ws.send(JSON.stringify(responseMessage));
        
        // 廣播執行通知給房間內其他用戶（可選）
        broadcastToRoom(roomId, {
            type: 'user_executed_code',
            userName: ws.userName,
            timestamp: Date.now()
        }, ws.userId);
        
        console.log(`✅ 代碼執行結果已發送給 ${ws.userName}`);
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
                    if (output.trim()) {
                        // 有輸出內容
                        console.log(`✅ 執行成功: ${output.trim()}`);
                        callback({
                            success: true,
                            output: output.trim()
                        });
                    } else {
                        // 無輸出內容，嘗試智能分析並提供建議
                        console.log(`🔍 程式執行成功但無輸出，分析代碼內容...`);
                        
                        let smartHelpMessage = analyzeCodeForOutput(code);
                        
                        console.log(`✅ 執行成功但無輸出，已提供智能建議`);
                        callback({
                            success: true,
                            output: smartHelpMessage
                        });
                    }
                } else {
                    // 執行失敗 - 處理錯誤信息，將臨時文件路徑替換為友好的信息
                    let error = errorOutput.trim() || `程式執行失敗（退出代碼: ${exitCode}）`;
                    
                    // 將臨時文件路徑替換為更友好的顯示
                    error = error.replace(new RegExp(tempFilePath.replace(/\\/g, '\\\\'), 'g'), '<您的代碼>');
                    error = error.replace(/File ".*?python_code_.*?\.py"/, 'File "<您的代碼>"');
                    
                    // 修復反斜杠處理問題，避免 /n 錯誤
                    // 正確的方式：先處理實際的反斜杠+n組合，然後處理轉義的\n
                    error = error.replace(/\\n/g, '\n');
                    
                    // 額外檢查：如果包含 "/n" (錯誤的反斜杠)，替換為正確的換行
                    error = error.replace(/\/n/g, '\n');
                    
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

// 智能分析無輸出代碼並提供建議
function analyzeCodeForOutput(code) {
    const lines = code.trim().split('\n');
    const lastLine = lines[lines.length - 1].trim();
    const variables = [];
    const calculations = [];
    
    // 分析代碼中的變數賦值和計算
    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // 檢測變數賦值 (排除函數定義和控制結構)
        const assignmentMatch = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
        if (assignmentMatch && 
            !trimmedLine.startsWith('def ') && 
            !trimmedLine.includes('if ') && 
            !trimmedLine.includes('for ') && 
            !trimmedLine.includes('while ')) {
            
            const varName = assignmentMatch[1];
            const value = assignmentMatch[2];
            
            variables.push(varName);
            
            // 檢測是否是計算表達式
            if (/[\+\-\*\/\%\*\*]/.test(value) || /\d/.test(value)) {
                calculations.push({ varName, expression: value, lineNumber: index + 1 });
            }
        }
    });
    
    // 生成智能建議
    let message = '程式執行完成（無顯示輸出）\n\n';
    
    if (calculations.length > 0) {
        // 有計算結果的變數
        message += '🔢 **發現計算結果，建議顯示：**\n';
        calculations.forEach(calc => {
            message += `• 第${calc.lineNumber}行：${calc.varName} = ${calc.expression}\n`;
            message += `  建議加上：print("${calc.varName} =", ${calc.varName})\n`;
        });
        
        // 提供完整的改進代碼
        message += '\n📝 **完整的建議代碼：**\n```python\n';
        lines.forEach(line => {
            message += line + '\n';
        });
        
        // 為最重要的變數添加print語句
        const mainVar = calculations[calculations.length - 1]; // 最後一個計算
        message += `print("${mainVar.varName} =", ${mainVar.varName})\n`;
        message += '```\n';
        
    } else if (variables.length > 0) {
        // 有變數但沒有計算
        message += '📦 **發現變數賦值，建議顯示：**\n';
        variables.slice(-3).forEach(varName => { // 只顯示最後3個變數
            message += `• print("${varName} =", ${varName})\n`;
        });
        
    } else {
        // 沒有變數，提供一般建議
        message += '💡 **程式碼執行建議：**\n';
        message += '• 使用 print() 來顯示結果：print("Hello World")\n';
        message += '• 顯示計算結果：print(5 + 3)\n';
        message += '• 顯示變數值：print(變數名稱)\n';
    }
    
    // 添加常用範例
    message += '\n💡 **常用顯示範例：**\n';
    message += '• 顯示文字：print("歡迎使用Python！")\n';
    message += '• 顯示計算：print("答案是:", 2 + 3)\n';
    message += '• 顯示變數：print("x的值是:", x)\n';
    
    return message;
}

// AI 請求處理函數
async function handleAIRequest(ws, message) {
    try {
        const { action, code } = message;
        let response;

        switch (action) {
            case 'explain':
                response = await aiAssistant.explainCode(code);
                break;
            case 'check':
                response = await aiAssistant.checkErrors(code);
                break;
            case 'suggest':
                response = await aiAssistant.suggestImprovements(code);
                break;
            case 'resolve':
                const { originalCode, currentCode, incomingCode } = message;
                response = await aiAssistant.analyzeConflict(originalCode, currentCode, incomingCode);
                break;
            case 'run_code':
                const output = await executePythonCode(code);
                response = await aiAssistant.analyzeCodeExecution(code, output.result, output.error);
                break;
            default:
                throw new Error('未知的 AI 助教操作');
        }

        ws.send(JSON.stringify({
            type: 'ai_response',
            action: action,
            response: response
        }));

    } catch (error) {
        console.error('❌ AI 請求處理失敗:', error);
        ws.send(JSON.stringify({
            type: 'ai_error',
            message: error.message
        }));
    }
}

// 用戶斷線處理
function handleUserDisconnect(ws) {
    const user = users[ws.userId];
    if (!user) return;
    
    console.log(`🧹 處理用戶斷線: ${ws.userId} (${ws.userName || '未知'})`);
    
    // 如果用戶在房間中，處理離開房間
    if (ws.currentRoom && rooms[ws.currentRoom]) {
        const room = rooms[ws.currentRoom];
        if (room.users && room.users[ws.userId]) {
            const userName = ws.userName;
            const roomId = ws.currentRoom;
            
            // 從房間中移除用戶
            delete room.users[ws.userId];
            
            // 通知其他用戶有用戶離開，並發送更新後的用戶列表
            broadcastToRoom(roomId, {
                type: 'user_left',
                userName: userName,
                userId: ws.userId,
                timestamp: Date.now()
            }, ws.userId);
            
            console.log(`👋 ${userName} 離開房間: ${roomId}`);
            
            // 如果房間空了，清理房間
            if (Object.keys(room.users).length === 0) {
                console.log(`⏰ 房間 ${roomId} 已空，將在 2 分鐘後清理`);
                setTimeout(() => {
                    if (rooms[roomId]) {
                        delete rooms[roomId];
                        console.log(`🧹 清理空房間: ${roomId}`);
                        // 房間被清理時也更新統計
                        broadcastStatsToTeachers();
                    }
                }, 120000);
            }
        }
    }
    
    // 如果是教師監控，移除
    if (teacherMonitors.has(ws.userId)) {
        teacherMonitors.delete(ws.userId);
        console.log(`👨‍🏫 移除教師監控: ${ws.userId}`);
    }
    
    // 從用戶列表中移除
    delete users[ws.userId];
    console.log(`✅ 用戶 ${ws.userId} 已完全清理`);
}

// 廣播到房間
function broadcastToRoom(roomId, message, excludeUserId = null) {
    const room = rooms[roomId];
    if (!room) {
        console.error(`❌ 嘗試廣播到不存在的房間: ${roomId}`);
        return;
    }
    
    console.log(`📡 開始廣播到房間 ${roomId}，房間內有 ${Object.keys(room.users).length} 個用戶`);
    
    // 添加房間資訊到消息中
    const messageWithRoom = {
        ...message,
        roomId: roomId
    };
    
    let successCount = 0;
    let failureCount = 0;
    
    // 發送給房間內的用戶
    for (const [userId, user] of Object.entries(room.users)) {
        if (excludeUserId && userId === excludeUserId) {
            console.log(`⏭️ 跳過發送者 ${userId}`);
            continue;
        }

        const userWs = user.ws;
        if (userWs && userWs.readyState === WebSocket.OPEN) {
            try {
                // 為每個用戶個性化消息
                const personalizedMessage = {
                    ...messageWithRoom,
                    recipientId: userId,
                    recipientName: user.userName
                };
                
                userWs.send(JSON.stringify(personalizedMessage));
                console.log(`✅ 消息已發送給用戶 ${user.userName} (${userId})`);
                successCount++;
            } catch (error) {
                console.error(`❌ 發送消息給用戶 ${userId} 失敗:`, error);
                failureCount++;
            }
        } else {
            console.log(`❌ 用戶 ${userId} 連接不可用`);
            failureCount++;
        }
    }
    
    // 確保教師也收到消息（除非是教師發送的消息）
    if (!message.isTeacher) {
        teacherMonitors.forEach(teacherId => {
            if (excludeUserId && teacherId === excludeUserId) return;
            
            const teacher = users[teacherId];
            if (teacher && teacher.ws && teacher.ws.readyState === WebSocket.OPEN) {
                try {
                    teacher.ws.send(JSON.stringify({
                        ...messageWithRoom,
                        fromRoom: roomId
                    }));
                    console.log(`✅ 消息已發送給教師 ${teacherId}`);
                    successCount++;
                } catch (error) {
                    console.error(`❌ 發送消息給教師 ${teacherId} 失敗:`, error);
                    failureCount++;
                }
            } else {
                console.log(`⚠️ 教師 ${teacherId} 的WebSocket連接不可用`);
                failureCount++;
            }
        });
    }
    
    console.log(`📊 廣播結果：成功 ${successCount} 個，失敗 ${failureCount} 個`);
}

// 自動保存定時器
setInterval(() => {
    if (Object.keys(rooms).length > 0) {
        saveDataToFile();
    }
}, AUTO_SAVE_INTERVAL);

// 啟動時載入數據
loadDataFromFile();

// 啟動服務器
// Zeabur 和其他雲平台的端口處理
let PORT = process.env.PORT || process.env.WEB_PORT || 3000;

// 如果 PORT 是字符串形式的環境變數引用，嘗試解析
if (typeof PORT === 'string' && PORT.includes('WEB_PORT')) {
    PORT = process.env.WEB_PORT || 3000;
}

// 確保 PORT 是數字
PORT = parseInt(PORT) || 3000;

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
    console.log(`🚀 Python多人協作教學平台啟動成功！`);
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
    Object.values(rooms).forEach(room => {
        if (!room.id || room.id === 'null' || room.id === 'undefined' || room.id.trim() === '') {
            invalidRooms.push(room.id);
        } else if (Object.keys(room.users).length === 0) {
            // 清理空房間
            invalidRooms.push(room.id);
        }
    });
    
    invalidRooms.forEach(roomId => {
        delete rooms[roomId];
        console.log(`🗑️ 清理無效房間: ${roomId}`);
    });
    
    // 清理孤立用戶（WebSocket已關閉的用戶）
    const invalidUsers = [];
    Object.values(users).forEach(user => {
        if (!user.ws || user.ws.readyState === WebSocket.CLOSED) {
            invalidUsers.push(user.id);
        }
    });
    
    invalidUsers.forEach(userId => {
        const user = users[userId];
        if (user) {
            handleUserDisconnect(user);
            delete users[userId];
            connectionCount = Math.max(0, connectionCount - 1);
            console.log(`🗑️ 清理孤立用戶: ${userId}`);
        }
    });
    
    // 修正連接計數
    const actualConnections = Object.values(users).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN
    ).length;
    
    if (connectionCount !== actualConnections) {
        console.log(`🔧 修正連接計數: ${connectionCount} -> ${actualConnections}`);
        connectionCount = actualConnections;
    }
    
    console.log(`✅ 數據清理完成 - 房間數: ${Object.keys(rooms).length}, 用戶數: ${Object.keys(users).length}, 連接數: ${connectionCount}`);
}

// 定期數據清理
setInterval(cleanupInvalidData, 300000); // 每5分鐘清理一次

// 向教師監控推送統計更新
function broadcastStatsToTeachers() {
    if (teacherMonitors.size === 0) return;
    
    // 計算當前統計
    const actualConnections = Object.values(users).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN
    ).length;
    
    const activeRooms = Object.values(rooms).filter(room => 
        Object.keys(room.users).length > 0
    ).length;
    
    const studentsInRooms = Object.values(rooms).reduce((total, room) => {
        const validUsers = Object.values(room.users).filter(user => {
            return user.ws && user.ws.readyState === WebSocket.OPEN;
        });
        return total + validUsers.length;
    }, 0);
    
    const nonTeacherUsers = Object.values(users).filter(user => 
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
        const teacher = users[teacherId];
        if (teacher && teacher.ws && teacher.ws.readyState === WebSocket.OPEN) {
            teacher.ws.send(JSON.stringify(statsUpdate));
        }
    });
}

// 處理代碼載入請求
async function handleLoadCode(ws, message) {
    const user = users[ws.userId];
    if (!user || !user.roomId) {
        ws.send(JSON.stringify({
            type: 'load_code_error',
            error: '用戶未在房間中'
        }));
        return;
    }
    
    const room = rooms[user.roomId];
    if (!room) {
        ws.send(JSON.stringify({
            type: 'load_code_error',
            error: '房間不存在'
        }));
        return;
    }

    const userName = user.name;
    const { loadLatest, saveId } = message;

    console.log(`📥 ${userName} 請求載入代碼 - 載入最新: ${loadLatest}, 特定ID: ${saveId}`);

    // 🆕 從用戶的個人代碼歷史中載入
    if (!room.userCodeHistory || !room.userCodeHistory[userName] || room.userCodeHistory[userName].length === 0) {
        ws.send(JSON.stringify({
            type: 'load_code_error',
            error: '您還沒有保存任何代碼記錄',
            message: '請先保存一些代碼再進行載入'
        }));
        return;
    }

    const userHistory = room.userCodeHistory[userName];
    let codeToLoad = null;

    if (loadLatest) {
        // 載入最新的代碼（第一個元素）
        codeToLoad = userHistory[0];
        console.log(`🔄 ${userName} 載入最新代碼記錄 (版本 ${codeToLoad.version})`);
    } else if (saveId) {
        // 載入特定ID的代碼
        codeToLoad = userHistory.find(item => item.id === saveId);
        if (!codeToLoad) {
            ws.send(JSON.stringify({
                type: 'load_code_error',
                error: '找不到指定的代碼記錄',
                message: '該代碼記錄可能已被刪除或不存在'
            }));
            return;
        }
        console.log(`🔄 ${userName} 載入特定代碼記錄: ${saveId} (版本 ${codeToLoad.version})`);
    } else {
        ws.send(JSON.stringify({
            type: 'load_code_error',
            error: '無效的載入請求',
            message: '請指定要載入最新代碼或特定代碼ID'
        }));
        return;
    }

    // 發送載入成功響應
    ws.send(JSON.stringify({
        type: 'load_code_success',
        code: codeToLoad.code,
        title: codeToLoad.title,
        version: codeToLoad.version,
        timestamp: codeToLoad.timestamp,
        author: codeToLoad.author,
        message: `已載入您的代碼 "${codeToLoad.title}" (版本 ${codeToLoad.version})`
    }));

    console.log(`✅ ${userName} 成功載入代碼: ${codeToLoad.title} (版本 ${codeToLoad.version})`);
}

// 🆕 處理獲取用戶個人代碼歷史記錄
async function handleGetHistory(ws, message) {
    const user = users[ws.userId];
    if (!user || !user.roomId) {
        ws.send(JSON.stringify({
            type: 'history_data',
            success: false,
            error: '用戶未在房間中',
            history: []
        }));
        return;
    }
    
    const room = rooms[user.roomId];
    if (!room) {
        ws.send(JSON.stringify({
            type: 'history_data',
            success: false,
            error: '房間不存在',
            history: []
        }));
        return;
    }

    const userName = user.name;
    console.log(`📚 ${userName} 請求獲取個人代碼歷史記錄`);

    // 獲取用戶的個人代碼歷史
    let userHistory = [];
    if (room.userCodeHistory && room.userCodeHistory[userName]) {
        userHistory = room.userCodeHistory[userName];
    }

    if (isDatabaseAvailable && user.dbUserId) {
        // 從數據庫獲取用戶的代碼歷史
        try {
            const [rows] = await pool.execute(
                'SELECT * FROM code_history WHERE room_id = ? AND user_name = ? ORDER BY timestamp DESC LIMIT 50',
                [user.roomId, userName]
            );
            
            userHistory = rows.map(row => ({
                id: `${userName}_${row.timestamp.getTime()}`,
                code: row.code_content,
                title: row.save_name || `代碼保存 - ${row.timestamp.toLocaleString()}`,
                author: userName,
                timestamp: row.timestamp.getTime(),
                version: row.version
            }));
    
            console.log(`📚 從數據庫獲取 ${userName} 的代碼歷史: ${userHistory.length} 條記錄`);
        } catch (error) {
            console.error(`❌ 從數據庫獲取代碼歷史失敗:`, error.message);
            // 如果數據庫查詢失敗，返回空歷史
            userHistory = [];
        }
    } else {
        console.log(`📚 從內存獲取 ${userName} 的代碼歷史: ${userHistory.length} 條記錄`);
    }

    // 發送歷史記錄給用戶
    ws.send(JSON.stringify({
        type: 'history_data',
        success: true,
        history: userHistory,
        userName: userName,
        message: `獲取到 ${userHistory.length} 條您的代碼記錄`
    }));

    console.log(`✅ 已發送 ${userName} 的代碼歷史記錄: ${userHistory.length} 條`);
}

// 處理代碼保存（手動保存）
async function handleSaveCode(ws, message) {
    const user = users[ws.userId];
    if (!user || !user.roomId) {
        ws?.send(JSON.stringify({
            type: 'save_code_error',
            error: '用戶未在房間中'
        }));
        return;
    }

    const room = rooms[user.roomId];
    if (!room) {
        ws.send(JSON.stringify({
            type: 'save_code_error',
            error: '房間不存在'
        }));
        return;
    }

    const { code, saveName } = message;
    const timestamp = Date.now();
    const userName = user.name;

    // 🆕 為每個用戶創建獨立的代碼記錄
    if (!room.userCodeHistory) {
        room.userCodeHistory = {};
    }
    
    if (!room.userCodeHistory[userName]) {
        room.userCodeHistory[userName] = [];
    }

    // 🆕 保存到用戶的最新槽位（覆蓋最新記錄或新增）
    const userHistory = room.userCodeHistory[userName];
    const saveData = {
        id: `${userName}_${timestamp}`,
        code: code,
        title: saveName || `${userName}的代碼保存 - ${new Date(timestamp).toLocaleString()}`,
        author: userName,
        timestamp: timestamp,
        version: userHistory.length + 1
    };

    // 將新記錄添加到用戶歷史的最前面（最新的在前）
    userHistory.unshift(saveData);

    // 限制每個用戶的歷史記錄數量為50個
    if (userHistory.length > 50) {
        userHistory.splice(50);
    }

    if (isDatabaseAvailable && user.dbUserId) {
        // 數據庫模式：保存到數據庫（用戶獨立）
        try {
            // 保存到代碼歷史表，使用用戶名作為標識
            await pool.execute(
                'INSERT INTO code_history (room_id, user_id, code_content, version, save_name, timestamp, user_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user.roomId, user.dbUserId, code, saveData.version, saveData.title, new Date(timestamp), userName]
            );

            console.log(`💾 用戶 ${userName} 保存代碼到數據庫 - 房間: ${user.roomId}, 版本: ${saveData.version}, 名稱: ${saveData.title}`);
        } catch (error) {
            console.error(`❌ 保存代碼到數據庫失敗:`, error.message);
            ws.send(JSON.stringify({
                type: 'save_code_error',
                error: '保存到數據庫失敗'
            }));
            return;
        }
    } else {
        // 本地模式：保存到內存和本地文件
        console.log(`💾 用戶 ${userName} 保存代碼到本地 - 房間: ${user.roomId}, 版本: ${saveData.version}, 名稱: ${saveData.title}`);
    }

    // 保存到本地文件
    saveDataToFile();

    // 發送成功回應
    ws.send(JSON.stringify({
        type: 'save_code_success',
        version: saveData.version,
        saveName: saveData.title,
        timestamp: timestamp,
        message: `代碼已保存到您的個人槽位 (版本 ${saveData.version})`
    }));

    // 🆕 只通知其他用戶有人保存了代碼，但不共享具體內容
    broadcastToRoom(user.roomId, {
        type: 'user_saved_code',
        userName: userName,
        saveName: saveData.title,
        timestamp: timestamp
    }, ws.userId);
}

// 處理代碼變更
function handleCodeChange(ws, message) {
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        console.error(`❌ 房間不存在: ${roomId}`);
        return;
    }

    const room = rooms[roomId];
    
    // 檢查是否為強制更新
    const isForceUpdate = message.forceUpdate === true;
    
    // 更新房間代碼和版本
    room.code = message.code;
    room.version = (room.version || 0) + 1;
    room.lastModified = Date.now();
    room.lastModifiedBy = ws.userId;

    console.log(`📝 代碼變更 - 房間: ${roomId}, 版本: ${room.version}, 用戶: ${ws.userName}, 強制更新: ${isForceUpdate}`);

    // 廣播消息
    const broadcastMessage = {
        type: 'code_change',
        code: message.code,
        version: room.version,
        userName: ws.userName,
        userId: ws.userId,
        timestamp: Date.now(),
        roomId: roomId,
        forceUpdate: isForceUpdate // 傳遞強制更新標記
    };

    // 廣播給房間內其他用戶
    broadcastToRoom(roomId, broadcastMessage, ws.userId);

    // 保存數據
    saveDataToFile();
}

// 🆕 處理衝突通知 - 轉發給目標用戶
function handleConflictNotification(ws, message) {
    console.log('🚨 [Server] 收到衝突通知:', message);
    
    const roomId = ws.currentRoom;
    const senderUserName = ws.userName;
    const targetUserName = message.targetUser;
    
    if (!roomId || !rooms[roomId]) {
        console.error('❌ 房間不存在，無法轉發衝突通知');
        return;
    }
    
    const room = rooms[roomId];
    
    // 尋找目標用戶
    const targetUser = Object.values(room.users).find(user => 
        user.userName === targetUserName && 
        user.ws && 
        user.ws.readyState === WebSocket.OPEN
    );
    
    if (!targetUser) {
        console.warn(`⚠️ 目標用戶 ${targetUserName} 不在房間 ${roomId} 中或已離線`);
        
        // 告知發送方目標用戶不可用
        ws.send(JSON.stringify({
            type: 'error',
            error: '目標用戶不可用',
            details: `用戶 ${targetUserName} 不在房間中或已離線`,
            timestamp: Date.now()
        }));
        return;
    }
    
    // 構建轉發的衝突通知
    const forwardedNotification = {
        type: 'conflict_notification',
        targetUser: targetUserName,
        conflictWith: senderUserName,
        message: message.message || `${senderUserName} 正在處理代碼衝突`,
        timestamp: Date.now(),
        conflictData: message.conflictData || {},
        originalMessage: message
    };
    
    // 發送給目標用戶
    try {
        targetUser.ws.send(JSON.stringify(forwardedNotification));
        console.log(`✅ [Server] 衝突通知已轉發: ${senderUserName} → ${targetUserName}`);
        
        // 確認給發送方
        ws.send(JSON.stringify({
            type: 'notification_sent',
            targetUser: targetUserName,
            message: '衝突通知已發送',
            timestamp: Date.now()
        }));
        
        // 在聊天室廣播衝突狀態（可選）
        const chatNotification = {
            type: 'chat_message',
            message: `🚨 系統提醒：檢測到 ${senderUserName} 和 ${targetUserName} 之間的協作衝突`,
            author: '系統',
            timestamp: Date.now(),
            isSystemMessage: true
        };
        
        // 廣播到房間內所有用戶
        broadcastToRoom(roomId, chatNotification);
        
    } catch (error) {
        console.error('❌ 轉發衝突通知失敗:', error);
        
        ws.send(JSON.stringify({
            type: 'error',
            error: '衝突通知發送失敗',
            details: error.message,
            timestamp: Date.now()
        }));
    }
}

// API密鑰驗證端點
app.post('/api/ai-validate', async (req, res) => {
    console.log('🔑 [API Validate] 驗證API密鑰...');
    
    if (!aiConfig.openai_api_key) {
        return res.json({
            valid: false,
            error: 'API密鑰未設置'
        });
    }
    
    try {
        // 發送一個簡單的測試請求到OpenAI
        const testResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiConfig.openai_api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'user',
                        content: 'Test connection - please respond with "OK"'
                    }
                ],
                max_tokens: 10,
                temperature: 0
            })
        });
        
        if (testResponse.ok) {
            console.log('✅ [API Validate] API密鑰驗證成功');
            res.json({
                valid: true,
                message: 'API密鑰驗證成功'
            });
        } else {
            const errorData = await testResponse.json().catch(() => ({}));
            console.log(`❌ [API Validate] API密鑰驗證失敗: ${testResponse.status}`);
            res.json({
                valid: false,
                error: `API驗證失敗: ${testResponse.status} - ${errorData.error?.message || 'Unknown error'}`
            });
        }
        
    } catch (error) {
        console.error(`❌ [API Validate] API密鑰驗證錯誤: ${error.message}`);
        res.json({
            valid: false,
            error: `驗證過程出錯: ${error.message}`
        });
    }
});

// AI功能直接測試端點
app.post('/api/ai-test', async (req, res) => {
    const { action, code } = req.body;
    const startTime = Date.now();
    
    console.log(`🧪 [API Test] 收到AI測試請求: ${action}, 代碼長度: ${code ? code.length : 0}`);
    
    if (!aiConfig.enabled || !aiConfig.openai_api_key) {
        return res.json({
            success: false,
            error: 'AI功能未啟用或API密鑰未設置'
        });
    }
    
    if (!code || code.trim() === '') {
        return res.json({
            success: false,
            error: '代碼不能為空'
        });
    }
    
    try {
        let response = '';
        
        switch (action) {
            case 'analyze':
                response = await analyzeCode(code);
                break;
            case 'check_errors':
                response = await debugCode(code);
                break;
            case 'improvement_tips':
                response = await improveCode(code);
                break;
            case 'collaboration_guide':
                response = await guideCollaboration(code, { userName: 'TestUser', roomId: 'test-room' });
                break;
            default:
                return res.json({
                    success: false,
                    error: `不支持的動作類型: ${action}`
                });
        }
        
        const responseTime = Date.now() - startTime;
        console.log(`✅ [API Test] AI測試成功: ${action}, 響應時間: ${responseTime}ms`);
        
        res.json({
            success: true,
            response: response,
            responseTime: responseTime,
            action: action
        });
        
    } catch (error) {
        console.error(`❌ [API Test] AI測試失敗: ${action}, 錯誤: ${error.message}`);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// AI配置查看端點
app.get('/api/ai-config', (req, res) => {
    res.json({
        hasApiKey: !!(aiConfig.openai_api_key),
        model: aiConfig.model,
        maxTokens: aiConfig.max_tokens,
        temperature: aiConfig.temperature,
        enabled: aiConfig.enabled,
        features: aiConfig.features
    });
});

// 測試頁面路由
app.get('/test-ai', (req, res) => {
    res.sendFile(path.join(__dirname, 'test_ai_assistant.html'));
});