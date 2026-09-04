/**
 * Kiểm tra SĐT có "hợp lý" để gửi lên backend hay không — KHÔNG phải chuẩn hoá.
 * Backend mới là nguồn sự thật duy nhất (normalizePhoneForZaloCampaign,
 * backend/src/utils/zaloPhoneCampaign.util.js) — hàm này chỉ chặn rác rõ ràng
 * (rỗng, quá ngắn, quá dài) trước khi gửi, để không lặp logic chuẩn hoá ở 2 nơi.
 *
 * Chấp nhận mọi định dạng người dùng hay gõ/copy: `0912345678`, `+84 912 345 678`,
 * `0912-345-678`, v.v. — đếm số chữ số sau khi bỏ ký tự không phải số.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isPlausiblePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 12;
}
