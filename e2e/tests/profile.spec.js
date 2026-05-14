import { test, expect } from '@playwright/test';

test.describe('Thông tin tài khoản', () => {
  test('mở modal, sửa họ tên, lưu', async ({ page }) => {
    await page.goto('/app');
    await page.locator('aside div.border-t').getByRole('button').first().click();
    await page.getByRole('button', { name: /Thông tin tài khoản/ }).click();

    await expect(page.getByRole('heading', { name: 'Thông tin tài khoản' })).toBeVisible();

    const fullName = page.getByPlaceholder('Nhập họ và tên');
    await fullName.clear();
    await fullName.fill(`E2E Test User ${Date.now()}`);

    await page.getByRole('button', { name: 'Lưu thông tin' }).click();
    await expect(
      page.getByText('Cập nhật thông tin tài khoản thành công.'),
    ).toBeVisible({ timeout: 12_000 });

    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Thông tin tài khoản' })).not.toBeVisible();
  });
});
