import { test, expect } from '@playwright/test';

const USERNAME = process.env.E2E_USERNAME || 'e2etest';
const PASSWORD = process.env.E2E_PASSWORD || 'Test@1234';

test.describe('Auth', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('form đăng nhập hiển thị', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Nhập tên đăng nhập')).toBeVisible();
    await expect(page.getByPlaceholder('Nhập mật khẩu')).toBeVisible();
  });

  test('submit trống → validation', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByText(/Vui lòng nhập tên đăng nhập/)).toBeVisible();
  });

  test('sai mật khẩu → vẫn ở /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Nhập tên đăng nhập').fill(USERNAME);
    await page.getByPlaceholder('Nhập mật khẩu').fill(`wrong-${Date.now()}`);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('đăng nhập đúng → /app', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Nhập tên đăng nhập').fill(USERNAME);
    await page.getByPlaceholder('Nhập mật khẩu').fill(PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
    await expect(page.locator('aside').first()).toBeVisible();
  });
});

test.describe('Session', () => {
  test('đã login vào /app', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('aside').first()).toBeVisible();
  });

  test('đăng xuất từ sidebar', async ({ page }) => {
    await page.goto('/app');
    await page.locator('aside').first().getByText(/E2E Test User|e2etest/i).first().click();
    await page.getByRole('button', { name: /Đăng xuất/ }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });
});
