#!/usr/bin/env php
<?php

require_once __DIR__ . '/../vendor/autoload.php';

use PythonLearn\WebSocket\CollaborationServer;
use PythonLearn\Config\Environment;
use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use React\EventLoop\Loop;
use React\Socket\SocketServer;
use Monolog\Logger;
use Monolog\Handler\StreamHandler;

// 載入環境變數
Environment::load();

// 設置日誌
$logger = new Logger('websocket');
$logger->pushHandler(new StreamHandler('php://stdout', Logger::INFO));

try {
    // 創建事件循環
    $loop = Loop::get();
    
    // 創建協作服務器實例
    $collaborationServer = new CollaborationServer($logger);
    
    // 配置 WebSocket 服務器
    $webSocketServer = new WsServer($collaborationServer);
    $webSocketServer->enableKeepAlive($loop, 30);
    
    // HTTP 服務器包裝
    $httpServer = new HttpServer($webSocketServer);
    
    // 創建 Socket 服務器
    $host = $_ENV['WEBSOCKET_HOST'] ?? '0.0.0.0';
    $port = (int)($_ENV['WEBSOCKET_PORT'] ?? 8080);
    
    $socket = new SocketServer("{$host}:{$port}", [], $loop);
    
    // 創建 IO 服務器
    $server = new IoServer($httpServer, $socket, $loop);
    
    $logger->info("🚀 Python多人協作教學平台 WebSocket 服務器啟動成功！");
    $logger->info("📡 服務器運行在: {$host}:{$port}");
    $logger->info("🌐 WebSocket URL: ws://{$host}:{$port}");
    $logger->info("⚙️ 系統配置:");
    $logger->info("   - 最大並發用戶: " . ($_ENV['MAX_CONCURRENT_USERS'] ?? 60));
    $logger->info("   - 最大房間數: " . ($_ENV['MAX_ROOMS'] ?? 20));
    $logger->info("   - 每房間最大用戶: " . ($_ENV['MAX_USERS_PER_ROOM'] ?? 5));
    $logger->info("✅ 系統就緒，等待連接...");
    
    // 定期清理任務
    $loop->addPeriodicTimer(300, function() use ($collaborationServer, $logger) {
        $collaborationServer->performCleanup();
        $logger->info("🧹 定期清理完成");
    });
    
    // 定期保存數據
    $loop->addPeriodicTimer(30, function() use ($collaborationServer, $logger) {
        $collaborationServer->saveDataToFile();
        $logger->debug("💾 數據自動保存完成");
    });
    
    // 優雅關閉處理
    $loop->addSignal(SIGINT, function() use ($server, $collaborationServer, $logger) {
        $logger->info("📊 服務器統計信息:");
        $stats = $collaborationServer->getServerStats();
        foreach ($stats as $key => $value) {
            $logger->info("   - {$key}: {$value}");
        }
        
        $collaborationServer->saveDataToFile();
        $logger->info("💾 數據已保存");
        $logger->info("👋 服務器正在關閉...");
        $server->loop->stop();
    });
    
    $loop->addSignal(SIGTERM, function() use ($server, $collaborationServer, $logger) {
        $collaborationServer->saveDataToFile();
        $logger->info("💾 數據已保存");
        $logger->info("👋 服務器正在關閉...");
        $server->loop->stop();
    });
    
    // 啟動服務器
    $server->run();
    
} catch (Exception $e) {
    $logger->error("❌ 服務器啟動失敗: " . $e->getMessage());
    $logger->error("🔧 錯誤詳細信息: " . $e->getTraceAsString());
    exit(1);
} 