import { describe, it, expect } from '@jest/globals';
import { getBillingCycle, computeBillingWindow } from '../billingCycle.util.js';

describe('billingCycle.util', () => {
  it('cycleStart equals cycleEnd minus duration_days', async () => {
    const cycleEnd = new Date('2026-07-01T00:00:00.000Z');
    const durationDays = 30;
    const cycleStart = new Date(cycleEnd);
    cycleStart.setUTCDate(cycleStart.getUTCDate() - durationDays);

    expect(cycleStart.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('returns empty cycle when userId is missing', async () => {
    const cycle = await getBillingCycle(null);
    expect(cycle.hasPlan).toBe(false);
    expect(cycle.cycleStart).toBeNull();
    expect(cycle.cycleEnd).toBeNull();
  });
});

describe('computeBillingWindow', () => {
  it('uses anchor window directly when now is inside it', () => {
    const now = new Date('2026-07-15T00:00:00.000Z');
    const { cycleStart, cycleEnd } = computeBillingWindow('2026-08-01T00:00:00.000Z', 30, now);
    expect(cycleStart.toISOString()).toBe('2026-07-02T00:00:00.000Z');
    expect(cycleEnd.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(cycleStart.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it('steps window back when expiry is more than one cycle ahead of now', () => {
    // expiry 1/8, now 1/7 → cửa sổ [2/7,1/8] không chứa 1/7 → phải lùi về [2/6,2/7]
    const now = new Date('2026-07-01T00:00:00.000Z');
    const { cycleStart, cycleEnd } = computeBillingWindow('2026-08-01T00:00:00.000Z', 30, now);
    expect(cycleStart.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(cycleEnd.getTime()).toBeGreaterThan(now.getTime());
    expect(cycleStart.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    expect(cycleEnd.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });

  it('handles expiry far in the future (annual anchor) so now is always inside window', () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const { cycleStart, cycleEnd } = computeBillingWindow('2027-06-01T00:00:00.000Z', 30, now);
    expect(cycleStart.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(cycleEnd.getTime()).toBeGreaterThan(now.getTime());
  });
});
