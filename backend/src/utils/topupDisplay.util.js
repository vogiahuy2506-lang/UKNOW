/**
 * Helpers hiển thị mua thêm (top-up) — thuần, không I/O.
 * @see _internal/PLAN_HIEN_THI_MUA_THEM.md
 */

/**
 * @param {{ note?: string|null, topup_config?: unknown }} row
 * @returns {boolean}
 */
export function isTopupOrderRow(row) {
  if (!row) return false;
  return row.note === 'topup' || row.topup_config != null;
}

/**
 * Parse topup_config.quantities → [{ itemKey, qty }], bỏ qty <= 0.
 * @param {unknown} topupConfig
 * @returns {{ itemKey: string, qty: number }[]}
 */
export function mapTopupItemsFromConfig(topupConfig) {
  let config = topupConfig;
  if (typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      return [];
    }
  }
  const quantities = config?.quantities && typeof config.quantities === 'object'
    ? config.quantities
    : {};
  return Object.entries(quantities)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([itemKey, qty]) => ({ itemKey, qty: Number(qty) }));
}

/**
 * @param {{
 *   zaloMessages: number,
 *   emails: number,
 *   aiCredits: number,
 *   expiresAt?: Date|string|null,
 * }} totals
 * @returns {null|{ zaloMessages: number, emails: number, aiCredits: number, expiresAt: Date|string|null }}
 */
export function buildAddonsPayload({ zaloMessages = 0, emails = 0, aiCredits = 0, expiresAt = null } = {}) {
  const z = Number(zaloMessages) || 0;
  const e = Number(emails) || 0;
  const a = Number(aiCredits) || 0;
  if (z === 0 && e === 0 && a === 0) return null;
  return {
    zaloMessages: z,
    emails: e,
    aiCredits: a,
    expiresAt: expiresAt ?? null,
  };
}
