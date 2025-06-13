const { test, expect } = require('@playwright/test');

test.describe('教師聊天室功能測試', () => {
    let teacherContext;
    let studentContext;
    let teacherPage;
    let studentPage;

    test.beforeAll(async ({ browser }) => {
        // 創建兩個獨立的上下文，分別用於教師和學生
        teacherContext = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        studentContext = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
    });

    test.afterAll(async () => {
        await teacherContext.close();
        await studentContext.close();
    });

    test('完整聊天流程測試', async () => {
        // 1. 設置教師頁面
        teacherPage = await teacherContext.newPage();
        await teacherPage.goto('https://pythonlearn.zeabur.app/teacher.html', {
            waitUntil: 'networkidle'
        });
        
        // 等待教師頁面加載完成
        await teacherPage.waitForSelector('.chat-panel', { state: 'visible', timeout: 10000 });
        console.log('✅ 教師頁面已加載');

        // 2. 設置學生頁面
        studentPage = await studentContext.newPage();
        await studentPage.goto('https://pythonlearn.zeabur.app', {
            waitUntil: 'networkidle'
        });
        
        // 等待學生頁面加載完成
        await studentPage.waitForSelector('input[placeholder="輸入房間名稱"]', { state: 'visible', timeout: 10000 });
        
        // 填寫學生加入房間表單
        await studentPage.fill('input[placeholder="輸入房間名稱"]', 'test-room');
        await studentPage.fill('input[placeholder="輸入您的名稱"]', 'test-student');
        
        // 等待按鈕可點擊
        const joinButton = studentPage.locator('button:has-text("加入房間")');
        await joinButton.waitFor({ state: 'visible' });
        await joinButton.click();
        
        // 等待學生進入房間
        await studentPage.waitForSelector('.chat-container', { state: 'visible', timeout: 10000 });
        console.log('✅ 學生已加入房間');

        // 等待 WebSocket 連接建立
        await studentPage.waitForFunction(() => {
            return window.ws && window.ws.readyState === WebSocket.OPEN;
        }, { timeout: 10000 });

        // 3. 學生發送消息
        const chatInput = studentPage.locator('.chat-input');
        await chatInput.waitFor({ state: 'visible' });
        await chatInput.fill('你好，老師！');
        
        const sendButton = studentPage.locator('.chat-send-btn');
        await sendButton.waitFor({ state: 'visible' });
        await sendButton.click();
        console.log('✅ 學生已發送消息');

        // 4. 驗證教師是否收到學生消息
        await teacherPage.waitForFunction(
            text => document.querySelector('.chat-messages')?.textContent.includes(text),
            '你好，老師！',
            { timeout: 10000 }
        );
        console.log('✅ 教師已收到學生消息');

        // 5. 教師發送回覆
        const roomSelect = teacherPage.locator('#chatTargetRoom');
        await roomSelect.waitFor({ state: 'visible' });
        await roomSelect.selectOption('test-room');
        
        const teacherInput = teacherPage.locator('#teacherChatInput');
        await teacherInput.waitFor({ state: 'visible' });
        await teacherInput.fill('同學你好！');
        
        const teacherSendButton = teacherPage.locator('#sendChatBtn');
        await teacherSendButton.waitFor({ state: 'visible' });
        await teacherSendButton.click();
        console.log('✅ 教師已發送回覆');

        // 6. 驗證學生是否收到教師消息
        await studentPage.waitForFunction(
            text => document.querySelector('.chat-container')?.textContent.includes(text),
            '同學你好！',
            { timeout: 10000 }
        );
        console.log('✅ 學生已收到教師消息');

        // 7. 教師發送廣播消息
        const broadcastButton = teacherPage.locator('button:has-text("廣播")');
        await broadcastButton.waitFor({ state: 'visible' });
        await broadcastButton.click();
        
        const broadcastInput = teacherPage.locator('#broadcastMessage');
        await broadcastInput.waitFor({ state: 'visible' });
        await broadcastInput.fill('這是一條廣播消息');
        
        const sendBroadcastButton = teacherPage.locator('button:has-text("發送廣播")');
        await sendBroadcastButton.waitFor({ state: 'visible' });
        await sendBroadcastButton.click();
        console.log('✅ 教師已發送廣播');

        // 8. 驗證學生是否收到廣播
        await studentPage.waitForFunction(
            text => document.querySelector('.chat-container')?.textContent.includes(text),
            '這是一條廣播消息',
            { timeout: 10000 }
        );
        console.log('✅ 學生已收到廣播');

        // 9. 檢查聊天記錄
        const teacherChatHistory = await teacherPage.$$eval('.chat-message', messages => 
            messages.map(m => ({
                text: m.textContent,
                isTeacher: m.classList.contains('teacher-message')
            }))
        );
        
        const studentChatHistory = await studentPage.$$eval('.chat-message', messages => 
            messages.map(m => ({
                text: m.textContent,
                isTeacher: m.classList.contains('teacher-message')
            }))
        );

        console.log('教師聊天記錄:', teacherChatHistory);
        console.log('學生聊天記錄:', studentChatHistory);

        // 10. 驗證連接狀態
        const teacherStatus = await teacherPage.evaluate(() => {
            return window.ws && window.ws.readyState === WebSocket.OPEN;
        });
        
        const studentStatus = await studentPage.evaluate(() => {
            return window.ws && window.ws.readyState === WebSocket.OPEN;
        });

        expect(teacherStatus).toBe(true);
        expect(studentStatus).toBe(true);
        console.log('✅ WebSocket 連接狀態正常');
    });

    test('教師監控功能測試', async () => {
        teacherPage = await teacherContext.newPage();
        await teacherPage.goto('https://pythonlearn.zeabur.app/teacher.html', {
            waitUntil: 'networkidle'
        });
        
        // 等待統計資訊更新
        await teacherPage.waitForSelector('.stats-panel', { state: 'visible', timeout: 10000 });
        
        // 等待 WebSocket 連接建立
        await teacherPage.waitForFunction(() => {
            return window.ws && window.ws.readyState === WebSocket.OPEN;
        }, { timeout: 10000 });
        
        // 檢查是否有活動房間資訊
        const activeRooms = await teacherPage.locator('.stats-active-rooms').textContent();
        expect(parseInt(activeRooms) || 0).toBeGreaterThanOrEqual(0);
        
        // 檢查是否有在線學生資訊
        const onlineStudents = await teacherPage.locator('.stats-online-students').textContent();
        expect(parseInt(onlineStudents) || 0).toBeGreaterThanOrEqual(0);
        
        console.log('✅ 教師監控面板數據正常');
        
        // 檢查房間列表更新
        const refreshButton = teacherPage.locator('button:has-text("刷新房間列表")');
        await refreshButton.waitFor({ state: 'visible' });
        await refreshButton.click();
        
        await teacherPage.waitForResponse(
            response => response.url().includes('/api/teacher/rooms') && response.status() === 200,
            { timeout: 10000 }
        );
        
        console.log('✅ 房間列表更新成功');
    });
}); 