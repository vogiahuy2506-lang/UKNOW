import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getActivePlanQuotaPause,
  getActiveRunPause,
  getRunPauseI18nKey,
} from '../campaignQuotaPause.helpers.js';

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

  it('vẫn trả null khi chỉ có nonContinuousDeferredReason (như run 366)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    expect(getActivePlanQuotaPause({
      nonContinuousDeferredAt: '2026-09-02T03:46:01.650Z',
      nonContinuousDeferredUntil: '2026-09-02T14:51:40.000Z',
      nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
    })).toBeNull();
  });
});

describe('getActiveRunPause', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('nhận diện đúng metadata thật của run 366 (kind=non_continuous)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    const run366Metadata = {
      nonContinuousDeferredAt: '2026-09-02T03:46:01.650Z',
      nonContinuousDeferredUntil: '2026-09-02T14:51:40.000Z',
      nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
    };
    const result = getActiveRunPause(run366Metadata);
    expect(result).toEqual({
      untilIso: '2026-09-02T14:51:40.000Z',
      untilMs: Date.parse('2026-09-02T14:51:40.000Z'),
      reason: 'all_recipients_waiting_next_due',
      kind: 'non_continuous',
    });
  });

  it('không hiện khi nonContinuousDeferredUntil đã qua giờ', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T15:00:00.000Z'));
    const run366Metadata = {
      nonContinuousDeferredAt: '2026-09-02T03:46:01.650Z',
      nonContinuousDeferredUntil: '2026-09-02T14:51:40.000Z',
      nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
    };
    expect(getActiveRunPause(run366Metadata)).toBeNull();
  });

  it('không văng lỗi JS và trả null khi until = "khong-phai-ngay"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    expect(getActiveRunPause({
      nonContinuousDeferredUntil: 'khong-phai-ngay',
      nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
    })).toBeNull();
  });

  it('ưu tiên zaloOutboundDeferredUntil khi có cả zalo và quota', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    const result = getActiveRunPause({
      zaloOutboundDeferredUntil: '2026-09-02T11:00:00.000Z',
      zaloDeferredReason: 'quiet_hours',
      quotaDeferredUntil: '2026-09-02T12:00:00.000Z',
      quotaDeferredReason: 'plan_quota_zalo_daily',
    });
    expect(result).toEqual({
      untilIso: '2026-09-02T11:00:00.000Z',
      untilMs: Date.parse('2026-09-02T11:00:00.000Z'),
      reason: 'quiet_hours',
      kind: 'zalo',
    });
  });

  it('ưu tiên nonContinuousDeferredUntil hơn quotaDeferredUntil', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    const result = getActiveRunPause({
      nonContinuousDeferredUntil: '2026-09-02T14:00:00.000Z',
      nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
      quotaDeferredUntil: '2026-09-02T12:00:00.000Z',
      quotaDeferredReason: 'plan_quota_email_daily',
    });
    expect(result?.kind).toBe('non_continuous');
  });

  it('trả về null khi runMetadata là null hoặc rỗng', () => {
    expect(getActiveRunPause(null)).toBeNull();
    expect(getActiveRunPause({})).toBeNull();
  });
});

describe('getRunPauseI18nKey', () => {
  it('map đúng key cho từng kind', () => {
    expect(getRunPauseI18nKey('zalo')).toBe('campaignRun.zaloPausedUntil');
    expect(getRunPauseI18nKey('non_continuous')).toBe('campaignRun.smtpPausedUntil');
    expect(getRunPauseI18nKey('plan_quota')).toBe('campaignRun.quotaPausedUntil');
    expect(getRunPauseI18nKey('other')).toBe('campaignRun.quotaPausedUntil');
  });
});

