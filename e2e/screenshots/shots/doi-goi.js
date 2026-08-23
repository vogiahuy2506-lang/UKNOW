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
  ],
};
