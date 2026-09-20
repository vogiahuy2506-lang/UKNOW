/**
 * Playwright — nghiệm thu bộ đo hiển thị landing (PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA, PR-1).
 *
 * Config RIÊNG, không dùng playwright.config.js: config chính seed DB, dựng Vite và cần backend cho
 * project `setup`. Bộ đo chỉ cần Chromium + mạng (Tailwind CDN), nên chạy được mà không có DB.
 *
 *   cd e2e && npm run test:layout-audit
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './layout-audit',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  projects: [{ name: 'layout-audit', use: { ...devices['Desktop Chrome'] } }],
});
