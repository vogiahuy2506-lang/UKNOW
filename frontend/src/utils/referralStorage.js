const REFERRAL_STORAGE_KEY = 'uknow_referral';
const REFERRAL_EXPIRY_DAYS = 30;

/**
 * Lưu mã giới thiệu vào localStorage với thời hạn 30 ngày.
 *
 * @param {string|null|undefined} code
 */
export function saveReferralCode(code) {
  if (!code || typeof code !== 'string') return;
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return;

  const expiresAt = Date.now() + REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(
      REFERRAL_STORAGE_KEY,
      JSON.stringify({
        code: cleanCode,
        expiresAt,
      })
    );
  } catch (err) {
    console.warn('[ReferralStorage] Không thể lưu referral code vào localStorage:', err);
  }
}

/**
 * Lấy mã giới thiệu đã lưu từ localStorage (tự động xóa nếu đã quá 30 ngày).
 *
 * @returns {string}
 */
export function getStoredReferralCode() {
  try {
    const raw = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return '';

    // Hỗ trợ trường hợp lưu chuỗi thuần trước đây
    if (!raw.startsWith('{')) {
      return raw.trim().toUpperCase();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.code) return '';

    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
      return '';
    }

    return String(parsed.code).trim().toUpperCase();
  } catch {
    return '';
  }
}

/**
 * Xóa mã giới thiệu khỏi localStorage.
 */
export function clearStoredReferralCode() {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {}
}

/**
 * Đọc ?ref= từ query string hoặc URL, lưu vào localStorage nếu có và trả về mã.
 *
 * @param {string} [searchString]
 * @returns {string}
 */
export function captureReferralFromUrl(searchString) {
  try {
    const query = searchString !== undefined
      ? searchString
      : (typeof window !== 'undefined' ? window.location.search : '');

    if (!query) return '';
    const params = new URLSearchParams(query);
    const ref = params.get('ref');
    if (ref) {
      const cleanRef = ref.trim().toUpperCase();
      saveReferralCode(cleanRef);
      return cleanRef;
    }
    return '';
  } catch {
    return '';
  }
}
