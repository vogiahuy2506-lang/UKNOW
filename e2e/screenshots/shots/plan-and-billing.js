/**
 * Ảnh minh hoạ cho bài "Gói dịch vụ & thanh toán" (/huong-dan/plan-and-billing).
 *
 * Bài có 8 ô, ở đây làm 7. Ô còn lại — "màn hình thanh toán đang hiện mã QR
 * PayOS" — CỐ Ý không tự động hoá: muốn có mã QR thật thì phải tạo một đơn hàng
 * thật ở cổng thanh toán. Ô đó phải chụp tay.
 *
 * Cần `E2E_SEED_ORDERS=1` (nằm trong `E2E_SEED_ALL=1`) cho ô "Lịch sử đơn":
 * 5 đơn các trạng thái, trong đó 2 đơn có hoá đơn điện tử đã phát hành.
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot,
  tallViewportShot,
} from '../lib/shotHelpers.js';

const BILLING_PATH = '/app/billing';
const TOPUP_PATH = '/app/topup';

export default {
  slug: 'plan-and-billing',
  shots: [
    {
      name: 'topbar-nang-cap',
      caption: 'thanh ngang trên cùng, khoanh đỏ nút "Nâng cấp" bên phải',
      async take(page) {
        await page.goto('/app');
        const header = page.locator('header').first();
        await header.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(header.getByRole('button', { name: 'Nâng cấp', exact: true }));
        return header;
      },
    },
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
      name: 'menu-mua-them-han-muc',
      caption: 'menu bên trái, khoanh đỏ mục "Mua thêm hạn mức"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Gói & Thanh toán',
          itemName: 'Mua thêm hạn mức',
          baseURL,
        });
      },
    },
    {
      name: 'bang-gia-chon-goi',
      caption: 'bảng giá với các gói xếp ngang, khoanh đỏ nút chọn của một gói',
      async take(page) {
        await regionShot(page, { path: '/pricing', clip: '#pricing', waitFor: '#pricing' });

        // Khoanh nút của MỘT gói cao hơn gói đang dùng. Chỉ khoanh, KHÔNG bấm —
        // bấm là vào luồng tạo đơn.
        const proCard = page.locator('#pricing .grid > *').filter({ hasText: 'Gói Pro' }).first();
        const cta = proCard.getByRole('button', { name: /Nâng cấp ngay|Đăng ký gói/ }).first();
        if (!(await cta.isVisible().catch(() => false))) {
          throw new Error(
            'Không thấy nút chọn gói nào để khoanh. Thường là do tài khoản đang ở gói cao nhất,\n'
            + 'hoặc đang có lệnh hẹn đổi gói khoá cả luồng nâng gói.',
          );
        }
        await highlight(cta);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('#pricing').first());
      },
    },
    {
      name: 'tong-quan-goi-sau-kich-hoat',
      caption: 'trang Tổng quan gói sau khi kích hoạt, khoanh đỏ tên gói và hạn mức mới',
      localOnly: true,
      async take(page) {
        await page.goto(BILLING_PATH);
        const heading = page.getByRole('heading', { name: 'Gói & Thanh toán' }).first();
        await heading.waitFor({ state: 'visible', timeout: 30_000 });

        // Trang này gọi GET /users/profile cùng lúc với MainLayout; nếu request bị
        // interceptor gộp-request huỷ thì hiện dải "Không tải được thông tin gói"
        // thay cho nội dung. Bắt lỗi tại đây thay vì chụp ra một khung báo lỗi.
        const failed = page.getByText('Không tải được thông tin gói').first();
        if (await failed.isVisible({ timeout: 3_000 }).catch(() => false)) {
          throw new Error('Trang Tổng quan gói báo "Không tải được thông tin gói" — không chụp được nội dung.');
        }

        const expiry = page.getByText(/Hết hạn ngày/).first();
        if (!(await expiry.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error('Tài khoản chưa được gán gói — cần seed gói đang hoạt động trước khi chụp.');
        }
        await settle(page);
        await hideVolatileChrome(page);

        // Hai thứ chú thích nhắc tới: tên gói (khối trên cùng) và hạn mức mới
        // (dải nhãn tính năng + thẻ "Giới hạn gửi tin").
        const section = page.locator('main div.space-y-5').first();
        await highlight(section.locator('> div').first());
        const limits = section.locator('div').filter({ hasText: /^GIỚI HẠN GỬI TIN/i }).last();
        if (await limits.isVisible().catch(() => false)) await highlight(limits);
        await page.waitForTimeout(200);
        return contentShot(page, section);
      },
    },
    {
      name: 'trang-mua-them-han-muc',
      caption: 'trang Mua thêm hạn mức, khoanh đỏ các loại hạn mức mua thêm được',
      async take(page) {
        await page.goto(TOPUP_PATH);
        const heading = page.getByRole('heading', { name: 'Mua thêm hạn mức' }).first();
        await heading.waitFor({ state: 'visible', timeout: 30_000 });

        const grid = page.locator('main div.grid').filter({ hasText: /Tin Zalo/ }).first();
        if (!(await grid.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error('Không tải được danh sách loại hạn mức mua thêm (GET /topup/config).');
        }
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(grid);
        await page.waitForTimeout(200);

        // Trang cao ~1290px và cuộn bên trong <main>. Chụp ở khung nhìn 900 thì
        // cắt ngang hàng cuối, mà chú thích lại đòi thấy ĐỦ các loại mua thêm.
        return tallViewportShot(page, 1400, async () => (
          // 1250: cắt ngay dưới khối "Tổng cộng", bỏ khoảng trắng cuối trang.
          contentShot(page, page.locator('main').first(), { maxHeight: 1250 })
        ));
      },
    },
    {
      name: 'lich-su-don',
      caption: 'mục Lịch sử đơn trong trang Tổng quan gói, khoanh đỏ một dòng đơn và chỗ mở hoá đơn',
      localOnly: true,
      async take(page) {
        await page.goto(BILLING_PATH);
        const tab = page.getByRole('button', { name: 'Lịch sử đơn', exact: true });
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await tab.click();
        await page.waitForTimeout(1500);

        // Chú thích đòi CẢ hai thứ: một dòng đơn và chỗ mở hoá đơn. Link "Xem"
        // chỉ hiện với đơn đã phát hành hoá đơn điện tử (bảng `einvoices`), nên
        // phải bám vào đơn đó chứ không lấy đơn đầu danh sách.
        const viewInvoice = page.locator('main a').filter({ hasText: /^Xem$/ }).first();
        if (!(await viewInvoice.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Không đơn nào có hoá đơn để mở. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_ORDERS=1 node scripts/seed-test-db.js\n'
            + 'Lưu ý: cột invoice_info của orders chỉ là thông tin khách khai — trạng thái\n'
            + 'hoá đơn mà giao diện đọc nằm ở bảng einvoices.',
          );
        }
        await settle(page);
        await hideVolatileChrome(page);

        const row = viewInvoice.locator('xpath=ancestor::*[self::div][4]').first();
        await highlight(row);
        await highlight(viewInvoice);
        await page.waitForTimeout(200);
        // Cắt ngay dưới đơn thứ hai — để nguyên thì đơn thứ ba bị xén ngang.
        return contentShot(page, page.locator('main').first(), { maxHeight: 620 });
      },
    },
  ],
};
