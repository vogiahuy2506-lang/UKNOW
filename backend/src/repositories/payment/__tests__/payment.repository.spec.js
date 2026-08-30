import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const {
  findUserIdByEmail,
  hasSuccessfulOrderForPlanByUser,
  activateUserPlan,
  lockUserForPaidPlanFulfillment,
  findNewerSuccessfulPlanEntitlement,
  findNewerSuccessfulPlanCheckout,
  cancelRecentPendingPlanOrders,
  cancelRecentPendingTopupOrders,
  findRecentPendingPlanOrders,
} = await import('../payment.repository.js');

describe('payment.repository ownership and activation invariants', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('resolves a legacy order email without depending on letter casing', async () => {
    query.mockResolvedValue({ rows: [{ id: 90 }] });

    await expect(findUserIdByEmail('NhatTuongSuRiNguyen@gmail.com')).resolves.toBe(90);

    expect(query).toHaveBeenCalledWith(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      ['NhatTuongSuRiNguyen@gmail.com'],
    );
  });

  it('only uses email ownership fallback for legacy orders without user_id', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await hasSuccessfulOrderForPlanByUser({
      planId: 13,
      userId: 90,
      userEmail: 'nhantuongsuringuyen@gmail.com',
      queryable,
    });

    const [sql, params] = queryable.query.mock.calls[0];
    expect(sql).toContain('AND user_id IS NULL');
    expect(sql).toContain('LOWER(user_email) = LOWER($3)');
    expect(params).toEqual([13, 90, 'nhantuongsuringuyen@gmail.com']);
  });

  it('throws if activation UPDATE cannot find both a user and a plan', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await expect(activateUserPlan(90, 13, 'yearly', queryable)).rejects.toThrow(
      'Không thể kích hoạt gói 13 cho tài khoản 90',
    );
  });

  it('locks the entitlement row before reading competing checkouts', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await lockUserForPaidPlanFulfillment({
      userId: 90,
      queryable,
    });

    const [sql, params] = queryable.query.mock.calls[0];
    expect(sql).toContain('FOR UPDATE');
    expect(sql).not.toContain('FROM orders');
    expect(params).toEqual([90]);
  });

  it('reads a newer activated entitlement in a fresh statement after the lock', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await findNewerSuccessfulPlanEntitlement({ userId: 90, orderId: 161, queryable });

    const [sql, params] = queryable.query.mock.calls[0];
    expect(sql).toContain('o.id > $2');
    expect(sql).toContain("o.status IN ('paid', 'success', 'completed')");
    expect(sql).toContain('FROM scheduled_plan_changes spc');
    expect(sql).toContain("spc.status = 'activated'");
    expect(sql).toContain('spc.order_id > $2');
    expect(sql).toContain("scheduled_order.note = 'scheduled_change'");
    expect(sql).toContain('o.user_id IS NULL');
    expect(params).toEqual([90, 161]);
  });

  it('includes newer successful scheduled checkouts when guarding scheduled fulfillment', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await findNewerSuccessfulPlanCheckout({ userId: 90, orderId: 161, queryable });

    const [sql, params] = queryable.query.mock.calls[0];
    expect(sql).toContain('o.id > $2');
    expect(sql).not.toContain("o.note IS DISTINCT FROM 'scheduled_change'");
    expect(sql).toContain('o.note IS DISTINCT FROM \'topup\'');
    expect(params).toEqual([90, 161]);
  });

  it('only cancels plan checkouts older than the replacement order', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await cancelRecentPendingPlanOrders({
      userId: 90,
      userEmail: 'user@example.com',
      planId: 15,
      billingPeriod: 'yearly',
      olderThanOrderId: 250,
      queryable,
    });

    const [sql, params] = queryable.query.mock.calls[0];
    expect(sql).toContain('($7::bigint IS NULL OR id < $7)');
    expect(params[6]).toBe(250);
  });

  it('finds only replaceable pending plan orders without mutating them', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [{ id: 249, order_code: 9000 }] }) };

    await expect(findRecentPendingPlanOrders({
      userId: 90,
      userEmail: 'user@example.com',
      planId: 15,
      billingPeriod: 'yearly',
      queryable,
    })).resolves.toEqual([{ id: 249, order_code: 9000 }]);

    const [sql] = queryable.query.mock.calls[0];
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('user_id IS NULL AND LOWER(user_email)');
    expect(sql).not.toContain('UPDATE orders');
  });

  it('only cancels top-up checkouts older than the replacement order', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await cancelRecentPendingTopupOrders({
      userId: 90,
      olderThanOrderId: 251,
      queryable,
    });

    const [sql, params] = queryable.query.mock.calls[0];
    expect(sql).toContain('($4::bigint IS NULL OR id < $4)');
    expect(params[3]).toBe(251);
  });
});
