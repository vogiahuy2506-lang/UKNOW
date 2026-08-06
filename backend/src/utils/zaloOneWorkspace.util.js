/**
 * Mỗi số Zalo (zalo_user_id) chỉ được có MỘT kết nối còn sống trên toàn hệ thống.
 * Kết nối đã ngắt / đã tắt không tính, để khách chuyển workspace được.
 */

export const ZALO_LIVE_ELSEWHERE_CODE = 'ZALO_LIVE_ELSEWHERE';

export const ZALO_LIVE_ELSEWHERE_MESSAGE =
  'Số Zalo này đang được kết nối ở một tài khoản khác. Vui lòng ngắt kết nối ở đó trước, hoặc dùng một số Zalo khác.';

export const ZALO_LIVE_UNIQUE_INDEX = 'uniq_zalo_settings_live_zalo_user';

/**
 * @param {{ ownerEmail?: string|null, revealOwner?: boolean }} [opts]
 * @returns {Error & { statusCode: number, code: string, ownerEmail: string|null }}
 */
export function createZaloLiveElsewhereError({ ownerEmail = null, revealOwner = false } = {}) {
  const email = String(ownerEmail || '').trim();
  const message =
    revealOwner && email
      ? `${ZALO_LIVE_ELSEWHERE_MESSAGE} (Chủ sở hữu: ${email})`
      : ZALO_LIVE_ELSEWHERE_MESSAGE;

  const err = new Error(message);
  err.statusCode = 409;
  err.code = ZALO_LIVE_ELSEWHERE_CODE;
  err.ownerEmail = email || null;
  return err;
}

export function isPostgresUniqueViolation(error) {
  return String(error?.code || '') === '23505';
}

/**
 * Map unique violation on live-zalo index (or unknown unique on these write paths) → 409.
 * @param {unknown} error
 * @param {{ ownerEmail?: string|null, revealOwner?: boolean }} [opts]
 * @returns {Error|null}
 */
export function mapUniqueViolationToZaloLiveElsewhere(error, opts = {}) {
  if (!isPostgresUniqueViolation(error)) return null;
  const constraint = String(error?.constraint || '');
  // Nếu biết constraint khác hẳn thì đừng nuốt — nhưng trên các đường write này
  // gần như chỉ có partial unique live-zalo (sau migration 108).
  if (constraint && !constraint.includes('zalo') && constraint !== ZALO_LIVE_UNIQUE_INDEX) {
    return null;
  }
  return createZaloLiveElsewhereError(opts);
}
