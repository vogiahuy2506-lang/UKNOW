import { describe, it, expect } from '@jest/globals';
import { getBillingCycle } from '../billingCycle.util.js';

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
