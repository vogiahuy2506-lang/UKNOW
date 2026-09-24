/**
 * Playwright — Kịch bản nghiệm thu 3 tính năng trên PRODUCTION.
 *
 * CHÚ Ý BẢO MẬT VÀ TOÀN VẸN:
 * 1. KHÔNG BAO GIỜ CHẠY TRONG CI (ném lỗi nếu process.env.CI được đặt).
 * 2. BẮT BUỘC có E2E_BASE_URL (ví dụ: https://founderai.biz) — KHÔNG có fallback localhost để tránh nhầm.
 * 3. Không globalSetup (không seed DB — tuyệt đối không chạm dữ liệu production).
 * 4. Retries: 0 (bằng chứng phải là lượt đầu).
 * 5. Workers: 1, locale: 'vi-VN'.
 * 6. Đăng nhập MỘT lần qua project 'setup' lưu storageState vào .auth/acceptance.json.
 * 7. Cố định ACCEPTANCE_RUN_DIR trong tiến trình chính để mọi worker ghi chung vào 1 thư mục kết quả.
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Chốt 1: Chặn chạy trên CI
if (process.env.CI) {
  throw new Error('CẤM CHẠY NGHIỆM THU PRODUCTION TRONG CI! Nghiệm thu là sự kiện production do người vận hành trực tiếp chạy.');
}

// Chốt 2: Bắt buộc có E2E_BASE_URL tường minh
const BASE_URL = process.env.E2E_BASE_URL;
if (!BASE_URL) {
  throw new Error('Thiếu biến môi trường E2E_BASE_URL (ví dụ: E2E_BASE_URL=https://founderai.biz). Không dùng giá trị mặc định để tránh chạy nhầm.');
}

// Cố định thư mục kết quả phiên chạy trong tiến trình chính Playwright để mọi worker cùng dùng
if (!process.env.ACCEPTANCE_RUN_DIR) {
  const RESULTS_BASE_DIR = path.resolve(__dirname, 'acceptance-results');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const runDir = path.join(RESULTS_BASE_DIR, timestamp);
  fs.mkdirSync(runDir, { recursive: true });
  process.env.ACCEPTANCE_RUN_DIR = runDir;
}

const AUTH_FILE = path.join(__dirname, '.auth', 'acceptance.json');

export default defineConfig({
  testDir: './acceptance',
  // In bảng đạt/không đạt từ report.json — "N passed" của Playwright không phải kết quả nghiệm thu.
  globalTeardown: './acceptance/acceptance.summary.js',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(process.env.ACCEPTANCE_RUN_DIR, 'playwright-summary.json') }],
  ],
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },

  projects: [
    // Project 1: Đăng nhập 1 lần duy nhất, lưu storageState vào .auth/acceptance.json
    {
      name: 'setup',
      testMatch: /acceptance\.setup\.js$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // Project 2: Desktop Chrome (1440x900) cho Kịch bản A (Chiến dịch gộp) và Kịch bản B (Landing tự kiểm hiển thị)
    {
      name: 'desktop',
      testMatch: /(campaigns-unified|landing-layout-audit)\.spec\.js$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: AUTH_FILE,
      },
    },

    // Project 3: iPhone 14 (WebKit) cho Kịch bản C (Form đặt lịch trên iPhone)
    {
      name: 'iphone',
      testMatch: /form-booking-iphone\.spec\.js$/,
      dependencies: ['setup'],
      use: {
        ...devices['iPhone 14'],
        storageState: AUTH_FILE,
      },
    },
  ],
});
