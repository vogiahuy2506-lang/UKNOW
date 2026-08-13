import { describe, it, expect } from '@jest/globals';
import {
  assertUserVoucherCode,
  buildOrderDiscountSnapshot,
  calculateVoucherDiscountAmount,
  compareDiscountCandidates,
  pickBestDiscountCandidate,
  resolveOfferMode,
  toPaymentDiscountDto,
  toPublicPromotionDto,
  withComputedDiscount,
} from '../voucherOffer.util.js';

describe('voucherOffer.util', () => {
  it('resolveOfferMode prefers offerMode then legacy autoApply', () => {
    expect(resolveOfferMode({ offerMode: 'private_code' })).toBe('private_code');
    expect(resolveOfferMode({ autoApply: true })).toBe('automatic');
    expect(resolveOfferMode({ auto_apply: false })).toBe('public_code');
  });

  it('assertUserVoucherCode normalizes and rejects invalid codes', () => {
    expect(assertUserVoucherCode(' tet-2027 ')).toBe('TET-2027');
    expect(() => assertUserVoucherCode('ab')).toThrow();
    expect(() => assertUserVoucherCode('bad code')).toThrow();
    expect(assertUserVoucherCode('AUTO_LEGACY')).toBe('AUTO_LEGACY');
  });

  it('calculates percentage with cap and fixed amount', () => {
    expect(
      calculateVoucherDiscountAmount(
        { discountType: 'percentage', discountValue: 20, maxDiscountAmount: 50000 },
        1000000
      )
    ).toBe(50000);
    expect(
      calculateVoucherDiscountAmount({ discountType: 'fixed_amount', discountValue: 30000 }, 100000)
    ).toBe(30000);
  });

  it('tie-breaks equal discount by startsAt then id', () => {
    const a = withComputedDiscount(
      { id: 1, startsAt: '2026-01-01', discountType: 'fixed_amount', discountValue: 10000, minOrderAmount: 0 },
      100000
    );
    const b = withComputedDiscount(
      { id: 2, startsAt: '2026-02-01', discountType: 'fixed_amount', discountValue: 10000, minOrderAmount: 0 },
      100000
    );
    expect(compareDiscountCandidates(a, b)).toBeGreaterThan(0);
    expect(pickBestDiscountCandidate([a, b]).id).toBe(2);
  });

  it('redacts automatic code in public/payment DTOs and order snapshot', () => {
    const voucher = withComputedDiscount(
      {
        id: 9,
        code: 'AUTO_ABCDEF12',
        name: 'Tết 20%',
        offerMode: 'automatic',
        discountType: 'percentage',
        discountValue: 20,
        minOrderAmount: 0,
      },
      100000
    );
    expect(toPublicPromotionDto(voucher).code).toBeUndefined();
    expect(toPublicPromotionDto(voucher).id).toBeUndefined();
    expect(toPaymentDiscountDto({
      voucher,
      originalAmount: 100000,
      discountAmount: voucher.discountAmount,
      finalAmount: voucher.finalAmount,
    }).code).toBeNull();
    expect(buildOrderDiscountSnapshot(voucher)).toMatchObject({
      voucherId: 9,
      voucherCode: null,
      discountSource: 'automatic',
      discountLabel: 'Tết 20%',
    });
  });
});
