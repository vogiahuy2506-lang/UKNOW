/**
 * Ảnh minh hoạ cho bài "Chương trình đối tác: giới thiệu bạn bè, nhận hoa hồng"
 * (/huong-dan/doi-tac).
 *
 * Tài khoản seed chưa có mã giới thiệu, chưa có doanh thu, ví bằng 0 — trang gần
 * như trống và nút rút tiền bị khoá. `ensureAffiliateDemo` nêm đủ: mã giới thiệu,
 * doanh thu tháng này ở Bậc 2, một kỳ đã chốt cho ví có tiền. Chỉ chạy ở máy mình.
 */
import {
  highlight, hideVolatileChrome, settle, contentShot, enclosingSection, forceSidebarExpanded,
  maskLocalOrigin,
} from '../lib/shotHelpers.js';
import { ensureAffiliateDemo } from '../lib/shotFixtures.js';

const PATH = '/app/affiliate';

async function openPage(page) {
  await ensureAffiliateDemo();
  await page.goto(PATH);
  await page.getByText('Thông tin giới thiệu', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
  await maskLocalOrigin(page);
}

export default {
  slug: 'doi-tac',
  shots: [
    {
      name: 'menu-chuong-trinh-doi-tac',
      caption: 'menu bên trái, khoanh đỏ mục "Chương trình đối tác"',
      async take(page, { baseURL }) {
        // Mục này nằm ở cấp trên cùng, không thuộc nhóm nào — sidebarShot (mở nhóm
        // rồi khoanh mục con) không dùng được.
        await forceSidebarExpanded(page, baseURL);
        await page.goto('/app');
        const sidebar = page.locator('aside').first();
        await sidebar.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(sidebar.getByText('Chương trình đối tác', { exact: true }).first());
        await page.waitForTimeout(150);
        const list = sidebar.locator('nav').first();
        return contentShot(page, (await list.count()) ? list : sidebar);
      },
    },
    {
      name: 'thong-tin-gioi-thieu',
      caption: 'khối Thông tin giới thiệu, khoanh đỏ mã giới thiệu, link giới thiệu và hai nút sao chép',
      localOnly: true,
      async take(page) {
        await openPage(page);
        const card = await enclosingSection(page, page.getByText('Thông tin giới thiệu', { exact: false }).first(), { minWidth: 250 });
        // Mỗi hàng = ô chứa mã/link + nút sao chép của nó. Khoanh cả hàng lẫn nút.
        for (const button of await card.locator('button').all()) {
          if (!(await button.isVisible().catch(() => false))) continue;
          await highlight(button.locator('xpath=..'));
          await highlight(button);
        }
        await page.waitForTimeout(200);
        return contentShot(page, card);
      },
    },
    {
      name: 'the-hoa-hong-thang',
      caption: 'thẻ hoa hồng tháng với thang 5 bậc, thấy bậc hiện tại, doanh thu tháng này và hoa hồng ước tính',
      localOnly: true,
      async take(page) {
        await openPage(page);
        const card = await enclosingSection(page, page.getByText(/Hoa hồng tháng/i).first(), { minWidth: 300 });
        return contentShot(page, card);
      },
    },
    {
      name: 'hop-yeu-cau-rut-tien',
      caption: 'hộp Yêu cầu rút tiền hoa hồng, thấy phần chi tiết khấu trừ và thực nhận',
      localOnly: true,
      async take(page) {
        await openPage(page);
        await page.getByRole('button', { name: 'Yêu cầu rút tiền' }).first().click();
        const dialog = page.locator('.modal-content, div.fixed.inset-0 > div').filter({ hasText: /rút tiền/i }).last();
        await dialog.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(800);
        await hideVolatileChrome(page);
        await highlight(await enclosingSection(page, dialog.getByText(/Chi tiết khấu trừ/i).first(), { minWidth: 300 }));
        await page.waitForTimeout(200);
        // Hộp dài gấp đôi màn hình (phần dưới là giấy tờ KYC). Bài chỉ nói tới phần
        // khấu trừ và thực nhận, nên cắt ngay sau khối "Loại đối tác".
        return contentShot(page, dialog, { maxHeight: 560 });
      },
    },
  ],
};
