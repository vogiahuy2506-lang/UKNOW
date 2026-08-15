/**
 * Pure pricing helpers for self-serve custom plans.
 * Server always recomputes price from admin-managed config rows — never trust client amounts.
 */

export const CONFIG_ITEM_KEYS = Object.freeze([
  'yearly_discount_percent',
  'zalo_monthly_capacity_per_account',
]);

export const BASE_FEE_KEY = 'base_fee';
export const CUSTOM_PLAN_VOUCHER_CODE = 'custom';

/** qty của item nhập theo đơn vị thân thiện (GB) nhưng cột plans lưu đơn vị gốc (byte). */
export const QTY_TO_COLUMN_SCALE = Object.freeze({
  storage_gb: 1073741824,
});

export function qtyToColumnValue(itemKey, qty) {
  return Number(qty || 0) * (QTY_TO_COLUMN_SCALE[itemKey] || 1);
}

const isConfigKey = (key) => CONFIG_ITEM_KEYS.includes(key);

/**
 * @param {Array<{item_key?: string, itemKey?: string, unit_price?: number|string, unitPrice?: number|string}>} configRows
 */
export function getConfigValue(configRows, itemKey, fallback) {
  const row = (configRows || []).find((r) => (r.item_key || r.itemKey) === itemKey);
  if (!row) return fallback;
  const n = Number(row.unit_price ?? row.unitPrice);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRow(row) {
  return {
    itemKey: row.item_key || row.itemKey,
    planColumn: row.plan_column ?? row.planColumn ?? null,
    unitPrice: Number(row.unit_price ?? row.unitPrice ?? 0),
    unitSize: Number(row.unit_size ?? row.unitSize ?? 1),
    includedQty: Number(row.included_qty ?? row.includedQty ?? 0),
    minQty: Number(row.min_qty ?? row.minQty ?? 0),
    maxQty: row.max_qty ?? row.maxQty,
    stepQty: Number(row.step_qty ?? row.stepQty ?? 1),
    isActive: row.is_active ?? row.isActive ?? true,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
  };
}

/**
 * Validate customer quantities against active billable config rows.
 * @returns {{ ok: true, quantities: Record<string, number> } | { ok: false, errors: string[] }}
 */
export function validateQuantities(configRows, rawQuantities = {}) {
  const errors = [];
  const quantities = {};
  const billable = (configRows || [])
    .map(normalizeRow)
    .filter((r) => r.isActive && !isConfigKey(r.itemKey));

  const knownKeys = new Set(billable.map((r) => r.itemKey));
  for (const key of Object.keys(rawQuantities || {})) {
    if (!knownKeys.has(key) && !isConfigKey(key)) {
      errors.push(`Hạng mục không hợp lệ: ${key}`);
    }
  }

  for (const row of billable) {
    const raw = rawQuantities?.[row.itemKey];
    const qty = raw === undefined || raw === null || raw === '' ? row.minQty : Number(raw);

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
 * Hard block: Zalo monthly messages cannot exceed ~16k per connected account.
 * @returns {{ ok: true } | { ok: false, message: string, capacity: number, requested: number, accounts: number }}
 */
export function checkZaloCapacity(quantities, configRows = []) {
  const capacityPerAccount = getConfigValue(configRows, 'zalo_monthly_capacity_per_account', 16000);
  const accounts = Math.max(0, Number(quantities?.zalo_accounts || 0));
  const requested = Math.max(0, Number(quantities?.zalo_messages || 0));
  const capacity = accounts * capacityPerAccount;

  if (requested > capacity) {
    return {
      ok: false,
      message:
        `Số tin Zalo (${requested.toLocaleString('vi-VN')}/tháng) vượt năng lực ` +
        `${accounts} tài khoản (≈ ${capacityPerAccount.toLocaleString('vi-VN')} tin/tài khoản). ` +
        `Tối đa ${capacity.toLocaleString('vi-VN')} tin/tháng — hãy thêm tài khoản Zalo hoặc giảm số tin.`,
      capacity,
      requested,
      accounts,
      capacityPerAccount,
    };
  }
  return { ok: true, capacity, requested, accounts, capacityPerAccount };
}

/**
 * Compute monthly/yearly totals from quantities + pricing rows.
 */
export function computeCustomPlanPrice(configRows, quantities, billingPeriod = 'monthly') {
  const billable = (configRows || [])
    .map(normalizeRow)
    .filter((r) => r.isActive && !isConfigKey(r.itemKey))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const items = [];
  let baseFee = 0;
  let monthlyTotal = 0;

  for (const row of billable) {
    const qty = Number(quantities?.[row.itemKey] ?? row.minQty);
    if (row.itemKey === BASE_FEE_KEY) {
      baseFee = Math.round(row.unitPrice);
      monthlyTotal += baseFee;
      items.push({
        itemKey: row.itemKey,
        qty: 1,
        unitCount: 1,
        unitPrice: row.unitPrice,
        unitSize: 1,
        subtotal: baseFee,
      });
      continue;
    }

    const billableQty = Math.max(0, qty - row.includedQty);
    const unitCount = row.unitSize > 0 ? Math.ceil(billableQty / row.unitSize) : 0;
    const subtotal = Math.round(unitCount * row.unitPrice);
    monthlyTotal += subtotal;
    items.push({
      itemKey: row.itemKey,
      qty,
      unitCount,
      unitPrice: row.unitPrice,
      unitSize: row.unitSize,
      subtotal,
    });
  }

  const yearlyDiscountPercent = getConfigValue(configRows, 'yearly_discount_percent', 20);
  const yearlyTotal = Math.round(monthlyTotal * 12 * (1 - yearlyDiscountPercent / 100));
  const period = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
  const total = period === 'yearly' ? yearlyTotal : monthlyTotal;

  return {
    items,
    baseFee,
    monthlyTotal,
    yearlyTotal,
    yearlyDiscountPercent,
    billingPeriod: period,
    total,
  };
}

/**
 * Map quantities → plans table columns (camelCase for admin repository).
 * messages_per_period is intentionally left null to avoid double-counting with monthly_* limits.
 */
export function mapQuantitiesToPlanColumns(configRows, quantities) {
  const billable = (configRows || [])
    .map(normalizeRow)
    .filter((r) => r.isActive && r.planColumn && !isConfigKey(r.itemKey));

  const snakeToCamel = {
    monthly_zalo_limit: 'monthlyZaloLimit',
    monthly_email_limit: 'monthlyEmailLimit',
    ai_credits_per_period: 'aiCreditsPerPeriod',
    max_zalo_accounts: 'maxZaloAccounts',
    max_email_accounts: 'maxEmailAccounts',
    max_landing_pages: 'maxLandingPages',
    max_chatbots: 'maxChatbots',
    max_employees: 'maxEmployees',
    max_campaigns: 'maxCampaigns',
    max_zalo_campaigns: 'maxZaloCampaigns',
    max_zalo_group_campaigns: 'maxZaloGroupCampaigns',
    max_email_campaigns: 'maxEmailCampaigns',
    max_email_templates: 'maxEmailTemplates',
    max_zalo_templates: 'maxZaloTemplates',
    storage_limit_bytes: 'storageLimitBytes',
  };

  const payload = {
    messagesPerPeriod: null,
    dailyEmailLimit: null,
    dailyZaloLimit: null,
    isFupEnabled: false,
  };

  for (const row of billable) {
    const camel = snakeToCamel[row.planColumn];
    if (!camel) continue;
    const qty = quantities?.[row.itemKey];
    if (qty === undefined || qty === null) {
      payload[camel] = null;
      continue;
    }
    // Safety net: never write a plan limit below included_qty (admin misconfig).
    payload[camel] = Math.max(
      qtyToColumnValue(row.itemKey, qty),
      qtyToColumnValue(row.itemKey, row.includedQty || 0)
    );
  }

  const storageGb = Number(quantities?.storage_gb) || 0;
  if (storageGb > 0) {
    payload.maxKbDocuments      = Math.max(25,      storageGb * 50);
    payload.maxKbExtractedChars = Math.max(1500000, storageGb * 5000000);
  }

  return payload;
}

/**
 * Does a public plan cover every selected limit?
 * NULL limit on plan = unlimited (covers anything).
 * 0 / missing on plan with positive qty = does not cover.
 */
export function planCoversQuantities(plan, quantities, configRows) {
  const billable = (configRows || [])
    .map(normalizeRow)
    .filter((r) => r.isActive && r.planColumn && !isConfigKey(r.itemKey));

  for (const row of billable) {
    const needed = qtyToColumnValue(row.itemKey, quantities?.[row.itemKey]);
    if (needed <= 0) continue;
    const planVal = plan[row.planColumn];
    if (planVal === null || planVal === undefined) continue; // unlimited
    if (Number(planVal) < needed) return false;
  }
  return true;
}

/** ≥ this min usage ratio across comparable dims → treat config as a "clone" of the plan. */
export const PLAN_CLONE_RATIO = 0.8;

/**
 * How close is the customer's config to a public plan's finite limits?
 * Only dims the customer chose (qty > 0) and the plan caps finitely are compared.
 * @returns {number|null} minimum qty/planLimit ratio, or null if nothing comparable
 */
export function planUsageRatio(plan, quantities, configRows) {
  const billable = (configRows || [])
    .map(normalizeRow)
    .filter((r) => r.isActive && r.planColumn && !isConfigKey(r.itemKey));

  let minRatio = null;
  for (const row of billable) {
    const qty = qtyToColumnValue(row.itemKey, quantities?.[row.itemKey]);
    if (qty <= 0) continue;
    const planVal = plan[row.planColumn];
    if (planVal === null || planVal === undefined) continue;
    const cap = Number(planVal);
    if (!Number.isFinite(cap) || cap <= 0) continue;
    const ratio = qty / cap;
    if (minRatio === null || ratio < minRatio) minRatio = ratio;
  }
  return minRatio;
}

function summarizePlan(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    price: Number(plan.price || 0),
    priceYearly: plan.price_yearly != null ? Number(plan.price_yearly) : null,
  };
}

/**
 * Find cheapest public plan that fully covers the config; optionally enforce price floor.
 * Hard floor only when config is a near-clone (≥ PLAN_CLONE_RATIO) of that plan.
 * @returns {{ suggestedPlan: object|null, flooredToPlan: object|null, flooredMonthlyTotal: number, flooredYearlyTotal: number, priceFloorApplied: boolean, total: number }}
 */
export function applyPublicPlanGuardrail({
  publicPlans = [],
  quantities,
  configRows,
  monthlyTotal,
  yearlyTotal,
  billingPeriod = 'monthly',
}) {
  const covering = (publicPlans || [])
    .filter((p) => !p.is_custom && p.is_active !== false)
    // Trial/free plans and the "contact us" placeholder are not real paid alternatives:
    // suggesting them (or flooring price to 0) would tell the customer to buy nothing.
    .filter((p) => Number(p.price || 0) > 0)
    .filter((p) => !['custom', 'contact'].includes(String(p.code || '').trim().toLowerCase()))
    .filter((p) => planCoversQuantities(p, quantities, configRows))
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));

  const cheapest = covering[0] || null;
  let flooredMonthly = monthlyTotal;
  let flooredYearly = yearlyTotal;
  let priceFloorApplied = false;
  let suggestedPlan = null;
  let flooredToPlan = null;

  if (cheapest) {
    const planMonthly = Number(cheapest.price || 0);
    const planYearly = cheapest.price_yearly != null
      ? Number(cheapest.price_yearly)
      : Math.round(planMonthly * 12 * (1 - getConfigValue(configRows, 'yearly_discount_percent', 20) / 100));

    // Soft suggestion when a public plan is cheaper for the same (or better) limits
    if (planMonthly < monthlyTotal) {
      suggestedPlan = {
        ...summarizePlan(cheapest),
        savings: monthlyTotal - planMonthly,
      };
    }

    // Hard floor only when the config is a near-clone of the covering plan
    const ratio = planUsageRatio(cheapest, quantities, configRows);
    const isClone = ratio !== null && ratio >= PLAN_CLONE_RATIO;
    if (isClone && monthlyTotal < planMonthly) {
      flooredMonthly = planMonthly;
      flooredYearly = planYearly;
      priceFloorApplied = true;
      flooredToPlan = summarizePlan(cheapest);
    }
  }

  const total = billingPeriod === 'yearly' ? flooredYearly : flooredMonthly;
  return {
    suggestedPlan,
    flooredToPlan,
    flooredMonthlyTotal: flooredMonthly,
    flooredYearlyTotal: flooredYearly,
    priceFloorApplied,
    total,
  };
}
