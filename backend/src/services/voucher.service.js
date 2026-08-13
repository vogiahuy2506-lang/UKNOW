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
  voucherHasOrderReference,
} from '../repositories/voucher.repository.js';
import {
  CODE_OFFER_MODES,
  OFFER_MODES,
  VOUCHER_NOT_APPLICABLE,
  assertUserVoucherCode,
  buildOrderDiscountSnapshot,
  generateAutomaticVoucherCode,
  isInternalAutomaticCode,
  offerModeToAutoApply,
  pickBestDiscountCandidate,
  resolveOfferMode,
  sortDiscountCandidates,
  toAdminVoucherDto,
  toAutomaticPreviewDto,
  toPaymentDiscountDto,
  toPublicCodeDto,
  toPublicPromotionDto,
  toValidatedCodeDto,
  withComputedDiscount,
} from '../utils/voucherOffer.util.js';

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

const resolveInputOfferMode = (input = {}) => {
  if (OFFER_MODES.includes(input.offerMode)) return input.offerMode;
  if (Object.prototype.hasOwnProperty.call(input, 'autoApply')) {
    return input.autoApply ? 'automatic' : 'public_code';
  }
  return null;
};

const listPublicPlanCodes = async () => {
  const plans = await findAllPlans();
  return new Set(
    plans
      .map((plan) => String(plan.code || '').trim().toLowerCase())
      .filter(Boolean)
  );
};

