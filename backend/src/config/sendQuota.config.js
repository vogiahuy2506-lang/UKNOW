/**
 * Send Quota Configuration & Validated Runtime Options
 */

export const DEFAULT_STALE_SENDING_SECONDS = 300; // 5 minutes per PR-Q4c contract

/**
 * Ngưỡng MẶC ĐỊNH của bộ dọn đặt chỗ (sendQuotaReservationSweeper) để đánh `sending` → `uncertain`: 30 phút.
 * Lớn hơn lần gọi nhà cung cấp dài nhất tìm thấy trong code (đo 19/10/2026): Zalo cá nhân hai bước (tra số rồi gửi,
 * mỗi bước tối đa 4 lần thử, undici headers 180s + ngủ 70s) ≈ 1580s xấu nhất; email nodemailer (connection 120s +
 * greeting 30s + socket 600s không hoạt động + giãn cách ≤60s sau markSending) ≈ 810s; Telegram ≤ 2×60s;
 * WhatsApp ≈ 60s. Đánh sớm vẫn không mất tiền (sending và uncertain đều tính hạn mức + giữ ví, retry cùng khoá đều 409,
 * consumeSendQuota nhận cả hai) — ngưỡng chỉ quyết định lúc gắn nhãn "chờ đối soát". Env
 * SEND_QUOTA_SENDING_UNCERTAIN_SECONDS vẫn ghi đè. KHÔNG đổi DEFAULT_STALE_SENDING_SECONDS (300): chiến dịch dùng nó
 * để GHI LOG quan sát (campaignRun.observeStaleReservationsOnRunResume), không đổi trạng thái.
 */
export const DEFAULT_SWEEPER_SENDING_UNCERTAIN_SECONDS = 1800;

/**
 * Parses value strictly as a positive integer.
 * Rejects non-integer strings like "300abc", "1.9", " 45 seconds", negative numbers, or non-finite values.
 *
 * @param {unknown} val
 * @returns {number|null}
 */
function parseStrictPositiveInteger(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') {
    return Number.isInteger(val) && val > 0 ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
  }
  return null;
}

/**
 * Get validated stale sending threshold in seconds.
 * Reads parameter override first, then env SEND_QUOTA_SENDING_UNCERTAIN_SECONDS,
 * falling back to DEFAULT_STALE_SENDING_SECONDS (300).
 * Enforces boundaries: minimum 1 second, maximum 86400 seconds (24 hours).
 *
 * @param {string|number} [override]
 * @param {number} [defaultSeconds] mặc định khi không có override lẫn env (mặc định 300)
 * @returns {number}
 */
export function getStaleSendingSeconds(override, defaultSeconds = DEFAULT_STALE_SENDING_SECONDS) {
  const parsedOverride = parseStrictPositiveInteger(override);
  if (parsedOverride !== null) {
    return Math.max(1, Math.min(86400, parsedOverride));
  }

  const rawEnv = process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS;
  const parsedEnv = parseStrictPositiveInteger(rawEnv);
  if (parsedEnv !== null) {
    return Math.max(1, Math.min(86400, parsedEnv));
  }

  const parsedDefault = parseStrictPositiveInteger(defaultSeconds);
  return parsedDefault !== null ? Math.max(1, Math.min(86400, parsedDefault)) : DEFAULT_STALE_SENDING_SECONDS;
}
