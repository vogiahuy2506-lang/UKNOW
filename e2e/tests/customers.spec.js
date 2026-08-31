import { test, expect } from '@playwright/test';

test.describe('Khách hàng', () => {
  test('trang index — tiêu đề + ô tìm kiếm', async ({ page }) => {
    await page.goto('/app/customers');
    // Wait for network to be idle so auth init (/auth/me) completes before asserting
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await expect(page).toHaveURL(/\/app\/customers/);
    await expect(page.getByRole('heading', { name: 'Khách hàng', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('Tìm kiếm khách hàng...')).toBeVisible();
  });

  /**
   * TẠM BỎ QUA 31/08/2026 — tiền đề của test không còn đúng.
   *
   * Test này cần một chiến dịch `E2E-*` đang HOẠT ĐỘNG. Trước đây có, vì
   * `campaigns.spec.js` kích hoạt được một chiến dịch rỗng node. Từ 30/08 preflight
   * `NO_SEND_NODE` chặn việc đó (đúng — xem lý do trong campaigns.spec.js), nên chiến dịch
   * nằm lại ở `draft` và không xuất hiện ở đây.
   *
   * Muốn bật lại: dựng một chiến dịch HỢP LỆ (có node gửi tin) qua builder rồi mới kích hoạt.
   * Đó là việc riêng, không nên nhét vào lần vá này. Bỏ qua có chú thích còn hơn để đỏ vĩnh viễn —
   * một check đỏ kinh niên sẽ khiến không ai nhận ra lúc nó đỏ vì lý do thật.
   */
  test.skip('mở chiến dịch E2E từ danh sách', async ({ page }) => {
    await page.goto('/app/customers');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    const entry = page.getByRole('button', { name: /E2E-\d+/ }).first();
    await expect(entry).toBeVisible({ timeout: 20_000 });
    await entry.click();
    await expect(page).toHaveURL(/\/app\/customers\/\d+/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await expect(page.getByText('Danh sách khách hàng tham gia chiến dịch')).toBeVisible({ timeout: 15_000 });
  });
});
