/**
 * Ảnh minh hoạ cho bài "Hai hộp thoại sau khi đăng nhập: đồng ý điều khoản và số
 * điện thoại" (/huong-dan/tai-khoan-dieu-khoan-sdt).
 *
 * Tài khoản chủ (e2etest) đã đồng ý và đã có SĐT nên không bao giờ thấy hai hộp
 * thoại này. Dùng nhân viên `nv_cskh` do seed dựng (`E2E_SEED_EMPLOYEES=1`): chưa
 * có dòng đồng ý nào, chưa có SĐT. Mỗi lượt chụp trả tài khoản đó về trạng thái
 * ban đầu qua DB để chạy lại được. Chỉ chạy ở máy mình.
 */
import { highlight, hideVolatileChrome } from '../lib/shotHelpers.js';
import { loginAs, withDb } from '../lib/shotFixtures.js';

const USERNAME = 'nv_cskh';

async function resetAccount() {
  await withDb(async (db) => {
    const { rows } = await db.query('SELECT id FROM users WHERE username = $1', [USERNAME]);
    if (!rows[0]) {
      throw new Error(
        `Không có tài khoản "${USERNAME}". Nạp lại DB:\n  E2E_SEED_ALL=1 node scripts/seed-test-db.js`,
      );
    }
    await db.query('DELETE FROM user_consents WHERE user_id = $1', [rows[0].id]);
    await db.query('UPDATE users SET phone = NULL, phone_verified_at = NULL WHERE id = $1', [rows[0].id]);
  });
}

/** Đăng nhập rồi đi tới hộp thoại đồng ý. */
async function openConsentDialog(page, baseURL) {
  await resetAccount();
  const other = await loginAs(page, { username: USERNAME, baseURL });
  const dialog = other.locator('.modal-content').filter({ hasText: 'Cập nhật thoả thuận điều khoản' }).first();
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  await other.waitForTimeout(600);
  await hideVolatileChrome(other);
  return { other, dialog };
}

/** Tích đủ ba ô, bấm đồng ý, chờ hộp thoại số điện thoại hiện ra. */
async function openPhoneDialog(page, baseURL) {
  const { other, dialog } = await openConsentDialog(page, baseURL);
  for (const box of await dialog.locator('input[type="checkbox"]').all()) await box.check();
  await dialog.getByRole('button', { name: 'Đồng ý và tiếp tục' }).click();
  const phoneDialog = other.locator('.modal-content').filter({ hasText: 'Bổ sung số điện thoại' }).first();
  await phoneDialog.waitFor({ state: 'visible', timeout: 30_000 });
  await other.waitForTimeout(600);
  await hideVolatileChrome(other);
  return { other, phoneDialog };
}

/** Chụp xong thì đóng context phụ, kẻo lượt sau còn treo một phiên đăng nhập. */
function shotAndClose(other, locator) {
  return {
    screenshot: async (options = {}) => {
      try {
        return await locator.screenshot(options);
      } finally {
        await other.context().close();
      }
    },
  };
}

export default {
  slug: 'tai-khoan-dieu-khoan-sdt',
  shots: [
    {
      name: 'hop-thoai-dong-y-dieu-khoan',
      caption: 'hộp thoại Cập nhật thoả thuận điều khoản, ba ô tích và nút Đồng ý và tiếp tục',
      localOnly: true,
      async take(page, { baseURL }) {
        const { other, dialog } = await openConsentDialog(page, baseURL);
        return shotAndClose(other, dialog);
      },
    },
    {
      name: 'hop-thoai-bo-sung-sdt',
      caption: 'hộp thoại Bổ sung số điện thoại với ô nhập số, nút Để sau và nút Xác nhận',
      localOnly: true,
      async take(page, { baseURL }) {
        const { other, phoneDialog } = await openPhoneDialog(page, baseURL);
        return shotAndClose(other, phoneDialog);
      },
    },
    {
      name: 'hop-thoai-sdt-bao-loi',
      caption: 'hộp thoại Bổ sung số điện thoại đang báo lỗi số không hợp lệ, thấy dòng hướng dẫn định dạng',
      localOnly: true,
      async take(page, { baseURL }) {
        const { other, phoneDialog } = await openPhoneDialog(page, baseURL);
        const input = phoneDialog.locator('input[type="tel"], input[name*="phone" i], input').first();
        await input.fill('12345');
        await phoneDialog.getByRole('button', { name: 'Xác nhận' }).click();
        await other.waitForTimeout(800);
        await hideVolatileChrome(other);
        await highlight(input);
        await other.waitForTimeout(200);
        return shotAndClose(other, phoneDialog);
      },
    },
  ],
};
