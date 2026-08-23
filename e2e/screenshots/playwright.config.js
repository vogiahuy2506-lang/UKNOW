/**
 * Cấu hình RIÊNG cho việc chụp ảnh minh hoạ bài hướng dẫn.
 *
 * Tách khỏi playwright.config.js của bộ e2e vì hai lý do:
 *  1. Bộ e2e có globalSetup RESET + SEED LẠI DB test. Chụp ảnh thì trỏ vào site
 *     thật, chạy nhầm globalSetup ở đây là xoá dữ liệu.
 *  2. Bộ e2e tự dựng frontend dev server; ở đây không cần vì trỏ vào site đã chạy.
 *
 * Chạy (từ thư mục e2e/):
 *   cp screenshots/.env.shots.example screenshots/.env.shots   # điền tài khoản
 *   npx playwright test --config=screenshots/playwright.config.js
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tài khoản đọc từ file thay vì gõ vào dòng lệnh: gõ tay dễ dán nhầm chuỗi mẫu,
// và mật khẩu gõ trong dòng lệnh thì nằm lại trong lịch sử shell.
// Biến môi trường đặt sẵn vẫn được ưu tiên (dotenv không ghi đè).
dotenv.config({ path: path.join(__dirname, '.env.shots') });

const BASE_URL = process.env.HELP_SHOT_BASE_URL || 'https://founderai.biz';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: 'list',

  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    // Khung cố định: mọi ảnh phải cùng kích thước, cùng tỉ lệ. deviceScaleFactor 2
    // cho ảnh nét trên màn hình Retina mà không phải phóng to.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'capture',
      testMatch: /capture\.spec\.js$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        storageState: 'screenshots/.auth/help-shots.json',
      },
    },
  ],
});
