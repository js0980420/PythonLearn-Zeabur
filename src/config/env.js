/**
 * 環境變數配置
 */
module.exports = {
    // 服務器配置
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0',
        env: process.env.NODE_ENV || 'development'
    },

    // MySQL 配置
    mysql: {
        host: process.env.MYSQL_HOST || 'service-6849c758e67e4ed917d8b36',
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE || 'pythonlearn',
        connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT) || 10,
        charset: 'utf8mb4',
        waitForConnections: true,
        queueLimit: 0
    },

    // OpenAI 配置
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3,
        timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000
    },

    // 應用配置
    app: {
        maxConcurrentUsers: parseInt(process.env.MAX_CONCURRENT_USERS) || 50,
        maxRooms: parseInt(process.env.MAX_ROOMS) || 12,
        maxUsersPerRoom: parseInt(process.env.MAX_USERS_PER_ROOM) || 4,
        websocketTimeout: parseInt(process.env.WEBSOCKET_TIMEOUT) || 300000,
        autoSaveInterval: parseInt(process.env.AUTO_SAVE_INTERVAL) || 180000,
        cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 300000
    }
}; 