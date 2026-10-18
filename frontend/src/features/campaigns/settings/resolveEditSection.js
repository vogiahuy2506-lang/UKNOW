import describeNodeSettings from './describeNodeSettings';

/**
 * Mục (thanh bên trái của form khối) chứa trường mà từng VAI của checklist cần điền — PLAN_THIET_LAP_CAU_HINH_TRUC_TIEP PR-D.
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

/** Thứ tự ưu tiên khi tự mở thẻ sau khi dựng khung: vừa chọn nguồn → điền nguồn ngay, rồi tới nội dung. */
export const ROLE_PRIORITY = Object.freeze(['audience', 'content', 'sender', 'other']);

const subtypeOf = (node) => String(node?.data?.nodeType || node?.type || '');

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

/** Vai của dòng THIẾU đầu tiên trong thẻ (theo thứ tự dòng hiển thị); không thiếu → null. */
export function findFirstMissingRole(node, lookups, t) {
  const first = describeNodeSettings(node, lookups, t).find((item) => item.tone === 'missing');
  return first ? first.role : null;
}

/** Mục cho nút Sửa trên chính thẻ: mục của dòng thiếu đầu tiên nếu có, không thì null (= mục đầu). */
export function resolveSectionForNode(node, lookups, t) {
  const role = findFirstMissingRole(node, lookups, t);
  return role ? resolveSectionForRole(subtypeOf(node), role) : null;
}

/**
 * Sau khi dựng khung: chọn thẻ + vai cần điền trước. Duyệt vai theo `ROLE_PRIORITY`; mỗi vai lấy thẻ ĐẦU TIÊN (theo thứ tự chạy)
 * có dòng thiếu thuộc vai đó. Khối khởi chạy thủ công không hiện thành thẻ nên bỏ qua.
 * @param {Array<{ node: object }>} ordered kết quả `buildSettingsOrder(...).ordered`
 * @returns {{ node: object, role: string, section: string|null }|null}
 */
export function pickFirstMissingTarget(ordered, lookups, t) {
  const cards = (Array.isArray(ordered) ? ordered : [])
    .map(({ node }) => node)
    .filter((node) => subtypeOf(node) !== 'manual_trigger')
    .map((node) => ({
      node,
      missingRoles: new Set(describeNodeSettings(node, lookups, t).filter((item) => item.tone === 'missing').map((item) => item.role)),
    }));
  for (const role of ROLE_PRIORITY) {
    const hit = cards.find((card) => card.missingRoles.has(role));
    if (hit) return { node: hit.node, role, section: resolveSectionForRole(subtypeOf(hit.node), role) };
  }
  return null;
}
