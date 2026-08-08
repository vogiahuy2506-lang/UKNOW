/**
 * Helpers hiển thị mua thêm (top-up) — thuần, không I/O.
 *
 * Consumable (tin/email/AI): ví vĩnh viễn — hồ sơ trả { granted, used, remaining }.
 * Structural: vẫn số nguyên (slot theo chu kỳ) khi ship phần B.
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
 * @param {{ granted?: number, used?: number, remaining?: number }|number|null|undefined} value
 * @returns {{ granted: number, used: number, remaining: number }}
 */
export function normalizeWalletAddon(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const granted = Number(value.granted) || 0;
    const used = Number(value.used) || 0;
    const remaining = value.remaining != null
      ? Math.max(0, Number(value.remaining) || 0)
      : Math.max(0, granted - used);
    return { granted, used, remaining };
  }
  const granted = Number(value) || 0;
  return { granted, used: 0, remaining: Math.max(0, granted) };
}

/**
 * @param {{
 *   zaloMessages?: object|number,
 *   emails?: object|number,
 *   aiCredits?: object|number,
 *   zaloAccounts?: number,
 *   emailAccounts?: number,
 *   landingPages?: number,
 *   chatbots?: number,
 *   employees?: number,
 * }} input
 * @returns {null|object}
 */
export function buildAddonsPayload({
  zaloMessages = 0,
  emails = 0,
  aiCredits = 0,
  zaloAccounts = 0,
  emailAccounts = 0,
  landingPages = 0,
  chatbots = 0,
  employees = 0,
} = {}) {
  const wallet = {
    zaloMessages: normalizeWalletAddon(zaloMessages),
    emails: normalizeWalletAddon(emails),
    aiCredits: normalizeWalletAddon(aiCredits),
  };
  const structural = {
    zaloAccounts: Number(zaloAccounts) || 0,
    emailAccounts: Number(emailAccounts) || 0,
    landingPages: Number(landingPages) || 0,
    chatbots: Number(chatbots) || 0,
    employees: Number(employees) || 0,
  };

  const hasWallet = Object.values(wallet).some((w) => w.granted > 0);
  const hasStructural = Object.values(structural).some((n) => n > 0);
  if (!hasWallet && !hasStructural) return null;

  return {
    ...wallet,
    ...structural,
  };
}
