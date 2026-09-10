import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '..', '.auth', 'user.json');
const USERNAME = process.env.E2E_USERNAME || 'e2etest';
const PASSWORD = process.env.E2E_PASSWORD || 'Test@1234';

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.goto('/login');
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[autocomplete="username"]').fill(USERNAME);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
  await expect(page.locator('aside').first()).toBeVisible();

  // Đóng modal nếu có (AccountProfileModal hoặc bất kỳ modal nào block UI)
  const closeModal = async () => {
    const overlay = page.locator('.modal-overlay').first();
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      // Click nút đóng nếu có
      const closeBtn = overlay.locator('button').filter({ hasText: /Đóng|Close|X|×/i }).first();
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
      // Escape key cũng đóng được modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  };
  await closeModal();

  await page.context().storageState({ path: AUTH_FILE });
});
