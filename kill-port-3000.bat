@echo off
chcp 65001 >nul

echo ========================================
echo        Port 3000 Cleanup Tool
echo ========================================
echo.

echo Checking processes using port 3000...

REM Find processes using port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    if "%%a" neq "" (
        echo Found process PID: %%a
        echo Terminating process %%a...
        taskkill /F /PID %%a >nul 2>&1
        if !errorlevel! equ 0 (
            echo SUCCESS: Process %%a terminated
        ) else (
            echo WARNING: Failed to terminate process %%a
        )
    )
)

echo.
echo Waiting for port to be fully released...
timeout /t 2 >nul

echo Checking port 3000 status...
netstat -ano | findstr :3000
if errorlevel 1 (
    echo SUCCESS: Port 3000 is now free
) else (
    echo WARNING: Port 3000 may still be in use
)

echo.
echo Port cleanup completed.
pause 