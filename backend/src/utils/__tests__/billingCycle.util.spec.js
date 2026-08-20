import { describe, it, expect } from '@jest/globals';
import { getBillingCycle, computeBillingWindow } from '../billingCycle.util.js';

describe('billingCycle.util', () => {
  it('returns empty cycle when userId is missing', async () => {
    const cycle = await getBillingCycle(null);
    expect(cycle.hasPlan).toBe(false);
    expect(cycle.cycleStart).toBeNull();
    expect(cycle.cycleEnd).toBeNull();
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
