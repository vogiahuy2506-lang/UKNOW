/**
 * Ảnh minh hoạ cho bài "Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn" (/huong-dan/doi-goi).
 *
 * `caption` là khoá tìm ô chú thích "[ẢNH: …]" trong body_html của bài. Khoá phải
 * đủ riêng để khớp ĐÚNG MỘT ô — script chèn sẽ từ chối nếu khớp 0 hoặc nhiều ô.
 *
 * Bài này có 7 ô chú thích, ở đây mới làm 3 ô. Bốn ô còn lại cần trạng thái tài
 * khoản đặc biệt, không dựng được bằng thao tác chỉ-đọc trên tài khoản thật:
 *   - "hộp cảnh báo trước khi xác nhận nâng gói" → phải bấm vào luồng nâng gói,
 *     có nguy cơ tạo đơn hàng thật. Cố ý không tự động hoá.
 *   - "lệnh hẹn đổi gói kèm ngày hiệu lực" → cần một lệnh hạ gói đang chờ.
 *   - "landing page bị tô đỏ vì vượt hạn mức" → cần tài khoản đang trong ân hạn.
 *   - "một mục đã bị khoá sau khi hết ân hạn" → cần tài khoản đã hết ân hạn.
 * Ba cái sau dựng được nếu chụp trên môi trường test có seed sẵn các trạng thái đó.
 */
import { sidebarShot, regionShot, highlight, hideVolatileChrome, settle } from '../lib/shotHelpers.js';

export default {
  slug: 'doi-goi',
  shots: [
    {
      name: 'topbar-nang-cap',
      caption: 'thanh ngang trên cùng, khoanh đỏ nút "Nâng cấp"',
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
      name: 'bang-gia',
      caption: 'bảng giá với các gói xếp ngang',
      async take(page) {
        // Đăng nhập sẵn nên gói đang dùng được đánh dấu — đúng như chú thích mô tả.
        return regionShot(page, { path: '/pricing', clip: '#pricing', waitFor: '#pricing' });
      },
    },
    {
      name: 'menu-mua-them-han-muc',
      caption: 'khoanh đỏ mục "Mua thêm hạn mức"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Gói & Thanh toán',
          itemName: 'Mua thêm hạn mức',
          baseURL,
        });
      },
    },

    // Từ đây trở xuống chỉ chạy ở máy mình: phải BẤM vào luồng đổi gói, và cần
    // trạng thái do seed dựng sẵn. Trên tài khoản thật thì không đụng vào.
    {
      name: 'canh-bao-mat-ngay',
      caption: 'hộp cảnh báo trước khi xác nhận nâng gói',
      localOnly: true,
      async take(page) {
        await regionShot(page, { path: '/pricing', clip: '#pricing', waitFor: '#pricing' });

        // Bấm nút của một gói CAO HƠN gói đang dùng. Nút này chỉ mở hộp thoại
        // cảnh báo, chưa tạo đơn — đơn chỉ sinh ra nếu bấm tiếp "Đồng ý nâng cấp",
        // và ta cố ý dừng lại trước bước đó.
        const proCard = page.locator('#pricing .grid > *').filter({ hasText: 'Gói Pro' }).first();
        await proCard.getByRole('button', { name: /Đăng ký gói|Nâng cấp ngay/ }).click();

        const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'Xác nhận nâng cấp gói' }).first();
        await dialog.waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        await highlight(dialog.locator('p').filter({ hasText: 'ngày sử dụng' }));
        await page.waitForTimeout(200);
        return dialog.locator('div.bg-white').first();
      },
    },
    {
      name: 'lenh-hen-doi-goi',
      // GHI CHÚ: chú thích trong bài nói dải này nằm ở trang "Tổng quan gói",
      // nhưng BillingHubPage không hề có nó — dải chỉ hiện trên trang bảng giá.
      // Chụp đúng chỗ nó thật sự nằm; phần chữ trong bài cần sửa lại cho khớp.
      caption: 'lệnh hẹn đổi gói kèm ngày hiệu lực',
      localOnly: true,
      async take(page) {
        await page.goto('/pricing');
        const banner = page.locator('#pricing').getByText('Lệnh hẹn đổi gói đang chờ kích hoạt').first();
        if (!(await banner.isVisible({ timeout: 20_000 }).catch(() => false))) {
          throw new Error(
            'Chưa có lệnh hẹn đổi gói. Nạp lại DB kèm cờ rồi chạy riêng ảnh này:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_PENDING_CHANGE=1 node scripts/seed-test-db.js\n'
            + 'Lưu ý: bật cờ đó thì ảnh "canh-bao-mat-ngay" sẽ hỏng, vì lệnh hẹn khoá luồng nâng gói.',
          );
        }
        await settle(page);
        await hideVolatileChrome(page);
        const box = page.locator('#pricing div').filter({ hasText: 'Lệnh hẹn đổi gói đang chờ kích hoạt' }).last();
        await highlight(box);
        await page.waitForTimeout(200);
        return box;
      },
    },
  ],
};
