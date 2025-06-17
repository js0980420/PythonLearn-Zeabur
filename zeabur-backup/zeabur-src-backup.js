const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 🔧 Zeabur /src 目錄 SQL 備份處理腳本
console.log('🔧 Zeabur /src 目錄 SQL 備份處理工具');
console.log('==========================================');

// 檢測運行環境
const isZeaburEnv = process.env.ZEABUR_URL || process.env.ZEABUR_ENV;
const dataDir = isZeaburEnv ? '/src' : './';

console.log(`📂 當前數據目錄: ${dataDir}`);
console.log(`🌍 環境檢測: ${isZeaburEnv ? 'Zeabur' : '本地'}`);

// MySQL 連接配置（優先使用 Zeabur 環境變數）
const dbConfig = {
    host: process.env.MYSQL_HOST || 'hnd1.clusters.zeabur.com',
    port: parseInt(process.env.MYSQL_PORT) || 31962,  // 使用正確的端口
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Aa12022020',
    database: process.env.MYSQL_DATABASE || 'pythonlearn',
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000
};

console.log('🔍 數據庫配置:');
console.log(`   - Host: ${dbConfig.host}`);
console.log(`   - Port: ${dbConfig.port}`);
console.log(`   - User: ${dbConfig.user}`);
console.log(`   - Database: ${dbConfig.database}`);
console.log(`   - Password: ${dbConfig.password ? '已設定' : '未設定'}`);

// 查找 SQL 備份檔案
function findSqlFiles() {
    console.log('\n🔍 搜索 SQL 備份檔案...');
    
    const possibleFiles = [
        'pythonlearn_backup.sql',
        'backup.sql',
        'data.sql',
        'database.sql',
        'pythonlearn.sql'
    ];
    
    const foundFiles = [];
    
    for (const fileName of possibleFiles) {
        const filePath = path.join(dataDir, fileName);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            foundFiles.push({
                name: fileName,
                path: filePath,
                size: stats.size,
                modified: stats.mtime
            });
            console.log(`✅ 找到: ${fileName} (${Math.round(stats.size / 1024)}KB)`);
        }
    }
    
    if (foundFiles.length === 0) {
        console.log('❌ 在當前目錄未找到 SQL 備份檔案');
        console.log('💡 請確認以下檔案是否存在:');
        possibleFiles.forEach(file => console.log(`   - ${file}`));
        return null;
    }
    
    // 返回最新的檔案
    foundFiles.sort((a, b) => b.modified - a.modified);
    const selectedFile = foundFiles[0];
    console.log(`📋 選擇最新檔案: ${selectedFile.name}`);
    return selectedFile;
}

// 測試數據庫連接
async function testConnection() {
    console.log('\n🔌 測試數據庫連接...');
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ 數據庫連接成功！');
        
        // 測試查詢
        const [rows] = await connection.execute('SELECT VERSION() as version');
        console.log(`📊 MySQL 版本: ${rows[0].version}`);
        
        // 查看現有表格
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`📋 現有表格數量: ${tables.length}`);
        if (tables.length > 0) {
            console.log('   表格列表:');
            tables.forEach(table => {
                console.log(`   - ${Object.values(table)[0]}`);
            });
        }
        
        await connection.end();
        return true;
    } catch (error) {
        console.log(`❌ 數據庫連接失敗: ${error.message}`);
        
        if (error.code === 'ETIMEDOUT') {
            console.log('💡 解決建議:');
            console.log('   1. 檢查 Zeabur MySQL 服務是否正常運行');
            console.log('   2. 確認防火牆設置');
            console.log('   3. 驗證連接參數是否正確');
            console.log('   4. 嘗試在 Zeabur 控制台重啟 MySQL 服務');
        }
        
        return false;
    }
}

// 執行 SQL 備份導入
async function importSqlBackup(sqlFile) {
    console.log(`\n📥 開始導入 SQL 備份: ${sqlFile.name}`);
    
    try {
        // 讀取 SQL 檔案
        const sqlContent = fs.readFileSync(sqlFile.path, 'utf8');
        console.log(`📖 SQL 檔案大小: ${Math.round(sqlContent.length / 1024)}KB`);
        
        // 分割 SQL 語句
        const statements = sqlContent
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        console.log(`📝 找到 ${statements.length} 條 SQL 語句`);
        
        const connection = await mysql.createConnection(dbConfig);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            
            try {
                await connection.execute(statement);
                successCount++;
                
                if (i % 10 === 0) {
                    console.log(`⏳ 進度: ${i + 1}/${statements.length} (${Math.round((i + 1) / statements.length * 100)}%)`);
                }
            } catch (error) {
                errorCount++;
                console.log(`⚠️ 語句 ${i + 1} 執行失敗: ${error.message.substring(0, 100)}`);
            }
        }
        
        await connection.end();
        
        console.log('\n📊 導入結果:');
        console.log(`   ✅ 成功: ${successCount} 條語句`);
        console.log(`   ❌ 失敗: ${errorCount} 條語句`);
        console.log(`   📈 成功率: ${Math.round(successCount / statements.length * 100)}%`);
        
        return successCount > 0;
        
    } catch (error) {
        console.log(`❌ 導入過程發生錯誤: ${error.message}`);
        return false;
    }
}

// 驗證導入結果
async function verifyImport() {
    console.log('\n🔍 驗證導入結果...');
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        // 檢查主要表格
        const tablesToCheck = [
            'user_code_saves',
            'rooms', 
            'users',
            'chat_messages'
        ];
        
        for (const tableName of tablesToCheck) {
            try {
                const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
                const count = rows[0].count;
                console.log(`📋 ${tableName}: ${count} 條記錄`);
            } catch (error) {
                console.log(`⚠️ ${tableName}: 表格不存在或無法讀取`);
            }
        }
        
        await connection.end();
        
    } catch (error) {
        console.log(`❌ 驗證過程發生錯誤: ${error.message}`);
    }
}

// 主函數
async function main() {
    console.log('\n🚀 開始處理...');
    
    // 1. 查找 SQL 檔案
    const sqlFile = findSqlFiles();
    if (!sqlFile) {
        console.log('\n❌ 無法找到 SQL 備份檔案，程序結束');
        return;
    }
    
    // 2. 測試數據庫連接
    const connectionOk = await testConnection();
    if (!connectionOk) {
        console.log('\n❌ 數據庫連接失敗，無法繼續導入');
        console.log('💡 請檢查網路連接和數據庫服務狀態');
        return;
    }
    
    // 3. 執行導入
    const importOk = await importSqlBackup(sqlFile);
    if (!importOk) {
        console.log('\n❌ SQL 備份導入失敗');
        return;
    }
    
    // 4. 驗證結果
    await verifyImport();
    
    console.log('\n🎉 處理完成！');
    console.log('💡 現在可以重啟應用程序，數據庫模式應該會自動啟用');
}

// 執行主函數
main().catch(error => {
    console.error('💥 程序執行出錯:', error);
    process.exit(1);
}); 