const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 🚀 Zeabur SQL 導入工具 - 專為 Zeabur 環境設計
console.log('🚀 Zeabur SQL 導入工具');
console.log('====================');

// 檢測運行環境
const isZeaburEnv = process.env.ZEABUR_URL || process.env.ZEABUR_ENV || process.env.NODE_ENV === 'production';
const isLocal = !isZeaburEnv;

console.log(`🌍 運行環境: ${isZeaburEnv ? 'Zeabur 雲端' : '本地開發'}`);
console.log(`📂 當前工作目錄: ${process.cwd()}`);

// MySQL 連接配置 - 根據環境自動選擇
const dbConfig = isZeaburEnv ? {
    // Zeabur 環境配置
    host: process.env.MYSQL_HOST || 'hnd1.clusters.zeabur.com',
    port: parseInt(process.env.MYSQL_PORT) || 31962,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Aa12022020',
    database: process.env.MYSQL_DATABASE || 'pythonlearn',
    connectTimeout: 60000,
    acquireTimeout: 60000
} : {
    // 本地環境配置
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '', // 本地通常無密碼
    database: 'python_collaboration',
    connectTimeout: 10000,
    acquireTimeout: 10000
};

console.log('🔍 數據庫配置:');
console.log(`   - Host: ${dbConfig.host}`);
console.log(`   - Port: ${dbConfig.port}`);
console.log(`   - User: ${dbConfig.user}`);
console.log(`   - Database: ${dbConfig.database}`);
console.log(`   - Password: ${dbConfig.password ? '已設定' : '未設定'}`);

// 尋找 SQL 備份檔案
function findSqlBackupFile() {
    console.log('\n🔍 搜索 SQL 備份檔案...');
    
    // 在不同位置尋找 SQL 檔案
    const searchPaths = [
        './pythonlearn_backup.sql',
        './backup.sql',
        './data.sql',
        './database.sql',
        './zeabur-backup/pythonlearn_backup.sql',
        '../pythonlearn_backup.sql'
    ];
    
    for (const filePath of searchPaths) {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`✅ 找到 SQL 檔案: ${filePath}`);
            console.log(`   檔案大小: ${Math.round(stats.size / 1024)}KB`);
            console.log(`   修改時間: ${stats.mtime.toISOString()}`);
            return {
                path: filePath,
                size: stats.size,
                name: path.basename(filePath)
            };
        }
    }
    
    console.log('❌ 未找到 SQL 備份檔案');
    console.log('💡 請確認以下任一檔案存在:');
    searchPaths.forEach(p => console.log(`   - ${p}`));
    return null;
}

// 測試數據庫連接
async function testDatabaseConnection() {
    console.log('\n🔌 測試數據庫連接...');
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        // 基本連接測試
        console.log('✅ 數據庫連接成功！');
        
        // 獲取 MySQL 版本
        const [versionRows] = await connection.execute('SELECT VERSION() as version');
        console.log(`📊 MySQL 版本: ${versionRows[0].version}`);
        
        // 檢查現有表格
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`📋 現有表格數量: ${tables.length}`);
        
        if (tables.length > 0) {
            console.log('   現有表格:');
            tables.forEach(table => {
                const tableName = Object.values(table)[0];
                console.log(`   - ${tableName}`);
            });
        } else {
            console.log('   📝 資料庫為空，準備導入數據');
        }
        
        // 檢查數據庫權限
        try {
            await connection.execute('CREATE TABLE IF NOT EXISTS test_permissions (id INT)');
            await connection.execute('DROP TABLE test_permissions');
            console.log('✅ 資料庫寫入權限正常');
        } catch (permError) {
            console.log('⚠️ 資料庫權限檢查失敗:', permError.message);
        }
        
        await connection.end();
        return true;
        
    } catch (error) {
        console.log(`❌ 資料庫連接失敗: ${error.message}`);
        
        // 提供詳細的錯誤診斷
        if (error.code === 'ETIMEDOUT') {
            console.log('💡 連接超時解決方案:');
            console.log('   1. 檢查網路連接');
            console.log('   2. 確認資料庫服務正在運行');
            console.log('   3. 驗證主機名和端口設定');
            if (isZeaburEnv) {
                console.log('   4. 在 Zeabur 控制台重啟 MySQL 服務');
            }
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('💡 權限拒絕解決方案:');
            console.log('   1. 檢查用戶名和密碼');
            console.log('   2. 確認資料庫存在');
            console.log('   3. 驗證用戶權限設定');
        } else if (error.code === 'ENOTFOUND') {
            console.log('💡 主機找不到解決方案:');
            console.log('   1. 檢查主機名拼寫');
            console.log('   2. 確認 DNS 解析');
            console.log('   3. 驗證網路連接');
        }
        
        return false;
    }
}