const assertAutomaticTargets = async ({
  appliesToPlanCodes,
  appliesToBillingPeriods,
  endsAt,
  isCreate,
  financialChanged = false,
  legacyNullPlansAllowed = false,
  legacyNullPeriodsAllowed = false,
}) => {
  const periods = (appliesToBillingPeriods || []).map((p) => String(p).trim().toLowerCase());
  const validPeriods = periods.filter((p) => p === 'monthly' || p === 'yearly');
  if (!validPeriods.length && !(legacyNullPeriodsAllowed && !isCreate)) {
    throw {
      status: 400,
      message: 'Khuyến mãi tự động phải chọn ít nhất một chu kỳ (monthly hoặc yearly)',
      code: 'VOUCHER_BILLING_PERIOD_REQUIRED',
    };
  }

  const plans = (appliesToPlanCodes || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  if (!plans.length) {
    if (!(legacyNullPlansAllowed && !isCreate)) {
      throw {
        status: 400,
        message: 'Khuyến mãi tự động phải chọn ít nhất một gói công khai đang active',
        code: 'VOUCHER_PLAN_REQUIRED',
      };
    }
  } else {
    const publicCodes = await listPublicPlanCodes();
    const invalid = plans.filter((code) => !publicCodes.has(code));
    if (invalid.length) {
      throw {
        status: 400,
        message: 'Khuyến mãi tự động chỉ áp dụng cho gói công khai đang active',
        code: 'VOUCHER_PLAN_INVALID',
      };
    }
  }

  if ((isCreate || financialChanged) && (!endsAt || new Date(endsAt).getTime() <= Date.now())) {
    throw {
      status: 400,
      message: 'Khuyến mãi tự động mới/sửa rule tài chính phải có ngày kết thúc trong tương lai',
      code: 'VOUCHER_ENDS_AT_REQUIRED',
    };
  }

  return {
    appliesToPlanCodes: plans.length ? plans : null,
    appliesToBillingPeriods: validPeriods.length ? validPeriods : null,
  };
};

export const getPlanAmount = (plan, billingPeriod = 'monthly') => {
  if (billingPeriod === 'yearly' && plan?.price_yearly) return Number(plan.price_yearly);
  return Number(plan?.price || 0);
};

export const calculateVoucherDiscount = (voucher, amount) =>
  withComputedDiscount(voucher, amount).discountAmount;

async function resolveCheckoutAmount({
  planCode,
  billingPeriod = 'monthly',
  amountOverride = null,
  queryable,
}) {
  const normalizedPlanCode = String(planCode || '').trim().toLowerCase();
  if (amountOverride != null && Number.isFinite(Number(amountOverride))) {
    return {
      amount: Math.round(Number(amountOverride)),
      eligibilityPlanCode: normalizedPlanCode || 'custom',
    };
  }
  const plan = await findPlanByCode(planCode, queryable);
  if (!plan) throw { status: 404, message: 'Gói không tồn tại' };
  return {
    amount: getPlanAmount(plan, billingPeriod),
    eligibilityPlanCode: plan.code,
  };
}

export async function validateVoucherForCheckout({
  planCode,
  billingPeriod = 'monthly',
  userId = null,
  userEmail = null,
  code = null,
  autoOnly = false,
  manualOnly = false,
  offerModes = null,
  ignoreMinOrder = false,
  includeIneligible = false,
  /** When set (e.g. self-serve custom plan), skip public-plan lookup and use this amount. */
  amountOverride = null,
  queryable,
  pendingWindowMinutes = getPayosPendingWindowMinutes(),
  mapDto = null,
}) {
  const { amount, eligibilityPlanCode } = await resolveCheckoutAmount({
    planCode,
    billingPeriod,
    amountOverride,
    queryable,
  });

  let modes = offerModes;
  if (!modes) {
    if (code) modes = [...CODE_OFFER_MODES];
    else if (autoOnly) modes = ['automatic'];
    else if (manualOnly) modes = ['public_code'];
  }

  const vouchers = await findEligibleVouchers({
    code,
    offerModes: modes,
    ignoreMinOrder,
    planCode: eligibilityPlanCode,
    billingPeriod,
    amount,
    userId,
    userEmail,
    pendingWindowMinutes,
    queryable,
  });

  const computed = sortDiscountCandidates(
    vouchers
      .map((voucher) => withComputedDiscount(voucher, amount))
      .filter((voucher) => includeIneligible || voucher.isEligible)
  );

  const best = computed.find((voucher) => voucher.isEligible) || null;
  const mappedBest = best ? (mapDto ? mapDto(best) : best) : null;
  const mappedList = mapDto ? computed.map(mapDto) : computed;

  return {
    originalAmount: Math.round(amount),
    voucher: mappedBest,
    vouchers: mappedList,
  };
}

/**
 * Authoritative checkout discount resolver for standard + custom payment.
 * Explicit public/private code wins; otherwise best automatic (standard plans only).
 */
export async function resolveCheckoutDiscount({
  userId = null,
  userEmail = null,
  planCode,
  billingPeriod = 'monthly',
  originalAmount,
  explicitCode = null,
  voucherCodeAlias = null,
  allowAutomatic = true,
  lockForPayment = false,
  queryable,
  pendingWindowMinutes = getPayosPendingWindowMinutes(),
}) {
  const amount = Math.round(Number(originalAmount || 0));
  const eligibilityPlanCode = String(planCode || '').trim().toLowerCase() || 'custom';

  let explicit = String(explicitCode || '').trim();
  const alias = String(voucherCodeAlias || '').trim();

  if (!explicit && alias) {
    const aliasRow = await findActiveVoucherByCode(alias, queryable);
    if (aliasRow && resolveOfferMode(aliasRow) === 'automatic') {
      // Legacy FE sent automatic internal/user-facing code as hint — ignore and pick canonical automatic.
      explicit = '';
    } else {
      explicit = alias;
    }
  }

  const empty = () => ({
    voucher: null,
    discountAmount: 0,
    finalAmount: amount,
    snapshot: buildOrderDiscountSnapshot(null),
    discount: toPaymentDiscountDto({ originalAmount: amount, discountAmount: 0, finalAmount: amount }),
  });

  const lockVoucher = async (voucherIdOrCode, kind) => {
    if (!lockForPayment || !queryable) return;
    if (kind === 'code') {
      await queryable.query(
        `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
        [`voucher-code:${normalizeVoucherCode(voucherIdOrCode)}`, 'redeem']
      );
      return;
    }
    await queryable.query(
      `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
      [`voucher:${voucherIdOrCode}`, 'redeem']
    );
  };

  const loadExplicit = async (code) => {
    await lockVoucher(code, 'code');
    const validation = await validateVoucherForCheckout({
      planCode: eligibilityPlanCode,
      billingPeriod,
      userId,
      userEmail,
      code,
      offerModes: [...CODE_OFFER_MODES],
      amountOverride: amount,
      queryable,
      pendingWindowMinutes,
    });
    if (!validation.voucher) throw { ...VOUCHER_NOT_APPLICABLE };
    await lockVoucher(validation.voucher.id, 'id');
    const recheck = await validateVoucherForCheckout({
      planCode: eligibilityPlanCode,
      billingPeriod,
      userId,
      userEmail,
      code,
      offerModes: [...CODE_OFFER_MODES],
      amountOverride: amount,
      queryable,
      pendingWindowMinutes,
    });
    if (!recheck.voucher || Number(recheck.voucher.id) !== Number(validation.voucher.id)) {
      throw {
        status: 400,
        message: 'Voucher không hợp lệ hoặc đã hết lượt sử dụng',
        code: 'VOUCHER_NOT_APPLICABLE',
      };
    }
    return recheck.voucher;
  };

  const loadAutomatic = async () => {
    if (!allowAutomatic) return null;
    const listed = await validateVoucherForCheckout({
      planCode: eligibilityPlanCode,
      billingPeriod,
      userId,
      userEmail,
      offerModes: ['automatic'],
      amountOverride: amount,
      queryable,
      pendingWindowMinutes,
      includeIneligible: false,
    });
    const candidates = sortDiscountCandidates(listed.vouchers || []).filter(
      (v) => v.isEligible && Number(v.discountAmount || 0) > 0
    );

    for (const candidate of candidates) {
      await lockVoucher(candidate.id, 'id');
      const recheck = await validateVoucherForCheckout({
        planCode: eligibilityPlanCode,
        billingPeriod,
        userId,
        userEmail,
        code: candidate.code,
        offerModes: ['automatic'],
        amountOverride: amount,
        queryable,
        pendingWindowMinutes,
      });
      if (recheck.voucher && Number(recheck.voucher.id) === Number(candidate.id)) {
        return recheck.voucher;
      }
    }
    return null;
  };

  let voucher = null;
  if (explicit) {
    voucher = await loadExplicit(explicit);
  } else {
    voucher = await loadAutomatic();
  }

  if (!voucher) return empty();

  const discountAmount = Number(voucher.discountAmount || 0);
  const finalAmount = Number(voucher.finalAmount || Math.max(0, amount - discountAmount));
  return {
    voucher,
    discountAmount,
    finalAmount,
    snapshot: buildOrderDiscountSnapshot(voucher),
    discount: toPaymentDiscountDto({
      voucher,
      originalAmount: amount,
      discountAmount,
      finalAmount,
    }),
  };
}

export async function listAvailableVouchers(params) {
  if (String(params?.planCode || '').trim().toLowerCase() === 'custom') {
    return {
      originalAmount: Math.round(Number(params?.amountOverride ?? params?.amount ?? 0) || 0),
      voucher: null,
      vouchers: [],
    };
  }
  const result = await validateVoucherForCheckout({
    ...params,
    autoOnly: true,
    mapDto: toAutomaticPreviewDto,
  });
  return result;
}

export async function listCheckoutCodeVouchers(params) {
  return validateVoucherForCheckout({
    ...params,
    manualOnly: true,
    ignoreMinOrder: true,
    includeIneligible: true,
    mapDto: toPublicCodeDto,
  });
}

export async function listPublicActivePromotions({ billingPeriod = 'monthly' } = {}) {
  const plans = await findAllPlans();
  const entries = await Promise.all(
    plans.map(async (plan) => {
      const amount = getPlanAmount(plan, billingPeriod);
      if (amount <= 0) return null;

      const vouchers = await findEligibleVouchers({
        offerModes: ['automatic'],
        planCode: plan.code,
        billingPeriod,
        amount,
      });
      const best = pickBestDiscountCandidate(
        vouchers.map((voucher) => withComputedDiscount(voucher, amount))
      );
      if (!best) return null;
      return [String(plan.code || '').toLowerCase(), best];
    })
  );

  const rawEntries = entries.filter(Boolean);
  const byPlanCode = Object.fromEntries(
    rawEntries.map(([planCode, voucher]) => [planCode, toPublicPromotionDto(voucher)])
  );
  const topPromotion = pickBestDiscountCandidate(rawEntries.map(([, voucher]) => voucher));

  return {
    hasPromotion: rawEntries.length > 0,
    billingPeriod,
    byPlanCode,
    topPromotion: topPromotion ? toPublicPromotionDto(topPromotion) : null,
  };
}

export async function listAdminVouchers({ offerMode = null } = {}) {
  const rows = await findAdminVouchers({ offerMode });
  return rows.map(toAdminVoucherDto);
}

const normalizeVoucherPayload = async (input, { partial = false, current = null } = {}) => {
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if (has('offerMode') && !OFFER_MODES.includes(input.offerMode)) {
    throw { status: 400, message: 'offerMode không hợp lệ', code: 'VOUCHER_OFFER_MODE_INVALID' };
  }

  if (!partial) {
    const offerMode =
      resolveInputOfferMode(input) ||
      (input.autoApply ? 'automatic' : 'public_code');
    let code;
    if (offerMode === 'automatic') {
      code = generateAutomaticVoucherCode();
    } else {
      code = assertUserVoucherCode(input.code);
    }

    let appliesToPlanCodes = normalizeStringArray(input.appliesToPlanCodes) ?? null;
    let appliesToBillingPeriods = normalizeStringArray(input.appliesToBillingPeriods) ?? null;

    if (offerMode === 'automatic') {
      const targets = await assertAutomaticTargets({
        appliesToPlanCodes,
        appliesToBillingPeriods,
        endsAt: normalizeTimestamp(input.endsAt) ?? null,
        isCreate: true,
      });
      appliesToPlanCodes = targets.appliesToPlanCodes;
      appliesToBillingPeriods = targets.appliesToBillingPeriods;
    }

    const payload = {
      code,
      name: String(input.name || '').trim(),
      description: String(input.description || '').trim() || null,
      discountType: input.discountType,
      discountValue: Number(input.discountValue),
      maxDiscountAmount:
        input.discountType === 'percentage' ? toNumberOrNull(input.maxDiscountAmount) : null,
      minOrderAmount: Number(input.minOrderAmount || 0),
      appliesToPlanCodes,
      appliesToBillingPeriods,
      startsAt: normalizeTimestamp(input.startsAt) ?? null,
      endsAt: normalizeTimestamp(input.endsAt) ?? null,
      usageLimit: toNonNegativeIntOrNull(input.usageLimit, 'Tổng lượt dùng'),
      usageLimitPerUser: toNonNegativeIntOrNull(input.usageLimitPerUser, 'Lượt/user'),
      offerMode,
      autoApply: offerModeToAutoApply(offerMode),
      stackable: false,
      isActive: input.isActive !== false,
    };
    assertVoucherPayload(payload);
    return payload;
  }

  const patch = {};
  if (has('offerMode') || has('autoApply')) {
    const mode = resolveInputOfferMode(input);
    if (mode) {
      patch.offerMode = mode;
      patch.autoApply = offerModeToAutoApply(mode);
    }
  }
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
  if (has('isActive')) patch.isActive = input.isActive !== false;
  return patch;
};

const normalizeComparableList = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();

const financialFieldChanged = (key, nextValue, currentValue) => {
  if (key === 'appliesToPlanCodes' || key === 'appliesToBillingPeriods') {
    return JSON.stringify(normalizeComparableList(nextValue)) !==
      JSON.stringify(normalizeComparableList(currentValue));
  }
  if (key === 'startsAt' || key === 'endsAt') {
    const nextTime = nextValue ? new Date(nextValue).getTime() : null;
    const currentTime = currentValue ? new Date(currentValue).getTime() : null;
    return nextTime !== currentTime;
  }
  if (key === 'discountType') {
    return String(nextValue || '') !== String(currentValue || '');
  }
  const nextNumber = nextValue == null || nextValue === '' ? null : Number(nextValue);
  const currentNumber = currentValue == null || currentValue === '' ? null : Number(currentValue);
  return nextNumber !== currentNumber;
};

function assertVoucherPayload(payload) {
  const offerMode = resolveOfferMode(payload);
  if (offerMode !== 'automatic' && !payload.code) {
    throw { status: 400, message: 'Mã voucher không được để trống' };
  }
  if (offerMode !== 'automatic' && payload.code) {
    assertUserVoucherCode(payload.code);
  }
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
    const payload = await normalizeVoucherPayload(input);
    return toAdminVoucherDto(await createVoucher(payload));
  } catch (err) {
    if (err?.code === '23505') throw { status: 409, message: 'Mã voucher đã tồn tại' };
    throw err;
  }
}

export async function updateAdminVoucher(id, input) {
  try {
    const current = await findVoucherById(id);
    if (!current) throw { status: 404, message: 'Không tìm thấy voucher' };

    const hasRef = await voucherHasOrderReference(id);
    const patch = await normalizeVoucherPayload(input, { partial: true, current });

    if (hasRef) {
      if (patch.offerMode && patch.offerMode !== resolveOfferMode(current)) {
        throw {
          status: 400,
          message: 'Không thể đổi loại voucher sau khi voucher đã gắn với đơn hàng',
          code: 'VOUCHER_MODE_LOCKED',
        };
      }
      if (patch.code && normalizeVoucherCode(patch.code) !== normalizeVoucherCode(current.code)) {
        throw {
          status: 400,
          message: 'Không thể đổi mã sau khi voucher đã gắn với đơn hàng',
          code: 'VOUCHER_CODE_LOCKED',
        };
      }
    }

    const nextOfferMode = patch.offerMode || resolveOfferMode(current);
    let nextCode = patch.code ?? current.code;
    if (nextOfferMode === 'automatic') {
      // Keep existing internal code; never accept client-supplied automatic code changes.
      nextCode = current.code;
      if (resolveOfferMode(current) !== 'automatic' && !hasRef) {
        nextCode = generateAutomaticVoucherCode();
      }
    } else if (
      resolveOfferMode(current) === 'automatic' &&
      patch.code &&
      normalizeVoucherCode(patch.code) === normalizeVoucherCode(current.code) &&
      isInternalAutomaticCode(current.code)
    ) {
      throw {
        status: 400,
        message: 'Phải nhập mã voucher mới khi đổi từ khuyến mãi tự động',
        code: 'VOUCHER_INTERNAL_CODE_REUSE',
      };
    } else if (patch.code) {
      nextCode = assertUserVoucherCode(patch.code);
    } else if (resolveOfferMode(current) === 'automatic') {
      // Switching away from automatic without explicit code is not allowed.
      if (!patch.code && Object.prototype.hasOwnProperty.call(input, 'offerMode')) {
        throw { status: 400, message: 'Mã voucher không được để trống' };
      }
    }

    const merged = {
      code: nextCode,
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
      offerMode: nextOfferMode,
      autoApply: offerModeToAutoApply(nextOfferMode),
      stackable: false,
      isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    };

    if (merged.discountType !== 'percentage') {
      merged.maxDiscountAmount = null;
    }

    if (nextOfferMode === 'automatic') {
      const financialChanged = [
        'discountType',
        'discountValue',
        'maxDiscountAmount',
        'minOrderAmount',
        'appliesToPlanCodes',
        'appliesToBillingPeriods',
        'startsAt',
        'endsAt',
      ].some(
        (key) =>
          Object.prototype.hasOwnProperty.call(patch, key) &&
          financialFieldChanged(key, patch[key], current[key])
      );

      const legacyNullPlansAllowed =
        resolveOfferMode(current) === 'automatic' &&
        (current.appliesToPlanCodes == null || current.appliesToPlanCodes.length === 0) &&
        !Object.prototype.hasOwnProperty.call(patch, 'appliesToPlanCodes');
      const legacyNullPeriodsAllowed =
        resolveOfferMode(current) === 'automatic' &&
        (current.appliesToBillingPeriods == null || current.appliesToBillingPeriods.length === 0) &&
        !Object.prototype.hasOwnProperty.call(patch, 'appliesToBillingPeriods');

      const targets = await assertAutomaticTargets({
        appliesToPlanCodes: merged.appliesToPlanCodes,
        appliesToBillingPeriods: merged.appliesToBillingPeriods,
        endsAt: merged.endsAt,
        isCreate: false,
        financialChanged,
        legacyNullPlansAllowed,
        legacyNullPeriodsAllowed,
      });
      merged.appliesToPlanCodes = targets.appliesToPlanCodes;
      merged.appliesToBillingPeriods = targets.appliesToBillingPeriods;
    }

    assertVoucherPayload(merged);

    if (merged.isActive) {
      const conflict = await findActiveVoucherByCode(merged.code);
      if (conflict && Number(conflict.id) !== Number(id)) {
        throw {
          status: 409,
          message: `Mã hiện đang được dùng bởi voucher «${conflict.name}» (ID ${conflict.id}). Đổi mã của voucher này hoặc ngừng voucher kia trước khi khôi phục.`,
          code: 'VOUCHER_CODE_IN_USE',
        };
      }
    }

    const voucher = await updateVoucher(id, merged);
    if (!voucher) throw { status: 404, message: 'Không tìm thấy voucher' };
    return toAdminVoucherDto(voucher);
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
  if (Number(current.usedCount) > 0 || (await voucherHasOrderReference(id))) {
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
    return toAdminVoucherDto(voucher);
  } catch (err) {
    if (err?.code === '23505') {
      throw { status: 409, message: 'Mã voucher đã tồn tại' };
    }
    throw err;
  }
}

export async function validateCheckoutCode(params) {
  const result = await validateVoucherForCheckout({
    ...params,
    offerModes: [...CODE_OFFER_MODES],
    mapDto: toValidatedCodeDto,
  });
  return result;
}
