const { test, expect } = require('@playwright/test');

test.describe('聊天功能測試', () => {
    let teacherContext;
    let studentContext1;
    let studentContext2;
    let teacherPage;
    let studentPage1;
    let studentPage2;

    test.beforeAll(async ({ browser }) => {
        // 創建三個獨立的上下文，分別用於教師和兩個學生
        teacherContext = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        studentContext1 = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        studentContext2 = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
    });

    test.afterAll(async () => {
        await teacherContext?.close();
        await studentContext1?.close();
        await studentContext2?.close();
    });

    test('多人聊天室消息傳遞測試', async () => {
        const TIMEOUT = 60000; // 增加超時時間到 60 秒
        const BASE_URL = 'http://localhost:3000';

        try {
            // 等待服務器啟動
            const waitForServer = async (maxRetries = 5) => {
                for (let i = 0; i < maxRetries; i++) {
                    try {
                        const tempPage = await teacherContext.newPage();
                        await tempPage.goto(BASE_URL, {
                            timeout: 5000,
                            waitUntil: 'networkidle'
                        });
                        await tempPage.close();
                        return true;
                    } catch (error) {
                        console.log(`等待服務器啟動 (${i + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
                return false;
            };

            const serverReady = await waitForServer();
            if (!serverReady) {
                throw new Error('服務器未啟動');
            }
            console.log('✅ 服務器已啟動');

            // 1. 設置教師頁面
            teacherPage = await teacherContext.newPage();
            await teacherPage.goto(`${BASE_URL}/teacher.html`, {
                waitUntil: 'networkidle',
                timeout: TIMEOUT
            });
            
            // 等待教師頁面加載完成
            await teacherPage.waitForSelector('input', { state: 'visible', timeout: TIMEOUT });
            console.log('✅ 教師頁面已加載');

            // 2. 設置第一個學生頁面
            studentPage1 = await studentContext1.newPage();
            await studentPage1.goto(BASE_URL, {
                waitUntil: 'networkidle',
                timeout: TIMEOUT
            });
            
            // 等待並填寫第一個學生的加入表單
            await studentPage1.waitForSelector('input', { state: 'visible', timeout: TIMEOUT });
            const student1Inputs = await studentPage1.$$('input');
            if (student1Inputs.length < 2) {
                throw new Error('找不到足夠的輸入框');
            }
            await student1Inputs[0].fill('test-room');
            await student1Inputs[1].fill('student1');
            
            // 等待按鈕可點擊
            await studentPage1.waitForSelector('button', { state: 'visible', timeout: TIMEOUT });
            await studentPage1.click('button');
            
            // 等待第一個學生進入房間
            await studentPage1.waitForSelector('div', { state: 'visible', timeout: TIMEOUT });
            console.log('✅ 學生1已加入房間');

            // 3. 設置第二個學生頁面
            studentPage2 = await studentContext2.newPage();
            await studentPage2.goto(BASE_URL, {
                waitUntil: 'networkidle',
                timeout: TIMEOUT
            });
            
            // 等待並填寫第二個學生的加入表單
            await studentPage2.waitForSelector('input', { state: 'visible', timeout: TIMEOUT });
            const student2Inputs = await studentPage2.$$('input');
            if (student2Inputs.length < 2) {
                throw new Error('找不到足夠的輸入框');
            }
            await student2Inputs[0].fill('test-room');
            await student2Inputs[1].fill('student2');
            
            // 等待按鈕可點擊
            await studentPage2.waitForSelector('button', { state: 'visible', timeout: TIMEOUT });
            await studentPage2.click('button');
            
            // 等待第二個學生進入房間
            await studentPage2.waitForSelector('div', { state: 'visible', timeout: TIMEOUT });
            console.log('✅ 學生2已加入房間');

            // 4. 等待所有 WebSocket 連接建立
            const checkWebSocket = async (page) => {
                try {
                    const wsStatus = await page.evaluate(() => {
                        if (!window.wsManager || !window.wsManager.ws) return 'no_ws';
                        switch (window.wsManager.ws.readyState) {
                            case WebSocket.CONNECTING: return 'connecting';
                            case WebSocket.OPEN: return 'open';
                            case WebSocket.CLOSING: return 'closing';
                            case WebSocket.CLOSED: return 'closed';
                            default: return 'unknown';
                        }
                    });
                    console.log(`WebSocket 狀態: ${wsStatus}`);
                    return wsStatus === 'open';
                } catch (error) {
                    console.error('WebSocket 連接檢查失敗:', error);
                    return false;
                }
            };

            // 重試機制
            const retryWebSocket = async (page, maxRetries = 10) => {
                for (let i = 0; i < maxRetries; i++) {
                    const isConnected = await checkWebSocket(page);
                    if (isConnected) return true;
                    console.log(`重試 WebSocket 連接 (${i + 1}/${maxRetries})`);
                    await page.waitForTimeout(5000); // 增加等待時間到 5 秒
                }
                return false;
            };

            const wsResults = await Promise.all([
                retryWebSocket(teacherPage),
                retryWebSocket(studentPage1),
                retryWebSocket(studentPage2)
            ]);

            if (!wsResults.every(result => result)) {
                throw new Error('部分 WebSocket 連接未建立');
            }
            console.log('✅ 所有 WebSocket 連接已建立');

            // 5. 學生1發送消息
            await studentPage1.waitForSelector('input', { state: 'visible', timeout: TIMEOUT });
            await studentPage1.fill('input', '大家好，我是學生1');
            await studentPage1.click('button');
            console.log('✅ 學生1已發送消息');

            // 6. 驗證教師和學生2是否收到學生1的消息
            await teacherPage.waitForFunction(
                text => document.body.textContent.includes(text),
                '大家好，我是學生1',
                { timeout: TIMEOUT }
            );
            await studentPage2.waitForFunction(
                text => document.body.textContent.includes(text),
                '大家好，我是學生1',
                { timeout: TIMEOUT }
            );
            console.log('✅ 教師和學生2已收到學生1的消息');

            // 7. 學生2發送消息
            await studentPage2.waitForSelector('input', { state: 'visible', timeout: TIMEOUT });
            await studentPage2.fill('input', '你好學生1，我是學生2');
            await studentPage2.click('button');
            console.log('✅ 學生2已發送消息');

            // 8. 驗證教師和學生1是否收到學生2的消息
            await teacherPage.waitForFunction(
                text => document.body.textContent.includes(text),
                '你好學生1，我是學生2',
                { timeout: TIMEOUT }
            );
            await studentPage1.waitForFunction(
                text => document.body.textContent.includes(text),
                '你好學生1，我是學生2',
                { timeout: TIMEOUT }
            );
            console.log('✅ 教師和學生1已收到學生2的消息');

            // 9. 教師發送回覆
            await teacherPage.waitForSelector('select', { state: 'visible', timeout: TIMEOUT });
            await teacherPage.selectOption('select', 'test-room');
            await teacherPage.fill('input', '同學們好，我是老師');
            await teacherPage.click('button');
            console.log('✅ 教師已發送回覆');

            // 10. 驗證兩個學生是否都收到教師的消息
            for (const studentPage of [studentPage1, studentPage2]) {
                await studentPage.waitForFunction(
                    text => document.body.textContent.includes(text),
                    '同學們好，我是老師',
                    { timeout: TIMEOUT }
                );
            }
            console.log('✅ 所有學生已收到教師消息');

            // 11. 教師發送廣播消息
            const buttons = await teacherPage.$$('button');
            for (const button of buttons) {
                const text = await button.textContent();
                if (text.includes('廣播')) {
                    await button.click();
                    break;
                }
            }
            await teacherPage.waitForSelector('textarea', { state: 'visible', timeout: TIMEOUT });
            await teacherPage.fill('textarea', '這是一條全體廣播');
            const broadcastButtons = await teacherPage.$$('button');
            for (const button of broadcastButtons) {
                const text = await button.textContent();
                if (text.includes('發送廣播')) {
                    await button.click();
                    break;
                }
            }
            console.log('✅ 教師已發送廣播');

            // 12. 驗證兩個學生是否都收到廣播消息
            for (const studentPage of [studentPage1, studentPage2]) {
                await studentPage.waitForFunction(
                    text => document.body.textContent.includes(text),
                    '這是一條全體廣播',
                    { timeout: TIMEOUT }
                );
            }
            console.log('✅ 所有學生已收到廣播');

            // 13. 檢查所有頁面的聊天記錄
            const teacherChatHistory = await teacherPage.evaluate(() => {
                const messages = Array.from(document.querySelectorAll('div')).filter(div => 
                    div.textContent.includes('學生') || div.textContent.includes('老師')
                );
                return messages.map(m => ({
                    text: m.textContent,
                    isTeacher: m.textContent.includes('老師')
                }));
            });
            
            const student1ChatHistory = await studentPage1.evaluate(() => {
                const messages = Array.from(document.querySelectorAll('div')).filter(div => 
                    div.textContent.includes('學生') || div.textContent.includes('老師')
                );
                return messages.map(m => ({
                    text: m.textContent,
                    isTeacher: m.textContent.includes('老師')
                }));
            });
            
            const student2ChatHistory = await studentPage2.evaluate(() => {
                const messages = Array.from(document.querySelectorAll('div')).filter(div => 
                    div.textContent.includes('學生') || div.textContent.includes('老師')
                );
                return messages.map(m => ({
                    text: m.textContent,
                    isTeacher: m.textContent.includes('老師')
                }));
            });

            // 14. 驗證所有聊天記錄的長度是否一致
            expect(teacherChatHistory.length).toBe(student1ChatHistory.length);
            expect(student1ChatHistory.length).toBe(student2ChatHistory.length);
            console.log('✅ 所有聊天記錄長度一致');

            // 15. 檢查 WebSocket 連接狀態
            const checkFinalWebSocket = async (page) => {
                try {
                    const wsStatus = await page.evaluate(() => {
                        if (!window.wsManager || !window.wsManager.ws) return 'no_ws';
                        switch (window.wsManager.ws.readyState) {
                            case WebSocket.CONNECTING: return 'connecting';
                            case WebSocket.OPEN: return 'open';
                            case WebSocket.CLOSING: return 'closing';
                            case WebSocket.CLOSED: return 'closed';
                            default: return 'unknown';
                        }
                    });
                    console.log(`最終 WebSocket 狀態: ${wsStatus}`);
                    return wsStatus === 'open';
                } catch (error) {
                    console.error('最終 WebSocket 狀態檢查失敗:', error);
                    return false;
                }
            };

            const finalWsResults = await Promise.all([
                checkFinalWebSocket(teacherPage),
                checkFinalWebSocket(studentPage1),
                checkFinalWebSocket(studentPage2)
            ]);

            expect(finalWsResults.every(result => result)).toBe(true);
            console.log('✅ 所有 WebSocket 連接狀態正常');

        } catch (error) {
            console.error('❌ 測試失敗:', error);
            // 保存頁面截圖以便調試
            if (teacherPage) await teacherPage.screenshot({ path: 'teacher-error.png' });
            if (studentPage1) await studentPage1.screenshot({ path: 'student1-error.png' });
            if (studentPage2) await studentPage2.screenshot({ path: 'student2-error.png' });
            throw error;
        }
    });
}); 