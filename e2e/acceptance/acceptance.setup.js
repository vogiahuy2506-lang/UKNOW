import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { captureScreenshot, recordReport, dismissPhoneReminder } from './acceptance-helper.js';

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
  const passwordInput = page.locator('input[autocomplete="current-password"]');
  await page.locator('input[autocomplete="username"]').fill(USERNAME);
  await passwordInput.fill(PASSWORD);
  // Bắt câu trả lời của máy chủ: toast lỗi chỉ sống vài giây, hết 25 giây chờ là đã tắt.
  const loginResponsePromise = page
    .waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST', { timeout: 25_000 })
    .catch(() => null);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  // Playwright chụp cây trang (kèm GIÁ TRỊ ô nhập) vào test-results/…/error-context.md khi test đỏ —
  // 25/09 file đó lưu nguyên mật khẩu production. Hỏng thì xoá ô mật khẩu TRƯỚC khi ném lỗi, và nói
  // rõ lý do thay cho một dòng "Timeout" câm.
  const failLogin = async (lyDo) => {
    await passwordInput.fill('').catch(() => {});
    recordReport({ kichBan: 'HE_THONG', buoc: 'login_setup', ketQua: 'khong_dat', lyDo });
    throw new Error(lyDo);
  };

  const leftLogin = await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  if (!leftLogin) {
    const loginResponse = await loginResponsePromise;
    let serverSaid = 'không thấy request đăng nhập nào';
    if (loginResponse) {
      const body = await loginResponse.json().catch(() => null);
      serverSaid = `HTTP ${loginResponse.status()}${body?.message ? `: "${body.message}"` : ''}`;
    }
    await failLogin(`Đăng nhập không thành công, trang vẫn ở /login — máy chủ trả ${serverSaid}.`);
  }

  // Tài khoản quản trị được đưa về /admin, tài khoản chưa có gói về / (utils/authRedirect.js:1-8) —
  // kịch bản cần góc nhìn của KHÁCH (chủ workspace có gói).
  const landedPath = new URL(page.url()).pathname;
  if (landedPath.startsWith('/admin')) {
    await failLogin(`Tài khoản "${USERNAME}" là tài khoản quản trị (vào /admin). Dùng tài khoản khách là chủ workspace có gói, ví dụ tài khoản 39.`);
  }
  if (!landedPath.startsWith('/app')) {
    await failLogin(`Đăng nhập xong bị đưa về "${landedPath}", không vào /app — tài khoản chưa có gói còn hạn?`);
  }
  // Hộp thoại "Bổ sung số điện thoại" (tài khoản chưa có SĐT) — bấm đúng "Để sau". KHÔNG tìm nút
  // theo /Đóng|Close|X|×/i như auth.setup.js: chữ "X" khớp nút "Xác nhận" (production 25/09).
  await dismissPhoneReminder(page);
  await expect(page.locator('aside').first()).toBeVisible({ timeout: 15_000 });
  const phoneModal = page.locator('.modal-overlay').filter({ hasText: 'Bổ sung số điện thoại' });
  if (await phoneModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await phoneModal.getByRole('button', { name: 'Để sau', exact: true }).click();
    await expect(phoneModal).toBeHidden({ timeout: 5000 });
  }

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
