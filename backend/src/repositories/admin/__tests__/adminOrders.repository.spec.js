import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = { query: jest.fn() };

jest.unstable_mockModule('../../../config/database.js', () => ({ default: mockDb }));

const { findOrders, setOrderCancelled, markPaidAfterCancelledHandled } = await import('../adminOrders.repository.js');

describe('adminOrders.repository.findOrders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns billing period, payment and voucher snapshot without duplicating rows', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ orderCode: '100', billingPeriod: 'yearly', voucherCode: 'VIP' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const result = await findOrders({ page: 1, limit: 20 });
    expect(result.rows[0].billingPeriod).toBe('yearly');
    expect(result.rows[0].voucherCode).toBe('VIP');
    expect(result.total).toBe(1);

    const [listQuery] = mockDb.query.mock.calls[0];
    expect(listQuery).toContain('o.billing_period AS "billingPeriod"');
    expect(listQuery).toContain('o.payment_method AS "paymentMethod"');
    expect(listQuery).toContain('LEFT JOIN LATERAL');
    expect(listQuery).toContain('voucher_redemptions');
  });

  it('keeps voucher search condition available to both list and count queries', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await findOrders({ search: 'SIHUB100', page: 1, limit: 20 });
    const [listQuery] = mockDb.query.mock.calls[0];
    const [countQuery] = mockDb.query.mock.calls[1];
    expect(listQuery).toContain('redemption.voucher_code');
    expect(countQuery).toContain('LEFT JOIN LATERAL');
    expect(countQuery).toContain('redemption.voucher_code');
  });
});

// PR-4 (đợt rà soát 26/09) — race webhook/admin: UPDATE phải atomic, chỉ đổi được hàng còn
// 'pending', không được đè lên 'success' mà webhook vừa claim xong giữa lúc service kiểm và
// lúc repository ghi.
describe('adminOrders.repository.setOrderCancelled', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chỉ UPDATE khi status hiện tại là pending và trả về hàng đã đổi', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, order_code: '999', status: 'cancelled' }] });

    const res = await setOrderCancelled('999');

    expect(res).toEqual({ id: 5, order_code: '999', status: 'cancelled' });
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(sql).toContain("AND status = 'pending'");
    expect(sql).toContain('RETURNING');
    expect(params).toEqual(['999']);
  });

  it('trả về null khi đơn đã bị đổi khỏi pending (webhook race) — KHÔNG được đè', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await setOrderCancelled('999');

    expect(res).toBeNull();
  });
});

// "Nợ nhỏ" PR-4 (26/09) — đánh dấu đã xử lý tay cho đơn PAID_AFTER_CANCELLED, KHÔNG đổi status.
describe('adminOrders.repository.markPaidAfterCancelledHandled', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chỉ UPDATE khi note đã có tag gốc và chưa được đánh dấu xử lý — KHÔNG đổi status', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 5, order_code: '999', status: 'cancelled', note: 'PAID_AFTER_CANCELLED\nHANDLED note' }],
    });

    const res = await markPaidAfterCancelledHandled('999', 'HANDLED note');

    expect(res.status).toBe('cancelled');
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(sql).toContain("note LIKE '%PAID_AFTER_CANCELLED%'");
    expect(sql).toContain("NOT LIKE '%PAID_AFTER_CANCELLED_HANDLED%'");
    expect(sql).not.toContain('status =');
    expect(sql).toContain('RETURNING');
    expect(params).toEqual(['999', 'HANDLED note']);
  });

  it('trả về null khi đơn không có tag PAID_AFTER_CANCELLED hoặc đã được đánh dấu xử lý trước đó', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await markPaidAfterCancelledHandled('999', 'HANDLED note');

    expect(res).toBeNull();
  });
});
