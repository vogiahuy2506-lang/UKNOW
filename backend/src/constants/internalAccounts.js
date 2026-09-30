/**
 * Tài khoản NỘI BỘ của công ty (dùng gửi thử, chạy thử chiến dịch) — không phải khách hàng.
 * Số liệu vận hành / kinh doanh toàn hệ thống phải loại các tài khoản này, nếu không tin gửi thử của chính mình
 * lấn át số của khách thật (production 30/09/2026: phần lớn tin là của user 39 và 116; khách thật chỉ vài chục
 * tin / tháng).
 *
 * MỘT nơi khai báo cho mọi màn admin (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30: PR-6 Giám sát gửi, PR-9 Tổng quan /
 * Đơn hàng / Thành viên / Phễu).
 *
 * Mặc định [39, 116]. Ghi đè bằng biến môi trường `INTERNAL_USER_IDS` (vd "39,116"). Đọc LÚC GỌI, không đọc lúc nạp
 * module: đổi env hoặc test đổi `process.env` có hiệu lực ngay, không cần khởi động lại module.
 */

export const DEFAULT_INTERNAL_USER_IDS = Object.freeze([39, 116]);

// Cảnh báo giá trị env sai đúng MỘT lần cho mỗi chuỗi (hàm này được gọi mỗi request).
const warnedRawValues = new Set();

function warnOnce(raw, message) {
  if (warnedRawValues.has(raw)) return;
  warnedRawValues.add(raw);
  console.warn(message);
}

/**
 * Danh sách id tài khoản nội bộ đang có hiệu lực.
 *
 * - `INTERNAL_USER_IDS` không đặt hoặc chỉ toàn khoảng trắng → mặc định [39, 116]. (Muốn xem cả tài khoản nội bộ
 *   thì bật công tắc "gồm tài khoản nội bộ" ở từng màn, không dùng env.)
 * - Có đặt → mỗi phần tử phải là số nguyên dương, ngăn cách bằng dấu phẩy; phần tử sai bị BỎ kèm cảnh báo. Nếu chuỗi
 *   toàn phần tử sai (không còn id nào) thì rơi về mặc định: gõ nhầm env không được âm thầm tắt việc loại nội bộ.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number[]} mảng MỚI mỗi lần gọi (người gọi được phép sửa)
 */
export function getInternalUserIds(env = process.env) {
  const raw = env?.INTERNAL_USER_IDS;
  if (raw == null || String(raw).trim() === '') return [...DEFAULT_INTERNAL_USER_IDS];

  const ids = [];
  const invalid = [];
  for (const token of String(raw).split(',')) {
    const text = token.trim();
    if (text === '') continue;
    if (/^[0-9]{1,15}$/.test(text) && Number(text) > 0) {
      const id = Number(text);
      if (!ids.includes(id)) ids.push(id);
    } else {
      invalid.push(text);
    }
  }

  if (invalid.length > 0) {
    warnOnce(String(raw), `[internalAccounts] INTERNAL_USER_IDS có phần tử không phải số nguyên dương, đã bỏ qua: ${invalid.join(', ')}`);
  }
  if (ids.length === 0) {
    warnOnce(`${String(raw)}#default`, '[internalAccounts] INTERNAL_USER_IDS không có id hợp lệ, dùng mặc định 39,116');
    return [...DEFAULT_INTERNAL_USER_IDS];
  }
  return ids;
}
