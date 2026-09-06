/**
 * Send Quota Configuration & Validated Runtime Options
 */

export const DEFAULT_STALE_SENDING_SECONDS = 300; // 5 minutes per PR-Q4c contract

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
 * @returns {number}
 */
export function getStaleSendingSeconds(override) {
  const parsedOverride = parseStrictPositiveInteger(override);
  if (parsedOverride !== null) {
    return Math.max(1, Math.min(86400, parsedOverride));
  }

  const rawEnv = process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS;
  const parsedEnv = parseStrictPositiveInteger(rawEnv);
  if (parsedEnv !== null) {
    return Math.max(1, Math.min(86400, parsedEnv));
  }

  return DEFAULT_STALE_SENDING_SECONDS;
}
