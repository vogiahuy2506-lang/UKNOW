/**
 * Playwright — UKNOW E2E (local-first).
 * Backend: `cd backend && npm run dev:e2e` (load ../e2e/.env.test).
 * Playwright: seed DB + spawn Vite frontend.
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
  timeout: 45_000,
  expect: { timeout: 8_000 },

  globalSetup: './global-setup.js',

  use: {
    baseURL: FRONTEND_URL,
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },

  projects: [
    {
      name: 'setup',
      testDir: './fixtures',
      testMatch: /.*\.setup\.js$/,
      use: { ...devices['Desktop Chrome'] },
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

  metadata: { backendUrl: BACKEND_URL, frontendUrl: FRONTEND_URL },
});
