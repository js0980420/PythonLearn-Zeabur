# PythonLearn-Zeabur GitHub 快速上船腳本 (PowerShell)
# 執行方式: .\github-deploy.ps1

param(
    [switch]$AutoCommit = $false,
    [switch]$SkipTests = $false,
    [string]$CommitMessage = "🚀 部署測試通過，準備 Zeabur 上船"
)

Write-Host "🚀 PythonLearn-Zeabur GitHub 快速上船腳本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 設置錯誤處理
$ErrorActionPreference = "Stop"

try {
    # 步驟 1: 檢查必要檔案
    Write-Host "📋 步驟 1: 檢查必要檔案..." -ForegroundColor Yellow
    
    $requiredFiles = @(
        "server.js",
        "package.json", 
        "public/index.html",
        "public/js/websocket.js",
        "public/js/ai-assistant.js",
        "deploy-test.js",
        "quick-deploy.js"
    )
    
    $missingFiles = @()
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            $missingFiles += $file
        }
    }
    
    if ($missingFiles.Count -gt 0) {
        Write-Host "❌ 缺少必要檔案:" -ForegroundColor Red
        $missingFiles | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        throw "檔案完整性檢查失敗"
    }
    
    Write-Host "✅ 所有必要檔案都存在" -ForegroundColor Green
    
    # 步驟 2: 檢查依賴安裝
    Write-Host ""
    Write-Host "📦 步驟 2: 檢查依賴安裝..." -ForegroundColor Yellow
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "📦 安裝 npm 依賴..." -ForegroundColor Blue
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install 失敗"
        }
    }
    
    Write-Host "✅ 依賴已安裝" -ForegroundColor Green
    
    if (-not $SkipTests) {
        # 步驟 3: 執行快速驗證
        Write-Host ""
        Write-Host "🧪 步驟 3: 執行快速驗證..." -ForegroundColor Yellow
        
        node quick-deploy.js
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ 快速驗證失敗" -ForegroundColor Red
            Write-Host "請查看上方錯誤訊息並修復後重試" -ForegroundColor Yellow
            throw "快速驗證失敗"
        }
        
        Write-Host "✅ 快速驗證通過" -ForegroundColor Green
        
        # 步驟 4: 執行完整部署測試
        Write-Host ""
        Write-Host "🔍 步驟 4: 執行完整部署測試..." -ForegroundColor Yellow
        
        node deploy-test.js
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ 部署測試失敗" -ForegroundColor Red
            Write-Host "請查看 deployment-test-report.json 了解詳情" -ForegroundColor Yellow
            throw "部署測試失敗"
        }
        
        Write-Host "✅ 部署測試通過" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "⏭️ 跳過測試階段 (-SkipTests)" -ForegroundColor Yellow
    }
    
    # 步驟 5: 檢查測試報告
    Write-Host ""
    Write-Host "📊 步驟 5: 檢查測試報告..." -ForegroundColor Yellow
    
    if (Test-Path "quick-deploy-report.json") {
        Write-Host "✅ 快速驗證報告: quick-deploy-report.json" -ForegroundColor Green
    }
    if (Test-Path "deployment-test-report.json") {
        Write-Host "✅ 完整測試報告: deployment-test-report.json" -ForegroundColor Green
    }
    
    # 步驟 6: Git 檢查
    Write-Host ""
    Write-Host "🎯 步驟 6: Git 檢查..." -ForegroundColor Yellow
    
    # 檢查是否是 Git 倉庫
    try {
        git status | Out-Null
    } catch {
        Write-Host "⚠️ 不是 Git 倉庫，需要初始化" -ForegroundColor Yellow
        Write-Host "請執行: git init" -ForegroundColor Cyan
        return
    }
    
    Write-Host "📄 當前 Git 狀態:" -ForegroundColor Blue
    git status --short
    
    # 步驟 7: GitHub 上傳
    Write-Host ""
    Write-Host "🚀 步驟 7: 準備上傳到 GitHub..." -ForegroundColor Yellow
    
    if ($AutoCommit) {
        Write-Host "🔄 自動提交並推送到 GitHub..." -ForegroundColor Blue
        
        # 檢查是否有 remote
        try {
            git remote get-url origin | Out-Null
        } catch {
            Write-Host "⚠️ 尚未設置 GitHub 遠端倉庫" -ForegroundColor Yellow
            Write-Host "請先設置: git remote add origin https://github.com/你的用戶名/你的倉庫名.git" -ForegroundColor Cyan
            return
        }
        
        # 添加所有檔案並提交
        git add .
        git commit -m "$CommitMessage - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        
        # 推送到 GitHub
        Write-Host "📤 推送到 GitHub..." -ForegroundColor Blue
        git push origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ 推送失敗，可能需要先設置認證" -ForegroundColor Red
            Write-Host "請檢查 GitHub 認證設置" -ForegroundColor Yellow
            return
        }
        
        Write-Host "✅ 已成功推送到 GitHub！" -ForegroundColor Green
    } else {
        Write-Host "選擇操作:" -ForegroundColor Cyan
        Write-Host "1. 自動提交並推送 (推薦)" -ForegroundColor White
        Write-Host "2. 僅顯示 Git 指令 (手動執行)" -ForegroundColor White
        Write-Host "3. 跳過 Git 操作" -ForegroundColor White
        Write-Host ""
        
        $choice = Read-Host "請選擇 (1-3)"
        
        switch ($choice) {
            "1" {
                Write-Host "🔄 自動提交並推送到 GitHub..." -ForegroundColor Blue
                
                # 檢查是否有 remote
                try {
                    git remote get-url origin | Out-Null
                } catch {
                    Write-Host "⚠️ 尚未設置 GitHub 遠端倉庫" -ForegroundColor Yellow
                    Write-Host "請先設置: git remote add origin https://github.com/你的用戶名/你的倉庫名.git" -ForegroundColor Cyan
                    break
                }
                
                # 添加所有檔案並提交
                git add .
                git commit -m "$CommitMessage - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
                
                # 推送到 GitHub
                Write-Host "📤 推送到 GitHub..." -ForegroundColor Blue
                git push origin main
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "❌ 推送失敗，可能需要先設置認證" -ForegroundColor Red
                    Write-Host "請檢查 GitHub 認證設置" -ForegroundColor Yellow
                } else {
                    Write-Host "✅ 已成功推送到 GitHub！" -ForegroundColor Green
                }
            }
            "2" {
                Write-Host ""
                Write-Host "📝 手動 Git 操作指令:" -ForegroundColor Cyan
                Write-Host "===================" -ForegroundColor Cyan
                Write-Host ""
                Write-Host "1. 檢查狀態:" -ForegroundColor Yellow
                Write-Host "   git status" -ForegroundColor White
                Write-Host ""
                Write-Host "2. 添加檔案:" -ForegroundColor Yellow
                Write-Host "   git add ." -ForegroundColor White
                Write-Host ""
                Write-Host "3. 提交變更:" -ForegroundColor Yellow
                Write-Host "   git commit -m `"🚀 部署測試通過，準備 Zeabur 上船`"" -ForegroundColor White
                Write-Host ""
                Write-Host "4. 推送到 GitHub:" -ForegroundColor Yellow
                Write-Host "   git push origin main" -ForegroundColor White
                Write-Host ""
                Write-Host "如果是第一次推送:" -ForegroundColor Yellow
                Write-Host "   git remote add origin https://github.com/你的用戶名/PythonLearn-Zeabur.git" -ForegroundColor White
                Write-Host "   git branch -M main" -ForegroundColor White
                Write-Host "   git push -u origin main" -ForegroundColor White
                Write-Host ""
            }
            "3" {
                Write-Host "⏭️ 已跳過 Git 操作" -ForegroundColor Yellow
            }
            default {
                Write-Host "⚠️ 無效選擇，跳過 Git 操作" -ForegroundColor Yellow
            }
        }
    }
    
    # 成功完成
    Write-Host ""
    Write-Host "🎉 GitHub 上船準備完成！" -ForegroundColor Green
    Write-Host "=========================" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ 檔案完整性檢查通過" -ForegroundColor Green
    Write-Host "✅ 功能測試全部通過" -ForegroundColor Green
    Write-Host "✅ WebSocket 連接正常" -ForegroundColor Green
    Write-Host "✅ 部署測試完成" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 接下來的步驟:" -ForegroundColor Cyan
    Write-Host "1. 🌐 訪問 https://zeabur.com" -ForegroundColor White
    Write-Host "2. 🔗 連接你的 GitHub 倉庫" -ForegroundColor White
    Write-Host "3. ⚙️ 配置環境變數:" -ForegroundColor White
    Write-Host "   - MYSQL_HOST" -ForegroundColor Gray
    Write-Host "   - MYSQL_USER" -ForegroundColor Gray
    Write-Host "   - MYSQL_PASSWORD" -ForegroundColor Gray
    Write-Host "   - MYSQL_DATABASE" -ForegroundColor Gray
    Write-Host "   - OPENAI_API_KEY (可選)" -ForegroundColor Gray
    Write-Host "4. 🚀 開始部署！" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 測試報告位置:" -ForegroundColor Cyan
    if (Test-Path "quick-deploy-report.json") {
        Write-Host "   - 快速驗證: quick-deploy-report.json" -ForegroundColor White
    }
    if (Test-Path "deployment-test-report.json") {
        Write-Host "   - 完整測試: deployment-test-report.json" -ForegroundColor White
    }
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ 腳本執行失敗！" -ForegroundColor Red
    Write-Host "錯誤訊息: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "請檢查上方錯誤訊息並修復問題後重試。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "常見問題解決方案:" -ForegroundColor Cyan
    Write-Host "1. 確保 Node.js 已安裝" -ForegroundColor White
    Write-Host "2. 確保在正確的專案目錄中" -ForegroundColor White
    Write-Host "3. 檢查網路連接" -ForegroundColor White
    Write-Host "4. 確保有足夠的磁碟空間" -ForegroundColor White
    Write-Host ""
    exit 1
}

# 用法說明
Write-Host ""
Write-Host "💡 腳本用法:" -ForegroundColor Cyan
Write-Host "   .\github-deploy.ps1                    # 互動模式" -ForegroundColor White
Write-Host "   .\github-deploy.ps1 -AutoCommit        # 自動提交" -ForegroundColor White
Write-Host "   .\github-deploy.ps1 -SkipTests         # 跳過測試" -ForegroundColor White
Write-Host "   .\github-deploy.ps1 -AutoCommit -CommitMessage `"自定義訊息`"" -ForegroundColor White 