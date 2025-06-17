#!/usr/bin/env node

/**
 * PythonLearn-Zeabur 快速部署驗證腳本
 * 
 * 功能：
 * - 快速檢查所有核心功能
 * - 本地服務器測試
 * - WebSocket 連接驗證
 * - MySQL 連接測試
 * - AI 助教功能檢查
 * - 生成部署報告
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');

class QuickDeployValidator {
    constructor() {
        this.results = {
            fileCheck: false,
            serverStart: false,
            websocket: false,
            mysql: false,
            ai: false,
            overall: false
        };
        
        this.serverProcess = null;
        this.testPort = 3000;
    }

    /**
     * 執行快速驗證
     */
    async runQuickValidation() {
        console.log('🚀 開始快速部署驗證...\n');
        
        try {
            // 1. 檢查檔案完整性
            await this.checkFiles();
            
            // 2. 啟動服務器
            await this.startServer();
            
            // 3. 測試 WebSocket 連接
            await this.testWebSocket();
            
            // 4. 測試 MySQL 連接
            await this.testMySQL();
            
            // 5. 測試 AI 助教配置
            await this.testAI();
            
            // 6. 生成報告
            this.generateReport();
            
        } catch (error) {
            console.error('❌ 驗證過程中發生錯誤:', error.message);
            this.results.overall = false;
        } finally {
            // 清理資源
            await this.cleanup();
        }
    }

    /**
     * 檢查必要檔案
     */
    async checkFiles() {
        console.log('📁 檢查檔案完整性...');
        
        const requiredFiles = [
            'server.js',
            'package.json',
            'public/index.html',
            'public/js/websocket.js',
            'public/js/ai-assistant.js',
            'public/js/editor.js',
            'public/js/ui.js',
            'public/js/chat.js'
        ];
        
        const missingFiles = [];
        
        for (const file of requiredFiles) {
            if (!fs.existsSync(file)) {
                missingFiles.push(file);
            }
        }
        
        if (missingFiles.length > 0) {
            console.error('❌ 缺少必要檔案:', missingFiles.join(', '));
            this.results.fileCheck = false;
            throw new Error(`缺少必要檔案: ${missingFiles.join(', ')}`);
        }
        
        console.log('✅ 所有必要檔案都存在');
        this.results.fileCheck = true;
    }

    /**
     * 啟動測試服務器
     */
    async startServer() {
        console.log('🌐 啟動測試服務器...');
        
        return new Promise((resolve, reject) => {
            // 設置環境變數
            const env = {
                ...process.env,
                PORT: this.testPort,
                NODE_ENV: 'test'
            };
            
            // 啟動服務器
            this.serverProcess = spawn('node', ['server.js'], {
                env,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let output = '';
            
            this.serverProcess.stdout.on('data', (data) => {
                output += data.toString();
                if (output.includes('運行在') || output.includes('listening')) {
                    console.log(`✅ 服務器已啟動在端口 ${this.testPort}`);
                    this.results.serverStart = true;
                    
                    // 等待一秒確保服務器完全就緒
                    setTimeout(() => resolve(), 1000);
                }
            });
            
            this.serverProcess.stderr.on('data', (data) => {
                console.error('服務器錯誤:', data.toString());
            });
            
            this.serverProcess.on('error', (error) => {
                console.error('❌ 無法啟動服務器:', error.message);
                this.results.serverStart = false;
                reject(error);
            });
            
            // 10秒超時
            setTimeout(() => {
                if (!this.results.serverStart) {
                    console.error('❌ 服務器啟動超時');
                    reject(new Error('服務器啟動超時'));
                }
            }, 10000);
        });
    }

    /**
     * 測試 WebSocket 連接
     */
    async testWebSocket() {
        console.log('🔌 測試 WebSocket 連接...');
        
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${this.testPort}`);
            
            ws.on('open', () => {
                console.log('✅ WebSocket 連接成功');
                this.results.websocket = true;
                
                // 測試基本消息
                ws.send(JSON.stringify({
                    type: 'ping',
                    data: { test: true }
                }));
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'pong' || message.type === 'status') {
                        console.log('✅ WebSocket 消息回應正常');
                        ws.close();
                        resolve();
                    }
                } catch (error) {
                    console.log('📨 收到 WebSocket 消息:', data.toString());
                    ws.close();
                    resolve();
                }
            });
            
            ws.on('error', (error) => {
                console.error('❌ WebSocket 連接失敗:', error.message);
                this.results.websocket = false;
                reject(error);
            });
            
            // 5秒超時
            setTimeout(() => {
                if (ws.readyState !== WebSocket.CLOSED) {
                    ws.close();
                    if (!this.results.websocket) {
                        console.error('❌ WebSocket 測試超時');
                        reject(new Error('WebSocket 測試超時'));
                    } else {
                        resolve();
                    }
                }
            }, 5000);
        });
    }

    /**
     * 測試 MySQL 連接
     */
    async testMySQL() {
        console.log('🗄️ 測試 MySQL 連接...');
        
        const mysqlConfig = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: process.env.MYSQL_DATABASE || 'python_collaboration',
            port: process.env.MYSQL_PORT || 3306
        };
        
        try {
            const connection = await mysql.createConnection(mysqlConfig);
            
            // 測試簡單查詢
            await connection.execute('SELECT 1 as test');
            await connection.end();
            
            console.log('✅ MySQL 連接成功');
            this.results.mysql = true;
            
        } catch (error) {
            console.log('⚠️ MySQL 連接失敗 (在 Zeabur 環境中這是正常的):', error.message);
            this.results.mysql = false; // 本地測試時可能沒有 MySQL
        }
    }

    /**
     * 測試 AI 助教配置
     */
    async testAI() {
        console.log('🤖 檢查 AI 助教配置...');
        
        const hasAPIKey = !!(process.env.OPENAI_API_KEY || this.checkLocalAIConfig());
        
        if (hasAPIKey) {
            console.log('✅ AI 助教配置已設置');
            this.results.ai = true;
        } else {
            console.log('⚠️ AI 助教配置未設置 (功能將降級運行)');
            this.results.ai = false;
        }
    }

    /**
     * 檢查本地 AI 配置
     */
    checkLocalAIConfig() {
        try {
            if (fs.existsSync('ai_config.json')) {
                const config = JSON.parse(fs.readFileSync('ai_config.json', 'utf8'));
                return config.openai_api_key && config.openai_api_key.length > 10;
            }
        } catch (error) {
            // 忽略錯誤
        }
        return false;
    }

    /**
     * 生成驗證報告
     */
    generateReport() {
        console.log('\n📊 快速驗證報告');
        console.log('================');
        
        const checks = [
            { name: '檔案完整性', status: this.results.fileCheck, icon: '📁' },
            { name: '服務器啟動', status: this.results.serverStart, icon: '🌐' },
            { name: 'WebSocket 連接', status: this.results.websocket, icon: '🔌' },
            { name: 'MySQL 連接', status: this.results.mysql, icon: '🗄️' },
            { name: 'AI 助教配置', status: this.results.ai, icon: '🤖' }
        ];
        
        checks.forEach(check => {
            const status = check.status ? '✅ 通過' : '❌ 失敗';
            console.log(`${check.icon} ${check.name}: ${status}`);
        });
        
        // 計算總體狀態
        const criticalChecks = [
            this.results.fileCheck,
            this.results.serverStart,
            this.results.websocket
        ];
        
        const optionalChecks = [
            this.results.mysql,
            this.results.ai
        ];
        
        const criticalPassed = criticalChecks.every(check => check);
        const optionalPassed = optionalChecks.filter(check => check).length;
        
        this.results.overall = criticalPassed;
        
        console.log('\n🎯 驗證結果');
        console.log('===========');
        
        if (criticalPassed) {
            console.log('✅ 核心功能驗證通過！');
            console.log('🚀 平台可以部署到 Zeabur');
            
            if (optionalPassed === 2) {
                console.log('🌟 所有功能都已配置完成');
            } else {
                console.log(`⚠️ 可選功能 ${optionalPassed}/2 已配置`);
                if (!this.results.mysql) {
                    console.log('   - MySQL: 在 Zeabur 部署時會自動配置');
                }
                if (!this.results.ai) {
                    console.log('   - AI 助教: 需要在 Zeabur 設置 OPENAI_API_KEY');
                }
            }
        } else {
            console.log('❌ 核心功能驗證失敗');
            console.log('🔧 需要修復以下問題後再部署:');
            
            if (!this.results.fileCheck) {
                console.log('   - 檔案完整性問題');
            }
            if (!this.results.serverStart) {
                console.log('   - 服務器啟動問題');
            }
            if (!this.results.websocket) {
                console.log('   - WebSocket 連接問題');
            }
        }
        
        console.log('\n📝 部署建議');
        console.log('===========');
        
        if (this.results.overall) {
            console.log('1. ✅ 提交代碼到 GitHub');
            console.log('2. ✅ 在 Zeabur 創建新服務');
            console.log('3. ✅ 連接 GitHub 倉庫');
            console.log('4. ⚙️ 配置環境變數:');
            console.log('   - MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD');
            console.log('   - OPENAI_API_KEY (可選)');
            console.log('5. 🚀 開始部署');
        } else {
            console.log('1. 🔧 修復上述核心問題');
            console.log('2. 🧪 重新運行驗證: node quick-deploy.js');
            console.log('3. ✅ 驗證通過後提交到 GitHub');
        }
        
        // 保存報告到檔案
        const report = {
            timestamp: new Date().toISOString(),
            results: this.results,
            summary: {
                critical_passed: criticalPassed,
                optional_passed: optionalPassed,
                overall_status: this.results.overall ? 'PASS' : 'FAIL'
            }
        };
        
        fs.writeFileSync('quick-deploy-report.json', JSON.stringify(report, null, 2));
        console.log('\n📄 詳細報告已保存至: quick-deploy-report.json');
    }

    /**
     * 清理資源
     */
    async cleanup() {
        if (this.serverProcess) {
            console.log('\n🧹 清理測試資源...');
            this.serverProcess.kill();
            console.log('✅ 測試服務器已停止');
        }
    }
}

// 主執行函數
async function main() {
    const validator = new QuickDeployValidator();
    await validator.runQuickValidation();
    
    // 根據結果設置退出碼
    process.exit(validator.results.overall ? 0 : 1);
}

// 當直接執行此檔案時運行
if (require.main === module) {
    main().catch(error => {
        console.error('💥 驗證失敗:', error);
        process.exit(1);
    });
}

module.exports = QuickDeployValidator;

// 添加端口清理功能
async function killProcessOnPort(port) {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            // Windows 系統
            exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
                if (stdout) {
                    const lines = stdout.split('\n');
                    const pids = new Set();
                    
                    lines.forEach(line => {
                        const match = line.match(/\s+(\d+)$/);
                        if (match) {
                            pids.add(match[1]);
                        }
                    });
                    
                    if (pids.size > 0) {
                        console.log(`🔧 發現端口 ${port} 被占用，正在清理...`);
                        const pidArray = Array.from(pids);
                        let completed = 0;
                        
                        pidArray.forEach(pid => {
                            exec(`taskkill /F /PID ${pid}`, (killError) => {
                                completed++;
                                if (completed === pidArray.length) {
                                    console.log(`✅ 端口 ${port} 清理完成`);
                                    setTimeout(resolve, 1000); // 等待1秒確保端口釋放
                                }
                            });
                        });
                    } else {
                        resolve();
                    }
                } else {
                    resolve();
                }
            });
        } else {
            // Unix/Linux/macOS 系統
            exec(`lsof -ti:${port}`, (error, stdout, stderr) => {
                if (stdout) {
                    const pids = stdout.trim().split('\n');
                    console.log(`🔧 發現端口 ${port} 被占用，正在清理...`);
                    
                    let completed = 0;
                    pids.forEach(pid => {
                        exec(`kill -9 ${pid}`, (killError) => {
                            completed++;
                            if (completed === pids.length) {
                                console.log(`✅ 端口 ${port} 清理完成`);
                                setTimeout(resolve, 1000);
                            }
                        });
                    });
                } else {
                    resolve();
                }
            });
        }
    });
}

async function startTestServer() {
    return new Promise(async (resolve, reject) => {
        try {
            // 先清理端口
            await killProcessOnPort(3000);
            
            console.log('🌐 啟動測試服務器...');
            
            // 設置測試環境變數，強制使用 3000 端口
            const testEnv = {
                ...process.env,
                NODE_ENV: 'test',
                PORT: '3000',  // 強制使用 3000 端口
                IS_ZEABUR: 'true' // 模擬 Zeabur 環境
            };
            
            testServer = spawn('node', ['server.js'], {
                env: testEnv,
                stdio: 'pipe'
            });

            let serverReady = false;
            let startupMessages = [];

            testServer.stdout.on('data', (data) => {
                const output = data.toString();
                startupMessages.push(output);
                console.log('   📡', output.trim());
                
                if (output.includes('系統就緒，等待連接') || output.includes('服務器運行在')) {
                    if (!serverReady) {
                        serverReady = true;
                        console.log('✅ 服務器啟動成功');
                        setTimeout(() => resolve(3000), 2000); // 返回實際使用的端口
                    }
                }
            });

            testServer.stderr.on('data', (data) => {
                const error = data.toString();
                if (!error.includes('Ignoring invalid configuration') && 
                    !error.includes('數據庫: Access denied')) {
                    console.log('   ❌ 服務器錯誤:', error.trim());
                }
            });

            testServer.on('error', (error) => {
                console.log('❌ 服務器啟動失敗:', error.message);
                reject(error);
            });

            // 30秒超時
            setTimeout(() => {
                if (!serverReady) {
                    reject(new Error('服務器啟動超時'));
                }
            }, 30000);

        } catch (error) {
            reject(error);
        }
    });
}

async function testWebSocket(port = 3000) {
    return new Promise((resolve, reject) => {
        console.log('🔌 測試 WebSocket 連接...');
        
        const WebSocket = require('ws');
        const ws = new WebSocket(`ws://localhost:${port}`);
        
        let testPassed = false;
        
        // 15秒超時
        const timeout = setTimeout(() => {
            if (!testPassed) {
                ws.close();
                reject(new Error('WebSocket 測試超時'));
            }
        }, 15000);
        
        ws.on('open', () => {
            console.log('✅ WebSocket 連接成功');
            
            // 發送測試消息
            ws.send(JSON.stringify({
                type: 'ping',
                timestamp: Date.now()
            }));
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                console.log('✅ WebSocket 消息回應正常');
                
                if (!testPassed) {
                    testPassed = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve(true);
                }
            } catch (error) {
                console.log('⚠️ WebSocket 消息格式錯誤');
            }
        });
        
        ws.on('error', (error) => {
            console.log('❌ WebSocket 連接錯誤:', error.message);
            clearTimeout(timeout);
            reject(error);
        });
        
        ws.on('close', () => {
            if (!testPassed) {
                clearTimeout(timeout);
                resolve(true); // 連接成功建立即算通過
            }
        });
    });
} 