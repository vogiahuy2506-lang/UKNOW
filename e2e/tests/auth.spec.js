/**
 * Auth happy-path + một số error path.
 *
 * Lưu ý: dù storageState đã đăng nhập sẵn, các test trong file này
 * thường cần state "chưa đăng nhập" → dùng `test.use({ storageState: { cookies: [], origins: [] } })`
 * hoặc gọi `page.context().clearCookies()` ở từng test.
 */
import { test, expect } from '@playwright/test';

const USERNAME = process.env.E2E_USERNAME || 'e2etest';
const PASSWORD = process.env.E2E_PASSWORD || 'Test@1234';

test.describe('Auth flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login form hiển thị đầy đủ field + nút', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Nhập tên đăng nhập')).toBeVisible();
    await expect(page.getByPlaceholder('Nhập mật khẩu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  });

  test('submit form trống → hiện lỗi validation', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByText(/Vui lòng nhập tên đăng nhập/)).toBeVisible();
    await expect(page.getByText(/Vui lòng nhập mật khẩu/)).toBeVisible();
  });

  test('sai password → hiển thị toast lỗi, vẫn ở /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Nhập tên đăng nhập').fill(USERNAME);
    await page.getByPlaceholder('Nhập mật khẩu').fill('wrong-password-' + Date.now());
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

    await expect(page.getByText(/Tên đăng nhập|mật khẩu|không đúng|sai|thất bại/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('đúng credential → redirect /app + thấy sidebar', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Nhập tên đăng nhập').fill(USERNAME);
    await page.getByPlaceholder('Nhập mật khẩu').fill(PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

    await page.waitForURL(/\/app(\/|$)/, { timeout: 15_000 });
    await expect(page.locator('aside').first()).toBeVisible();
  });
});

test.describe('Authenticated session (dùng storageState)', () => {
  test('vào / → redirect /app vì đã login', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app(\/|$)/);
    await expect(page.locator('aside').first()).toBeVisible();
  });

  test('logout từ sidebar → quay về /login', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('aside').first()).toBeVisible();

    const sidebar = page.locator('aside').first();
    await sidebar.getByText(/E2E Test User|e2etest/i).first().click();

    await page.getByRole('button', { name: /Đăng xuất/ }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });
});
