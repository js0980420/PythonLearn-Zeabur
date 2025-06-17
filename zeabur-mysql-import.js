const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 🚀 Zeabur MySQL 導入工具 - 完全修正版
console.log('🚀 Zeabur MySQL 導入工具 v2.0');
console.log('==============================');

// 檢測運行環境
const isZeaburEnv = !!(
    process.env.ZEABUR_URL || 
    process.env.ZEABUR_ENV || 
    process.env.NODE_ENV === 'production' ||
    process.env.MYSQL_HOST
);

console.log(`🌍 運行環境: ${isZeaburEnv ? 'Zeabur 雲端' : '本地開發'}`);
console.log(`📂 當前工作目錄: ${process.cwd()}`);

// 🔧 MySQL 連接配置 - 智能環境檢測
function getDbConfig() {
    if (isZeaburEnv) {
        // Zeabur 雲端環境配置
        return {
            host: process.env.MYSQL_HOST || 'hnd1.clusters.zeabur.com',
            port: parseInt(process.env.MYSQL_PORT) || 31962,
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || 'Aa12022020',
            database: process.env.MYSQL_DATABASE || 'pythonlearn',
            connectTimeout: 60000,
            acquireTimeout: 60000,
            multipleStatements: true,
            ssl: false
        };
    } else {
        // 本地開發環境配置
        return {
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: '',
            database: 'python_collaboration',
            connectTimeout: 10000,
            multipleStatements: true
        };
    }
}

// 🔍 智能尋找 SQL 備份檔案
function findSqlBackupFile() {
    console.log('🔍 尋找 SQL 備份檔案...');
    
    const possibleFiles = [
        'pythonlearn_backup.sql',
        'backup.sql',
        'database.sql',
        'pythonlearn.sql',
        'data.sql'
    ];
    
    // 搜索位置列表
    const searchPaths = [
        './',                    // 根目錄
        './zeabur-backup/',      // 備份目錄
        '/src/'                  // Zeabur /src 目錄
    ];
    
    for (const searchPath of searchPaths) {
        console.log(`   📁 搜索目錄: ${searchPath}`);
        
        if (fs.existsSync(searchPath)) {
            for (const fileName of possibleFiles) {
                const fullPath = path.join(searchPath, fileName);
                
                if (fs.existsSync(fullPath)) {
                    const stats = fs.statSync(fullPath);
                    console.log(`   ✅ 找到檔案: ${fullPath}`);
                    console.log(`   📏 檔案大小: ${(stats.size / 1024).toFixed(1)} KB`);
                    console.log(`   📅 修改時間: ${stats.mtime.toLocaleString('zh-TW')}`);
                    return fullPath;
                }
            }
        } else {
            console.log(`   ⚠️ 目錄不存在: ${searchPath}`);
        }
    }
    
    return null;
}

// 📊 測試數據庫連接
async function testDatabaseConnection(config) {
    console.log('🔗 測試數據庫連接...');
    console.log(`   📡 主機: ${config.host}:${config.port}`);
    console.log(`   👤 用戶: ${config.user}`);
    console.log(`   🗄️ 數據庫: ${config.database}`);
    
    let connection = null;
    
    try {
        // 嘗試建立連接
        connection = await mysql.createConnection(config);
        
        // 測試基本查詢
        const [rows] = await connection.execute('SELECT 1 as test');
        
        if (rows && rows[0] && rows[0].test === 1) {
            console.log('   ✅ 數據庫連接成功！');
            return true;
        } else {
            console.log('   ❌ 連接測試失敗');
            return false;
        }
        
    } catch (error) {
        console.log('   ❌ 連接失敗:', error.message);
        
        // 提供診斷建議
        if (error.code === 'ECONNREFUSED') {
            console.log('   💡 建議: 檢查 MySQL 服務是否正在運行');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('   💡 建議: 檢查用戶名和密碼是否正確');
        } else if (error.code === 'ETIMEDOUT') {
            console.log('   💡 建議: 檢查網路連接和防火牆設置');
        } else if (error.code === 'ENOTFOUND') {
            console.log('   💡 建議: 檢查主機名是否正確');
        }
        
        return false;
        
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (err) {
                // 忽略關閉連接時的錯誤
            }
        }
    }
}

// 📋 處理 SQL 語句
function processSqlStatements(sqlContent) {
    console.log('📋 處理 SQL 語句...');
    
    // 清理和分割 SQL 語句
    const statements = sqlContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'))
        .join('\n')
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);
    
    console.log(`   📊 處理後的 SQL 語句數量: ${statements.length}`);
    
    // 顯示前幾個語句的預覽
    console.log('   🔍 語句預覽:');
    statements.slice(0, 3).forEach((stmt, index) => {
        const preview = stmt.substring(0, 60) + (stmt.length > 60 ? '...' : '');
        console.log(`      ${index + 1}. ${preview}`);
    });
    
    if (statements.length > 3) {
        console.log(`      ... 和其他 ${statements.length - 3} 個語句`);
    }
    
    return statements;
}

