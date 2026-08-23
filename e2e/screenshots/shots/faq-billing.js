/**
 * Ảnh minh hoạ cho bài "Câu hỏi thường gặp về thanh toán & hoá đơn"
 * (/huong-dan/faq-billing).
 *
 * Bài có 5 ô, ở đây làm 4. Ô còn lại — "so sánh hai thanh menu cạnh nhau, bên
 * chủ tài khoản có nhóm Gói & Thanh toán, bên nhân viên không có" — là ảnh GHÉP
 * hai màn hình của hai tài khoản khác nhau. Chụp tự động ra được từng cái, còn
 * ghép lại thì phải sửa ảnh; để chụp tay.
 *
 * Ô "thông tin xuất hoá đơn" cần cờ `VITE_INVOICE_VAT_ENABLED=1` khi dựng
 * frontend — mặc định ở máy là tắt, production thì bật từ 17/08:
 *   VITE_INVOICE_VAT_ENABLED=1 npm run dev
 *
 * Cần `E2E_SEED_ALL=1` cho lịch sử đơn và danh sách tài nguyên.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot, enclosingSection,
} from '../lib/shotHelpers.js';

const BILLING_PATH = '/app/billing';
const TOPUP_PATH = '/app/topup';

export default {
  slug: 'faq-billing',
  shots: [
    {
      name: 'menu-tong-quan-goi',
      caption: 'menu bên trái đang mở nhóm Gói & Thanh toán, khoanh đỏ mục "Tổng quan gói"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Gói & Thanh toán',
          itemName: 'Tổng quan gói',
          baseURL,
        });
      },
    },
    {
      name: 'tai-nguyen-khoa',
      caption: 'mục Tài nguyên khoá, khoanh đỏ các ô tick chọn giữ lại',
      localOnly: true,
      async take(page) {
        await page.goto(BILLING_PATH);
        const tab = page.getByRole('button', { name: 'Tài nguyên khoá', exact: true });
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await tab.click();
        await page.waitForTimeout(1500);

        const boxes = page.locator('main input[type="checkbox"]');
        if (!(await boxes.first().isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Mục "Tài nguyên khoá" không có tài nguyên nào để tick. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_ALL=1 node scripts/seed-test-db.js',
          );
        }
        await settle(page);
        await hideVolatileChrome(page);

        // Khoanh từng ô tick — chú thích chỉ đích danh "các ô tick chọn giữ lại",
        // khoanh cả mục thì người đọc không biết nhìn vào đâu.
        // KHÔNG bấm "Lưu lựa chọn": chỉ đọc, không ghi gì xuống DB.
        for (const box of await boxes.all()) {
          if (await box.isVisible().catch(() => false)) await highlight(box);
        }
        await page.waitForTimeout(200);
        // 570: cắt ngay dưới thẻ "Tài khoản Email". Để rộng hơn thì thẻ
        // "Landing page" bị xén ngang, nhìn như ảnh chụp hụt.
        return contentShot(page, page.locator('main').first(), { maxHeight: 570 });
      },
    },
    {
      name: 'thong-tin-hoa-don',
      // BÀI VIẾT MÔ TẢ HƠI LỆCH: chú thích nói "màn hình thanh toán", tức trang
      // /checkout sau khi chọn gói. Trang đó phải có đơn hàng THẬT ở cổng thanh
      // toán mới mở được, nên không tự động hoá. Cùng một khối form
      // (InvoiceVatForm) còn được dùng ở trang Mua thêm hạn mức — chụp ở đó,
      // giao diện y hệt và không phải tạo đơn nào.
      caption: 'màn hình thanh toán, khoanh đỏ khu vực điền thông tin hoá đơn với hai lựa chọn Công ty / Cá nhân',
      localOnly: true,
      async take(page) {
        await page.goto(TOPUP_PATH);
        await page.getByRole('heading', { name: 'Mua thêm hạn mức' })
          .first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);

        // Khối hoá đơn chỉ hiện khi tổng đơn > 0 (`invoiceVatUiEnabled && total > 0`).
        // Bấm "+" một mục là đủ — chỉ đổi trạng thái form, KHÔNG tạo đơn nào;
        // đơn chỉ sinh ra khi bấm "Thanh toán", và ta dừng trước bước đó.
        const firstItem = page.locator('main div.grid > div').first();
        await firstItem.locator('button').last().click();
        await page.waitForTimeout(1500);

        const form = page.getByText('Thông tin xuất hoá đơn', { exact: false }).first();
        if (!(await form.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Không thấy khối thông tin hoá đơn. Hai nguyên nhân:\n'
            + '  1. Cờ VAT đang tắt — dựng lại frontend với VITE_INVOICE_VAT_ENABLED=1\n'
            + '  2. Tổng đơn vẫn bằng 0 — nút "+" không ăn',
          );
        }
        await form.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);

        // Mặc định khối này ở trạng thái "Không lấy hoá đơn" — gập lại, chỉ còn
        // một dòng ghi chú, chụp ra chẳng thấy ô nhập nào. Chọn "Công ty" cho nó
        // mở ra mã số thuế / tên / địa chỉ đúng như bài viết mô tả. Chỉ đổi
        // trạng thái form, không tạo đơn nào.
        const companyTab = page.getByRole('button', { name: 'Công ty', exact: true }).first();
        if (await companyTab.isVisible().catch(() => false)) {
          await companyTab.click();
          await page.waitForTimeout(800);
        }
        await hideVolatileChrome(page);

        const card = await enclosingSection(page, form);
        // Khoanh cả ba lựa chọn: giao diện thật có thêm "Không lấy hoá đơn" bên
        // cạnh hai dạng bài viết nhắc tới.
        for (const name of ['Không lấy hoá đơn', 'Cá nhân', 'Công ty']) {
          const tab = page.getByRole('button', { name, exact: true }).first();
          if (await tab.isVisible().catch(() => false)) await highlight(tab);
        }
        await page.waitForTimeout(200);
        return contentShot(page, card);
      },
    },
    {
      name: 'mo-hoa-don',
      caption: 'mục Lịch sử đơn, khoanh đỏ chỗ bấm để mở hoá đơn của một đơn',
      localOnly: true,
      async take(page) {
        await page.goto(BILLING_PATH);
        const tab = page.getByRole('button', { name: 'Lịch sử đơn', exact: true });
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await tab.click();
        await page.waitForTimeout(1500);

        // Link "Xem" chỉ hiện với đơn đã phát hành hoá đơn điện tử (bảng
        // `einvoices`) — cột invoice_info của orders không đủ.
        const viewInvoice = page.locator('main a').filter({ hasText: /^Xem$/ }).first();
        if (!(await viewInvoice.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Không đơn nào có hoá đơn để mở. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_ORDERS=1 node scripts/seed-test-db.js',
          );
        }
        await settle(page);
        await hideVolatileChrome(page);

        // Chú thích chỉ đích danh CHỖ BẤM, nên khoanh riêng link chứ không khoanh
        // cả dòng đơn như ảnh bên bài plan-and-billing.
        await highlight(viewInvoice);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 620 });
      },
    },
  ],
};
