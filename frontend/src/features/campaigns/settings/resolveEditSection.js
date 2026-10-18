/**
 * Mục (thanh bên trái của hộp cài đặt khối) chứa trường mà từng VAI (Gửi từ · Gửi cho ai · Nội dung) cần điền — dùng khi tab Thiết lập mở "Cài đặt nâng cao" đúng mục.
 * Đã đối chiếu với id mục thật của từng form (`NodeConfigModal*Section.jsx`):
 * - Email: `basic` = Gửi từ (`fromEmailId`), `recipient` = ô nhập email / nguồn, `templates` = danh sách email (chọn mẫu).
 * - Zalo cá nhân / nhóm: `basic` = ô người nhận / nhóm (DataSourceSelector), `templates` = danh sách mẫu tin. Tài khoản Zalo
 *   nằm ở khối «Chọn tài khoản Zalo» riêng nên vai sender không có mục.
 * - Đọc Google Sheet: ô link nằm ở `basic`. Khách đã lưu: danh sách khách ở `test`. Khoá học / sản phẩm: danh sách chọn ở `select`.
 * - Kết bạn Zalo, Telegram, WhatsApp, landing, biểu mẫu, lưu khách: form một trang / không có mục → không khai báo (mở như cũ).
 */
export const SECTION_BY_SUBTYPE_ROLE = Object.freeze({
  send_email: Object.freeze({ sender: 'basic', audience: 'recipient', content: 'templates' }),
  send_zalo_personal: Object.freeze({ audience: 'basic', content: 'templates' }),
  send_zalo_group: Object.freeze({ audience: 'basic', content: 'templates' }),
  read_sheet: Object.freeze({ audience: 'basic' }),
  read_interested_customers: Object.freeze({ audience: 'test' }),
  read_courses_db: Object.freeze({ audience: 'select' }),
  read_products_db: Object.freeze({ audience: 'select' }),
});

/**
 * Id mục form phải mở cho (loại khối, vai). Hàm thuần. Không có mục riêng → null (form mở ở mục mặc định).
 * @param {string} subtype
 * @param {string} role 'sender' | 'audience' | 'content' | ...
 * @returns {string|null}
 */
export function resolveSectionForRole(subtype, role) {
  const byRole = SECTION_BY_SUBTYPE_ROLE[String(subtype || '')];
  return (byRole && byRole[role]) || null;
}