// 📤 執行 SQL 導入
async function executeSqlImport(config, sqlStatements) {
    console.log('📤 開始執行 SQL 導入...');
    
    let connection = null;
    let successCount = 0;
    let errorCount = 0;
    
    try {
        connection = await mysql.createConnection(config);
        console.log('   ✅ 連接建立成功');
        
        // 設置事務
        await connection.beginTransaction();
        console.log('   🔄 開始事務');
        
        // 執行每個 SQL 語句
        for (let i = 0; i < sqlStatements.length; i++) {
            const statement = sqlStatements[i];
            
            try {
                console.log(`   ⏳ 執行語句 ${i + 1}/${sqlStatements.length}...`);
                
                await connection.execute(statement);
                successCount++;
                
                // 每 10 個語句顯示一次進度
                if ((i + 1) % 10 === 0) {
                    const progress = ((i + 1) / sqlStatements.length * 100).toFixed(1);
                    console.log(`   📊 進度: ${progress}% (${i + 1}/${sqlStatements.length})`);
                }
                
            } catch (error) {
                errorCount++;
                console.log(`   ⚠️ 語句 ${i + 1} 執行失敗: ${error.message}`);
                
                // 顯示失敗的語句（前50個字符）
                const preview = statement.substring(0, 50) + '...';
                console.log(`      失敗語句: ${preview}`);
                
                // 如果是嚴重錯誤，回滾事務
                if (error.code === 'ER_SYNTAX_ERROR' || error.code === 'ER_NO_SUCH_TABLE') {
                    console.log('   ❌ 嚴重錯誤，回滾事務');
                    await connection.rollback();
                    throw error;
                }
            }
        }
        
        // 提交事務
        await connection.commit();
        console.log('   ✅ 事務提交成功');
        
    } catch (error) {
        console.log('   ❌ 導入過程發生錯誤:', error.message);
        
        if (connection) {
            try {
                await connection.rollback();
                console.log('   🔄 事務已回滾');
            } catch (rollbackError) {
                console.log('   ⚠️ 回滾失敗:', rollbackError.message);
            }
        }
        
        throw error;
        
    } finally {
        if (connection) {
            try {
                await connection.end();
                console.log('   🔐 連接已關閉');
            } catch (err) {
                // 忽略關閉連接時的錯誤
            }
        }
    }
    
    return { successCount, errorCount };
}

// 📊 驗證導入結果
async function verifyImportResults(config) {
    console.log('📊 驗證導入結果...');
    
    let connection = null;
    
    try {
        connection = await mysql.createConnection(config);
        
        // 檢查表格
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`   📋 找到 ${tables.length} 個表格:`);
        
        for (const table of tables) {
            const tableName = Object.values(table)[0];
            const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM \`${tableName}\``);
            const count = rows[0].count;
            console.log(`      📊 ${tableName}: ${count} 條記錄`);
        }
        
        return true;
        
    } catch (error) {
        console.log('   ❌ 驗證失敗:', error.message);
        return false;
        
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (err) {
                // 忽略關閉連接時的錯誤
            }
        }
    }
}

// 🎯 主要執行函數
async function main() {
    try {
        console.log('🎯 開始 SQL 導入流程...\n');
        
        // 1. 尋找 SQL 檔案
        const sqlFilePath = findSqlBackupFile();
        if (!sqlFilePath) {
            console.log('❌ 找不到任何 SQL 備份檔案');
            console.log('💡 請確保以下檔案之一存在:');
            console.log('   - pythonlearn_backup.sql');
            console.log('   - backup.sql');
            console.log('   - database.sql');
            process.exit(1);
        }
        
        // 2. 讀取 SQL 內容
        console.log('\n📖 讀取 SQL 檔案內容...');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        console.log(`   📏 檔案大小: ${(sqlContent.length / 1024).toFixed(1)} KB`);
        
        // 3. 處理 SQL 語句
        const sqlStatements = processSqlStatements(sqlContent);
        if (sqlStatements.length === 0) {
            console.log('❌ SQL 檔案中沒有有效的語句');
            process.exit(1);
        }
        
        // 4. 獲取數據庫配置
        const dbConfig = getDbConfig();
        
        // 5. 測試連接
        console.log('\n🔗 測試數據庫連接...');
        const connectionOk = await testDatabaseConnection(dbConfig);
        if (!connectionOk) {
            console.log('❌ 無法連接到數據庫，請檢查配置和網路連接');
            process.exit(1);
        }
        
        // 6. 執行導入
        console.log('\n📤 執行 SQL 導入...');
        const { successCount, errorCount } = await executeSqlImport(dbConfig, sqlStatements);
        
        // 7. 驗證結果
        console.log('\n📊 驗證導入結果...');
        await verifyImportResults(dbConfig);
        
        // 8. 顯示最終結果
        console.log('\n🎉 SQL 導入完成！');
        console.log('===============================');
        console.log(`✅ 成功執行: ${successCount} 個語句`);
        console.log(`❌ 執行失敗: ${errorCount} 個語句`);
        console.log(`📊 成功率: ${((successCount / (successCount + errorCount)) * 100).toFixed(1)}%`);
        
        if (isZeaburEnv) {
            console.log('\n🌐 Zeabur 環境導入成功！');
            console.log('💡 現在可以重啟您的應用服務來使用數據庫模式');
        }
        
    } catch (error) {
        console.log('\n❌ 導入過程發生錯誤:', error.message);
        console.log('🔍 錯誤詳情:', error);
        process.exit(1);
    }
}

// 🚀 啟動腳本
if (require.main === module) {
    main().catch(error => {
        console.error('💥 腳本執行失敗:', error);
        process.exit(1);
    });
}

module.exports = { main, findSqlBackupFile, testDatabaseConnection }; 