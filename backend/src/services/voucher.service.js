import { findAllPlans, findPlanByCode } from '../repositories/payment/plan.repository.js';
import {
  createVoucher,
  deleteVoucher,
  findAdminVouchers,
  findEligibleVouchers,
  normalizeVoucherCode,
  updateVoucher,
} from '../repositories/voucher.repository.js';

const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeStringArray = (value) => {
  if (!value) return null;
  const items = Array.isArray(value) ? value : String(value).split(',');
  const normalized = items.map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length ? normalized : null;
};

const normalizeTimestamp = (value) => {
  const text = String(value || '').trim();
  return text ? text : null;
};

export const getPlanAmount = (plan, billingPeriod = 'monthly') => {
  if (billingPeriod === 'yearly' && plan?.price_yearly) return Number(plan.price_yearly);
  return Number(plan?.price || 0);
};

export const calculateVoucherDiscount = (voucher, amount) => {
  const base = Number(amount || 0);
  if (!voucher || base <= 0) return 0;

  let discount = 0;
  const value = Number(voucher.discountValue || 0);
  if (voucher.discountType === 'percentage') {
    discount = Math.floor((base * value) / 100);
    const max = toNumberOrNull(voucher.maxDiscountAmount);
    if (max !== null) discount = Math.min(discount, max);
  } else if (voucher.discountType === 'fixed_amount') {
    discount = value;
  }

  return Math.max(0, Math.min(base, Math.round(discount)));
};

const withComputedDiscount = (voucher, amount) => {
  const originalAmount = Math.round(Number(amount || 0));
  const minOrderAmount = Number(voucher.minOrderAmount || 0);
  const discountAmount = calculateVoucherDiscount(voucher, amount);
  const isEligible = originalAmount >= minOrderAmount && discountAmount > 0;
  return {
    ...voucher,
    minOrderAmount,
    discountAmount,
    isEligible,
    finalAmount: isEligible ? Math.max(0, originalAmount - discountAmount) : originalAmount,
  };
};

export async function validateVoucherForCheckout({
  planCode,
  billingPeriod = 'monthly',
  userId = null,
  userEmail = null,
  code = null,
  autoOnly = false,
  manualOnly = false,
  ignoreMinOrder = false,
  includeIneligible = false,
}) {
  const plan = await findPlanByCode(planCode);
  if (!plan) throw { status: 404, message: 'Gói không tồn tại' };

  const amount = getPlanAmount(plan, billingPeriod);
  const vouchers = await findEligibleVouchers({
    code,
    autoOnly,
    manualOnly,
    ignoreMinOrder,
    planCode: plan.code,
    billingPeriod,
    amount,
    userId,
    userEmail,
  });

  const computed = vouchers
    .map((voucher) => withComputedDiscount(voucher, amount))
    .filter((voucher) => includeIneligible || voucher.isEligible)
    .sort((a, b) => {
      if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;
      return b.discountAmount - a.discountAmount;
    });

  return {
    originalAmount: Math.round(amount),
    voucher: computed.find((voucher) => voucher.isEligible) || null,
    vouchers: computed,
  };
}

export async function listAvailableVouchers(params) {
  return validateVoucherForCheckout({ ...params, autoOnly: true });
}

export async function listCheckoutCodeVouchers(params) {
  return validateVoucherForCheckout({
    ...params,
    manualOnly: true,
    ignoreMinOrder: true,
    includeIneligible: true,
  });
}

export async function listPublicActivePromotions({ billingPeriod = 'monthly' } = {}) {
  const plans = await findAllPlans();
  const entries = await Promise.all(
    plans.map(async (plan) => {
      const amount = getPlanAmount(plan, billingPeriod);
      if (amount <= 0) return null;

      const vouchers = await findEligibleVouchers({
        autoOnly: true,
        planCode: plan.code,
        billingPeriod,
        amount,
      });
      const best = vouchers
        .map((voucher) => withComputedDiscount(voucher, amount))
        .filter((voucher) => voucher.discountAmount > 0)
        .sort((a, b) => b.discountAmount - a.discountAmount)[0];

      return best ? [String(plan.code || '').toLowerCase(), best] : null;
    })
  );

  const byPlanCode = Object.fromEntries(entries.filter(Boolean));
  const promotions = Object.values(byPlanCode);
  const topPromotion = promotions
    .slice()
    .sort((a, b) => b.discountAmount - a.discountAmount)[0] || null;

  return {
    hasPromotion: promotions.length > 0,
    billingPeriod,
    byPlanCode,
    topPromotion,
  };
}

export async function listAdminVouchers() {
  return findAdminVouchers();
}

const normalizeVoucherPayload = (input) => {
  const payload = {
    code: normalizeVoucherCode(input.code),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim() || null,
    discountType: input.discountType,
    discountValue: Number(input.discountValue),
    maxDiscountAmount: toNumberOrNull(input.maxDiscountAmount),
    minOrderAmount: Number(input.minOrderAmount || 0),
    appliesToPlanCodes: normalizeStringArray(input.appliesToPlanCodes),
    appliesToBillingPeriods: normalizeStringArray(input.appliesToBillingPeriods),
    startsAt: normalizeTimestamp(input.startsAt),
    endsAt: normalizeTimestamp(input.endsAt),
    usageLimit: toNumberOrNull(input.usageLimit),
    usageLimitPerUser: toNumberOrNull(input.usageLimitPerUser),
    autoApply: Boolean(input.autoApply),
    stackable: Boolean(input.stackable),
    isActive: input.isActive !== false,
  };

  if (!payload.code) throw { status: 400, message: 'Mã voucher không được để trống' };
  if (!payload.name) throw { status: 400, message: 'Tên voucher không được để trống' };
  if (!['percentage', 'fixed_amount'].includes(payload.discountType)) {
    throw { status: 400, message: 'Loại giảm giá không hợp lệ' };
  }
  if (!Number.isFinite(payload.discountValue) || payload.discountValue <= 0) {
    throw { status: 400, message: 'Giá trị giảm phải lớn hơn 0' };
  }
  if (payload.discountType === 'percentage' && payload.discountValue > 100) {
    throw { status: 400, message: 'Giảm theo % không được vượt quá 100%' };
  }
  if (!Number.isFinite(payload.minOrderAmount) || payload.minOrderAmount < 0) {
    throw { status: 400, message: 'Điều kiện đơn tối thiểu không hợp lệ' };
  }
  return payload;
};

export async function createAdminVoucher(input) {
  try {
    return await createVoucher(normalizeVoucherPayload(input));
  } catch (err) {
    if (err?.code === '23505') throw { status: 409, message: 'Mã voucher đã tồn tại' };
    throw err;
  }
}

export async function updateAdminVoucher(id, input) {
  try {
    const voucher = await updateVoucher(id, normalizeVoucherPayload(input));
    if (!voucher) throw { status: 404, message: 'Không tìm thấy voucher' };
    return voucher;
  } catch (err) {
    if (err?.code === '23505') throw { status: 409, message: 'Mã voucher đã tồn tại' };
    throw err;
  }
}

export async function deleteAdminVoucher(id) {
  const ok = await deleteVoucher(id);
  if (!ok) throw { status: 404, message: 'Không tìm thấy voucher' };
}
