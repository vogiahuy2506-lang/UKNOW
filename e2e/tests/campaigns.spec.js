import { test, expect } from '@playwright/test';

test.describe('Campaigns UI', () => {
  test('nút Tạo mở modal rồi Hủy', async ({ page }) => {
    await page.goto('/app/campaigns');
    await expect(page.getByRole('heading', { name: /Chiến dịch/i })).toBeVisible();
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tạo chiến dịch mới' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy' }).first().click();
    await expect(page.getByRole('heading', { name: 'Tạo chiến dịch mới' })).not.toBeVisible();
  });
});

test.describe.serial('Tạo + kích hoạt chiến dịch', () => {
  const name = `E2E-${Date.now()}`;

  test('tạo email → vào builder', async ({ page }) => {
    await page.goto('/app/campaigns');
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    await page.getByPlaceholder('Nhập tên chiến dịch...').fill(name);
    await page.getByRole('button', { name: 'Tạo và thiết kế' }).click();
    await page.waitForURL(/\/app\/campaigns\/\d+\/builder/, { timeout: 25_000 });
    await expect(page).toHaveURL(/\/builder/);
  });

  test('kích hoạt từ danh sách', async ({ page }) => {
    await page.goto('/app/campaigns');
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('td').last().locator('button').first().click();
    await page.getByRole('button', { name: 'Kích hoạt' }).click();
    await expect(page.getByText(/Kích hoạt chiến dịch thành công|thành công/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(row.getByText('Đang hoạt động')).toBeVisible({ timeout: 10_000 });
  });
});
