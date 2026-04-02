/**
 * Chuẩn hóa số điện thoại để lưu tra cứu blocklist / binding gửi Zalo trong campaign.
 * Chỉ giữ chữ số; 84xxxxxxxxxx → 0xxxxxxxxxx.
 *
 * @param {string|number|null|undefined} raw
 * @returns {string}
 */
export function normalizePhoneForZaloCampaign(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) {
    return `0${digits.slice(2)}`.slice(0, 20);
  }
  if (digits.length === 9 && digits.startsWith('9')) {
    return `0${digits}`.slice(0, 20);
  }
  return digits.slice(0, 20);
}

/**
 * Gom chuỗi tra cứu từ Error/SDK (message, code, cause) để so khớp ổn định.
 *
 * @param {unknown} error
 * @returns {string} chữ thường, không rỗng hoặc ''
 */
function buildZaloRecipientErrorProbe(error) {
  const parts = [];
  if (typeof error === 'string') {
    parts.push(error);
  }
  if (error && typeof error === 'object') {
    parts.push(
      error.message,
      error.code,
      error.cause?.message,
      error.cause?.code,
      // Lỗi từ BullMQ / axios-style bọc ngoài — giữ nguyên thông điệp gốc để khớp "Không tìm thấy".
      error.response?.data?.message,
      error.response?.data?.error,
      error.data?.message,
      error.failedReason
    );
  }
  return parts
    .filter((p) => p != null && String(p).trim() !== '')
    .map((p) => String(p).trim().toLowerCase())
    .join(' ');
}

/**
 * Lỗi Zalo coi là SĐT không dùng được (không tìm thấy / không hợp lệ / chặn gửi) — ghi blocklist, không tốn slot.
 *
 * Luồng hoạt động:
 * 1. Đọc mã lỗi (code) nếu SDK gắn sẵn (vd. zalo_unreachable_contact).
 * 2. Gom message + cause để khớp cả thông điệp tiếng Việt/Anh từ findUser và từ API gửi tin.
 * 3. Khớp thêm các lỗi phổ biến khi gửi: tham số không hợp lệ; chặn tin từ người lạ; vi phạm chính sách.
 * 4. Tránh khớp nhầm lỗi domain khác bằng từ khóa loại trừ ngắn (chỉ áp cho nhánh “không tìm thấy” chung).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isZaloUnreachableRecipientError(error) {
  const code = String(
    error && typeof error === 'object'
      ? (error.code ?? error.cause?.code ?? '')
      : ''
  )
    .trim()
    .toLowerCase();
  if (code === 'zalo_unreachable_contact' || code === 'zalo_user_not_found') return true;
  if (code.includes('unreachable') && code.includes('contact')) return true;

  const probe = buildZaloRecipientErrorProbe(error);
  if (!probe) return false;

  // API gửi tin Zalo: tham số không hợp lệ — không gửi được cho SĐT/recipient hiện tại.
  if (probe.includes('tham số không hợp lệ')) return true;
  // Người nhận không nhận tin từ người lạ (cài đặt quyền riêng tư / chặn inbox người lạ).
  if (
    probe.includes('chặn không nhận tin nhắn từ người lạ')
    || probe.includes('không nhận tin nhắn từ người lạ')
    || (probe.includes('bạn chưa thể gửi tin nhắn') && probe.includes('người lạ'))
  ) {
    return true;
  }
  // Tài khoản Zalo người nhận bị hạn chế theo chính sách nền tảng.
  if (probe.includes('vi phạm chính sách') && probe.includes('zalo')) return true;
  if (probe.includes('người dùng này đã bị chặn') && probe.includes('vi phạm')) return true;

  const excludeDomain =
    probe.includes('chiến dịch')
    || probe.includes('campaign')
    || probe.includes('template')
    || probe.includes('khách hàng')
    || probe.includes('lượt chạy')
    || probe.includes('nhóm')
    || probe.includes('tài khoản zalo đã chọn')
    // Tránh nhầm lỗi tìm kiếm nội bộ khác (không liên quan tra SĐT Zalo).
    || probe.includes('nhân viên')
    || probe.includes('đơn hàng')
    || probe.includes('khóa học')
    || probe.includes('tệp tin')
    || probe.includes('file không');

  if (probe.includes('không tìm thấy user zalo theo số')) return true;
  if (probe.includes('không tìm thấy') && (probe.includes('số') || probe.includes('user'))) return true;
  // Cụm "Không tìm thấy" đứng một mình hoặc sau tiền tố (queue/SDK) — vẫn là không có user Zalo theo SĐT.
  if (!excludeDomain && /\bkhông tìm thấy\b/.test(probe)) {
    return true;
  }
  if (probe.includes('số điện thoại không hợp lệ')) return true;
  if (probe.includes('user không hợp lệ')) return true;
  if (probe.includes('invalid phone') || probe.includes('phone invalid')) return true;
  if (probe.includes('not found') && probe.includes('user')) return true;
  if (probe.includes('no user') && probe.includes('phone')) return true;
  return false;
}

/**
 * Suy ra mã reason ngắn (tối đa 50 ký tự cột `reason`) để lưu DB từ message lỗi.
 *
 * Luồng hoạt động:
 * 1. Ưu tiên mã lỗi chuẩn từ SDK.
 * 2. Phân nhánh theo cụm tiếng Việt đặc trưng (chặn người lạ, vi phạm chính sách, tham số).
 * 3. Fallback: không hợp lệ / không tìm thấy / mặc định not_found.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function inferZaloUnreachableReason(error) {
  const code = String(
    error && typeof error === 'object'
      ? (error.code ?? error.cause?.code ?? '')
      : ''
  )
    .trim()
    .toLowerCase();
  if (code === 'zalo_unreachable_contact') return 'not_found';

  const msg = buildZaloRecipientErrorProbe(error) || String(error?.message ?? error ?? '').trim().toLowerCase();

  if (
    msg.includes('chặn không nhận tin nhắn từ người lạ')
    || msg.includes('không nhận tin nhắn từ người lạ')
    || (msg.includes('bạn chưa thể gửi tin nhắn') && msg.includes('người lạ'))
  ) {
    return 'stranger_blocked';
  }
  if (
    (msg.includes('vi phạm chính sách') && msg.includes('zalo'))
    || (msg.includes('người dùng này đã bị chặn') && msg.includes('vi phạm'))
  ) {
    return 'policy_violation';
  }
  // “Tham số không hợp lệ” tách khỏi lỗi định dạng SĐT chung.
  if (msg.includes('tham số không hợp lệ')) return 'invalid_parameter';

  if (msg.includes('không hợp lệ') || msg.includes('invalid')) return 'invalid_format';
  if (msg.includes('không tìm thấy') || msg.includes('not found')) return 'not_found';
  return 'not_found';
}
