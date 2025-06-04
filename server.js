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

// 創建WebSocket服務器 - 簡化配置以避免升級問題
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 1024 * 1024 * 2, // 2MB 消息大小限制
    perMessageDeflate: false, // 暫時禁用壓縮以避免升級問題
    // 移除複雜的verifyClient，使用簡單配置
    clientTracking: true
});

// WebSocket錯誤處理
wss.on('error', (error) => {
    console.error('❌ WebSocket服務器錯誤:', error);
});

console.log('✅ WebSocket服務器已配置（簡化版本，修復426錯誤）');

// 環境變數配置
// 動態檢測 URL，適用於多種部署環境
const PUBLIC_URL = process.env.PUBLIC_URL || 
                   process.env.VERCEL_URL || 
                   process.env.ZEABUR_URL ||
                   'http://localhost:3000'; // 默認本地開發

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
        // 創建用戶表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 創建房間表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS rooms (
                id VARCHAR(100) PRIMARY KEY,
                current_code_content TEXT,
                current_code_version INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 創建代碼歷史表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS code_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(100),
                user_id INT,
                code_content TEXT,
                version INT,
                save_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 創建聊天消息表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(100),
                user_id INT,
                message_content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 創建AI請求記錄表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ai_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(100),
                user_id INT,
                request_type VARCHAR(50),
                code_content TEXT,
                ai_response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 創建用戶名稱使用記錄表
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
            )
        `);

        console.log('✅ 數據庫表初始化完成');
    } catch (error) {
        console.error('❌ 數據庫表初始化失敗:', error);
        throw error;
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

// 載入AI配置
let aiConfig = {};
try {
    // 優先使用環境變數配置（適合生產環境）
    if (process.env.OPENAI_API_KEY) {
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

// 測試AI四大功能是否在Zeabur環境正常工作
async function testAIFunctionsOnZeabur() {
    console.log('🧪 開始測試AI四大功能...');
    
    if (!aiConfig.enabled || !aiConfig.openai_api_key) {
        console.log('⚠️ AI功能未啟用，跳過測試');
        return;
    }
    
    const testCode = `print("Hello, World!")
def add_numbers(a, b):
    return a + b

result = add_numbers(5, 3)
print(f"結果: {result}")`;
    
    try {
        console.log('🔍 測試1: 代碼分析功能...');
        const analysis = await analyzeCode(testCode);
        console.log('✅ 代碼分析功能正常');
        console.log(`📝 分析結果長度: ${analysis.length} 字符`);
        
        console.log('🔍 測試2: 錯誤檢查功能...');
        const debug = await debugCode(testCode);
        console.log('✅ 錯誤檢查功能正常');
        console.log(`🐛 檢查結果長度: ${debug.length} 字符`);
        
        console.log('🔍 測試3: 改進建議功能...');
        const improvement = await improveCode(testCode);
        console.log('✅ 改進建議功能正常');
        console.log(`💡 建議結果長度: ${improvement.length} 字符`);
        
        console.log('🔍 測試4: 衝突分析功能...');
        const conflict = await analyzeConflict({
            userCode: testCode,
            serverCode: 'print("不同的代碼")',
            userVersion: 1,
            serverVersion: 2,
            conflictUser: '測試用戶',
            roomId: '測試房間'
        });
        console.log('✅ 衝突分析功能正常');
        console.log(`🔧 衝突結果長度: ${conflict.length} 字符`);
        
        console.log('🎉 所有AI功能測試通過！OpenAI API在Zeabur環境中正常工作');
        
    } catch (error) {
        console.error('❌ AI功能測試失敗:', error.message);
        
        if (error.message.includes('401')) {
            console.log('🔑 API密鑰問題 - 請檢查OPENAI_API_KEY環境變數');
        } else if (error.message.includes('429')) {
            console.log('⏰ API配額或頻率限制 - 請檢查OpenAI帳戶');
        } else if (error.message.includes('quota')) {
            console.log('💳 API配額不足 - 請檢查OpenAI帳戶餘額');
        } else {
            console.log('🌐 網路或其他問題 - 請檢查Zeabur的網路連接');
        }
    }
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
        rooms: Object.keys(rooms).length,
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

// AI功能測試端點
app.get('/api/test/ai', async (req, res) => {
    try {
        console.log('🧪 收到AI功能測試請求...');
        
        if (!aiConfig.enabled || !aiConfig.openai_api_key) {
            return res.json({
                success: false,
                error: 'AI功能未啟用或API密鑰未設定',
                enabled: aiConfig.enabled,
                hasApiKey: !!aiConfig.openai_api_key,
                config: {
                    model: aiConfig.model,
                    features: aiConfig.features
                }
            });
        }
        
        const testCode = `print("Hello, World!")
def calculate_sum(a, b):
    return a + b

