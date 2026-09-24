import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { captureScreenshot, recordReport } from './acceptance-helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '..', '.auth', 'acceptance.json');

const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

setup('authenticate for acceptance', async ({ page }) => {
  if (!USERNAME || !PASSWORD) {
    recordReport({
      kichBan: 'HE_THONG',
      buoc: 'login_setup',
      ketQua: 'khong_dat',
      lyDo: 'Thiếu E2E_USERNAME hoặc E2E_PASSWORD trong biến môi trường',
    });
    throw new Error('Thiếu E2E_USERNAME hoặc E2E_PASSWORD! Hãy truyền qua biến môi trường lúc chạy.');
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  console.log(`[Đăng nhập] Đăng nhập vào ${process.env.E2E_BASE_URL} bằng tài khoản: ${USERNAME}`);
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[autocomplete="username"]').fill(USERNAME);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await page.waitForURL(/\/app(\/|$)/, { timeout: 25_000 });
  await expect(page.locator('aside').first()).toBeVisible({ timeout: 15_000 });

  // Đóng modal nếu có (AccountProfileModal hoặc bất kỳ modal nào block UI) theo đúng auth.setup.js
  const closeModal = async () => {
    const overlay = page.locator('.modal-overlay').first();
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeBtn = overlay.locator('button').filter({ hasText: /Đóng|Close|X|×/i }).first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  };
  await closeModal();

  await captureScreenshot(page, 'setup_logged_in.png', 'Đăng nhập thành công vào app');
  await page.context().storageState({ path: AUTH_FILE });

  recordReport({
    kichBan: 'HE_THONG',
    buoc: 'login_setup',
    ketQua: 'dat',
    extra: { username: USERNAME, authFile: AUTH_FILE },
  });
  console.log(`[Đăng nhập] Lưu storageState thành công vào ${AUTH_FILE}`);
});
