/**
 * Ảnh minh hoạ cho bài "Trợ lý AI dựng landing page ngay trong khung chat" (/huong-dan/tro-ly-ai-landing).
 *
 * Chỉ ảnh đầu (menu) chụp được mà không cần AI. Năm ảnh còn lại là KẾT QUẢ của AI (thẻ landing page, dòng
 * "Đã kiểm tra hiển thị ✓", hộp Lưu & xuất bản…) nên máy thử phải có GEMINI_API_KEY thật trong e2e/.env.test.
 */
import { forceSidebarExpanded, highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';

export default {
  slug: 'tro-ly-ai-landing',
  shots: [
    {
      name: 'menu-tro-ly-ai',
      caption: 'menu bên trái, khoanh đỏ mục "Trợ lý AI" ở trên cùng',
      async take(page, { baseURL }) {
        await forceSidebarExpanded(page, baseURL);
        await page.goto('/app');
        const sidebar = page.locator('aside').first();
        await sidebar.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(sidebar.getByText('Trợ lý AI', { exact: true }).first());
        await page.waitForTimeout(150);
        const list = sidebar.locator('nav').first();
        return contentShot(page, (await list.count()) ? list : sidebar);
      },
    },
  ],
};
