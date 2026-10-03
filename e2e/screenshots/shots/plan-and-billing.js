/**
 * Ảnh minh hoạ cho bài "Gói dịch vụ & thanh toán" (/huong-dan/plan-and-billing).
 *
 * Bài có 9 ô, ở đây làm cả 9. Ô "màn hình thanh toán đang hiện mã QR PayOS" (`man-hinh-thanh-toan-qr`) KHÔNG dùng
 * PayOS thật: phải chạy máy chủ PayOS GIẢ `tools/fake-payos.mjs` và backend e2e với
 * `PAYOS_BASE_URL=http://127.0.0.1:5099 PAYOS_CLIENT_ID=fake PAYOS_API_KEY=fake PAYOS_CHECKSUM_KEY=fake` (đặt trên dòng
 * lệnh). Mã QR trong ảnh là giả và không thanh toán được (xem docstring của tools/fake-payos.mjs). Chỉ chạy ở máy mình:
 * ảnh này BẤM "Đồng ý nâng cấp" / "Tiếp tục thanh toán" — tạo đơn trong DB e2e.
 *
 * Cần `E2E_SEED_ORDERS=1` (nằm trong `E2E_SEED_ALL=1`) cho ô "Lịch sử đơn":
 * 5 đơn các trạng thái, trong đó 2 đơn có hoá đơn điện tử đã phát hành.
 *
 * Ảnh `dong-ho-da-dung` (các đồng hồ Tin nhắn trong kỳ + Lượt AI trong kỳ) cần `E2E_SEED_ACTIVITY=1` (cũng nằm trong
 * `E2E_SEED_ALL=1`): tin đã gửi và lượt AI trong kỳ của gói. Chụp riêng bằng `HELP_SHOT_ONLY=dong-ho-da-dung`.
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot,
  tallViewportShot, bandShot,
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
      name: 'dong-ho-da-dung',
      caption: 'tab Tổng quan của trang Tổng quan gói, khoanh đỏ khối Tin nhắn trong kỳ và khối Lượt AI trong kỳ',
      localOnly: true,
      async take(page) {
        await page.goto(BILLING_PATH);
        const messages = page.getByTestId('messages-usage');
        const ai = page.getByTestId('ai-usage');
        await messages.waitFor({ state: 'visible', timeout: 30_000 });
        await ai.waitFor({ state: 'visible', timeout: 30_000 });

        // Đồng hồ hỏng hiện "—" — báo lỗi thay vì chụp một khối không có số.
        if (await messages.getByText('—', { exact: true }).count()) {
          throw new Error('Có đồng hồ trong khối Tin nhắn trong kỳ hiện "—" (chưa đọc được số) — không chụp được.');
        }
        await settle(page);
        await hideVolatileChrome(page);
        // Hai khối liền nhau (cao ~450px): đặt khối đầu giữa vùng nhìn để cả hai nằm trọn trong khung nhìn và viền khoanh
        // không chui dưới thanh ngang cố định ở đỉnh trang.
        await messages.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(300);
        await highlight(messages);
        await highlight(ai);
        await page.waitForTimeout(200);
        return bandShot(page, messages, ai, { pad: 14, padTop: 14 });
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
    {
      name: 'man-hinh-thanh-toan-qr',
      caption: 'màn hình thanh toán đang hiện mã QR PayOS',
      localOnly: true,
      // Đặt CUỐI bài: bước này tạo một đơn đang chờ thanh toán, đứng trước sẽ chen vào ảnh "Lịch sử đơn".
      async take(page) {
        await page.goto('/pricing');
        await page.locator('#pricing').waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        const proCard = page.locator('#pricing .grid > *').filter({ hasText: 'Gói Pro' }).first();
        await proCard.getByRole('button', { name: /Nâng cấp ngay|Đăng ký gói/ }).first().click();
        // Hộp xác nhận nâng gói (có mặt khi tài khoản đang ở một gói trả phí).
        const confirm = page.getByRole('button', { name: 'Đồng ý nâng cấp' });
        // `isVisible` KHÔNG chờ (tham số timeout bị bỏ qua) nên phải dùng waitFor.
        if (await confirm.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)) await confirm.click();
        await page.waitForURL(/\/checkout/, { timeout: 30_000 });

        await page.getByRole('checkbox').first().check();
        await page.getByRole('button', { name: /Tiếp tục thanh toán/ }).click();

        // Bước QR: ảnh QR dựng từ chuỗi `qrCode` do PayOS trả (`qrcode.toDataURL` -> ảnh data:).
        const qrImage = page.locator('img[src^="data:image/png"]').first();
        if (!(await qrImage.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false))) {
          throw new Error(
            'Không thấy mã QR. Backend e2e phải chạy với PAYOS_BASE_URL trỏ máy chủ PayOS GIẢ:\n'
            + '  node e2e/screenshots/tools/fake-payos.mjs\n'
            + '  PAYOS_BASE_URL=http://127.0.0.1:5099 PAYOS_CLIENT_ID=fake PAYOS_API_KEY=fake PAYOS_CHECKSUM_KEY=fake <lệnh chạy backend e2e>',
          );
        }
        await settle(page);
        await hideVolatileChrome(page);
        await page.waitForTimeout(300);
        return { screenshot: (options = {}) => page.screenshot(options) };
      },
    },
  ],
};
