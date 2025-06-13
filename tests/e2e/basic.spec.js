const { test, expect } = require('@playwright/test');

test.describe('基本功能測試', () => {
  test('首頁應該可以成功載入並顯示標題', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle(/Python多人協作教學平台/);
    await expect(page.locator('h1')).toHaveText('Python多人協作教學平台');
  });

  test('AI 助教按鈕應該存在且可點擊', async ({ page }) => {
    await page.goto('http://localhost:3000');
    // 等待頁面加載完成
    await page.waitForLoadState('networkidle');
    
    // 先加入房間（因為 AI 助教按鈕只在加入房間後才會顯示）
    await page.fill('input[placeholder="輸入房間名稱"]', 'test-room');
    await page.fill('input[placeholder="輸入您的名稱"]', 'test-user');
    await page.click('button:has-text("加入房間")');
    
    // 等待工作區域顯示
    await page.waitForSelector('#workspaceSection', { state: 'visible' });
    
    // 檢查 AI 助教按鈕是否存在且啟用
    const aiAssistantButton = page.locator('button:has-text("解釋程式")');
    await expect(aiAssistantButton).toBeVisible();
    await expect(aiAssistantButton).toBeEnabled();
  });
}); 