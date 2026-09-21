/**
 * Ảnh minh hoạ cho bài "Đồng ý nhận tin" (/huong-dan/dong-y-nhan-tin).
 *
 * Mới có ảnh bài nộp "Đã rút" (dùng chung biểu mẫu mẫu của bài `bieu-mau`). Hai ảnh còn lại cần dữ liệu lead
 * có người từ chối nhận tin + cột "Nguồn đồng ý" ở danh sách khách — chưa dựng fixture.
 */
import { highlightCell, hideVolatileChrome, settle } from '../lib/shotHelpers.js';
import { ensureDemoForm, ensureDemoSubmissions } from '../lib/shotFixtures.js';

export default {
  slug: 'dong-y-nhan-tin',
  shots: [
    {
      name: 'bai-nop-da-rut-dong-y',
      caption: 'trang Bài nộp biểu mẫu, khoanh đỏ một dòng có cột Đồng ý tiếp thị ghi "Đã rút"',
      localOnly: true,
      async take(page) {
        await page.goto('/app/forms');
        const form = await ensureDemoForm(page);
        await ensureDemoSubmissions(page, form);

        const viewport = page.viewportSize();
        await page.setViewportSize({ width: viewport.width, height: 2200 });
        try {
          await page.goto(`/app/forms/${form.id}/submissions`);
          const row = page.locator('main table tbody tr').filter({ hasText: /Đã rút/ }).first();
          await row.waitFor({ state: 'visible', timeout: 30_000 });
          await settle(page);
          await hideVolatileChrome(page);
          // Ẩn các dòng khác để tiêu đề cột nằm sát ngay trên dòng "Đã rút" — mỗi dòng bài nộp cao cả
          // trăm pixel, để nguyên thì tiêu đề và dòng cần xem cách nhau cả màn hình.
          await page.evaluate(() => {
            for (const tr of document.querySelectorAll('main table tbody tr')) {
              if (!/Đã rút/.test(tr.innerText)) tr.style.display = 'none';
            }
          });
          await highlightCell(row.locator('td').filter({ hasText: /Đã rút/ }).first());
          await highlightCell(page.locator('main table thead th').filter({ hasText: /Đồng ý tiếp thị/i }).first());
          await page.waitForTimeout(300);

          const head = await page.locator('main table thead').first().boundingBox();
          const box = await row.boundingBox();
          const clip = { x: head.x, y: head.y, width: head.width, height: (box.y + box.height) - head.y + 6 };
          return {
            screenshot: async (options = {}) => {
              try {
                return await page.screenshot({ ...options, clip });
              } finally {
                await page.setViewportSize(viewport);
              }
            },
          };
        } catch (error) {
          await page.setViewportSize(viewport);
          throw error;
        }
      },
    },
  ],
};
