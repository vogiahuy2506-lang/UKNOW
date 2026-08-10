import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActivePlanQuotaPause } from '../campaignQuotaPause.helpers.js';

describe('getActivePlanQuotaPause', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hiện khi plan_quota và until > now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00.000Z'));
    const result = getActivePlanQuotaPause({
      quotaDeferredReason: 'plan_quota_email_daily',
      quotaDeferredUntil: '2026-08-10T12:00:00.000Z',
    });
    expect(result).toEqual({
      untilIso: '2026-08-10T12:00:00.000Z',
      untilMs: Date.parse('2026-08-10T12:00:00.000Z'),
      reason: 'plan_quota_email_daily',
    });
  });

  it('không hiện khi until đã qua', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T13:00:00.000Z'));
    expect(getActivePlanQuotaPause({
      quotaDeferredReason: 'plan_quota_email_daily',
      quotaDeferredUntil: '2026-08-10T12:00:00.000Z',
    })).toBeNull();
  });

  it('không hiện với lý do defer khác', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00.000Z'));
    expect(getActivePlanQuotaPause({
      quotaDeferredReason: 'quiet_hours',
      quotaDeferredUntil: '2026-08-10T12:00:00.000Z',
    })).toBeNull();
  });
});
