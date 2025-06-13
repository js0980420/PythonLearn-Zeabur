const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const { spawn } = require('child_process');
const crypto = require('crypto');

// 載入配置
const config = require('./src/config/env');

// 配置服務器
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 初始化 MySQL 連接池
let pool;
try {
    pool = mysql.createPool({
        ...config.mysql,
        waitForConnections: true,
        queueLimit: 0
    });
    console.log('✅ MySQL 連接池建立成功！');
} catch (error) {
    console.error('❌ MySQL 連接失敗:', error);
    pool = null;
}

// ... existing code ...