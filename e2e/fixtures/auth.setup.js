/**
 * Auth setup — chạy 1 lần qua project "setup" trước mọi spec.
 *
 * Quy trình:
 *   1. Vào /login
 *   2. Điền credential từ E2E_USERNAME / E2E_PASSWORD (đã seed sẵn)
 *   3. Submit → đợi redirect /app
 *   4. Lưu cookies + localStorage vào .auth/user.json
 *
 * Sau đó mọi spec dùng storageState này → KHÔNG cần login lại.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '..', '.auth', 'user.json');

const USERNAME = process.env.E2E_USERNAME || 'e2etest';
const PASSWORD = process.env.E2E_PASSWORD || 'Test@1234';

setup('authenticate e2e user', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();

  await page.getByPlaceholder('Nhập tên đăng nhập').fill(USERNAME);
  await page.getByPlaceholder('Nhập mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await page.waitForURL(/\/app(\/|$)/, { timeout: 15_000 });
  await expect(page.locator('aside').first()).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
