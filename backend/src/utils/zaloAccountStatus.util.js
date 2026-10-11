/**
 * Trạng thái "đã đăng xuất" của tài khoản Zalo cá nhân (PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026).
 *
 * Khác `disconnected` / `needs_reauth` (hệ thống tự đặt khi phiên chết, vẫn cho xem lịch sử): `logged_out` do NGƯỜI DÙNG chủ động
 * bấm "Đăng xuất" — để giao tài khoản cho người khác mà không để họ đọc tin Zalo. Hội thoại + tin nhắn của tài khoản này ẩn khỏi
 * Hộp thư (danh sách, chi tiết, chưa đọc, liên hệ để lại, báo cáo AI, hộp thư đi) cho tới khi CHÍNH tài khoản Zalo đó (cùng
 * `zalo_user_id`) quét QR lại — lúc ấy `updateQrConnectedById` đặt `status = 'connected'` và mọi thứ hiện lại, không xoá gì.
 *
 * `zalo_settings.status` là VARCHAR(20) không CHECK / ENUM nên KHÔNG cần migration cho giá trị này.
 */
export const ZALO_STATUS_LOGGED_OUT = 'logged_out';

/** Mã lỗi 409 khi khôi phục / thử lại phiên của tài khoản đã đăng xuất. */
export const ZALO_ACCOUNT_LOGGED_OUT_CODE = 'ZALO_ACCOUNT_LOGGED_OUT';

/** Alias SQL do server tự viết (không phải input) — chặn mọi ký tự lạ để không bao giờ nội suy được chuỗi tuỳ ý. */
function safeAlias(alias) {
  const text = String(alias || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`Alias SQL không hợp lệ: ${text}`);
  }
  return text;
}

/**
 * Mệnh đề SQL: dòng `zalo_settings` (alias `alias`) CHƯA đăng xuất. NULL-an toàn — hàng LEFT JOIN không có tài khoản
 * (`alias.status` NULL) vẫn "nhìn thấy" như trước, để hội thoại không gắn tài khoản nào không biến mất.
 *
 * @param {string} alias alias của bảng zalo_settings trong câu truy vấn
 * @returns {string}
 */
export function zaloAccountVisibleSql(alias) {
  return `COALESCE(${safeAlias(alias)}.status, '') <> '${ZALO_STATUS_LOGGED_OUT}'`;
}

/**
 * Mệnh đề SQL: hội thoại Zalo cá nhân (alias `convAlias`, có cột `id_zalo_setting`) KHÔNG thuộc tài khoản đã đăng xuất.
 * Dùng NOT EXISTS thay vì JOIN để áp được vào bất kỳ câu truy vấn nào (kể cả giai đoạn chọn trang) mà không đổi số dòng;
 * hội thoại không gắn tài khoản (`id_zalo_setting` NULL) vẫn hiện.
 *
 * @param {string} convAlias alias bảng zalo_personal_conversations (hoặc bảng có cột id_zalo_setting)
 * @param {string} [column] tên cột trỏ tới zalo_settings.id
 * @returns {string}
 */
export function zaloConversationVisibleSql(convAlias, column = 'id_zalo_setting') {
  const alias = safeAlias(convAlias);
  const col = safeAlias(column);
  return `NOT EXISTS (
        SELECT 1 FROM zalo_settings zs_lo
        WHERE zs_lo.id = ${alias}.${col} AND zs_lo.status = '${ZALO_STATUS_LOGGED_OUT}'
      )`;
}