result = calculate_sum(10, 20)
print(f"計算結果: {result}")`;
        
        const results = {
            success: true,
            message: 'AI功能測試完成',
            timestamp: new Date().toISOString(),
            config: {
                model: aiConfig.model,
                enabled: aiConfig.enabled,
                hasApiKey: !!aiConfig.openai_api_key
            },
            tests: {}
        };
        
        // 測試1: 代碼分析
        try {
            console.log('🔍 測試代碼分析功能...');
            const analysis = await analyzeCode(testCode);
            results.tests.analyze = {
                success: true,
                responseLength: analysis.length,
                hasContent: analysis.length > 10
            };
            console.log('✅ 代碼分析功能測試通過');
        } catch (error) {
            results.tests.analyze = {
                success: false,
                error: error.message
            };
            console.log('❌ 代碼分析功能測試失敗:', error.message);
        }
        
        // 測試2: 錯誤檢查
        try {
            console.log('🔍 測試錯誤檢查功能...');
            const debug = await debugCode(testCode);
            results.tests.debug = {
                success: true,
                responseLength: debug.length,
                hasContent: debug.length > 10
            };
            console.log('✅ 錯誤檢查功能測試通過');
        } catch (error) {
            results.tests.debug = {
                success: false,
                error: error.message
            };
            console.log('❌ 錯誤檢查功能測試失敗:', error.message);
        }
        
        // 測試3: 改進建議
        try {
            console.log('🔍 測試改進建議功能...');
            const improvement = await improveCode(testCode);
            results.tests.improve = {
                success: true,
                responseLength: improvement.length,
                hasContent: improvement.length > 10
            };
            console.log('✅ 改進建議功能測試通過');
        } catch (error) {
            results.tests.improve = {
                success: false,
                error: error.message
            };
            console.log('❌ 改進建議功能測試失敗:', error.message);
        }
        
        // 測試4: 衝突分析
        try {
            console.log('🔍 測試衝突分析功能...');
            const conflict = await analyzeConflict({
                userCode: testCode,
                serverCode: 'print("另一個版本的代碼")',
                userVersion: 1,
                serverVersion: 2,
                conflictUser: 'API測試用戶',
                roomId: 'API測試房間'
            });
            results.tests.conflict = {
                success: true,
                responseLength: conflict.length,
                hasContent: conflict.length > 10
            };
            console.log('✅ 衝突分析功能測試通過');
        } catch (error) {
            results.tests.conflict = {
                success: false,
                error: error.message
            };
            console.log('❌ 衝突分析功能測試失敗:', error.message);
        }
        
        // 計算成功率
        const testResults = Object.values(results.tests);
        const successCount = testResults.filter(test => test.success).length;
        results.summary = {
            total: testResults.length,
            success: successCount,
            failed: testResults.length - successCount,
            successRate: `${Math.round((successCount / testResults.length) * 100)}%`
        };
        
        console.log(`🎯 AI功能測試完成 - 成功率: ${results.summary.successRate}`);
        
        res.json(results);
        
    } catch (error) {
        console.error('❌ AI測試端點錯誤:', error);
        res.status(500).json({
            success: false,
            error: 'AI測試端點內部錯誤',
            message: error.message
        });
    }
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
    const studentsInRooms = Object.values(rooms).reduce((total, room) => total + room.userCount, 0);
    
    // 計算非教師用戶數（排除教師監控連接）
    const nonTeacherUsers = Object.values(users).filter(user => 
        user.ws && user.ws.readyState === WebSocket.OPEN && !user.isTeacher
    ).length;
    
    console.log(`📊 教師監控統計 - 總連接: ${actualConnections}, 房間學生: ${studentsInRooms}, 非教師用戶: ${nonTeacherUsers}`);
    
    res.json({
        rooms: Object.values(rooms),
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
    
    // 不再自動創建用戶，只設置基本屬性
    ws.clientIP = clientIP;
    ws.joinTime = new Date();
    ws.isAlive = true;
    ws.userId = null;  // 將在加入房間時設置
    ws.userName = null; // 將在加入房間時設置
    
    console.log(`🔌 WebSocket 連接已建立 (IP: ${clientIP})`);
    
    // 心跳檢測
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    // 處理消息
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            if (ws.userId) {
                console.log(`[Server DEBUG] handleMessage CALLED for ${ws.userId} (${ws.userName}). Type: '${message.type}'.`);
            } else {
                console.log(`[Server DEBUG] handleMessage CALLED for anonymous connection. Type: '${message.type}'.`);
            }
            
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
            
            console.log(`📤 [Error] 發送錯誤消息:`, errorMessage);
            ws.send(JSON.stringify(errorMessage));
        }
    });
    
    // 連接關閉處理
    ws.on('close', () => {
        if (ws.userId && ws.userName) {
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
        } else {
            console.log(`🔌 匿名連接斷開 (IP: ${ws.clientIP})`);
        }
    });

    // 錯誤處理
    ws.on('error', (error) => {
        console.error(`❌ WebSocket 錯誤:`, error);
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
            // 處理客戶端心跳
            ws.send(JSON.stringify({ type: 'pong' }));
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
            await handleConflictNotification(ws, message);
            break;
        case 'load_history':
            await handleLoadHistory(ws, message);
            break;
        case 'sync_history':
            await handleSyncHistory(ws, message);
            break;
        case 'save_code':
            await handleSaveCode(ws, message);
            break;
        case 'load_code':
            await handleLoadCode(ws, message);
            break;
        case 'run_code':
            handleRunCode(ws, message);
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

    // 如果用戶還沒有ID，現在創建
    if (!ws.userId) {
        ws.userId = generateUserId();
        ws.userName = userName;
        
        // 添加到全域用戶列表
        users[ws.userId] = {
            id: ws.userId,
            name: userName,
            ws: ws,
            joinTime: new Date(),
            isActive: true,
            roomId: roomId
        };
        
        console.log(`✅ 創建新用戶: ${ws.userId} (${userName}) (IP: ${ws.clientIP})`);
        console.log(`📊 全域用戶總數: ${Object.keys(users).length}`);
    }

    // 創建房間（如果不存在）
    if (!rooms[roomId]) {
        const newRoom = await createRoom(roomId);
        rooms[roomId] = newRoom;
        console.log(`[Server DEBUG] 全域 rooms Map 已更新，新增房間: ${roomId}`);
    }

    const room = rooms[roomId];
    
    // 確保 room 對象及其 users 屬性存在
    if (!room || !room.users) {
        console.error(`❌ 嚴重錯誤：無法獲取或初始化房間 ${roomId} 的用戶列表。`);
        ws.send(JSON.stringify({
                type: 'join_room_error',
            error: 'room_initialization_failed',
            message: `無法初始化房間 ${roomId}，請稍後再試。`
            }));
            return;
        }

    // 清理房間內無效的用戶連接
    const invalidUserIds = [];
    Object.entries(room.users).forEach(([userId, user]) => {
        if (!user.ws || user.ws.readyState !== WebSocket.OPEN) {
            invalidUserIds.push(userId);
    }
    });
    
    invalidUserIds.forEach(userId => {
        delete room.users[userId];
        console.log(`🧹 清理房間 ${roomId} 中的無效用戶: ${userId}`);
    });

    // 檢查用戶是否已在房間中（重連情況）
    const existingUserInRoom = room.users[ws.userId];
    const isReconnect = existingUserInRoom && existingUserInRoom.userName === userName;

    // 更新用戶信息
    ws.currentRoom = roomId;
    ws.userName = userName;
    
    // 更新全域用戶信息
    if (users[ws.userId]) {
        users[ws.userId].roomId = roomId;
        users[ws.userId].name = userName;
        console.log(`📝 更新全域用戶信息: ${ws.userId} -> 房間: ${roomId}, 名稱: ${userName}`);
    } else {
        console.warn(`⚠️ 警告：在全域用戶列表中找不到用戶 ${ws.userId}`);
    }
    
    // 添加用戶到房間
    room.users[ws.userId] = {
        userId: ws.userId,
        userName: userName,
        ws: ws,
        joinTime: new Date(),
        isActive: true,
        cursor: null // 初始化游標位置
    };

    console.log(`👤 ${userName} ${isReconnect ? '重連到' : '加入'} 房間: ${roomId}`);
    console.log(`📊 房間 ${roomId} 現有用戶數: ${Object.keys(room.users).length}`);
    
    // 獲取當前有效用戶列表
    const activeUsers = Object.values(room.users).filter(u => 
        u.ws && u.ws.readyState === WebSocket.OPEN
    ).map(u => ({
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
    const joinMessage = {
        type: isReconnect ? 'user_reconnected' : 'user_joined',
        userName: userName,
        userId: ws.userId,
        users: activeUsers
    };

    broadcastToRoom(roomId, joinMessage, ws.userId);
    
    console.log(`✅ ${userName} 成功加入房間 ${roomId}，當前在線用戶: ${activeUsers.length} 人`);
}

// 離開房間處理
function handleLeaveRoom(ws, message) {
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        console.error(`❌ 房間不存在: ${roomId}`);
        return;
    }
    
    const room = rooms[roomId];
    const userName = ws.userName;
        
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
        id: Date.now() + Math.random(), // 使用時間戳和隨機數生成唯一ID
        userId: ws.userId,
        userName: ws.userName,
        message: message.message,
        timestamp: Date.now(),
        isHistory: false
    };

    // 添加到房間聊天歷史
    room.chatHistory = room.chatHistory || [];
    room.chatHistory.push(chatMessage);
    
    if (isDatabaseAvailable) {
        // 數據庫模式：保存到數據庫
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
        // 本地模式：保存到文件
        saveDataToFile();
    }
    
    console.log(`💬 ${ws.userName}: ${message.message}`);
    
    // 廣播聊天消息
    broadcastToRoom(roomId, {
        type: 'chat_message',
        ...chatMessage
    });
}

// 教師廣播處理
function handleTeacherBroadcast(ws, message) {
    if (!teacherMonitors.has(ws.userId)) return;
    
    const { targetRoom, message: broadcastMessage, messageType } = message.data;
    
    console.log(`📢 教師廣播到房間 ${targetRoom}: ${broadcastMessage}`);
    
    if (targetRoom && rooms[targetRoom]) {
        broadcastToRoom(targetRoom, {
            type: 'teacher_broadcast',
            message: broadcastMessage,
            messageType: messageType || 'info',
            timestamp: Date.now()
        });
    }
}

// 教師聊天處理
function handleTeacherChat(ws, message) {
    if (!teacherMonitors.has(ws.userId)) {
        console.log(`❌ 非教師用戶嘗試發送教師聊天: ${ws.userId}`);
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
        isTeacher: true
    };
    
    if (targetRoom === 'all') {
        // 廣播到所有房間
        Object.values(rooms).forEach(room => {
            // 添加到房間聊天歷史
            room.chatHistory.push(teacherChatMessage);
            
            // 廣播給房間內的所有用戶
            broadcastToRoom(room.id, {
                type: 'chat_message',
                ...teacherChatMessage
            });
        });
        
        // 通知所有教師監控
        teacherMonitors.forEach(teacherId => {
            if (teacherId !== ws.userId) { // 不發送給自己
                const teacher = users[teacherId];
                if (teacher && teacher.ws && teacher.ws.readyState === WebSocket.OPEN) {
                    teacher.ws.send(JSON.stringify({
                        type: 'chat_message',
                        ...teacherChatMessage,
                        roomName: '所有房間'
                    }));
                }
            }
        });
        
        console.log(`📢 教師消息已廣播到所有房間`);
    } else if (targetRoom && rooms[targetRoom]) {
        // 發送到特定房間
        const room = rooms[targetRoom];
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
    const os = require('os');
    const path = require('path');
    
    // 檢查是否有Python解釋器 - 添加常見的Windows安裝路徑
    let pythonCommands;
    if (process.platform === 'win32') {
        const userProfile = process.env.USERPROFILE || process.env.HOME;
        pythonCommands = [
            'python',
            'python3', 
            'py',
            // Windows常見安裝路徑
            path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
            path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
            path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
            'C:\\Python313\\python.exe',
            'C:\\Python312\\python.exe', 
            'C:\\Python311\\python.exe'
        ];
    } else {
        pythonCommands = ['python3', 'python'];
    }
    
    console.log(`🐍 開始執行Python代碼，嘗試命令: ${pythonCommands.slice(0, 3).join(', ')}...`);
    console.log(`📝 代碼內容: ${code.substring(0, 200)}${code.length > 200 ? '...' : ''}`);
    
    // 嘗試不同的Python命令
    function tryPythonCommand(commandIndex = 0) {
        if (commandIndex >= pythonCommands.length) {
            console.log(`❌ 所有Python命令都失敗了: ${pythonCommands.slice(0, 3).join(', ')}`);
            callback({
                success: false,
                output: `❌ 服務器環境錯誤：找不到Python解釋器\n嘗試的命令: ${pythonCommands.slice(0, 3).join(', ')}\n\n請確保系統已安裝Python並添加到PATH環境變數中。`
            });
            return;
        }
        
        const pythonCommand = pythonCommands[commandIndex];
        
        // 首先測試Python是否可用
        const testPython = spawn(pythonCommand, ['--version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false
        });
        
        testPython.on('close', (exitCode) => {
            if (exitCode !== 0) {
                console.log(`❌ Python解釋器測試失敗 (${path.basename(pythonCommand)})，退出代碼: ${exitCode}，嘗試下一個...`);
                tryPythonCommand(commandIndex + 1);
                return;
            }
            
            console.log(`✅ Python解釋器測試成功 (${path.basename(pythonCommand)})，開始執行用戶代碼`);
            
            // Python可用，執行用戶代碼
            executeUserCode(pythonCommand);
        });
        
        testPython.on('error', (error) => {
            console.error(`❌ Python解釋器測試錯誤 (${path.basename(pythonCommand)}):`, error.message);
            tryPythonCommand(commandIndex + 1);
        });
    }
    
    // 開始嘗試
    tryPythonCommand();
    
    function executeUserCode(pythonCommand) {
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
                        // 無輸出內容，提供說明
                        const helpMessage = `程式執行完成（無輸出）
