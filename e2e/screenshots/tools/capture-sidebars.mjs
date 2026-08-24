/**
 * Chụp thanh menu của CHỦ TÀI KHOẢN và của NHÂN VIÊN, ghi ra hai file riêng.
 *
 * Vì sao tách khỏi bộ shot thường: ô ảnh này cần HAI phiên đăng nhập khác nhau,
 * mà capture.spec.js dùng chung một `storageState` cho cả lượt chạy. Ghép hai ảnh
 * lại thì dùng tools/compose.py.
 *
 * Chạy (từ thư mục e2e/, cần frontend + backend đang chạy ở máy, DB đã seed
 * kèm E2E_SEED_EMPLOYEES=1):
 *   node screenshots/tools/capture-sidebars.mjs
 *
 * Tài khoản lấy từ seed: chủ = e2etest, nhân viên = nv_marketing (cùng mật khẩu
 * Test@1234). Đổi seed thì sửa hằng số dưới đây.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'manual', 'faq-billing');
const BASE_URL = process.env.HELP_SHOT_BASE_URL || 'http://localhost:5174';
const PASSWORD = process.env.E2E_PASSWORD || 'Test@1234';

const ACCOUNTS = [
  { username: process.env.E2E_USERNAME || 'e2etest', file: 'chu-tai-khoan.png' },
  { username: 'nv_marketing', file: 'nhan-vien.png' },
];

/**
 * Đăng nhập rồi chụp riêng phần <nav> trong thanh menu.
 *
 * Chụp <nav> chứ không chụp cả <aside>: aside cao hết màn hình và có nút thu gọn
 * ghim ở đáy, chụp nguyên khối thì thừa một mảng trắng dài ở giữa.
 */
async function captureSidebar(browser, { username, file }) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input').first().fill(username);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /Đăng nhập/i }).first().click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });

  // Menu mặc định ở trạng thái thu gọn (chỉ còn biểu tượng) — phải bật cờ rồi
  // tải lại thì mới có chữ để so sánh hai bên.
  await page.evaluate(() => {
    window.localStorage.setItem('founder_ai_sidebar_open', 'true');
  });
  await page.goto(`${BASE_URL}/app`);

  const nav = page.locator('aside nav').first();
  await nav.waitFor({ state: 'visible', timeout: 30_000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1200);

  const groups = (await nav.innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
  const target = path.join(OUT_DIR, file);
  await nav.screenshot({ path: target, animations: 'disabled' });
  await ctx.close();

  console.log(`${file}: ${groups.length} mục — ${groups.join(' · ')}`);
  return groups;
}

const browser = await chromium.launch();
try {
  const results = [];
  for (const account of ACCOUNTS) {
    results.push(await captureSidebar(browser, account));
  }
  const [ownerGroups, staffGroups] = results;

  // Chốt chặn: ảnh chỉ có nghĩa khi hai bên THẬT SỰ khác nhau đúng chỗ bài viết nói.
  const billing = 'Gói & Thanh toán';
  if (!ownerGroups.includes(billing)) {
    throw new Error(`Thanh menu chủ tài khoản KHÔNG có "${billing}" — sai tài khoản, hoặc menu chưa mở rộng.`);
  }
  if (staffGroups.includes(billing)) {
    throw new Error(`Thanh menu nhân viên VẪN có "${billing}" — ảnh so sánh sẽ vô nghĩa.`);
  }
  console.log('\nOK — hai thanh menu khác nhau đúng chỗ cần so sánh.');
} finally {
  await browser.close();
}
