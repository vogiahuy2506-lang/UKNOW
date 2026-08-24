/**
 * Ô cuối còn thiếu của bài "Hồ sơ doanh nghiệp" (/huong-dan/ai-profile).
 * Bài đã có sẵn 7 ảnh từ trước.
 */
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';

export default {
  slug: 'ai-profile',
  shots: [
    {
      name: 'nut-luu-cuoi-trang',
      caption: 'cuối trang, khoanh đỏ nút lưu',
      localOnly: true,
      async take(page) {
        await page.goto('/app/settings/ai-profile');
        const save = page.getByRole('button', { name: /^Lưu/ }).last();
        if (!(await save.isVisible({ timeout: 30_000 }).catch(() => false))) {
          throw new Error('Không thấy nút lưu ở trang Hồ sơ doanh nghiệp');
        }
        await save.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await settle(page);
        await hideVolatileChrome(page);

        // Cuộn lại lần nữa sau settle: settle() cuộn hết trang để kích hoạt các
        // khối hiện-dần rồi đưa về đầu, nên nút lưu lại rơi ra ngoài khung nhìn.
        await save.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await highlight(save);
        await page.waitForTimeout(200);

        // Chụp vùng quanh nút chứ không chụp cả trang: chú thích nói "cuối trang".
        return { screenshot: async (options = {}) => page.screenshot(options) };
      },
    },
  ],
};
