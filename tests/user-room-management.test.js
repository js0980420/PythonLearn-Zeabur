const { test, expect } = require('@playwright/test');

// 測試配置
const TEST_URL = 'http://localhost:3000';
const TEST_ROOM = 'test-room-' + Math.random().toString(36).substring(7);
const TEST_USERS = [
    { name: 'User1' },
    { name: 'User2' },
    { name: 'User3' }
];

test.describe('用戶房間管理測試', () => {
    test('多個用戶加入和離開房間', async ({ browser }) => {
        // 創建三個用戶的上下文
        const contexts = await Promise.all(
            TEST_USERS.map(() => browser.newContext())
        );
        const pages = await Promise.all(
            contexts.map(context => context.newPage())
        );

        // 所有用戶訪問頁面
        await Promise.all(
            pages.map(page => page.goto(TEST_URL))
        );

        // 依次讓用戶加入房間
        for (let i = 0; i < TEST_USERS.length; i++) {
            const page = pages[i];
            const user = TEST_USERS[i];

            // 輸入房間名稱和用戶名稱
            await page.fill('#roomInput', TEST_ROOM);
            await page.fill('#nameInput', user.name);
            await page.click('button:has-text("加入房間")');

            // 驗證成功加入房間
            await expect(page.locator('#workspaceSection')).toBeVisible();
            await expect(page.locator('#currentRoom')).toHaveText(TEST_ROOM);
            await expect(page.locator('#currentUserName')).toHaveText(user.name);

            // 驗證在線用戶列表更新
            for (let j = 0; j <= i; j++) {
                await expect(page.locator('#onlineUsers')).toContainText(TEST_USERS[j].name);
            }
        }

        // 依次讓用戶離開房間
        for (let i = 0; i < TEST_USERS.length; i++) {
            const page = pages[i];
            
            // 點擊離開房間按鈕
            await page.click('button:has-text("離開房間")');

            // 驗證回到登入頁面
            await expect(page.locator('#loginSection')).toBeVisible();
            await expect(page.locator('#workspaceSection')).toBeHidden();

            // 驗證其他用戶的在線用戶列表更新
            for (let j = i + 1; j < TEST_USERS.length; j++) {
                await expect(pages[j].locator('#onlineUsers')).not.toContainText(TEST_USERS[i].name);
            }
        }

        // 清理：關閉所有上下文
        await Promise.all(contexts.map(context => context.close()));
    });

    test('重複用戶名稱處理', async ({ browser }) => {
        // 創建兩個用戶的上下文
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();
        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        // 訪問頁面
        await page1.goto(TEST_URL);
        await page2.goto(TEST_URL);

        // 第一個用戶加入房間
        await page1.fill('#roomInput', TEST_ROOM);
        await page1.fill('#nameInput', 'DuplicateUser');
        await page1.click('button:has-text("加入房間")');

        // 驗證第一個用戶成功加入
        await expect(page1.locator('#workspaceSection')).toBeVisible();

        // 第二個用戶嘗試使用相同名稱加入
        await page2.fill('#roomInput', TEST_ROOM);
        await page2.fill('#nameInput', 'DuplicateUser');
        await page2.click('button:has-text("加入房間")');

        // 驗證錯誤提示
        const toastLocator = page2.locator('.toast-body');
        await expect(toastLocator).toContainText('用戶名稱重複');

        // 清理
        await context1.close();
        await context2.close();
    });

    test('房間自動清理', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        // 訪問頁面
        await page.goto(TEST_URL);

        // 加入房間
        const testRoom = 'cleanup-test-' + Math.random().toString(36).substring(7);
        await page.fill('#roomInput', testRoom);
        await page.fill('#nameInput', 'CleanupTester');
        await page.click('button:has-text("加入房間")');

        // 驗證成功加入
        await expect(page.locator('#workspaceSection')).toBeVisible();

        // 離開房間
        await page.click('button:has-text("離開房間")');

        // 等待超過房間清理時間（2分鐘）
        await page.waitForTimeout(125000); // 2分鐘 + 5秒緩衝

        // 嘗試重新加入同一房間
        await page.fill('#roomInput', testRoom);
        await page.fill('#nameInput', 'CleanupTester');
        await page.click('button:has-text("加入房間")');

        // 驗證是一個全新的房間（編輯器應該是空的）
        const editor = page.locator('.CodeMirror-code');
        await expect(editor).toBeEmpty();

        // 清理
        await context.close();
    });
}); 