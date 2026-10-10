/**
 * Ảnh minh hoạ cho bài "Thêm tài khoản email" (/huong-dan/email-account) — chỉ ô khối "Giới hạn gửi/ngày".
 *
 * Cần `E2E_SEED_CHANNELS=1` (nằm trong `E2E_SEED_ALL=1`) để thẻ Email có tài khoản. Chỉ khoanh, KHÔNG bấm Lưu.
 */
import { highlight, hideVolatileChrome, settle, bandShot, tallViewportShot } from '../lib/shotHelpers.js';

export default {
  slug: 'email-account',
  shots: [
    {
      name: 'khoi-gioi-han-gui-ngay',
      caption: 'biểu mẫu tài khoản email, khoanh đỏ khối "Giới hạn gửi/ngày"',
      localOnly: true,
      async take(page) {
        await page.goto('/app/settings/channels');
        // Chọn tài khoản email có sẵn ở cột trái để biểu mẫu hiện bên phải (chỉ xem, không lưu).
        await page.getByText('Email CSKH UKNOW').first().click();
        const title = page.getByText('Giới hạn gửi/ngày', { exact: true }).first();
        await title.waitFor({ state: 'visible', timeout: 30_000 });
        // Nới khung nhìn cho cả biểu mẫu lọt trọn rồi mới đo / khoanh / chụp.
        return tallViewportShot(page, 1400, async () => {
          await settle(page);
          await hideVolatileChrome(page);
          const block = title.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
          const first = page.getByText('Thông tin người gửi', { exact: true }).first()
            .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
          await highlight(block);
          await page.waitForTimeout(200);
          return bandShot(page, first, block, { pad: 18 });
        });
      },
    },
  ],
};
