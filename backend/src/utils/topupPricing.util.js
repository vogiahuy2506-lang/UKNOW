/**
 * Pure pricing helpers for mid-cycle top-up purchases.
 * Linear unit pricing — never Math.ceil by block (unlike customPlanPricing).
 */

export const TOPUP_MIN_ORDER_AMOUNT = 50_000;

/** Consumable quotas — permanent wallet (cycle_end NULL). */
export const TOPUP_CONSUMABLE_KEYS = Object.freeze([
  'zalo_messages',
  'emails',
  'ai_credits',
]);

/** Structural slots (also expire with cycle; raise effective plan limits while active). */
export const TOPUP_STRUCTURAL_KEYS = Object.freeze([
  'zalo_accounts',
  'email_accounts',
  'landing_pages',
  'chatbots',
  'employees',
]);

export const TOPUP_ITEM_KEYS = Object.freeze([
  ...TOPUP_CONSUMABLE_KEYS,
  ...TOPUP_STRUCTURAL_KEYS,
]);

/** resourceKey (userResourceLimit) → topup_grants.item_key */
export const TOPUP_GRANT_KEY_BY_RESOURCE = Object.freeze({
  zaloAccounts: 'zalo_accounts',
  emailAccounts: 'email_accounts',
  landingPages: 'landing_pages',
});

function normalizeRow(row) {
  return {
    itemKey: row.item_key || row.itemKey,
    unitPrice: Number(row.unit_price ?? row.unitPrice ?? 0),
    minQty: Number(row.min_qty ?? row.minQty ?? 0),
    stepQty: Number(row.step_qty ?? row.stepQty ?? 1),
    maxQty: row.max_qty ?? row.maxQty ?? null,
    isActive: row.is_active ?? row.isActive ?? true,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
  };
}

/**
 * Validate top-up quantities. qty=0 / missing = not buying that item.
 * Positive qty must be integer, >= min, <= max, and align to step from min.
 *
 * @returns {{ ok: true, quantities: Record<string, number> } | { ok: false, errors: string[] }}
 */
export function validateTopupQuantities(pricingRows, rawQuantities = {}) {
  const errors = [];
  const quantities = {};
  const billable = (pricingRows || [])
    .map(normalizeRow)
    .filter((r) => r.isActive);

  const knownKeys = new Set(billable.map((r) => r.itemKey));
  for (const key of Object.keys(rawQuantities || {})) {
    if (!knownKeys.has(key)) {
      errors.push(`Hạng mục không hợp lệ: ${key}`);
    }
  }

  for (const row of billable) {
    const raw = rawQuantities?.[row.itemKey];
    if (raw === undefined || raw === null || raw === '' || Number(raw) === 0) {
      quantities[row.itemKey] = 0;
      continue;
    }

    const qty = Number(raw);
    if (!Number.isFinite(qty) || !Number.isInteger(qty)) {
      errors.push(`${row.itemKey}: số lượng phải là số nguyên`);
      continue;
    }
    if (qty < 0) {
      errors.push(`${row.itemKey}: số lượng không được âm`);
      continue;
    }
    if (qty < row.minQty) {
      errors.push(`${row.itemKey}: tối thiểu ${row.minQty}`);
      continue;
    }
    if (row.maxQty != null && Number.isFinite(Number(row.maxQty)) && qty > Number(row.maxQty)) {
      errors.push(`${row.itemKey}: tối đa ${row.maxQty}`);
      continue;
    }
    if (row.stepQty > 1 && (qty - row.minQty) % row.stepQty !== 0) {
      errors.push(`${row.itemKey}: phải theo bước ${row.stepQty}`);
      continue;
    }
    quantities[row.itemKey] = qty;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, quantities };
}

/**
 * Linear price: subtotal = qty * unit_price (no block ceil).
 *
 * @returns {{
 *   items: Array<{ itemKey: string, qty: number, unitPrice: number, subtotal: number }>,
 *   total: number,
 *   meetsMinimum: boolean,
 *   shortfall: number,
 * }}
 */
