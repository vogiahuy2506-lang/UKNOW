import { test, expect } from '@playwright/test';

test.describe('Thông tin tài khoản', () => {
  test('mở modal, sửa họ tên, lưu', async ({ page }) => {
    await page.goto('/app');
    // User button ở Header (SaaS-style), không còn ở sidebar.
    // Click avatar/user-group button ở góc phải top-bar.
    await page.locator('header button:has(.rounded-lg.bg-gradient-to-br)').first().click();
    await page.getByRole('button', { name: /Thông tin tài khoản/ }).click();

    await expect(page.getByRole('heading', { name: 'Hồ sơ' })).toBeVisible();

    const fullName = page.getByPlaceholder('Nhập họ và tên');
    await fullName.clear();
    await fullName.fill(`E2E Test User ${Date.now()}`);

    await page.getByRole('button', { name: 'Lưu thông tin' }).click();
    await expect(
      page.getByText(/Cập nhật.*thành công/i),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hồ sơ' })).not.toBeVisible();
  });
});
