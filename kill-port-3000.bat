@echo off
chcp 65001 >nul
echo 🔍 檢查端口 3000 占用狀況...

REM 檢查端口占用
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 "') do (
    echo 🔍 發現進程 PID: %%a 占用端口 3000
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo ❌ 無法終止進程 %%a
    ) else (
        echo ✅ 已終止進程 %%a
    )
)

REM 等待一秒後再次檢查
timeout /t 1 /nobreak >nul

REM 驗證端口是否已釋放
netstat -ano | findstr ":3000 " >nul
if errorlevel 1 (
    echo ✅ 端口 3000 已釋放，可以啟動服務器
) else (
    echo ⚠️ 端口 3000 仍被占用，請手動檢查
    netstat -ano | findstr ":3000"
)

pause 