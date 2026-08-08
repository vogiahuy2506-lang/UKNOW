import { findAllPlans, findPlanByCode } from '../repositories/payment/plan.repository.js';
import {
  createVoucher,
  deleteVoucher,
  hardDeleteVoucher,
  findAdminVouchers,
  findActiveVoucherByCode,
  findEligibleVouchers,
  findVoucherById,
  normalizeVoucherCode,
  restoreVoucher,
  updateVoucher,
  getPayosPendingWindowMinutes,
} from '../repositories/voucher.repository.js';

const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toNonNegativeIntOrNull = (value, fieldLabel) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw { status: 400, message: `${fieldLabel} phải là số nguyên ≥ 0` };
  }
  if (n === 0) {
    throw {
      status: 400,
      message: `${fieldLabel} = 0 không hợp lệ — để trống nếu không giới hạn`,
    };
  }
  return n;
};

const normalizeStringArray = (value) => {
  if (value === undefined) return undefined;
  if (!value) return null;
  const items = Array.isArray(value) ? value : String(value).split(',');
  const normalized = items.map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length ? normalized : null;
};

const normalizeTimestamp = (value) => {
  if (value === undefined) return undefined;
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
  /** When set (e.g. self-serve custom plan), skip public-plan lookup and use this amount. */
  amountOverride = null,
  queryable,
  pendingWindowMinutes = getPayosPendingWindowMinutes(),
}) {
  const normalizedPlanCode = String(planCode || '').trim().toLowerCase();
  let amount;
  let eligibilityPlanCode = normalizedPlanCode;

  if (amountOverride != null && Number.isFinite(Number(amountOverride))) {
    // Self-serve custom plans have code=NULL; use sentinel 'custom' for voucher filters.
    amount = Math.round(Number(amountOverride));
    eligibilityPlanCode = normalizedPlanCode || 'custom';
  } else {
    const plan = await findPlanByCode(planCode, queryable);
    if (!plan) throw { status: 404, message: 'Gói không tồn tại' };
    amount = getPlanAmount(plan, billingPeriod);
    eligibilityPlanCode = plan.code;
  }

  const vouchers = await findEligibleVouchers({
    code,
    autoOnly,
    manualOnly,
    ignoreMinOrder,
    planCode: eligibilityPlanCode,
    billingPeriod,
    amount,
    userId,
    userEmail,
    pendingWindowMinutes,
    queryable,
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

const normalizeVoucherPayload = (input, { partial = false } = {}) => {
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial) {
    const payload = {
      code: normalizeVoucherCode(input.code),
      name: String(input.name || '').trim(),
      description: String(input.description || '').trim() || null,
      discountType: input.discountType,
      discountValue: Number(input.discountValue),
      maxDiscountAmount:
        input.discountType === 'percentage' ? toNumberOrNull(input.maxDiscountAmount) : null,
      minOrderAmount: Number(input.minOrderAmount || 0),
      appliesToPlanCodes: normalizeStringArray(input.appliesToPlanCodes) ?? null,
      appliesToBillingPeriods: normalizeStringArray(input.appliesToBillingPeriods) ?? null,
      startsAt: normalizeTimestamp(input.startsAt) ?? null,
      endsAt: normalizeTimestamp(input.endsAt) ?? null,
      usageLimit: toNonNegativeIntOrNull(input.usageLimit, 'Tổng lượt dùng'),
      usageLimitPerUser: toNonNegativeIntOrNull(input.usageLimitPerUser, 'Lượt/user'),
      autoApply: Boolean(input.autoApply),
      stackable: false,
      isActive: input.isActive !== false,
    };
    assertVoucherPayload(payload);
    return payload;
  }

  // Merge-patch: only normalize fields present in input.
  const patch = {};
  if (has('code')) patch.code = normalizeVoucherCode(input.code);
  if (has('name')) patch.name = String(input.name || '').trim();
  if (has('description')) patch.description = String(input.description || '').trim() || null;
  if (has('discountType')) patch.discountType = input.discountType;
  if (has('discountValue')) patch.discountValue = Number(input.discountValue);
  if (has('maxDiscountAmount')) patch.maxDiscountAmount = toNumberOrNull(input.maxDiscountAmount);
  if (has('minOrderAmount')) patch.minOrderAmount = Number(input.minOrderAmount || 0);
  if (has('appliesToPlanCodes')) patch.appliesToPlanCodes = normalizeStringArray(input.appliesToPlanCodes) ?? null;
  if (has('appliesToBillingPeriods')) {
    patch.appliesToBillingPeriods = normalizeStringArray(input.appliesToBillingPeriods) ?? null;
  }
  if (has('startsAt')) patch.startsAt = normalizeTimestamp(input.startsAt) ?? null;
  if (has('endsAt')) patch.endsAt = normalizeTimestamp(input.endsAt) ?? null;
  if (has('usageLimit')) patch.usageLimit = toNonNegativeIntOrNull(input.usageLimit, 'Tổng lượt dùng');
  if (has('usageLimitPerUser')) {
    patch.usageLimitPerUser = toNonNegativeIntOrNull(input.usageLimitPerUser, 'Lượt/user');
  }
  if (has('autoApply')) patch.autoApply = Boolean(input.autoApply);
  if (has('isActive')) patch.isActive = input.isActive !== false;
  // stackable deliberately ignored (V-3A) — always leave existing DB value unless full create.
  return patch;
};

function assertVoucherPayload(payload) {
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
  if (payload.startsAt && payload.endsAt && new Date(payload.startsAt) > new Date(payload.endsAt)) {
    throw { status: 400, message: 'Ngày bắt đầu phải trước ngày kết thúc' };
  }
  if (payload.usageLimit === 0) {
    throw { status: 400, message: 'Tổng lượt dùng = 0 không hợp lệ — để trống nếu không giới hạn' };
  }
  if (payload.usageLimitPerUser === 0) {
    throw { status: 400, message: 'Lượt/user = 0 không hợp lệ — để trống nếu không giới hạn' };
  }
  if (payload.discountType !== 'percentage') {
    payload.maxDiscountAmount = null;
  }
  if (payload.isActive === true && payload.endsAt && new Date(payload.endsAt).getTime() <= Date.now()) {
    throw {
      status: 400,
      message: 'Phải đặt ngày kết thúc trong tương lai (hoặc để trống) trước khi khôi phục',
      code: 'VOUCHER_ENDS_AT_REQUIRED',
    };
  }
}

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
    const current = await findVoucherById(id);
    if (!current) throw { status: 404, message: 'Không tìm thấy voucher' };

    const patch = normalizeVoucherPayload(input, { partial: true });
    const merged = {
      code: patch.code ?? current.code,
      name: patch.name ?? current.name,
      description: patch.description !== undefined ? patch.description : current.description,
      discountType: patch.discountType ?? current.discountType,
      discountValue: patch.discountValue ?? Number(current.discountValue),
      maxDiscountAmount:
        patch.maxDiscountAmount !== undefined ? patch.maxDiscountAmount : current.maxDiscountAmount,
      minOrderAmount: patch.minOrderAmount ?? Number(current.minOrderAmount || 0),
      appliesToPlanCodes:
        patch.appliesToPlanCodes !== undefined ? patch.appliesToPlanCodes : current.appliesToPlanCodes,
      appliesToBillingPeriods:
        patch.appliesToBillingPeriods !== undefined
          ? patch.appliesToBillingPeriods
          : current.appliesToBillingPeriods,
      startsAt: patch.startsAt !== undefined ? patch.startsAt : current.startsAt,
      endsAt: patch.endsAt !== undefined ? patch.endsAt : current.endsAt,
      usageLimit: patch.usageLimit !== undefined ? patch.usageLimit : current.usageLimit,
      usageLimitPerUser:
        patch.usageLimitPerUser !== undefined ? patch.usageLimitPerUser : current.usageLimitPerUser,
      autoApply: patch.autoApply !== undefined ? patch.autoApply : current.autoApply,
      stackable: false,
      isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    };

    if (merged.discountType !== 'percentage') {
      merged.maxDiscountAmount = null;
    }

    assertVoucherPayload(merged);

    // Reactivating with a code already held by another active voucher.
    if (merged.isActive) {
      const conflict = await findActiveVoucherByCode(merged.code);
      if (conflict && Number(conflict.id) !== Number(id)) {
        throw {
          status: 409,
          message: `Mã ${merged.code} hiện đang được dùng bởi voucher «${conflict.name}» (ID ${conflict.id}). Đổi mã của voucher này hoặc ngừng voucher kia trước khi khôi phục.`,
          code: 'VOUCHER_CODE_IN_USE',
        };
      }
    }

    const voucher = await updateVoucher(id, merged);
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

export async function hardDeleteAdminVoucher(id) {
  const current = await findVoucherById(id);
  if (!current) throw { status: 404, message: 'Không tìm thấy voucher' };
  if (Number(current.usedCount) > 0) {
    throw {
      status: 400,
      message: 'Chỉ xoá vĩnh viễn được khi chưa có ai dùng (used_count = 0). Hãy dùng Ngừng dùng.',
    };
  }
  const ok = await hardDeleteVoucher(id);
  if (!ok) throw { status: 404, message: 'Không tìm thấy voucher' };
}

export async function restoreAdminVoucher(id, input = {}) {
  try {
    const endsAt = Object.prototype.hasOwnProperty.call(input, 'endsAt')
      ? normalizeTimestamp(input.endsAt)
      : undefined;
    const voucher = await restoreVoucher(id, { endsAt });
    if (!voucher) throw { status: 404, message: 'Không tìm thấy voucher' };
    return voucher;
  } catch (err) {
    if (err?.code === '23505') {
      throw { status: 409, message: 'Mã voucher đã tồn tại' };
    }
    throw err;
  }
}
