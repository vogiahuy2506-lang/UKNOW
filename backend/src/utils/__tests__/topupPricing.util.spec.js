import { describe, it, expect } from '@jest/globals';
import {
  validateTopupQuantities,
  computeTopupPrice,
  checkTopupZaloCapacity,
  TOPUP_MIN_ORDER_AMOUNT,
} from '../topupPricing.util.js';

const pricingRows = [
  { item_key: 'zalo_messages', unit_price: 100, min_qty: 50, step_qty: 50, max_qty: null, is_active: true, sort_order: 10 },
  { item_key: 'emails', unit_price: 20, min_qty: 250, step_qty: 250, max_qty: 50000, is_active: true, sort_order: 20 },
  { item_key: 'ai_credits', unit_price: 200, min_qty: 25, step_qty: 25, max_qty: 5000, is_active: true, sort_order: 30 },
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

    it('0 tài khoản đã nối → remaining 0 + hướng dẫn kết nối', () => {
      const result = checkTopupZaloCapacity({
        accounts: 0,
        capacityPerAccount: 16000,
        planMonthlyZaloLimit: 8000,
        requestedQty: 50,
      });
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.code).toBe('ZALO_NOT_CONNECTED');
      expect(result.message).toMatch(/kết nối tài khoản Zalo/i);
    });
  });
});
