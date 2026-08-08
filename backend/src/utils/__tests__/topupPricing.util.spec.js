import { describe, it, expect } from '@jest/globals';
import {
  validateTopupQuantities,
  computeTopupPrice,
  checkTopupZaloCapacity,
  resolveMaxTopupMonths,
  filterAllowedTopupMonths,
  resolveTopupMonths,
  TOPUP_MIN_ORDER_AMOUNT,
} from '../topupPricing.util.js';

const pricingRows = [
  { item_key: 'zalo_messages', unit_price: 100, min_qty: 50, step_qty: 50, max_qty: null, is_active: true, sort_order: 10 },
  { item_key: 'emails', unit_price: 20, min_qty: 250, step_qty: 250, max_qty: 50000, is_active: true, sort_order: 20 },
  { item_key: 'ai_credits', unit_price: 200, min_qty: 25, step_qty: 25, max_qty: 5000, is_active: true, sort_order: 30 },
  { item_key: 'zalo_accounts', unit_price: 50000, min_qty: 1, step_qty: 1, max_qty: 50, is_active: true, sort_order: 40 },
  { item_key: 'chatbots', unit_price: 100000, min_qty: 1, step_qty: 1, max_qty: 100, is_active: true, sort_order: 70 },
];

describe('topupPricing.util', () => {
  describe('computeTopupPrice — linear, no block ceil', () => {
    it('300 tin Zalo = 30.000đ (không làm tròn lên khối)', () => {
      const priced = computeTopupPrice(pricingRows, { zalo_messages: 300 });
      expect(priced.total).toBe(30000);
      expect(priced.items).toHaveLength(1);
      expect(priced.items[0].subtotal).toBe(30000);
    });

    it('300 Zalo + 1000 email + 50 AI = 60.000đ', () => {
      const priced = computeTopupPrice(pricingRows, {
        zalo_messages: 300,
        emails: 1000,
        ai_credits: 50,
      });
      expect(priced.total).toBe(60000);
      expect(priced.meetsMinimum).toBe(true);
      expect(priced.shortfall).toBe(0);
    });

    it('100 tin Zalo = 10.000đ — dưới tối thiểu đơn', () => {
      const priced = computeTopupPrice(pricingRows, { zalo_messages: 100 });
      expect(priced.total).toBe(10000);
      expect(priced.meetsMinimum).toBe(false);
      expect(priced.shortfall).toBe(TOPUP_MIN_ORDER_AMOUNT - 10000);
    });

    it('đơn trộn: tin không nhân months, slot chatbot nhân 12', () => {
      const priced = computeTopupPrice(
        pricingRows,
        { zalo_messages: 500, chatbots: 1 },
        12
      );
      expect(priced.items.find((i) => i.itemKey === 'zalo_messages').subtotal).toBe(50000);
      expect(priced.items.find((i) => i.itemKey === 'chatbots').subtotal).toBe(1_200_000);
      expect(priced.total).toBe(1_250_000);
    });
  });

  describe('resolveMaxTopupMonths / allowedMonths', () => {
    it('ân hạn → maxMonths = 0', () => {
      const past = new Date(Date.now() - 86400000);
      expect(resolveMaxTopupMonths({
        expiresAt: past,
        isInGracePeriod: true,
      })).toBe(0);
      expect(filterAllowedTopupMonths(0)).toEqual([]);
    });

    it('gói còn 40 ngày → maxMonths = 1', () => {
      const expiresAt = new Date(Date.now() + 40 * 86400000);
      expect(resolveMaxTopupMonths({ expiresAt, isInGracePeriod: false })).toBe(1);
      expect(filterAllowedTopupMonths(1)).toEqual([1]);
    });

    it('gói còn 25 ngày → maxMonths = 1 (sàn)', () => {
      const expiresAt = new Date(Date.now() + 25 * 86400000);
      expect(resolveMaxTopupMonths({ expiresAt, isInGracePeriod: false })).toBe(1);
    });
  });

  describe('resolveTopupMonths', () => {
    it('ân hạn + mua slot → GRACE_NO_STRUCTURAL', () => {
      const result = resolveTopupMonths({
        rawMonths: 1,
        quantities: { zalo_accounts: 1 },
        subscription: {
          expiresAt: new Date(Date.now() - 86400000),
          isInGracePeriod: true,
        },
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('GRACE_NO_STRUCTURAL');
    });

    it('ân hạn + chỉ mua tin → cho qua, months=1', () => {
      const result = resolveTopupMonths({
        rawMonths: 12,
        quantities: { zalo_messages: 500 },
        subscription: {
          expiresAt: new Date(Date.now() - 86400000),
          isInGracePeriod: true,
        },
      });
      expect(result.ok).toBe(true);
      expect(result.months).toBe(1);
      expect(result.hasStructural).toBe(false);
    });

    it('gói còn 40 ngày chọn 12 tháng → từ chối', () => {
      const result = resolveTopupMonths({
        rawMonths: 12,
        quantities: { zalo_accounts: 1 },
        subscription: {
          expiresAt: new Date(Date.now() + 40 * 86400000),
          isInGracePeriod: false,
        },
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('MONTHS_NOT_ALLOWED');
      expect(result.maxMonths).toBe(1);
    });
  });

  describe('validateTopupQuantities', () => {
    it('320 tin Zalo → lỗi bước 50', () => {
      const result = validateTopupQuantities(pricingRows, { zalo_messages: 320 });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('bước'))).toBe(true);
    });

    it('qty=0 được phép (không mua hạng mục đó)', () => {
      const result = validateTopupQuantities(pricingRows, {
        zalo_messages: 0,
        emails: 2500,
        ai_credits: 0,
      });
      expect(result.ok).toBe(true);
      expect(result.quantities.emails).toBe(2500);
      expect(result.quantities.zalo_messages).toBe(0);
    });

    it('hạng mục lạ → lỗi', () => {
      const result = validateTopupQuantities(pricingRows, { foo: 1 });
      expect(result.ok).toBe(false);
    });
  });

  describe('checkTopupZaloCapacity — trừ hạn mức đã cấp, không trừ đã gửi', () => {
    it('1 TK · plan 8000 · mua 10000 → chặn (còn 8000 slot)', () => {
      const result = checkTopupZaloCapacity({
        accounts: 1,
        capacityPerAccount: 16000,
        planMonthlyZaloLimit: 8000,
        existingZaloGrants: 0,
        requestedQty: 10000,
      });
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(8000);
    });

    it('1 TK · hạn đã đủ 16000 · chưa gửi tin nào → remaining 0', () => {
      const result = checkTopupZaloCapacity({
        accounts: 1,
        capacityPerAccount: 16000,
        planMonthlyZaloLimit: 16000,
        existingZaloGrants: 0,
        requestedQty: 50,
      });
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('trừ grant cũ khỏi remaining', () => {
      const result = checkTopupZaloCapacity({
        accounts: 1,
        capacityPerAccount: 16000,
        planMonthlyZaloLimit: 8000,
        existingZaloGrants: 3000,
        requestedQty: 6000,
      });
      expect(result.remaining).toBe(5000);
      expect(result.ok).toBe(false);
    });

    it('plan unlimited → không mua thêm Zalo', () => {
      const result = checkTopupZaloCapacity({
        accounts: 2,
        planMonthlyZaloLimit: null,
        requestedQty: 50,
      });
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('0 slot tài khoản → remaining 0 (không còn bắt buộc đã kết nối)', () => {
      const result = checkTopupZaloCapacity({
        accounts: 0,
        capacityPerAccount: 16000,
        planMonthlyZaloLimit: 8000,
        requestedQty: 50,
      });
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.code).toBe('ZALO_NO_SLOT');
      expect(result.message).toMatch(/slot tài khoản Zalo/i);
    });

    it('có slot gói dù chưa nối → cho phép mua trong remaining', () => {
      const result = checkTopupZaloCapacity({
        accounts: 1,
        capacityPerAccount: 16000,
        planMonthlyZaloLimit: 8000,
        existingZaloGrants: 0,
        requestedQty: 50,
      });
      expect(result.ok).toBe(true);
      expect(result.remaining).toBe(8000);
    });
  });
});
