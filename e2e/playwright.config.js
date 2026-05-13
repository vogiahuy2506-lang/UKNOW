/**
 * Playwright config cho UKNOW E2E.
 *
 * Triết lý:
 *   - Local-first: dev phải tự khởi động backend (qua `npm run dev:e2e`).
 *     Playwright chỉ auto-spawn frontend để giảm số terminal cần mở.
 *   - Single browser (chromium) để chạy nhanh — UKNOW không cần test
 *     đa browser ở giai đoạn này.
 *   - storageState (cookies + localStorage) được tạo 1 lần qua project
 *     "setup" rồi reuse cho các spec → tiết kiệm thời gian login.
 *
 * Khởi chạy:
 *   1. Khởi backend test mode: `cd backend && npm run dev:e2e`
 *   2. (Optional) Seed lại DB: `cd e2e && npm run seed`
 *   3. Chạy test: `cd e2e && npm test`
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '.env.test') });

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const BACKEND_URL = process.env.BACKEND_PUBLIC_URL || 'http://localhost:5001';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  globalSetup: './global-setup.js',

  use: {
    baseURL: FRONTEND_URL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    extraHTTPHeaders: {
      'x-e2e-test': '1',
    },
  },

  projects: [
    {
      name: 'setup',
      testDir: './fixtures',
      testMatch: /.*\.setup\.js$/,
      use: {
        ...devices['Desktop Chrome'],
      },
      teardown: 'cleanup',
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'cleanup',
      testDir: './fixtures',
      testMatch: /.*\.teardown\.js$/,
    },
  ],

  webServer: [
    {
      command: 'cd ../frontend && npm run dev -- --port 5174 --host',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],

  metadata: {
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
  },
});
