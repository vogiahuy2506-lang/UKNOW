import { describe, it, expect, jest } from '@jest/globals';
import {
  getBillingCycle,
  computeBillingWindow,
  findCurrentPlanActivation,
  resolveBillingUserId,
} from '../billingCycle.util.js';

describe('billingCycle.util', () => {
  it('returns empty cycle when userId is missing', async () => {
    const cycle = await getBillingCycle(null);
    expect(cycle.hasPlan).toBe(false);
    expect(cycle.cycleStart).toBeNull();
    expect(cycle.cycleEnd).toBeNull();
  });

  it('ignores a stored anchor after expiry and resolves the activation event', async () => {
    const now = Date.now();
    const invalidAnchor = new Date(now - 2 * 86400000);
    const expiry = new Date(now - 3 * 86400000);
    const activation = new Date(now - 10 * 86400000);
    const queryable = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ effective_plan_id: 15 }] })
        .mockResolvedValueOnce({ rows: [{
          effective_plan_id: 15,
          plan_activated_at: invalidAnchor,
          subscription_expires_at: expiry,
          created_at: new Date(now - 30 * 86400000),
          duration_days: 30,
        }] })
        .mockResolvedValueOnce({ rows: [{ activation_at: activation, billing_period: 'yearly' }] }),
    };

    const cycle = await getBillingCycle(90, {}, queryable);
    expect(cycle.hasPlan).toBe(true);
    expect(cycle.cycleStart.getTime()).toBe(activation.getTime());
    expect(queryable.query).toHaveBeenCalledTimes(3);
  });

  it('uses a past activation event when the stored anchor is in the future', async () => {
    const now = Date.now();
    const futureAnchor = new Date(now + 2 * 86400000);
    const activation = new Date(now - 5 * 86400000);
    const queryable = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ effective_plan_id: 15 }] })
        .mockResolvedValueOnce({ rows: [{
          effective_plan_id: 15,
          plan_activated_at: futureAnchor,
          subscription_expires_at: new Date(now + 365 * 86400000),
          created_at: new Date(now - 30 * 86400000),
          duration_days: 30,
        }] })
        .mockResolvedValueOnce({ rows: [{ activation_at: activation, billing_period: 'yearly' }] }),
    };

    const cycle = await getBillingCycle(90, {}, queryable);
    expect(cycle.cycleStart.getTime()).toBe(activation.getTime());
    expect(queryable.query).toHaveBeenCalledTimes(3);
  });

  it('uses activation evidence for a past anchor produced by expiry minus duration', async () => {
    const now = Date.now();
    const activation = new Date(now - 340 * 86400000);
    const expiry = new Date(now + 25 * 86400000);
    const pastButWrongAnchor = new Date(expiry.getTime() - 30 * 86400000);
    const queryable = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ effective_plan_id: 15 }] })
        .mockResolvedValueOnce({ rows: [{
          effective_plan_id: 15,
          plan_activated_at: pastButWrongAnchor,
          subscription_expires_at: expiry,
          created_at: new Date(now - 365 * 86400000),
          duration_days: 30,
        }] })
        .mockResolvedValueOnce({ rows: [{ activation_at: activation, billing_period: 'yearly' }] }),
    };

    const cycle = await getBillingCycle(90, {}, queryable);
    const expected = computeBillingWindow(activation, 30, new Date(now));

    expect(cycle.cycleStart.getTime()).toBe(expected.cycleStart.getTime());
    expect(cycle.cycleStart.getTime()).not.toBe(pastButWrongAnchor.getTime());
    expect(queryable.query).toHaveBeenCalledTimes(3);
  });

  it('does not restore entitlement from a historical order when active_plan_id is missing', async () => {
    const queryable = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ effective_plan_id: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{
          effective_plan_id: null,
          plan_activated_at: null,
          subscription_expires_at: new Date(Date.now() - 86400000),
          created_at: new Date(Date.now() - 30 * 86400000),
          duration_days: 30,
        }] }),
    };

    const cycle = await getBillingCycle(90, {}, queryable);

    expect(cycle.hasPlan).toBe(false);
    expect(queryable.query.mock.calls[0][0]).not.toContain('FROM orders');
  });

  it('uses an active owner for an employee even when the employee has historical orders', async () => {
    const queryable = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ effective_plan_id: null }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 42 }] }),
    };

    await expect(resolveBillingUserId(90, {}, queryable)).resolves.toBe(42);
    expect(queryable.query.mock.calls[0][0]).not.toContain('FROM orders');
  });

  it('uses checkout intent across direct/scheduled events and only preserves legacy evidence over an older direct checkout', async () => {
    const queryable = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    await findCurrentPlanActivation(90, queryable);

    const [query, params] = queryable.query.mock.calls[0];
    expect(query).toContain('spc.id::bigint AS event_id');
    expect(query).toContain('o.id::bigint AS event_id');
    expect(query).toContain('spc.order_id::bigint AS checkout_order_id');
    expect(query).toContain('direct.event_id AS checkout_order_id');
    expect(query).toContain('latest_direct_order AS');
    expect(query).toContain('ORDER BY o.id DESC');
    expect(query).toContain('COALESCE(o.created_at, o.paid_at) AS checkout_created_at');
    expect(query).toContain("source = 'scheduled'");
    expect(query).toContain('AND checkout_order_id IS NULL');
    expect(query).toContain('NOT EXISTS (SELECT 1 FROM latest_direct_order)');
    expect(query).toContain('(SELECT checkout_created_at FROM latest_direct_order) <= activation_at');
    expect(query).toContain('checkout_order_id DESC NULLS LAST');
    expect(params).toEqual([90]);
  });
});

