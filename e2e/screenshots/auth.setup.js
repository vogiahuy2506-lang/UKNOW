/**
 * Đăng nhập một lần, lưu phiên cho các lượt chụp.
 *
 * Tài khoản lấy từ biến môi trường do NGƯỜI CHẠY tự đặt — không ghi vào file,
 * không commit. Nên dùng tài khoản chủ workspace, vì nhiều màn hình trong bài
 * hướng dẫn chỉ chủ tài khoản mới thấy (nhóm Gói & Thanh toán, Hồ sơ doanh nghiệp).
 */
import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'help-shots.json');

/**
 * Nhận ra chuỗi chỉ là chỗ điền trong lệnh mẫu.
 *
 * Không liệt kê từng chuỗi cụ thể nữa — đã thử và vẫn lọt ('tên_đăng_nhập_thật'
 * không nằm trong danh sách). Bắt theo hình dạng: dấu ba chấm, hoặc chuỗi có
 * gạch dưới mà lại chứa chữ tiếng Việt có dấu — tên đăng nhập thật không viết vậy.
 */
const PLACEHOLDER_SHAPE = /^(\.{3}|…)$|^[^\s]*_[^\s]*$/u;
const VIETNAMESE_DIACRITICS = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

function looksLikePlaceholder(value) {
  const text = String(value).trim();
  if (text === '...' || text === '…') return true;
  return PLACEHOLDER_SHAPE.test(text) && VIETNAMESE_DIACRITICS.test(text);
}

setup('đăng nhập để chụp ảnh', async ({ page }) => {
  const username = process.env.HELP_SHOT_USERNAME;
  const password = process.env.HELP_SHOT_PASSWORD;
  const SETUP_HINT = 'Điền tài khoản vào e2e/screenshots/.env.shots:\n'
    + '  cp screenshots/.env.shots.example screenshots/.env.shots\n'
    + '  rồi mở file đó điền HELP_SHOT_USERNAME và HELP_SHOT_PASSWORD.';

  if (!username || !password) throw new Error(`Chưa có tài khoản.\n${SETUP_HINT}`);
  if (looksLikePlaceholder(username) || looksLikePlaceholder(password)) {
    throw new Error(
      `Tài khoản đang là chuỗi mẫu ("${username}") chứ không phải tài khoản thật.\n${SETUP_HINT}`,
    );
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.goto('/login');

  // KHÔNG chờ 'networkidle': site thật giữ kết nối SSE cho hộp thư nên mạng không
  // bao giờ rảnh, chờ kiểu đó luôn hết giờ. Chờ đúng ô nhập là chắc chắn nhất.
  const usernameBox = page.locator('input[autocomplete="username"]');
  await usernameBox.waitFor({ state: 'visible', timeout: 30_000 });

  await usernameBox.fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  // Sai tài khoản thì trang đứng nguyên ở /login, và chờ chuyển trang sẽ hết giờ
  // với thông báo không nói gì về nguyên nhân thật. Bắt lấy, đọc thông báo lỗi
  // đang hiện trên trang rồi báo lại cho đúng chuyện.
  const loggedIn = await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!loggedIn) {
    const notice = await page.locator('[role="alert"], [class*="toast"], [class*="Toast"]')
      .first().textContent({ timeout: 2_000 }).catch(() => null);
    throw new Error(
      `Đăng nhập không thành công — vẫn ở ${page.url()}\n`
      + (notice ? `Trang báo: ${notice.trim()}\n` : '')
      + 'Kiểm tra lại tên đăng nhập / mật khẩu.',
    );
  }
  await expect(page.locator('aside').first()).toBeVisible({ timeout: 30_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