// 執行 SQL 導入
async function importSqlFile(sqlFile) {
    console.log(`\n📥 開始導入 SQL 檔案: ${sqlFile.name}`);
    
    try {
        // 讀取 SQL 檔案內容
        const sqlContent = fs.readFileSync(sqlFile.path, 'utf8');
        console.log(`📖 SQL 檔案大小: ${Math.round(sqlContent.length / 1024)}KB`);
        
        // 清理和分割 SQL 語句
        const statements = sqlContent
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));
        
        console.log(`📝 準備執行 ${statements.length} 條 SQL 語句`);
        
        // 建立資料庫連接
        const connection = await mysql.createConnection(dbConfig);
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        console.log('⏳ 開始執行 SQL 語句...');
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            
            try {
                await connection.execute(statement);
                successCount++;
                
                // 每 10 條語句顯示一次進度
                if ((i + 1) % 10 === 0 || i === statements.length - 1) {
                    const progress = Math.round((i + 1) / statements.length * 100);
                    console.log(`⏳ 進度: ${i + 1}/${statements.length} (${progress}%)`);
                }
                
            } catch (error) {
                errorCount++;
                const errorInfo = {
                    statement: i + 1,
                    error: error.message.substring(0, 100),
                    sqlPreview: statement.substring(0, 50) + '...'
                };
                errors.push(errorInfo);
                
                // 只顯示前 5 個錯誤避免輸出過多
                if (errorCount <= 5) {
                    console.log(`⚠️ 語句 ${i + 1} 失敗: ${error.message.substring(0, 100)}`);
                }
            }
        }
        
        await connection.end();
        
        // 顯示導入結果
        console.log('\n📊 導入結果統計:');
        console.log(`   ✅ 成功執行: ${successCount} 條語句`);
        console.log(`   ❌ 執行失敗: ${errorCount} 條語句`);
        console.log(`   📈 成功率: ${Math.round(successCount / statements.length * 100)}%`);
        
        if (errorCount > 0 && errorCount <= 10) {
            console.log('\n⚠️ 錯誤詳情:');
            errors.forEach((err, index) => {
                console.log(`   ${index + 1}. 語句 ${err.statement}: ${err.error}`);
                console.log(`      SQL: ${err.sqlPreview}`);
            });
        } else if (errorCount > 10) {
            console.log(`\n⚠️ 錯誤過多 (${errorCount} 個)，請檢查 SQL 檔案格式`);
        }
        
        return successCount > 0;
        
    } catch (error) {
        console.log(`❌ 導入過程發生致命錯誤: ${error.message}`);
        return false;
    }
}

// 驗證導入結果
async function verifyImportResults() {
    console.log('\n🔍 驗證導入結果...');
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        // 檢查核心表格
        const coreTables = [
            'user_code_saves',
            'rooms',
            'users', 
            'chat_messages'
        ];
        
        let totalRecords = 0;
        
        for (const tableName of coreTables) {
            try {
                const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
                const count = rows[0].count;
                totalRecords += count;
                console.log(`📋 ${tableName}: ${count} 條記錄`);
            } catch (error) {
                console.log(`⚠️ ${tableName}: 表格不存在或無法讀取`);
            }
        }
        
        console.log(`\n📊 總計: ${totalRecords} 條記錄`);
        
        await connection.end();
        
        if (totalRecords > 0) {
            console.log('✅ 數據導入驗證成功！');
            return true;
        } else {
            console.log('⚠️ 未找到預期的數據，請檢查導入過程');
            return false;
        }
        
    } catch (error) {
        console.log(`❌ 驗證過程失敗: ${error.message}`);
        return false;
    }
}

// 主執行函數
async function main() {
    try {
        console.log(`\n🚀 開始 SQL 導入流程...`);
        console.log(`⏰ 開始時間: ${new Date().toISOString()}`);
        
        // 1. 尋找 SQL 檔案
        const sqlFile = findSqlBackupFile();
        if (!sqlFile) {
            console.log('\n❌ 未找到 SQL 備份檔案，導入終止');
            process.exit(1);
        }
        
        // 2. 測試資料庫連接
        const connectionSuccess = await testDatabaseConnection();
        if (!connectionSuccess) {
            console.log('\n❌ 資料庫連接失敗，導入終止');
            process.exit(1);
        }
        
        // 3. 執行 SQL 導入
        const importSuccess = await importSqlFile(sqlFile);
        if (!importSuccess) {
            console.log('\n❌ SQL 導入失敗');
            process.exit(1);
        }
        
        // 4. 驗證導入結果
        const verifySuccess = await verifyImportResults();
        
        // 5. 最終結果
        console.log('\n🎉 SQL 導入流程完成！');
        console.log(`⏰ 完成時間: ${new Date().toISOString()}`);
        
        if (verifySuccess) {
            console.log('✅ 所有步驟都成功完成');
            console.log('\n📋 後續步驟:');
            if (isZeaburEnv) {
                console.log('   1. 在 Zeabur 控制台重啟應用服務');
                console.log('   2. 確認環境變數已正確設定');
                console.log('   3. 檢查應用是否切換到資料庫模式');
            } else {
                console.log('   1. 重啟本地應用服務');
                console.log('   2. 檢查資料庫連接是否正常');
            }
        } else {
            console.log('⚠️ 導入完成但驗證有問題，請檢查數據');
        }
        
    } catch (error) {
        console.error('\n💥 執行過程發生未預期錯誤:', error);
        process.exit(1);
    }
}

// 執行主函數
if (require.main === module) {
    main();
}

module.exports = {
    findSqlBackupFile,
    testDatabaseConnection,
    importSqlFile,
    verifyImportResults
}; 