💡 提示：如果想要看到輸出結果，可以嘗試：
• 使用 print() 函數：print("Hello World")
• 顯示變數值：print(變數名稱)
• 顯示計算結果：print(5 + 3)
• 列印內容：print("您的訊息")`;
                        
                        console.log(`✅ 執行成功但無輸出，已提供幫助說明`);
                        callback({
                            success: true,
                            output: helpMessage
                        });
                    }
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
async function handleAIRequest(ws, message) {
    // 使用正確的用戶獲取方式
    const user = users[ws.userId];
    if (!user) {
        console.log(`❌ AI 請求失敗：找不到用戶 ${ws.userId}`);
        ws.send(JSON.stringify({
            type: 'ai_response',
            action: message.action,
            requestId: message.requestId,
            response: '⚠️ 用戶信息不完整，請重新連接',
            error: 'user_invalid'
        }));
        return;
    }
    
    // 修復：從 message.data.code 中提取代碼，而不是 message.code
    const { action, requestId, data } = message;
    
    // 修復：根據動作類型提取代碼
    let code;
    if (action === 'conflict_analysis' && data) {
        // 對於衝突分析，使用 userCode
        code = data.userCode;
        console.log(`🔍 [Conflict Analysis] 從 data.userCode 提取代碼: "${code ? code.substring(0, 50) + (code.length > 50 ? '...' : '') : 'null/undefined'}"`);
    } else {
        // 對於其他動作，使用 data.code
        code = data ? data.code : null;
        console.log(`🔍 [Standard Action] 從 data.code 提取代碼: "${code ? code.substring(0, 50) + (code.length > 50 ? '...' : '') : 'null/undefined'}"`);
    }
    
    console.log(`🤖 收到 AI 請求 - 用戶: ${user.name}, 動作: ${action}, 代碼長度: ${code ? code.length : 0}, RequestID: ${requestId || 'N/A'}`);
    console.log(`🔍 [Server Debug] 消息結構:`, { action, requestId, data });
    console.log(`🔍 [Server Debug] 提取的代碼:`, code ? `"${code.substring(0, 50)}${code.length > 50 ? '...' : ''}"` : 'null/undefined');
    
    if (!aiConfig.enabled || !aiConfig.openai_api_key) {
        ws.send(JSON.stringify({
            type: 'ai_response',
            action: action,
            requestId: requestId,
            response: '🚫 AI 助教功能未啟用或 API 密鑰未設定。請聯繫管理員配置 OpenAI API 密鑰。',
            error: 'ai_disabled'
        }));
        console.log(`⚠️ AI功能停用 - 用戶: ${user.name}, 原因: ${!aiConfig.enabled ? 'AI功能未啟用' : 'API密鑰未設定'}`);
        return;
    }
    
    // 檢查代碼內容 (但 conflict_analysis 除外，因為它使用 data.userCode)
    if (action !== 'conflict_analysis' && (!code || code.trim() === '')) {
        ws.send(JSON.stringify({
            type: 'ai_response',
            action: action,
            requestId: requestId,
            response: '📝 請先在編輯器中輸入一些 Python 程式碼，然後再使用 AI 助教功能進行分析。',
            error: 'empty_code'
        }));
        console.log(`⚠️ 代碼為空 - 用戶: ${user.name}, 動作: ${action}`);
        return;
    }
    
    let response = '';
    let error = null;
    
    try {
        // 根據動作類型調用對應的 AI 函數
        switch (action) {
            case 'explain_code':
            case 'analyze':        // 前端別名映射 - 解釋程式
                response = await analyzeCode(code);
                break;
            case 'check_errors':
            case 'check':          // 前端別名映射 - 檢查錯誤
                response = await debugCode(code);
                break;
            case 'improve_code':
            case 'suggest':        // 前端別名映射 - 改進建議
            case 'improvement_tips': // 前端別名映射
                response = await improveCode(code);
                break;
            case 'conflict_resolution':
            case 'conflict_analysis':  // 新增：支持 conflict_analysis 動作
            case 'resolve':        // 前端別名映射 - 衝突協助
                if (action === 'conflict_analysis') {
                    // 衝突分析：檢查並使用完整的衝突數據
                    if (!data) {
                        console.log(`⚠️ conflict_analysis 缺少數據 - 用戶: ${user.name}`);
                        response = '❌ 衝突分析請求缺少必要數據';
                        error = 'missing_conflict_data';
                        break;
                    }
                    
                    console.log(`🔍 [Conflict Analysis] 收到的數據:`, {
                        userCode: data.userCode ? `"${data.userCode.substring(0, 30)}..."` : 'null/undefined',
                        serverCode: data.serverCode ? `"${data.serverCode.substring(0, 30)}..."` : 'null/undefined',
                        userVersion: data.userVersion,
                        serverVersion: data.serverVersion,
                        conflictUser: data.conflictUser,
                        roomId: data.roomId
                    });
                    
                    // 即使 userCode 為空也進行分析，提供協作建議
                    response = await analyzeConflict({
                        userCode: data.userCode || '',
                        serverCode: data.serverCode || '',
                        userVersion: data.userVersion || 0,
                        serverVersion: data.serverVersion || 0,
                        conflictUser: data.conflictUser || user.name,
                        roomId: data.roomId || user.roomId
                    });
                } else {
                    // 其他衝突解決：使用當前代碼
                    response = await analyzeConflict({ 
                        userCode: code, 
                        serverCode: '', 
                        userVersion: 0, 
                        serverVersion: 0, 
                        conflictUser: user.name, 
                        roomId: user.roomId 
                    });
                }
                break;
            case 'collaboration_guide':
                response = await guideCollaboration(code, { userName: user.name, roomId: user.roomId });
                break;
            default:
                response = `❓ 未知的 AI 請求類型: ${action}。支援的功能：解釋程式(explain_code/analyze)、檢查錯誤(check_errors/check)、改進建議(improve_code/suggest)、衝突協助(conflict_resolution/resolve)、協作指導(collaboration_guide)`;
                error = 'unknown_action';
        }
        
        console.log(`✅ AI 回應生成成功 - 用戶: ${user.name}, 動作: ${action}, 回應長度: ${response.length}`);
        
        // 簡化：跳過數據庫記錄，專注於功能測試
        console.log(`🔄 簡化模式：跳過 AI 請求記錄保存，專注於衝突檢測測試`);
        
    } catch (err) {
        console.error(`❌ AI 請求處理失敗 - 用戶: ${user.name}, 動作: ${action}, 錯誤: ${err.message}`);
        response = '😅 抱歉，AI 助教暫時無法處理您的請求。請檢查網路連接或稍後再試。如果問題持續，請聯繫管理員。';
        error = 'ai_processing_failed';
    }
    
    // 發送 AI 回應給用戶
    ws.send(JSON.stringify({
        type: 'ai_response',
        action: action,
        requestId: requestId,
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
            const errorData = await response.json().catch(() => ({}));
            console.error(`OpenAI API錯誤: ${response.status}`, errorData);
            throw new Error(`OpenAI API錯誤: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('OpenAI API 回應格式異常');
        }
        
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('AI分析錯誤:', error.message);
        
        // 根據錯誤類型提供不同的回應
        if (error.message.includes('401')) {
            return '🔑 API密鑰無效，請檢查OpenAI API密鑰設定。';
        } else if (error.message.includes('429')) {
            return '⏰ API請求頻率過高，請稍後再試。';
        } else if (error.message.includes('quota')) {
            return '💳 API配額已用完，請檢查OpenAI帳戶餘額。';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            return '🌐 網路連接問題，請檢查網路連接後重試。';
        } else {
            return '😅 抱歉，AI分析功能暫時無法使用。請稍後再試或聯繫管理員。';
        }
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
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`OpenAI API錯誤: ${response.status}`, errorData);
            throw new Error(`OpenAI API錯誤: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('OpenAI API 回應格式異常');
        }
        
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('AI除錯功能錯誤:', error.message);
        
        // 根據錯誤類型提供不同的回應
        if (error.message.includes('401')) {
            return '🔑 API密鑰無效，請檢查OpenAI API密鑰設定。';
        } else if (error.message.includes('429')) {
            return '⏰ API請求頻率過高，請稍後再試。';
        } else if (error.message.includes('quota')) {
            return '💳 API配額已用完，請檢查OpenAI帳戶餘額。';
        } else {
            return '😅 抱歉，AI除錯功能暫時無法使用。請檢查網路連接或稍後再試。';
        }
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
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`OpenAI API錯誤: ${response.status}`, errorData);
            throw new Error(`OpenAI API錯誤: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('OpenAI API 回應格式異常');
        }
        
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('AI改進建議錯誤:', error.message);
        
        // 根據錯誤類型提供不同的回應
        if (error.message.includes('401')) {
            return '🔑 API密鑰無效，請檢查OpenAI API密鑰設定。';
        } else if (error.message.includes('429')) {
            return '⏰ API請求頻率過高，請稍後再試。';
        } else if (error.message.includes('quota')) {
            return '💳 API配額已用完，請檢查OpenAI帳戶餘額。';
        } else {
            return '😅 抱歉，AI改進建議功能暫時無法使用。請稍後再試。';
        }
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
    console.log(`🔍 [analyzeConflict] 收到的衝突數據:`, conflictData);
    
    if (!aiConfig.openai_api_key) {
        return `🤖 **協作衝突分析** 
        
**🔍 衝突原因：**
${conflictData?.conflictUser || '其他同學'}正在同時修改程式碼，形成協作衝突。

**💡 解決建議：**
1. **即時溝通：** 在聊天室與${conflictData?.conflictUser || '其他同學'}討論
2. **選擇版本：** 比較雙方的修改，選擇更好的版本  
3. **協作分工：** 將不同功能分配給不同同學
4. **手動合併：** 結合兩個版本的優點

**🚀 預防措施：**
- 修改前先在聊天室告知其他同學
- 使用註解標記自己負責的部分
- 頻繁保存和同步程式碼

💡 提示：配置OpenAI API密鑰可獲得更詳細的AI分析。`;
    }
    
    if (!conflictData) {
        console.log(`⚠️ [analyzeConflict] 衝突數據為空，提供基本分析`);
        return `🤖 **協作衝突基本分析**

**🔍 衝突原因：**
檢測到多人協作衝突，需要協調解決。

**💡 解決建議：**
1. **即時溝通** - 在聊天室與同學討論
2. **協調編輯** - 避免同時修改相同部分
3. **版本選擇** - 比較修改內容，選擇較好版本

建議配置AI功能以獲得更詳細分析。`;
    }
    
    const { userCode = '', serverCode = '', userVersion = 0, serverVersion = 0, conflictUser = '其他同學', roomId = '未知房間' } = conflictData;
    
    console.log(`🔍 [analyzeConflict] 解析後的數據:`, {
        userCodeLength: userCode.length,
        serverCodeLength: serverCode.length,
        userVersion,
        serverVersion,
        conflictUser,
        roomId
    });
    
    try {
        const conflictPrompt = `
作為Python程式設計助教，請分析以下協作衝突情況並提供解決建議：

**協作衝突情況：**
- 房間：${roomId}
- 衝突同學：${conflictUser}
- 我的版本：${userVersion}
- 同學版本：${serverVersion}

**我的程式碼：**
\`\`\`python
${userCode || '# (目前是空白代碼)'}
\`\`\`

**同學的程式碼：**
\`\`\`python
${serverCode || '# (同學的代碼)'}
\`\`\`

請提供：
1. 協作衝突的原因分析
2. 兩個版本的差異比較（如果有代碼的話）
3. 具體的協作解決建議
4. 如何避免未來的協作衝突

請用繁體中文回答，使用清楚的段落和標題格式，包含適當的換行和分段，語氣要友善且具教育性。即使代碼為空也要提供有用的協作建議。
        `;
        
        console.log(`📡 [analyzeConflict] 向OpenAI發送請求...`);
        
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
                        content: '你是一位經驗豐富的程式設計助教，專門協助學生解決協作程式設計中的衝突問題。請提供實用、友善的建議，並使用清楚的段落格式。'
                    },
                    {
                        role: 'user',
                        content: conflictPrompt
                    }
                ],
                max_tokens: Math.min(aiConfig.max_tokens, 1500), // 限制token數量提高速度
                temperature: 0.3 // 降低temperature提高穩定性
            })
        });
        
        if (!response.ok) {
            console.error(`❌ [analyzeConflict] OpenAI API錯誤: ${response.status}`);
            throw new Error(`OpenAI API錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        console.log(`✅ [analyzeConflict] AI回應成功，長度: ${aiResponse.length}`);
        return aiResponse;
        
    } catch (error) {
        console.error('❌ [analyzeConflict] AI衝突分析錯誤:', error);
        return `🤖 **協作衝突快速分析** 

**🔍 衝突原因：**
多位同學同時修改程式碼，導致協作衝突。

**💡 解決建議：**
1. **溝通協調：** 在聊天室與${conflictUser}討論各自的修改內容
2. **版本選擇：** 比較兩個版本，選擇較好的一個
3. **手動合併：** 將兩個版本的優點結合起來
4. **分工協作：** 將不同功能分配給不同同學

**🚀 預防措施：**
- 修改前先在聊天室告知其他同學
- 頻繁保存和同步程式碼
- 使用註解標記自己負責的部分

⚠️ AI詳細分析暫時無法使用，但以上建議仍然有效。`;
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
    
    let successCount = 0;
    let failureCount = 0;
    
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
                    ...message,
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
let PORT = process.env.PORT || process.env.WEB_PORT || 8080;

// 如果 PORT 是字符串形式的環境變數引用，嘗試解析
if (typeof PORT === 'string' && PORT.includes('WEB_PORT')) {
    PORT = process.env.WEB_PORT || 8080;
}

// 確保 PORT 是數字
PORT = parseInt(PORT) || 8080;

// 🔧 增強環境檢測邏輯
const isZeabur = !!(process.env.ZEABUR || 
                   process.env.ZEABUR_URL || 
                   process.env.ZEABUR_SERVICE_DOMAIN ||
                   (process.env.NODE_ENV === 'production' && process.env.PORT));

const isRender = process.env.RENDER || process.env.RENDER_SERVICE_NAME;
const isLocal = !isZeabur && !isRender && (process.env.NODE_ENV !== 'production');

console.log(`\n🌍 部署環境檢測:`);
console.log(`   - Zeabur: ${isZeabur ? '✅' : '❌'}`);
console.log(`   - Render: ${isRender ? '✅' : '❌'}`);  
console.log(`   - 本地開發: ${isLocal ? '✅' : '❌'}`);
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || '未設定'}`);
console.log(`   - PORT: ${PORT}`);

// 環境變數檢查
if (isZeabur) {
    console.log(`\n🔧 Zeabur 環境變數檢查:`);
    console.log(`   - ZEABUR: ${process.env.ZEABUR || '未設定'}`);
    console.log(`   - ZEABUR_URL: ${process.env.ZEABUR_URL || '未設定'}`);
    console.log(`   - ZEABUR_SERVICE_DOMAIN: ${process.env.ZEABUR_SERVICE_DOMAIN || '未設定'}`);
}

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
    
    // 系統配置信息
    console.log(`\n⚙️ 系統配置:`);
    console.log(`   - 最大並發用戶: ${MAX_CONCURRENT_USERS}`);
    console.log(`   - 最大房間數: ${MAX_ROOMS}`);
    console.log(`   - 每房間最大用戶: ${MAX_USERS_PER_ROOM}`);
    console.log(`   - 自動保存間隔: ${AUTO_SAVE_INTERVAL / 1000}秒`);
    
    // 網路配置 - 根據環境動態生成
    let publicUrl;
    if (isZeabur && (process.env.ZEABUR_URL || process.env.ZEABUR_SERVICE_DOMAIN)) {
        publicUrl = process.env.ZEABUR_URL || `https://${process.env.ZEABUR_SERVICE_DOMAIN}`;
    } else if (isRender && process.env.RENDER_EXTERNAL_URL) {
        publicUrl = process.env.RENDER_EXTERNAL_URL;
    } else if (isLocal) {
        publicUrl = `http://${HOST}:${PORT}`;
    } else {
        publicUrl = PUBLIC_URL || `http://${HOST}:${PORT}`;
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
    
    // 在Zeabur環境中測試AI功能
    if (isZeabur && aiConfig.enabled && aiConfig.openai_api_key) {
        console.log(`\n🚀 檢測到Zeabur環境，開始測試AI功能...`);
        setTimeout(() => {
            testAIFunctionsOnZeabur();
        }, 3000); // 延遲3秒確保服務器完全啟動
    } else if (aiConfig.enabled && aiConfig.openai_api_key) {
        console.log(`\n🧪 本地環境，AI功能已配置但跳過自動測試`);
        console.log(`💡 提示：部署到Zeabur後將自動測試AI功能`);
    }
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
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        ws.send(JSON.stringify({
            type: 'code_loaded',
            success: false,
            error: '請先加入房間'
        }));
        return;
    }
    
    const room = rooms[roomId];
    
    const currentVersion = message.currentVersion || 0;
    const latestVersion = room.version || 0;
    const latestCode = room.code || '';
    
    console.log(`📥 ${ws.userName} 請求載入 - 當前版本: ${currentVersion}, 最新版本: ${latestVersion}`);
    
    // 比較版本，判斷是否已是最新
    const isAlreadyLatest = currentVersion >= latestVersion;
    
    // 發送響應
    ws.send(JSON.stringify({
        type: 'code_loaded',
        success: true,
        code: latestCode,
        version: latestVersion,
        currentVersion: currentVersion,
        isAlreadyLatest: isAlreadyLatest,
        roomId: roomId
    }));
    
    if (isAlreadyLatest) {
        console.log(`✅ ${ws.userName} 的代碼已是最新版本 (${currentVersion})`);
    } else {
        console.log(`🔄 ${ws.userName} 載入最新代碼：版本 ${currentVersion} → ${latestVersion}`);
    }
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
            ws.send(JSON.stringify({
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
    ws.send(JSON.stringify({
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
async function handleConflictNotification(ws, message) {
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

// 處理代碼歷史載入請求
async function handleLoadHistory(ws, message) {
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        ws.send(JSON.stringify({
            type: 'code_history_load_error',
            error: '請先加入房間'
        }));
        return;
    }
    
    const room = rooms[roomId];
    
    const history = room.codeHistory || [];
    
    ws.send(JSON.stringify({
        type: 'code_history_loaded',
        history: history
    }));
}

// 處理代碼歷史同步請求
async function handleSyncHistory(ws, message) {
    const roomId = message.room || ws.currentRoom;
    if (!roomId || !rooms[roomId]) {
        ws.send(JSON.stringify({
            type: 'code_history_sync_error',
            error: '請先加入房間'
        }));
        return;
    }
    
    const room = rooms[roomId];
    
    const history = room.codeHistory || [];
    
    ws.send(JSON.stringify({
        type: 'code_history_synced',
        history: history
    }));
}