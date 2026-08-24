/**
 * Hai ô còn thiếu của bài "Vì sao Zalo gửi chậm hoặc đang dừng"
 * (/huong-dan/zalo-gui-cham).
 *
 * Lưu ý tên gọi: mục menu là "Hiệu quả chiến dịch" nhưng tiêu đề trang là
 * "Giám sát gửi tin" — giống bài campaign-theo-doi.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot, enclosingSection,
} from '../lib/shotHelpers.js';

const MONITOR_PATH = '/app/delivery-monitor';

export default {
  slug: 'zalo-gui-cham',
  shots: [
    {
      name: 'menu-hieu-qua-chien-dich',
      caption: 'menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục "Hiệu quả chiến dịch"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Chiến dịch',
          itemName: 'Hiệu quả chiến dịch',
          baseURL,
        });
      },
    },
    {
      name: 'dong-chien-dich-zalo',
      caption: 'mục Chiến dịch gần đây, khoanh đỏ dòng của một chiến dịch Zalo đang chạy với cột Thành công / tổng',
      localOnly: true,
      async take(page) {
        await page.goto(MONITOR_PATH);
        const title = page.getByRole('heading', { name: /Chiến dịch gần đây/ }).first();
        await title.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);

        const section = await enclosingSection(page, title);

        // Chú thích chỉ đích danh chiến dịch ZALO đang chạy, không phải dòng đầu
        // tiên bất kỳ — mục này xếp lẫn cả chiến dịch email.
        //
        // Khớp 'running' chứ không phải 'Đang chạy': cột TRẠNG THÁI ở mục này in
        // thẳng giá trị tiếng Anh trong DB (running / failed / completed), không
        // qua i18n. Đó là lỗi dịch thiếu của sản phẩm, không phải của bộ chụp.
        const row = section.locator('tr, li, div').filter({ hasText: /Zalo/ })
          .filter({ hasText: /running/ }).last();
        if (!(await row.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error(
            'Không thấy chiến dịch Zalo nào đang chạy trong mục "Chiến dịch gần đây".\n'
            + 'Hai nguyên nhân:\n'
            + '  1. Worker nền đã đánh hỏng lượt chạy mẫu — chạy backend với SCHEDULER_ENABLED=false\n'
            + '  2. Chưa seed: E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        await highlight(row);
        await page.waitForTimeout(200);
        return contentShot(page, section);
      },
    },
  ],
};