describe('computeBillingWindow (PR-3 Forward 30-day Counting from plan_activated_at)', () => {
  it('mua gói tháng 20/08/2026: chu kỳ đầu đúng 30 ngày (20/08 -> 19/09)', () => {
    const activatedAt = '2026-08-20T00:00:00.000Z';
    const now = new Date('2026-08-20T12:00:00.000Z');
    const { cycleStart, cycleEnd } = computeBillingWindow(activatedAt, 30, now);

    expect(cycleStart.toISOString()).toBe('2026-08-20T00:00:00.000Z');
    // 20/08 + 30 days (August has 31 days) -> 19/09
    expect(cycleEnd.toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(cycleStart.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(cycleEnd.getTime()).toBeGreaterThan(now.getTime());
  });

  it('mua gói năm 20/08/2026: kiểm tra sau 5 ngày (25/08) vẫn thuộc chu kỳ đầu (không bị reset sớm 5 ngày)', () => {
    const activatedAt = '2026-08-20T00:00:00.000Z';
    const now = new Date('2026-08-25T00:00:00.000Z');
    const { cycleStart, cycleEnd } = computeBillingWindow(activatedAt, 30, now);

    // Chu kỳ vẫn là 20/08 -> 19/09
    expect(cycleStart.toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(cycleEnd.toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(cycleStart.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(cycleEnd.getTime()).toBeGreaterThan(now.getTime());
  });

  it('tiến sang chu kỳ thứ 2 (ngày thứ 32): tự động tính cycleStart = 19/09, cycleEnd = 19/10', () => {
    const activatedAt = '2026-08-20T00:00:00.000Z';
    const now = new Date('2026-09-21T00:00:00.000Z');
    const { cycleStart, cycleEnd } = computeBillingWindow(activatedAt, 30, now);

    expect(cycleStart.toISOString()).toBe('2026-09-19T00:00:00.000Z');
    // 19/09 + 30 days (September has 30 days) -> 19/10
    expect(cycleEnd.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(cycleStart.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(cycleEnd.getTime()).toBeGreaterThan(now.getTime());
  });

  it('gói năm chu kỳ 12 (sau 360 ngày): phần lẻ 5 ngày nằm ở cuối chu kỳ năm', () => {
    const activatedAt = '2026-08-20T00:00:00.000Z';
    // 360 ngày sau ngày kích hoạt: 12 * 30 = 360 ngày
    const now = new Date(new Date(activatedAt).getTime() + 361 * 86400000);
    const { cycleStart, cycleEnd } = computeBillingWindow(activatedAt, 30, now);

    const expectedStart = new Date(new Date(activatedAt).getTime() + 12 * 30 * 86400000);
    expect(cycleStart.getTime()).toBe(expectedStart.getTime());
    expect(cycleEnd.getTime()).toBe(expectedStart.getTime() + 30 * 86400000);
  });

  it('xử lý an toàn khi now trước anchorStart (chênh lệch đồng hồ mili-giây)', () => {
    const activatedAt = new Date('2026-08-20T10:00:00.000Z');
    const now = new Date('2026-08-20T09:59:59.000Z');
    const { cycleStart, cycleEnd } = computeBillingWindow(activatedAt, 30, now);

    expect(cycleStart.toISOString()).toBe('2026-08-20T10:00:00.000Z');
    expect(cycleEnd.toISOString()).toBe('2026-09-19T10:00:00.000Z');
  });
});
