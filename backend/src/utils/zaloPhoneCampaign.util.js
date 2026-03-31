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
 * Lỗi Zalo coi là SĐT không dùng được (không tìm thấy / không hợp lệ) — ghi blocklist, không tốn slot.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isZaloUnreachableRecipientError(error) {
  const msg = String(error?.message ?? error ?? '').trim().toLowerCase();
  if (!msg) return false;
  if (msg.includes('không tìm thấy user zalo theo số')) return true;
  if (msg.includes('không tìm thấy') && (msg.includes('số') || msg.includes('user'))) return true;
  if (msg.includes('số điện thoại không hợp lệ')) return true;
  if (msg.includes('user không hợp lệ')) return true;
  if (msg.includes('invalid phone') || msg.includes('phone invalid')) return true;
  if (msg.includes('not found') && msg.includes('user')) return true;
  return false;
}

/**
 * Suy ra mã reason ngắn để lưu DB từ message lỗi.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function inferZaloUnreachableReason(error) {
  const msg = String(error?.message ?? error ?? '').trim().toLowerCase();
  if (msg.includes('không hợp lệ') || msg.includes('invalid')) return 'invalid_format';
  if (msg.includes('không tìm thấy') || msg.includes('not found')) return 'not_found';
  return 'not_found';
}
