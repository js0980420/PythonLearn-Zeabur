#!/usr/bin/env node

/**
 * 用戶數據恢復腳本
 * 用於檢查和恢復特定用戶的保存記錄
 */

const mysql = require('mysql2/promise');
const fs = require('fs');

// 從備份 SQL 文件中提取數據
async function extractUserDataFromSQL(sqlFile, userName) {
    try {
        if (!fs.existsSync(sqlFile)) {
            console.log(`❌ 備份文件不存在: ${sqlFile}`);
            return null;
        }

        const sqlContent = fs.readFileSync(sqlFile, 'utf8');
        console.log(`🔍 正在搜索用戶 "${userName}" 的數據...`);
        
        // 搜索該用戶的保存記錄
        const userCodeSavesPattern = /INSERT INTO `user_code_saves`[^;]+;/g;
        const userDataPattern = new RegExp(`'${userName}'`, 'g');
        
        const matches = sqlContent.match(userCodeSavesPattern) || [];
        const userRecords = matches.filter(match => match.includes(`'${userName}'`));
        
        if (userRecords.length > 0) {
            console.log(`✅ 找到 ${userRecords.length} 筆 "${userName}" 的保存記錄`);
            return userRecords;
        } else {
            console.log(`⚠️ 在備份文件中未找到用戶 "${userName}" 的保存記錄`);
            return [];
        }
        
    } catch (error) {
        console.error('❌ 讀取備份文件失敗:', error.message);
        return null;
    }
}

// 連接數據庫並恢復數據
async function restoreUserData(userName) {
    let connection = null;
    
    try {
        // 數據庫配置
        const dbConfig = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: process.env.MYSQL_DATABASE || 'python_collaboration',
            port: process.env.MYSQL_PORT || 3306
        };

        console.log('🔗 嘗試連接數據庫...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ 數據庫連接成功');

        // 檢查現有數據
        const [existingRecords] = await connection.execute(
            'SELECT * FROM user_code_saves WHERE user_name = ?',
            [userName]
        );

        console.log(`📊 現有記錄數量: ${existingRecords.length}`);
        
        if (existingRecords.length > 0) {
            console.log('📋 現有保存記錄:');
            existingRecords.forEach((record, index) => {
                console.log(`   ${index + 1}. 槽位 ${record.slot_id}: ${record.slot_name}`);
                console.log(`      最新: ${record.is_latest ? '是' : '否'} | 建立時間: ${record.created_at}`);
            });
        } else {
            console.log(`⚠️ 數據庫中沒有找到用戶 "${userName}" 的保存記錄`);
        }

        // 從備份文件提取數據
        const backupData = await extractUserDataFromSQL('pythonlearn_backup.sql', userName);
        
        if (backupData && backupData.length > 0) {
            console.log(`\n🔄 準備恢復 ${backupData.length} 筆記錄...`);
            
            // 這裡可以手動解析 SQL 插入語句並恢復數據
            console.log('💡 建議操作:');
            console.log('1. 將 pythonlearn_backup.sql 中的相關數據手動導入');
            console.log('2. 或使用 MySQL 工具直接導入整個備份檔案');
            console.log('3. 確保 Zeabur MySQL 環境變數配置正確');
        }

        return existingRecords;

    } catch (error) {
        console.error('❌ 數據庫操作失敗:', error.message);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n💡 解決方案:');
            console.log('1. 檢查 MySQL 環境變數是否正確設置');
            console.log('2. 在 Zeabur 控制台配置 MySQL 服務');
            console.log('3. 確保數據庫用戶權限正確');
        }
        
        return null;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 生成恢復指導
function generateRestoreGuide(userName) {
    console.log(`\n📖 "${userName}" 數據恢復指導:`);
    console.log('=====================================');
    console.log('');
    console.log('🎯 方案一：完整恢復 (推薦)');
    console.log('1. 在 Zeabur 控制台添加 MySQL 服務');
    console.log('2. 配置環境變數:');
    console.log('   - MYSQL_HOST=your-mysql-host.zeabur.app');
    console.log('   - MYSQL_USER=root');
    console.log('   - MYSQL_PASSWORD=your-password');
    console.log('   - MYSQL_DATABASE=python_collaboration');
    console.log('3. 使用 MySQL Workbench 或 phpMyAdmin 連接 Zeabur MySQL');
    console.log('4. 導入 zeabur-mysql-import.sql 初始化表結構');
    console.log('5. 選擇性導入 pythonlearn_backup.sql 中的用戶數據');
    console.log('');
    console.log('🎯 方案二：手動恢復');
    console.log('1. 讓學生630重新保存程式碼');
    console.log('2. 確保 MySQL 連接正常後，數據會自動持久化');
    console.log('');
    console.log('🎯 方案三：檢查現有數據');
    console.log('1. 如果 MySQL 已連接，檢查是否有現有數據');
    console.log('2. 使用以下 SQL 查詢:');
    console.log(`   SELECT * FROM user_code_saves WHERE user_name = '${userName}';`);
}

// 主函數
async function main() {
    const userName = process.argv[2] || '學生630';
    
    console.log('🔍 PythonLearn 用戶數據恢復工具');
    console.log('===================================');
    console.log(`📋 目標用戶: ${userName}`);
    console.log('');

    // 檢查備份文件
    if (!fs.existsSync('pythonlearn_backup.sql')) {
        console.log('❌ 找不到 pythonlearn_backup.sql 備份文件');
        console.log('💡 請確保備份文件在當前目錄中');
        return;
    }

    // 嘗試連接數據庫並恢復數據
    const result = await restoreUserData(userName);
    
    // 生成恢復指導
    generateRestoreGuide(userName);
    
    console.log('\n🎉 恢復腳本執行完成');
    console.log('📞 如需協助，請檢查上述指導步驟');
}

// 執行主函數
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { restoreUserData, extractUserDataFromSQL }; 