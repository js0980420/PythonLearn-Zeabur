const fs = require('fs');
const path = require('path');

// 🚀 複製 SQL 備份到 Zeabur /src 目錄工具
console.log('🚀 複製 SQL 備份到 Zeabur /src 目錄工具');
console.log('=====================================');

// 檢測環境
const isZeaburEnv = process.env.ZEABUR_URL || process.env.ZEABUR_ENV || process.env.NODE_ENV === 'production';
const sourceDir = './';  // 本地目錄
const targetDir = isZeaburEnv ? '/src' : './zeabur-backup/';  // Zeabur 使用 /src，本地模擬使用 zeabur-backup

console.log(`📂 來源目錄: ${sourceDir}`);
console.log(`📁 目標目錄: ${targetDir}`);
console.log(`🌍 環境: ${isZeaburEnv ? 'Zeabur 雲端' : '本地開發'}`);

// 尋找 SQL 備份檔案
function findSqlBackupFiles() {
    console.log('\n🔍 尋找 SQL 備份檔案...');
    
    const sqlFiles = [
        'pythonlearn_backup.sql',
        'backup.sql', 
        'database.sql',
        'pythonlearn.sql',
        'data.sql'
    ];
    
    const foundFiles = [];
    
    for (const fileName of sqlFiles) {
        const filePath = path.join(sourceDir, fileName);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            foundFiles.push({
                name: fileName,
                path: filePath,
                size: stats.size,
                modified: stats.mtime
            });
            
            console.log(`✅ 找到: ${fileName}`);
            console.log(`   大小: ${Math.round(stats.size / 1024)}KB`);
            console.log(`   修改時間: ${stats.mtime.toLocaleString()}`);
        }
    }
    
    if (foundFiles.length === 0) {
        console.log('❌ 未找到任何 SQL 備份檔案');
        console.log('💡 請確認以下檔案是否存在於當前目錄:');
        sqlFiles.forEach(file => console.log(`   - ${file}`));
        return [];
    }
    
    return foundFiles;
}

// 確保目標目錄存在
function ensureTargetDirectory() {
    console.log(`\n📁 檢查目標目錄: ${targetDir}`);
    
    if (!fs.existsSync(targetDir)) {
        try {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`✅ 創建目標目錄: ${targetDir}`);
        } catch (error) {
            console.log(`❌ 無法創建目標目錄: ${error.message}`);
            return false;
        }
    } else {
        console.log(`✅ 目標目錄已存在: ${targetDir}`);
    }
    
    return true;
}

// 複製檔案
function copyFile(sourceFile, targetPath) {
    console.log(`\n📋 複製檔案: ${sourceFile.name}`);
    console.log(`   從: ${sourceFile.path}`);
    console.log(`   到: ${targetPath}`);
    
    try {
        // 檢查目標檔案是否已存在
        if (fs.existsSync(targetPath)) {
            const targetStats = fs.statSync(targetPath);
            console.log(`⚠️ 目標檔案已存在 (大小: ${Math.round(targetStats.size / 1024)}KB)`);
            console.log(`   是否覆蓋? 繼續複製...`);
        }
        
        // 複製檔案
        fs.copyFileSync(sourceFile.path, targetPath);
        
        // 驗證複製結果
        const copiedStats = fs.statSync(targetPath);
        const originalSize = sourceFile.size;
        const copiedSize = copiedStats.size;
        
        if (originalSize === copiedSize) {
            console.log(`✅ 複製成功! 檔案大小: ${Math.round(copiedSize / 1024)}KB`);
            return true;
        } else {
            console.log(`❌ 複製失敗: 檔案大小不符 (原始: ${originalSize}, 複製: ${copiedSize})`);
            return false;
        }
        
    } catch (error) {
        console.log(`❌ 複製失敗: ${error.message}`);
        return false;
    }
}

// 列出目標目錄內容
function listTargetDirectory() {
    console.log(`\n📋 目標目錄內容 (${targetDir}):`);
    
    try {
        const files = fs.readdirSync(targetDir);
        
        if (files.length === 0) {
            console.log('   (空目錄)');
            return;
        }
        
        files.forEach(fileName => {
            const filePath = path.join(targetDir, fileName);
            const stats = fs.statSync(filePath);
            
            if (fileName.endsWith('.sql')) {
                console.log(`✅ ${fileName} (${Math.round(stats.size / 1024)}KB)`);
            } else {
                console.log(`📄 ${fileName} (${Math.round(stats.size / 1024)}KB)`);
            }
        });
        
    } catch (error) {
        console.log(`❌ 無法讀取目標目錄: ${error.message}`);
    }
}

// 生成使用說明
function generateInstructions() {
    console.log('\n📝 使用說明:');
    
    if (isZeaburEnv) {
        console.log('🌍 在 Zeabur 環境中:');
        console.log('   1. SQL 檔案已複製到 /src 目錄');
        console.log('   2. 執行: node /src/zeabur-src-backup.js');
        console.log('   3. 或手動導入到 MySQL 數據庫');
    } else {
        console.log('💻 在本地環境中:');
        console.log('   1. SQL 檔案已準備到 zeabur-backup/ 目錄');
        console.log('   2. 部署到 Zeabur 後，檔案會自動複製到 /src');
        console.log('   3. 在 Zeabur 控制台中執行導入腳本');
    }
    
    console.log('\n🔧 MySQL 導入命令 (如果有 MySQL 客戶端):');
    console.log('   mysql -h hnd1.clusters.zeabur.com -P 31962 -u root -p pythonlearn < pythonlearn_backup.sql');
    
    console.log('\n💡 環境變數設置 (Zeabur 控制台):');
    console.log('   MYSQL_HOST=hnd1.clusters.zeabur.com');
    console.log('   MYSQL_PORT=31962');
    console.log('   MYSQL_USER=root');
    console.log('   MYSQL_PASSWORD=Aa12022020');
    console.log('   MYSQL_DATABASE=pythonlearn');
}

// 主函數
function main() {
    console.log('\n🚀 開始處理...');
    
    // 1. 尋找 SQL 備份檔案
    const sqlFiles = findSqlBackupFiles();
    if (sqlFiles.length === 0) {
        console.log('\n❌ 沒有找到 SQL 備份檔案，程序結束');
        return;
    }
    
    // 2. 確保目標目錄存在
    if (!ensureTargetDirectory()) {
        console.log('\n❌ 無法創建目標目錄，程序結束');
        return;
    }
    
    // 3. 複製所有找到的 SQL 檔案
    let successCount = 0;
    for (const sqlFile of sqlFiles) {
        const targetPath = path.join(targetDir, sqlFile.name);
        if (copyFile(sqlFile, targetPath)) {
            successCount++;
        }
    }
    
    // 4. 列出目標目錄內容
    listTargetDirectory();
    
    // 5. 生成使用說明
    generateInstructions();
    
    console.log('\n🎉 處理完成!');
    console.log(`📊 成功複製 ${successCount}/${sqlFiles.length} 個檔案`);
    
    if (successCount > 0) {
        console.log('✅ 準備就緒，可以進行數據庫導入');
    } else {
        console.log('❌ 沒有成功複製任何檔案');
    }
}

// 執行主函數
try {
    main();
} catch (error) {
    console.error('💥 程序執行出錯:', error);
    process.exit(1);
} 