export function computeTopupPrice(pricingRows, quantities = {}) {
  const billable = (pricingRows || [])
    .map(normalizeRow)
    .filter((r) => r.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || String(a.itemKey).localeCompare(String(b.itemKey)));

  const items = [];
  let total = 0;

  for (const row of billable) {
    const qty = Math.max(0, Number(quantities?.[row.itemKey] || 0));
    if (qty <= 0) continue;
    const subtotal = qty * row.unitPrice;
    items.push({
      itemKey: row.itemKey,
      qty,
      unitPrice: row.unitPrice,
      minQty: row.minQty,
      stepQty: row.stepQty,
      maxQty: row.maxQty,
      subtotal,
    });
    total += subtotal;
  }

  const shortfall = Math.max(0, TOPUP_MIN_ORDER_AMOUNT - total);
  return {
    items,
    total,
    meetsMinimum: total >= TOPUP_MIN_ORDER_AMOUNT,
    shortfall,
    minOrderAmount: TOPUP_MIN_ORDER_AMOUNT,
  };
}

/**
 * Remaining Zalo top-up slots under physical capacity.
 * qty_mua ≤ capacity − planMonthlyLimit − existingActiveGrants
 *
 * @param {{
 *   accounts: number,
 *   capacityPerAccount?: number,
 *   planMonthlyZaloLimit: number|null,
 *   existingZaloGrants?: number,
 *   requestedQty?: number,
 * }} input
 */
export function checkTopupZaloCapacity({
  accounts,
  capacityPerAccount = 16000,
  planMonthlyZaloLimit,
  existingZaloGrants = 0,
  requestedQty = 0,
} = {}) {
  const acct = Math.max(0, Number(accounts) || 0);
  const perAcct = Math.max(0, Number(capacityPerAccount) || 0);
  const capacity = acct * perAcct;
  const planLimit = planMonthlyZaloLimit == null ? null : Math.max(0, Number(planMonthlyZaloLimit) || 0);
  const grants = Math.max(0, Number(existingZaloGrants) || 0);
  const requested = Math.max(0, Number(requestedQty) || 0);

  // Unlimited plan monthly → no need (and no room) to buy more under capacity model.
  if (planLimit === null) {
    return {
      ok: requested === 0,
      capacity,
      accounts: acct,
      capacityPerAccount: perAcct,
      planMonthlyZaloLimit: null,
      existingGrants: grants,
      remaining: 0,
      requested,
      message: requested > 0
        ? 'Gói hiện tại không giới hạn tin Zalo theo tháng — không cần mua thêm.'
        : undefined,
    };
  }

  // accounts=0: gói không cấp slot Zalo (hoặc feature tắt) → không còn chỗ mua thêm.
  // Không còn bắt buộc đã kết nối QR — capacity lấy theo slot gói (+ grant) ở tầng service.
  if (acct === 0) {
    return {
      ok: requested === 0,
      capacity: 0,
      accounts: 0,
      capacityPerAccount: perAcct,
      planMonthlyZaloLimit: planLimit,
      existingGrants: grants,
      remaining: 0,
      requested,
      message: requested > 0
        ? 'Gói hiện tại không có slot tài khoản Zalo — không thể mua thêm tin.'
        : undefined,
      code: requested > 0 ? 'ZALO_NO_SLOT' : undefined,
    };
  }

  const remaining = Math.max(0, capacity - planLimit - grants);
  if (requested > remaining) {
    return {
      ok: false,
      capacity,
      accounts: acct,
      capacityPerAccount: perAcct,
      planMonthlyZaloLimit: planLimit,
      existingGrants: grants,
      remaining,
      requested,
      message:
        `Số tin Zalo mua thêm (${requested.toLocaleString('vi-VN')}) vượt năng lực còn lại ` +
        `(${remaining.toLocaleString('vi-VN')} tin). ` +
        `Tối đa ${capacity.toLocaleString('vi-VN')} tin/tháng cho ${acct} tài khoản đã kết nối ` +
        `(đã cấp gói ${planLimit.toLocaleString('vi-VN')}` +
        (grants > 0 ? ` + đã mua thêm ${grants.toLocaleString('vi-VN')}` : '') +
        ').',
    };
  }

  return {
    ok: true,
    capacity,
    accounts: acct,
    capacityPerAccount: perAcct,
    planMonthlyZaloLimit: planLimit,
    existingGrants: grants,
    remaining,
    requested,
  };
}
