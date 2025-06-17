@echo off
chcp 65001 >nul
echo.
echo ============================================
echo 🚀 部署 SQL 備份到 Zeabur 並執行導入
echo ============================================
echo.

REM 檢查 pythonlearn_backup.sql 是否存在
if not exist "pythonlearn_backup.sql" (
    echo ❌ 錯誤: 找不到 pythonlearn_backup.sql 檔案
    echo 💡 請確保 pythonlearn_backup.sql 在當前目錄中
    echo.
    dir *.sql
    echo.
    pause
    exit /b 1
)

echo ✅ 找到 SQL 備份檔案: pythonlearn_backup.sql
for %%F in (pythonlearn_backup.sql) do echo    檔案大小: %%~zF bytes

echo.
echo 📋 準備部署步驟:
echo    1. 複製 SQL 檔案到部署目錄
echo    2. 添加導入腳本
echo    3. 提交到 GitHub
echo    4. Zeabur 自動部署
echo    5. 在 Zeabur 控制台執行導入
echo.

set /p proceed="是否繼續? (Y/N): "
if /i not "%proceed%"=="Y" (
    echo 用戶取消操作
    pause
    exit /b 0
)

echo.
echo 🔧 步驟 1: 複製 SQL 檔案...
REM 確保 zeabur-backup 目錄存在
if not exist "zeabur-backup" mkdir zeabur-backup

copy "pythonlearn_backup.sql" "zeabur-backup\pythonlearn_backup.sql" >nul
if %errorlevel% neq 0 (
    echo ❌ 複製失敗
    pause
    exit /b 1
)
echo ✅ SQL 檔案已複製到 zeabur-backup 目錄

echo.
echo 🔧 步驟 2: 複製導入腳本...
copy "zeabur-src-backup.js" "zeabur-backup\zeabur-src-backup.js" >nul
copy "copy-sql-to-zeabur-src.js" "zeabur-backup\copy-sql-to-zeabur-src.js" >nul
echo ✅ 導入腳本已複製

echo.
echo 🔧 步驟 3: 檢查 Git 狀態...
git status --porcelain 2>nul
if %errorlevel% neq 0 (
    echo ❌ 這不是一個 Git 倉庫
    pause
    exit /b 1
)

echo.
echo 📦 添加檔案到 Git...
git add zeabur-backup/ 2>nul
git add zeabur-src-backup.js 2>nul 
git add copy-sql-to-zeabur-src.js 2>nul
git add deploy-sql-to-zeabur.bat 2>nul

echo.
echo 📝 提交變更...
git commit -m "🗄️ 新增 SQL 備份部署工具和 Zeabur /src 目錄支援" 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ 沒有新的變更需要提交
)

echo.
echo 🚀 推送到 GitHub...
git push origin main 2>nul
if %errorlevel% neq 0 (
    echo ❌ Git 推送失敗，嘗試強制推送...
    git push origin main --force 2>nul
    if %errorlevel% neq 0 (
        echo ❌ 強制推送也失敗了，請手動檢查
        pause
        exit /b 1
    )
    echo ✅ 強制推送成功
) else (
    echo ✅ 推送成功
)

echo.
echo 🎉 Git 部署完成！
echo.
echo ============================================
echo 📋 接下來在 Zeabur 控制台執行以下步驟:
echo ============================================
echo.
echo 1. 等待 Zeabur 自動部署完成 (約 2-3 分鐘)
echo.
echo 2. 在 Zeabur 控制台的 Terminal 中執行:
echo    cd /src
echo    node zeabur-src-backup.js
echo.
echo 3. 或者執行複製腳本:
echo    node copy-sql-to-zeabur-src.js
echo.
echo 4. 設置環境變數 (如果尚未設置):
echo    MYSQL_HOST=hnd1.clusters.zeabur.com
echo    MYSQL_PORT=31962
echo    MYSQL_USER=root  
echo    MYSQL_PASSWORD=Aa12022020
echo    MYSQL_DATABASE=pythonlearn
echo.
echo 5. 重啟應用服務以啟用數據庫模式
echo.
echo ============================================
echo 💡 故障排除:
echo ============================================
echo.
echo 如果 MySQL 連接仍然 ETIMEDOUT:
echo 1. 在 Zeabur 控制台重啟 MySQL 服務
echo 2. 檢查服務狀態和日誌
echo 3. 確認環境變數設置正確
echo 4. 驗證網路連接
echo.
echo ============================================
echo.

echo ✅ 部署腳本執行完成！
echo 💡 現在可以在 Zeabur 上進行 SQL 導入了
echo.
pause 