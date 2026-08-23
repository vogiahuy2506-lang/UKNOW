/**
 * Đăng nhập một lần, lưu phiên cho các lượt chụp.
 *
 * Tài khoản lấy từ biến môi trường do NGƯỜI CHẠY tự đặt — không ghi vào file,
 * không commit. Nên dùng tài khoản chủ workspace, vì nhiều màn hình trong bài
 * hướng dẫn chỉ chủ tài khoản mới thấy (nhóm Gói & Thanh toán, Hồ sơ doanh nghiệp).
 */
import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'help-shots.json');

setup('đăng nhập để chụp ảnh', async ({ page }) => {
  const username = process.env.HELP_SHOT_USERNAME;
  const password = process.env.HELP_SHOT_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'Thiếu tài khoản. Chạy:\n'
      + '  HELP_SHOT_USERNAME=... HELP_SHOT_PASSWORD=... npx playwright test --config=screenshots/playwright.config.js',
    );
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.goto('/login');
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
  await expect(page.locator('aside').first()).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
