/**
 * Ảnh minh hoạ cho bài "Nhật ký hoạt động" (/huong-dan/nhat-ky-hoat-dong).
 *
 * DB vừa seed không có dòng nhật ký nào (nhật ký chỉ sinh khi có người thao tác),
 * nên hai ảnh bảng tự nêm vài dòng mẫu qua `ensureAuditLogDemo`. Chỉ chạy ở máy mình.
 */
import {
  sidebarShot, highlight, highlightCell, hideVolatileChrome, settle, contentShot, enclosingSection,
} from '../lib/shotHelpers.js';
import { ensureAuditLogDemo } from '../lib/shotFixtures.js';

const PATH = '/app/settings/audit-logs';

async function openPage(page) {
  await ensureAuditLogDemo();
  await page.goto(PATH);
  await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
}

export default {
  slug: 'nhat-ky-hoat-dong',
  shots: [
    {
      name: 'menu-nhat-ky-hoat-dong',
      caption: 'menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục "Nhật ký hoạt động"',
      async take(page, { baseURL }) {
        return sidebarShot(page, { groupName: 'Cài đặt', itemName: 'Nhật ký hoạt động', baseURL });
      },
    },
    {
      name: 'bang-nhat-ky',
      caption: 'bảng Nhật ký hoạt động với vài dòng, khoanh đỏ cột Người thực hiện và cột Hành động',
      localOnly: true,
      async take(page) {
        await openPage(page);
        const head = page.locator('main table thead th');
        await highlightCell(head.filter({ hasText: /Người thực hiện/i }));
        await highlightCell(head.filter({ hasText: /Hành động/i }));
        await page.waitForTimeout(200);
        const card = await enclosingSection(page, page.locator('main table').first());
        return contentShot(page, card, { maxHeight: 520 });
      },
    },
    {
      name: 'bo-loc-nhat-ky',
      caption: 'hàng bộ lọc phía trên bảng, khoanh đỏ ô lọc hành động và hai ô chọn ngày',
      localOnly: true,
      async take(page) {
        await openPage(page);
        const filters = await enclosingSection(page, page.getByText('Loại đối tượng', { exact: true }).first());
        await highlight(filters.locator('select').first());
        for (const dateInput of await filters.locator('input[type="date"]').all()) await highlight(dateInput);
        await page.waitForTimeout(200);
        return contentShot(page, filters);
      },
    },
  ],
};
