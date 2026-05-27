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
  await page.context().storageState({ path: AUTH_FILE });
});
