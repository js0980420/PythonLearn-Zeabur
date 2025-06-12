const { test, expect } = require('@playwright/test');

test.describe('基本功能測試', () => {
  test('首頁應該可以成功載入並顯示標題', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle(/Python多人協作教學平台/);
    await expect(page.locator('h1')).toHaveText('Python多人協作教學平台');
  });

  test('AI 助教按鈕應該存在且可點擊', async ({ page }) => {
    await page.goto('http://localhost:3000');
    // 檢查 AI 助教按鈕是否存在且啟用
    const aiAssistantButton = page.locator('button[data-bs-title="使用 AI 分析您的程式碼"]');
    await expect(aiAssistantButton).toBeVisible();
    await expect(aiAssistantButton).toBeEnabled();
  });
}); 