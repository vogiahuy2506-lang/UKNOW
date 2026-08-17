import { findAllPlans } from '../../repositories/payment/plan.repository.js';
import {
  findAllPricingConfig,
  findAllPricingRows,
  findPricingRowByKey,
  updatePricingRow,
  deleteOrphanCustomPlans,
  findCustomPlanOwnedByUser,
} from '../../repositories/payment/customPlan.repository.js';
import {
  CONFIG_ITEM_KEYS,
  CUSTOM_PLAN_VOUCHER_CODE,
  validateQuantities,
  checkZaloCapacity,
  computeCustomPlanPrice,
  mapQuantitiesToPlanColumns,
  applyPublicPlanGuardrail,
} from '../../utils/customPlanPricing.util.js';

/**
 * Public/admin config for the custom-plan builder.
 */
export async function getCustomPlanPricingConfig() {
  const rows = await findAllPricingConfig();
  const config = {};
  const items = [];

  for (const row of rows) {
    if (CONFIG_ITEM_KEYS.includes(row.itemKey)) {
      config[row.itemKey] = Number(row.unitPrice);
      continue;
    }
    if (!row.isActive) continue;
    items.push(row);
  }

  return {
    config: {
      yearlyDiscountPercent: config.yearly_discount_percent ?? 20,
      zaloMonthlyCapacityPerAccount: config.zalo_monthly_capacity_per_account ?? 16000,
    },
    items,
    voucherPlanCode: CUSTOM_PLAN_VOUCHER_CODE,
  };
}

/**
 * Quote a custom configuration (read-only, no DB writes).
 */
export async function quoteCustomPlan({ quantities = {}, billingPeriod = 'monthly' } = {}) {
  if (!['monthly', 'yearly'].includes(billingPeriod)) {
    throw { status: 400, message: 'billingPeriod phải là monthly hoặc yearly' };
  }

  const pricingRows = await findAllPricingRows();
  const validation = validateQuantities(pricingRows, quantities);
  if (!validation.ok) {
    throw { status: 400, message: validation.errors.join('; '), errors: validation.errors };
  }

  const capacity = checkZaloCapacity(validation.quantities, pricingRows);
  if (!capacity.ok) {
    throw {
      status: 400,
      message: capacity.message,
      code: 'ZALO_CAPACITY_EXCEEDED',
      capacity,
    };
  }

  const priced = computeCustomPlanPrice(pricingRows, validation.quantities, billingPeriod);
  const publicPlans = await findAllPlans();
  const guardrail = applyPublicPlanGuardrail({
    publicPlans,
    quantities: validation.quantities,
    configRows: pricingRows,
    monthlyTotal: priced.monthlyTotal,
    yearlyTotal: priced.yearlyTotal,
    billingPeriod,
  });

  const warnings = [];
  if (guardrail.suggestedPlan) {
    warnings.push({
      code: 'SUGGESTED_PUBLIC_PLAN',
      message:
        `Gói ${guardrail.suggestedPlan.name} (${Number(guardrail.suggestedPlan.price).toLocaleString('vi-VN')}đ/tháng) ` +
        `đã bao gồm những gì bạn chọn và rẻ hơn ` +
        `${Number(guardrail.suggestedPlan.savings).toLocaleString('vi-VN')}đ.`,
      suggestedPlan: guardrail.suggestedPlan,
    });
  }
  if (guardrail.priceFloorApplied) {
    const floorPlan = guardrail.flooredToPlan;
    const floorPrice = Number(floorPlan?.price || guardrail.flooredMonthlyTotal || 0);
    warnings.push({
      code: 'PRICE_FLOOR_APPLIED',
      message:
        `Cấu hình gần trùng gói ${floorPlan?.name || 'đại trà'} — ` +
        `giá đã được đưa về mức ${floorPrice.toLocaleString('vi-VN')}đ/tháng.`,
      flooredToPlan: floorPlan,
    });
  }

  return {
    quantities: validation.quantities,
    items: priced.items,
    baseFee: priced.baseFee,
    monthlyTotal: guardrail.flooredMonthlyTotal,
    yearlyTotal: guardrail.flooredYearlyTotal,
    yearlyDiscountPercent: priced.yearlyDiscountPercent,
    billingPeriod,
    total: guardrail.total,
    priceFloorApplied: guardrail.priceFloorApplied,
    flooredToPlan: guardrail.flooredToPlan,
    suggestedPlan: guardrail.suggestedPlan,
    warnings,
    capacity: {
      ok: true,
      capacity: capacity.capacity,
      requested: capacity.requested,
      accounts: capacity.accounts,
      capacityPerAccount: capacity.capacityPerAccount,
    },
    planColumns: mapQuantitiesToPlanColumns(pricingRows, validation.quantities),
  };
}

