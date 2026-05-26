import { test, expect } from '@playwright/test';

test.describe('Khách hàng', () => {
  test('trang index — tiêu đề + ô tìm kiếm', async ({ page }) => {
    await page.goto('/app/customers');
    await expect(page.getByRole('heading', { name: 'Khách hàng', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Tìm kiếm khách hàng...')).toBeVisible();
  });

  test('mở chiến dịch E2E từ danh sách', async ({ page }) => {
    await page.goto('/app/customers');
    const entry = page.getByRole('button', { name: /E2E-\d+/ }).first();
    await expect(entry).toBeVisible({ timeout: 20_000 });
    await entry.click();
    await expect(page).toHaveURL(/\/app\/customers\/\d+/);
    await expect(page.getByText('Danh sách khách hàng tham gia chiến dịch')).toBeVisible();
  });
});
