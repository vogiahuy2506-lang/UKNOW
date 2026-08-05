import { describe, expect, it } from '@jest/globals';
import { assertOnceCronNotYearRolled } from '../onceScheduleValidation.util.js';

describe('assertOnceCronNotYearRolled', () => {
  // 2026-06-15 12:00 Asia/Ho_Chi_Minh = 05:00 UTC
  const now = new Date('2026-06-15T05:00:00.000Z');

  it('rejects once cron for a day/month already past this year (year rollover)', () => {
    // 10:00 on 15 April — this year already passed → next is 2027-04-15 (~10 months)
    const result = assertOnceCronNotYearRolled('0 10 15 4 *', now);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/năm sau|tương lai/i);
  });

  it('allows once cron for tomorrow', () => {
    const result = assertOnceCronNotYearRolled('0 10 16 6 *', now);
    expect(result.ok).toBe(true);
  });

  it('allows once cron ~1 minute ahead (after_delay path)', () => {
    const result = assertOnceCronNotYearRolled('1 12 15 6 *', now);
    expect(result.ok).toBe(true);
  });

  it('allows near year-boundary short hops (Dec 31 → Jan 1)', () => {
    const nye = new Date('2026-12-31T10:00:00.000Z'); // 17:00 Hanoi Dec 31
    const result = assertOnceCronNotYearRolled('0 10 1 1 *', nye);
    expect(result.ok).toBe(true);
  });

  it('allows far future still within this year', () => {
    // From June, December same year
    const result = assertOnceCronNotYearRolled('0 10 15 12 *', now);
    expect(result.ok).toBe(true);
  });
});
