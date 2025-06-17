@echo off
echo 🚀 PythonLearn-Zeabur GitHub 快速上船腳本
echo ==========================================
echo.

REM 設置控制台編碼為 UTF-8
chcp 65001 > nul

REM 設置變數
set TEST_PORT=3001
set SCRIPT_DIR=%~dp0

echo 📋 步驟 1: 檢查必要檔案...
if not exist "server.js" (
    echo ❌ 缺少 server.js
    goto :error
)
if not exist "package.json" (
    echo ❌ 缺少 package.json
    goto :error
)
if not exist "public\index.html" (
    echo ❌ 缺少 public\index.html
    goto :error
)
if not exist "deploy-test.js" (
    echo ❌ 缺少 deploy-test.js
    goto :error
)
echo ✅ 所有必要檔案都存在

echo.
echo 📦 步驟 2: 檢查依賴安裝...
if not exist "node_modules" (
    echo 📦 安裝 npm 依賴...
    call npm install
    if errorlevel 1 (
        echo ❌ npm install 失敗
        goto :error
    )
)
echo ✅ 依賴已安裝

echo.
echo 🧪 步驟 3: 執行快速驗證...
call node quick-deploy.js
if errorlevel 1 (
    echo ❌ 快速驗證失敗
    echo 請查看上方錯誤訊息並修復後重試
    goto :error
)
echo ✅ 快速驗證通過

echo.
echo 🔍 步驟 4: 執行完整部署測試...
call node deploy-test.js
if errorlevel 1 (
    echo ❌ 部署測試失敗
    echo 請查看 deployment-test-report.json 了解詳情
    goto :error
)
echo ✅ 部署測試通過

echo.
echo 📊 步驟 5: 檢查測試報告...
if exist "quick-deploy-report.json" (
    echo ✅ 快速驗證報告: quick-deploy-report.json
)
if exist "deployment-test-report.json" (
    echo ✅ 完整測試報告: deployment-test-report.json
)

echo.
echo 🎯 步驟 6: Git 檢查...
git status > nul 2>&1
if errorlevel 1 (
    echo ⚠️ 不是 Git 倉庫，需要初始化
    echo 請執行: git init
    goto :manual_git
)

echo 📄 當前 Git 狀態:
git status --short

echo.
echo 🚀 步驟 7: 準備上傳到 GitHub...
echo.
echo 選擇操作:
echo 1. 自動提交並推送 (推薦)
echo 2. 僅顯示 Git 指令 (手動執行)
echo 3. 跳過 Git 操作
echo.
set /p choice="請選擇 (1-3): "

if "%choice%"=="1" goto :auto_commit
if "%choice%"=="2" goto :manual_git
if "%choice%"=="3" goto :skip_git

:auto_commit
echo.
echo 🔄 自動提交並推送到 GitHub...

REM 檢查是否有 remote
git remote get-url origin > nul 2>&1
if errorlevel 1 (
    echo ⚠️ 尚未設置 GitHub 遠端倉庫
    echo 請先設置: git remote add origin https://github.com/你的用戶名/你的倉庫名.git
    goto :manual_git
)

REM 添加所有檔案並提交
git add .
git commit -m "🚀 部署測試通過，準備 Zeabur 上船 - %date% %time%"
if errorlevel 1 (
    echo ⚠️ 沒有變更需要提交，或提交失敗
)

REM 推送到 GitHub
echo 📤 推送到 GitHub...
git push origin main
if errorlevel 1 (
    echo ❌ 推送失敗，可能需要先設置認證
    echo 請檢查 GitHub 認證設置
    goto :manual_git
)

echo ✅ 已成功推送到 GitHub！
goto :success

:manual_git
echo.
echo 📝 手動 Git 操作指令:
echo ===================
echo.
echo 1. 檢查狀態:
echo    git status
echo.
echo 2. 添加檔案:
echo    git add .
echo.
echo 3. 提交變更:
echo    git commit -m "🚀 部署測試通過，準備 Zeabur 上船"
echo.
echo 4. 推送到 GitHub:
echo    git push origin main
echo.
echo 如果是第一次推送:
echo    git remote add origin https://github.com/你的用戶名/PythonLearn-Zeabur.git
echo    git branch -M main
echo    git push -u origin main
echo.
goto :success

:skip_git
echo ⏭️ 已跳過 Git 操作
goto :success

:success
echo.
echo 🎉 GitHub 上船準備完成！
echo =========================
echo.
echo ✅ 檔案完整性檢查通過
echo ✅ 功能測試全部通過
echo ✅ WebSocket 連接正常
echo ✅ 部署測試完成
echo.
echo 📋 接下來的步驟:
echo 1. 🌐 訪問 https://zeabur.com
echo 2. 🔗 連接你的 GitHub 倉庫
echo 3. ⚙️ 配置環境變數:
echo    - MYSQL_HOST
echo    - MYSQL_USER  
echo    - MYSQL_PASSWORD
echo    - MYSQL_DATABASE
echo    - OPENAI_API_KEY (可選)
echo 4. 🚀 開始部署！
echo.
echo 📊 測試報告位置:
if exist "quick-deploy-report.json" (
    echo    - 快速驗證: quick-deploy-report.json
)
if exist "deployment-test-report.json" (
    echo    - 完整測試: deployment-test-report.json
)
echo.
pause
exit /b 0

:error
echo.
echo ERROR: Script execution failed!
echo Please check error messages above and retry after fixing issues.
echo.
pause
exit /b 1 