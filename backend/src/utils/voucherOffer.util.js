import crypto from 'crypto';

export const OFFER_MODES = Object.freeze(['public_code', 'private_code', 'automatic']);
export const CODE_OFFER_MODES = Object.freeze(['public_code', 'private_code']);

const USER_CODE_RE = /^[A-Z0-9_-]{4,64}$/;

export function resolveOfferMode(row = {}) {
  const raw = row.offerMode ?? row.offer_mode;
  if (OFFER_MODES.includes(raw)) return raw;
  if (row.autoApply === true || row.auto_apply === true) return 'automatic';
  return 'public_code';
}

export function offerModeToAutoApply(offerMode) {
  return resolveOfferMode({ offerMode }) === 'automatic';
}

export function normalizeUserVoucherCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function assertUserVoucherCode(code) {
  const normalized = normalizeUserVoucherCode(code);
  if (!USER_CODE_RE.test(normalized)) {
    throw {
      status: 400,
      message: 'Mã voucher phải gồm 4–64 ký tự A-Z, 0-9, _ hoặc -',
      code: 'VOUCHER_CODE_INVALID',
    };
  }
  return normalized;
}

export function generateAutomaticVoucherCode() {
  return `AUTO_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

export function isInternalAutomaticCode(code) {
  return /^AUTO_[A-Z0-9]+$/.test(normalizeUserVoucherCode(code));
}

export function calculateVoucherDiscountAmount(voucher, amount) {
  const base = Number(amount || 0);
  if (!voucher || base <= 0) return 0;

  let discount = 0;
  const value = Number(voucher.discountValue ?? voucher.discount_value ?? 0);
  const discountType = voucher.discountType ?? voucher.discount_type;
  if (discountType === 'percentage') {
    discount = Math.floor((base * value) / 100);
    const maxRaw = voucher.maxDiscountAmount ?? voucher.max_discount_amount;
    const max = maxRaw === '' || maxRaw == null ? null : Number(maxRaw);
    if (max != null && Number.isFinite(max)) discount = Math.min(discount, max);
  } else if (discountType === 'fixed_amount') {
    discount = value;
  }

  return Math.max(0, Math.min(base, Math.round(discount)));
}

export function withComputedDiscount(voucher, amount) {
  const originalAmount = Math.round(Number(amount || 0));
  const minOrderAmount = Number(voucher.minOrderAmount ?? voucher.min_order_amount ?? 0);
  const discountAmount = calculateVoucherDiscountAmount(voucher, amount);
  const isEligible = originalAmount >= minOrderAmount && discountAmount > 0;
  const offerMode = resolveOfferMode(voucher);
  return {
    ...voucher,
    offerMode,
    autoApply: offerMode === 'automatic',
    minOrderAmount,
    discountAmount,
    isEligible,
    finalAmount: isEligible ? Math.max(0, originalAmount - discountAmount) : originalAmount,
  };
}

/** Best discount first; tie-break startsAt DESC then id DESC. */
export function compareDiscountCandidates(a, b) {
  if (Boolean(a.isEligible) !== Boolean(b.isEligible)) {
    return a.isEligible ? -1 : 1;
  }
  const dA = Number(a.discountAmount || 0);
  const dB = Number(b.discountAmount || 0);
  if (dB !== dA) return dB - dA;

  const startA = a.startsAt ? new Date(a.startsAt).getTime() : 0;
  const startB = b.startsAt ? new Date(b.startsAt).getTime() : 0;
  if (startB !== startA) return startB - startA;

  return Number(b.id || 0) - Number(a.id || 0);
}

export function sortDiscountCandidates(vouchers) {
  return [...(vouchers || [])].sort(compareDiscountCandidates);
}

export function pickBestDiscountCandidate(vouchers) {
  const sorted = sortDiscountCandidates(vouchers).filter((v) => v.isEligible !== false && Number(v.discountAmount || 0) > 0);
  return sorted[0] || null;
}

function sanitizeText(value, maxLen = 500) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLen);
}

export function toAdminVoucherDto(voucher) {
  if (!voucher) return null;
  const offerMode = resolveOfferMode(voucher);
  return {
    ...voucher,
    offerMode,
    autoApply: offerMode === 'automatic',
  };
}

export function toAutomaticPreviewDto(voucher) {
  if (!voucher) return null;
  const offerMode = resolveOfferMode(voucher);
  return {
    id: voucher.id,
    offerMode,
    name: sanitizeText(voucher.name, 160),
    description: sanitizeText(voucher.description, 500),
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    maxDiscountAmount: voucher.maxDiscountAmount ?? null,
    minOrderAmount: Number(voucher.minOrderAmount || 0),
    discountAmount: Number(voucher.discountAmount || 0),
    finalAmount: Number(voucher.finalAmount || 0),
    isEligible: voucher.isEligible !== false,
    startsAt: voucher.startsAt || null,
    endsAt: voucher.endsAt || null,
  };
}

export function toPublicCodeDto(voucher) {
  if (!voucher) return null;
  return {
    ...toAutomaticPreviewDto(voucher),
    offerMode: 'public_code',
    code: normalizeUserVoucherCode(voucher.code),
  };
}

/** Exact validate response may include public or private code the user typed. */
export function toValidatedCodeDto(voucher) {
  if (!voucher) return null;
  const offerMode = resolveOfferMode(voucher);
  return {
    ...toAutomaticPreviewDto(voucher),
    offerMode,
    code: CODE_OFFER_MODES.includes(offerMode) ? normalizeUserVoucherCode(voucher.code) : null,
  };
}

export function toPublicPromotionDto(voucher) {
  if (!voucher) return null;
  const { id: _internalId, ...dto } = toAutomaticPreviewDto(voucher);
  return {
    ...dto,
    offerMode: 'automatic',
    discountPercent:
      voucher.discountType === 'percentage' ? Number(voucher.discountValue || 0) : null,
  };
}

export function toPaymentDiscountDto({
  voucher = null,
  originalAmount = 0,
  discountAmount = 0,
  finalAmount = 0,
} = {}) {
  if (!voucher || Number(discountAmount || 0) <= 0) {
    return {
      source: null,
      name: null,
      code: null,
      originalAmount: Math.round(Number(originalAmount || 0)),
      discountAmount: 0,
      finalAmount: Math.round(Number(finalAmount || originalAmount || 0)),
    };
  }
  const offerMode = resolveOfferMode(voucher);
  return {
    source: offerMode,
    name: sanitizeText(voucher.name, 160),
    code: offerMode === 'automatic' ? null : normalizeUserVoucherCode(voucher.code),
    originalAmount: Math.round(Number(originalAmount || 0)),
    discountAmount: Math.round(Number(discountAmount || 0)),
    finalAmount: Math.round(Number(finalAmount || 0)),
  };
}

export function buildOrderDiscountSnapshot(voucher) {
  if (!voucher) {
    return {
      voucherId: null,
      voucherCode: null,
      discountSource: null,
      discountLabel: null,
      discountAmount: 0,
    };
  }
  const offerMode = resolveOfferMode(voucher);
  return {
    voucherId: voucher.id,
    voucherCode: offerMode === 'automatic' ? null : normalizeUserVoucherCode(voucher.code),
    discountSource: offerMode,
    discountLabel: sanitizeText(voucher.name, 160),
    discountAmount: Number(voucher.discountAmount || 0),
  };
}

export function auditVoucherMeta(voucher, extra = {}) {
  if (!voucher) return { ...extra };
  const offerMode = resolveOfferMode(voucher);
  return {
    voucherId: voucher.id,
    offerMode,
    name: sanitizeText(voucher.name, 160),
    ...extra,
  };
}

export const VOUCHER_NOT_APPLICABLE = Object.freeze({
  status: 400,
  message: 'Voucher không hợp lệ hoặc không đủ điều kiện',
  code: 'VOUCHER_NOT_APPLICABLE',
});