/**
 * Resolve quote + columns for payment creation (same validation as quote).
 */
export async function resolveCustomPlanQuote({ quantities, billingPeriod }) {
  return quoteCustomPlan({ quantities, billingPeriod });
}

/** Admin: list all pricing rows including inactive + config. */
export async function listAdminCustomPlanPricing() {
  return findAllPricingConfig();
}

/** Admin: patch one pricing row by item_key. */
export async function updateAdminCustomPlanPricing(itemKey, patch) {
  const key = String(itemKey || '').trim();
  if (!key) throw { status: 400, message: 'Thiếu itemKey' };

  const allowed = {};
  if (patch.unitPrice !== undefined) {
    const n = Number(patch.unitPrice);
    if (!Number.isFinite(n) || n < 0) throw { status: 400, message: 'unitPrice không hợp lệ' };
    allowed.unitPrice = Math.round(n);
  }
  if (patch.unitSize !== undefined) {
    const n = Number(patch.unitSize);
    if (!Number.isInteger(n) || n < 1) throw { status: 400, message: 'unitSize phải ≥ 1' };
    allowed.unitSize = n;
  }
  if (patch.includedQty !== undefined) {
    const n = Number(patch.includedQty);
    if (!Number.isInteger(n) || n < 0) throw { status: 400, message: 'includedQty không hợp lệ' };
    allowed.includedQty = n;
  }
  if (patch.minQty !== undefined) {
    const n = Number(patch.minQty);
    if (!Number.isInteger(n) || n < 0) throw { status: 400, message: 'minQty không hợp lệ' };
    allowed.minQty = n;
  }
  if (patch.maxQty !== undefined) {
    if (patch.maxQty === null || patch.maxQty === '') {
      allowed.maxQty = null;
    } else {
      const n = Number(patch.maxQty);
      if (!Number.isInteger(n) || n < 0) throw { status: 400, message: 'maxQty không hợp lệ' };
      allowed.maxQty = n;
    }
  }
  if (patch.stepQty !== undefined) {
    const n = Number(patch.stepQty);
    if (!Number.isInteger(n) || n < 1) throw { status: 400, message: 'stepQty phải ≥ 1' };
    allowed.stepQty = n;
  }
  if (patch.isActive !== undefined) allowed.isActive = Boolean(patch.isActive);
  if (patch.sortOrder !== undefined) {
    const n = Number(patch.sortOrder);
    if (!Number.isInteger(n)) throw { status: 400, message: 'sortOrder không hợp lệ' };
    allowed.sortOrder = n;
  }

  if (!Object.keys(allowed).length) {
    const existing = await findPricingRowByKey(key);
    if (!existing) throw { status: 404, message: 'Không tìm thấy hạng mục giá' };
    return existing;
  }

  // Enforce min_qty >= included_qty using the post-patch values.
  if (allowed.minQty !== undefined || allowed.includedQty !== undefined) {
    const current = await findPricingRowByKey(key);
    if (!current) throw { status: 404, message: 'Không tìm thấy hạng mục giá' };
    const nextMin = allowed.minQty !== undefined ? allowed.minQty : Number(current.minQty || 0);
    const nextIncluded = allowed.includedQty !== undefined
      ? allowed.includedQty
      : Number(current.includedQty || 0);
    if (nextMin < nextIncluded) {
      throw {
        status: 400,
        message: `minQty (${nextMin}) không được nhỏ hơn includedQty (${nextIncluded})`,
      };
    }
  }

  const updated = await updatePricingRow(key, allowed);
  if (!updated) throw { status: 404, message: 'Không tìm thấy hạng mục giá' };
  return updated;
}

export async function cleanupOrphanCustomPlans(olderThanMinutes) {
  return deleteOrphanCustomPlans(olderThanMinutes);
}

export async function getMyCustomPlan({ userId, activePlanId }) {
  if (!activePlanId || !userId) return null;
  const plan = await findCustomPlanOwnedByUser(activePlanId, userId);
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    price: Number(plan.price || 0),
    priceYearly: plan.price_yearly != null ? Number(plan.price_yearly) : null,
    customConfig: plan.custom_config,
    createdAt: plan.created_at,
  };
}
