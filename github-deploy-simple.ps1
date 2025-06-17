# PythonLearn-Zeabur GitHub 快速上船腳本 (簡化版)
# 執行方式: .\github-deploy-simple.ps1

Write-Host "🚀 PythonLearn-Zeabur GitHub 快速上船腳本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 檢查必要檔案
Write-Host "📋 檢查必要檔案..." -ForegroundColor Yellow
$files = @("server.js", "package.json", "public/index.html", "public/js/websocket.js", "public/js/ai-assistant.js")
$missing = @()
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        $missing += $file
    }
}

if ($missing.Count -gt 0) {
    Write-Host "❌ 缺少檔案:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
    Write-Host "請確保所有必要檔案都存在" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ 檔案檢查通過" -ForegroundColor Green

# 檢查 npm 依賴
Write-Host ""
Write-Host "📦 檢查依賴..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 安裝依賴..." -ForegroundColor Blue
    npm install
}
Write-Host "✅ 依賴檢查完成" -ForegroundColor Green

# 執行快速測試
Write-Host ""
Write-Host "🧪 執行快速測試..." -ForegroundColor Yellow
if (Test-Path "quick-deploy.js") {
    node quick-deploy.js
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ 快速測試通過" -ForegroundColor Green
    } else {
        Write-Host "⚠️ 快速測試失敗，但繼續處理" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ 找不到 quick-deploy.js" -ForegroundColor Yellow
}

# Git 狀態檢查
Write-Host ""
Write-Host "🎯 Git 狀態檢查..." -ForegroundColor Yellow
try {
    git status --short
    Write-Host "✅ Git 檢查完成" -ForegroundColor Green
} catch {
    Write-Host "⚠️ 不是 Git 倉庫或 Git 未安裝" -ForegroundColor Yellow
}

# 完成信息
Write-Host ""
Write-Host "🎉 準備完成！" -ForegroundColor Green
Write-Host "===============" -ForegroundColor Green
Write-Host ""
Write-Host "接下來的步驟:" -ForegroundColor Cyan
Write-Host "1. 檢查 Git 狀態: git status" -ForegroundColor White
Write-Host "2. 添加檔案: git add ." -ForegroundColor White
Write-Host "3. 提交變更: git commit -m '🚀 準備部署'" -ForegroundColor White
Write-Host "4. 推送到 GitHub: git push origin main" -ForegroundColor White
Write-Host ""
Write-Host "Zeabur 部署:" -ForegroundColor Cyan
Write-Host "1. 訪問 https://zeabur.com" -ForegroundColor White
Write-Host "2. 連接你的 GitHub 倉庫" -ForegroundColor White
Write-Host "3. 設置環境變數 (MYSQL_HOST, OPENAI_API_KEY 等)" -ForegroundColor White
Write-Host "4. 開始部署" -ForegroundColor White
Write-Host ""

Write-Host "腳本執行完成！" -ForegroundColor Green 