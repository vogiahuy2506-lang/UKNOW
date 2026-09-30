import { describe, it, expect } from '@jest/globals';
import {
  validateTopupQuantities,
  computeTopupPrice,
  checkTopupZaloCapacity,
  checkTopupChannelCapacity,
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

    it('đơn trộn: tin không nhân months, slot chatbot và storage_gb nhân 12', () => {
      const extendedPricingRows = [
        ...pricingRows,
        { item_key: 'storage_gb', unit_price: 25000, min_qty: 5, step_qty: 5, max_qty: 200, is_active: true, sort_order: 90 },
      ];
      const priced = computeTopupPrice(
        extendedPricingRows,
        { zalo_messages: 500, chatbots: 1, storage_gb: 10 },
        12
      );
      expect(priced.items.find((i) => i.itemKey === 'zalo_messages').subtotal).toBe(50000);
      expect(priced.items.find((i) => i.itemKey === 'chatbots').subtotal).toBe(1_200_000);
      expect(priced.items.find((i) => i.itemKey === 'storage_gb').subtotal).toBe(10 * 25000 * 12);
      expect(priced.total).toBe(50000 + 1_200_000 + 3_000_000);
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

describe('topupPricing.util — P6 slot tài khoản Telegram/WhatsApp', () => {
  it('telegram_accounts/whatsapp_accounts là món CẤU TRÚC (hết hạn theo tháng, nhân months, cần months hợp lệ)', async () => {
    const { TOPUP_STRUCTURAL_KEYS } = await import('../topupPricing.util.js');
    expect(TOPUP_STRUCTURAL_KEYS).toEqual(expect.arrayContaining(['telegram_accounts', 'whatsapp_accounts']));
    const rows = [
      ...pricingRows,
      { item_key: 'telegram_accounts', unit_price: 50000, min_qty: 1, step_qty: 1, max_qty: 50, is_active: true, sort_order: 41 },
    ];
    const priced = computeTopupPrice(rows, { telegram_accounts: 2 }, 3);
    expect(priced.total).toBe(2 * 50000 * 3);
    expect(priced.items[0]).toMatchObject({ itemKey: 'telegram_accounts', months: 3, subtotal: 300000 });
  });

  it('TOPUP_GRANT_KEY_BY_RESOURCE: cổng TẠO tài khoản (userResourceLimit) cộng grant slot vào trần', async () => {
    const { TOPUP_GRANT_KEY_BY_RESOURCE } = await import('../topupPricing.util.js');
    expect(TOPUP_GRANT_KEY_BY_RESOURCE.telegramAccounts).toBe('telegram_accounts');
    expect(TOPUP_GRANT_KEY_BY_RESOURCE.whatsappAccounts).toBe('whatsapp_accounts');
  });
});

// P11 — năng lực tin lẻ theo số tài khoản cho Telegram/WhatsApp (cùng khuôn Zalo).
describe('checkTopupChannelCapacity (P11)', () => {
  it('WhatsApp · 2 TK · gói 8000 · mua 24050 → chặn, còn 24000, mã WHATSAPP_CAPACITY_EXCEEDED, thông điệp có "WhatsApp"', () => {
    const r = checkTopupChannelCapacity({
      channel: 'whatsapp', accounts: 2, capacityPerAccount: 16000, planMonthlyLimit: 8000, existingGrants: 0, requestedQty: 24050,
    });
    expect(r).toMatchObject({ ok: false, remaining: 24000, code: 'WHATSAPP_CAPACITY_EXCEEDED', channel: 'whatsapp' });
    expect(r.message).toContain('WhatsApp');
  });

  it('đúng bằng phần còn lại → ok', () => {
    const r = checkTopupChannelCapacity({
      channel: 'telegram', accounts: 2, capacityPerAccount: 16000, planMonthlyLimit: 8000, requestedQty: 24000,
    });
    expect(r).toMatchObject({ ok: true, remaining: 24000 });
  });

  it('accounts 0 → WHATSAPP_NO_SLOT; TELEGRAM_NO_SLOT', () => {
    expect(checkTopupChannelCapacity({ channel: 'whatsapp', accounts: 0, planMonthlyLimit: 100, requestedQty: 50 }))
      .toMatchObject({ ok: false, code: 'WHATSAPP_NO_SLOT' });
    expect(checkTopupChannelCapacity({ channel: 'telegram', accounts: 0, planMonthlyLimit: 100, requestedQty: 50 }))
      .toMatchObject({ ok: false, code: 'TELEGRAM_NO_SLOT' });
  });

  it('gói NULL (không giới hạn) → remaining 0, ok chỉ khi requested 0', () => {
    expect(checkTopupChannelCapacity({ channel: 'telegram', accounts: 3, planMonthlyLimit: null, requestedQty: 0 }))
      .toMatchObject({ ok: true, remaining: 0 });
    const r = checkTopupChannelCapacity({ channel: 'telegram', accounts: 3, planMonthlyLimit: null, requestedQty: 50 });
    expect(r).toMatchObject({ ok: false, remaining: 0 });
    expect(r.message).toContain('Telegram');
  });

  it('trừ grant cũ; kênh lạ ném lỗi', () => {
    expect(checkTopupChannelCapacity({ channel: 'telegram', accounts: 1, planMonthlyLimit: 8000, existingGrants: 3000, requestedQty: 1 }).remaining).toBe(5000);
    expect(() => checkTopupChannelCapacity({ channel: 'email', accounts: 1, planMonthlyLimit: 1 })).toThrow();
  });

  it('checkTopupZaloCapacity vẫn trả field cũ (planMonthlyZaloLimit, không có channel)', () => {
    const r = checkTopupZaloCapacity({ accounts: 1, planMonthlyZaloLimit: 8000, requestedQty: 10000 });
    expect(r.planMonthlyZaloLimit).toBe(8000);
    expect(r).not.toHaveProperty('channel');
    expect(r).not.toHaveProperty('code');
    expect(r.remaining).toBe(8000);
    expect(checkTopupZaloCapacity({ accounts: 0, planMonthlyZaloLimit: 8000, requestedQty: 50 }).code).toBe('ZALO_NO_SLOT');
  });
});
