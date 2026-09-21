import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/**
 * PR cho vietqr-chat-hero-landing.
 * Test logic env fallback + validation — KHÔNG mock DB vì service cần fall
 * through nếu DB fail. Cần setup env var đầy đủ trước.
 */

// Set env TRƯỚC khi import service — service đọc env ngay khi require.
process.env.PAYMENT_BANK_BIN = '970436';
process.env.PAYMENT_BANK_ACCOUNT_NUMBER = '0123456789';
process.env.PAYMENT_BANK_ACCOUNT_NAME = 'TEST USER';
process.env.PAYMENT_BANK_NAME = 'Vietcombank';

const { buildVietQrString, crc16CcittFalse } = await import(
  '../../utils/vietQr.util.js'
);

// Mock DB module — service gọi db.query(), ta ép nó throw hoặc trả []
jest.unstable_mockModule('../../config/database.js', () => ({
  default: {
    query: jest.fn().mockRejectedValue(new Error('TABLE_NOT_EXISTS')),
  },
}));

const { generatePaymentQr, getActivePaymentAccount } = await import(
  '../systemPaymentAccount.service.js'
);

describe('systemPaymentAccount.service (env fallback only)', () => {
  beforeEach(() => {
    // Đảm bảo env vẫn đầy đủ cho mỗi test
    process.env.PAYMENT_BANK_BIN = '970436';
    process.env.PAYMENT_BANK_ACCOUNT_NUMBER = '0123456789';
    process.env.PAYMENT_BANK_ACCOUNT_NAME = 'TEST USER';
    process.env.PAYMENT_BANK_NAME = 'Vietcombank';
  });

  it('getActivePaymentAccount() → fallback env (vì DB mock fail)', async () => {
    const acc = await getActivePaymentAccount();
    expect(acc).not.toBeNull();
    expect(acc.account_name).toBe('TEST USER');
    expect(acc.account_number).toBe('0123456789');
    expect(acc.bank_bin).toBe('970436');
    expect(acc.bank_name).toBe('Vietcombank');
    expect(acc.source).toBe('env');
  });

  it('generatePaymentQr() → trả vietqr_string CRC valid', async () => {
    const out = await generatePaymentQr({
      amount: 150000,
      description: 'TT ABC123',
    });
    expect(out.vietqr_string).toMatch(/^000201010212/);
    expect(out.account.account_name).toBe('TEST USER');
    expect(out.account.bank_bin).toBe('970436');
    expect(out.amount).toBe(150000);
    expect(out.description).toBe('TT ABC123');
    // CRC check
    const body = out.vietqr_string.slice(0, -4);
    const crc = out.vietqr_string.slice(-4);
    expect(crc).toBe(crc16CcittFalse(body));
  });

  it('generatePaymentQr() amount=0 → throw INVALID_AMOUNT 400', async () => {
    let captured;
    try {
      await generatePaymentQr({ amount: 0 });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeDefined();
    expect(captured.code).toBe('INVALID_AMOUNT');
    expect(captured.statusCode).toBe(400);
  });

  it('generatePaymentQr() amount=-100 → throw INVALID_AMOUNT 400', async () => {
    let captured;
    try {
      await generatePaymentQr({ amount: -100 });
    } catch (e) {
      captured = e;
    }
    expect(captured.code).toBe('INVALID_AMOUNT');
  });

  it('generatePaymentQr() amount="abc" → throw INVALID_AMOUNT', async () => {
    let captured;
    try {
      await generatePaymentQr({ amount: 'abc' });
    } catch (e) {
      captured = e;
    }
    expect(captured.code).toBe('INVALID_AMOUNT');
  });

  it('generatePaymentQr() amount=150000.7 → round thành 150001', async () => {
    const out = await generatePaymentQr({ amount: 150000.7 });
    expect(out.amount).toBe(150001);
  });

  it('description: bỏ ký tự lạ, cắt tối đa 50 ký tự', async () => {
    const out = await generatePaymentQr({
      amount: 50000,
      description: 'Thanh toán cho đơn hàng 🎉 ' + 'A'.repeat(60),
    });
    expect(out.description).toMatch(/^[A-Za-z0-9 \-_./]*$/);
    expect(out.description.length).toBeLessThanOrEqual(50);
    // Không chứa emoji
    expect(out.description).not.toMatch(/[^\x20-\x7E]/);
  });

  it('description rỗng → null (không hiển thị)', async () => {
    // service trả safeDescription nguyên si. Khi rỗng/null, frontend hiển thị
    // fallback tuỳ ý — service không ép "THANHTOAN" (để user copy lệnh dễ nhầm).
    const out = await generatePaymentQr({ amount: 50000 });
    expect(out.description).toBeNull();
  });

  it('khứ hồi: generatePaymentQr() === buildVietQrString(env account)', async () => {
    const out = await generatePaymentQr({
      amount: 250000,
      description: 'ORDER99',
    });
    const direct = buildVietQrString({
      bin: '970436',
      accountNumber: '0123456789',
      amount: 250000,
      memo: 'ORDER99',
    });
    expect(out.vietqr_string).toBe(direct);
  });
});

describe('systemPaymentAccount.service — khi env rỗng', () => {
  beforeEach(() => {
    delete process.env.PAYMENT_BANK_BIN;
    delete process.env.PAYMENT_BANK_ACCOUNT_NUMBER;
    delete process.env.PAYMENT_BANK_ACCOUNT_NAME;
    delete process.env.PAYMENT_BANK_NAME;
  });

  it('getActivePaymentAccount() → trả null (DB fail + env rỗng)', async () => {
    const acc = await getActivePaymentAccount();
    expect(acc).toBeNull();
  });

  it('generatePaymentQr() → throw NO_PAYMENT_ACCOUNT 503', async () => {
    let captured;
    try {
      await generatePaymentQr({ amount: 100000 });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeDefined();
    expect(captured.code).toBe('NO_PAYMENT_ACCOUNT');
    expect(captured.statusCode).toBe(503);
  });
});

describe('systemPaymentAccount.service — khi DB có row (mock)', () => {
  beforeEach(() => {
    // Reset mock
    jest.resetModules();
  });

  it('DB trả 1 row active → dùng row đó (không fallback env)', async () => {
    jest.unstable_mockModule('../../config/database.js', () => ({
      default: {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              id: 42,
              account_name: 'FROM DB',
              account_number: '9999999999',
              bank_bin: '970407',
              bank_name: 'Techcombank',
              is_default: true,
            },
          ],
        }),
      },
    }));
    const svc = await import('../systemPaymentAccount.service.js');
    const acc = await svc.getActivePaymentAccount();
    expect(acc.account_name).toBe('FROM DB');
    expect(acc.account_number).toBe('9999999999');
    expect(acc.bank_bin).toBe('970407');
    expect(acc.source).toBe('db');
  });

  it('DB trả row nhưng account_name = "FROM DB", generatePaymentQr dùng row DB', async () => {
    jest.unstable_mockModule('../../config/database.js', () => ({
      default: {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              id: 42,
              account_name: 'FROM DB',
              account_number: '9999999999',
              bank_bin: '970407',
              bank_name: 'Techcombank',
              is_default: true,
            },
          ],
        }),
      },
    }));
    const svc = await import('../systemPaymentAccount.service.js');
    const out = await svc.generatePaymentQr({ amount: 200000 });
    expect(out.account.account_name).toBe('FROM DB');
    expect(out.account.bank_bin).toBe('970407');
    expect(out.vietqr_string).toMatch(/^000201010212/);
    // CRC valid
    const body = out.vietqr_string.slice(0, -4);
    const crc = out.vietqr_string.slice(-4);
    expect(crc).toBe(crc16CcittFalse(body));
  });
});
