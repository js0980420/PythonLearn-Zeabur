const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/**
 * 修正的 Zeabur MySQL 連接測試
 * 使用從控制台獲取的正確配置
 */

// 🔧 Zeabur MySQL 修復版導入工具 - 解決 ETIMEDOUT 問題
console.log('🔧 Zeabur MySQL 修復版導入工具 v3.0');
console.log('=====================================');
console.log('🎯 專門解決 ETIMEDOUT 連接超時問題');
console.log('');

// 檢測 Zeabur 環境
const isZeabur = !!(process.env.MYSQL_HOST || process.env.ZEABUR_URL);
console.log(`🌍 環境: ${isZeabur ? 'Zeabur 雲端' : '本地開發'}`);

// 增強版 MySQL 配置 - 更長超時時間
const dbConfig = {
    host: process.env.MYSQL_HOST || 'hnd1.clusters.zeabur.com',
    port: parseInt(process.env.MYSQL_PORT) || 31962,
    user: process.env.MYSQL_USER || 'root', 
    password: process.env.MYSQL_PASSWORD || 'Aa12022020',
    database: process.env.MYSQL_DATABASE || 'pythonlearn',
    connectTimeout: 180000,    // 3分鐘
    acquireTimeout: 180000,    // 3分鐘
    requestTimeout: 180000,    // 3分鐘
    multipleStatements: true,
    charset: 'utf8mb4'
};

console.log(`📡 連接目標: ${dbConfig.host}:${dbConfig.port}`);
console.log(`⏱️ 超時設定: ${dbConfig.connectTimeout/1000} 秒`);

// 尋找 SQL 檔案
function findSqlFile() {
    const files = ['pythonlearn_backup.sql', 'backup.sql', 'database.sql'];
    for (const file of files) {
        if (fs.existsSync(file)) {
            const stats = fs.statSync(file);
            console.log(`✅ 找到: ${file} (${Math.round(stats.size/1024)}KB)`);
            return file;
        }
    }
    return null;
}

// 重試連接機制
async function connectWithRetry(maxRetries = 3) {
    for (let i = 1; i <= maxRetries; i++) {
        try {
            console.log(`🔄 連接嘗試 ${i}/${maxRetries}...`);
            const connection = await mysql.createConnection(dbConfig);
            console.log('✅ MySQL 連接成功！');
            return connection;
        } catch (error) {
            console.log(`❌ 嘗試 ${i} 失敗: ${error.code} - ${error.message}`);
            if (i < maxRetries) {
                console.log(`⏳ 等待 10 秒後重試...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
    throw new Error('所有連接嘗試都失敗');
}

// 主執行函數
async function main() {
    try {
        // 1. 找到 SQL 檔案
        const sqlFile = findSqlFile();
        if (!sqlFile) {
            console.log('❌ 未找到 SQL 備份檔案');
            return;
        }

        // 2. 連接數據庫
        let connection;
        try {
            connection = await connectWithRetry(3);
        } catch (error) {
            console.log('❌ 無法連接到 MySQL:');
            console.log('💡 建議解決方案:');
            console.log('1. 在 Zeabur 控制台重啟 MySQL 服務');
            console.log('2. 檢查環境變數是否正確設定');
            console.log('3. 等待幾分鐘後重新嘗試');
            return;
        }

        // 3. 讀取並執行 SQL
        console.log(`📖 讀取 ${sqlFile}...`);
        const sqlContent = fs.readFileSync(sqlFile, 'utf8');
        const statements = sqlContent.split(';').filter(s => s.trim());
        
        console.log(`📊 找到 ${statements.length} 個 SQL 語句`);
        console.log('🚀 開始導入...');

        await connection.beginTransaction();
        
        let success = 0;
        for (let i = 0; i < statements.length; i++) {
            try {
                if (statements[i].trim()) {
                    await connection.execute(statements[i]);
                    success++;
                }
                if (i % 20 === 0) {
                    console.log(`⏳ 進度: ${Math.round(i/statements.length*100)}%`);
                }
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    console.log(`⚠️ 語句 ${i+1} 失敗: ${error.message.substring(0,50)}`);
                }
            }
        }

        await connection.commit();
        console.log(`✅ 導入完成！成功執行 ${success} 個語句`);

        // 4. 驗證結果
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`📋 創建了 ${tables.length} 個表格`);
        
        await connection.end();
        console.log('🎉 數據導入成功！請重啟 Zeabur 應用服務');

    } catch (error) {
        console.log(`💥 執行失敗: ${error.message}`);
    }
}

main(); 