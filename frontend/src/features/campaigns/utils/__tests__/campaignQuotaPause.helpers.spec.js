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
      accountName: null,
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

  it('trả về accountName khi kind=zalo có zaloDeferredAccountName', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    const result = getActiveRunPause({
      zaloOutboundDeferredUntil: '2026-09-02T11:00:00.000Z',
      zaloDeferredReason: 'phone_lookup_cooldown',
      zaloDeferredAccountName: 'SIM1-DIGISO',
    });
    expect(result).toEqual({
      untilIso: '2026-09-02T11:00:00.000Z',
      untilMs: Date.parse('2026-09-02T11:00:00.000Z'),
      reason: 'phone_lookup_cooldown',
      kind: 'zalo',
      accountName: 'SIM1-DIGISO',
    });
  });

  it('trả về accountName: null khi kind=zalo không có zaloDeferredAccountName', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    const result = getActiveRunPause({
      zaloOutboundDeferredUntil: '2026-09-02T11:00:00.000Z',
      zaloDeferredReason: 'quiet_hours',
    });
    expect(result?.accountName).toBeNull();
  });
});

describe('getRunPauseI18nKey', () => {
  it('map đúng key cho từng kind và reason', () => {
    expect(getRunPauseI18nKey('zalo')).toBe('campaignRun.zaloPausedUntil');
    expect(getRunPauseI18nKey('plan_quota')).toBe('campaignRun.quotaPausedUntil');
    expect(getRunPauseI18nKey('other')).toBe('campaignRun.quotaPausedUntil');
  });

  it('với zalo: map đúng 3 nhóm lý do hoãn mới (PR-A)', () => {
    // 1. Cooldown tra số (cá nhân, api error, all pool)
    expect(getRunPauseI18nKey('zalo', 'phone_lookup_cooldown')).toBe('campaignRun.zaloPhoneLookupPausedUntil');
    expect(getRunPauseI18nKey('zalo', 'phone_lookup_cooldown_api_error')).toBe('campaignRun.zaloPhoneLookupPausedUntil');
    expect(getRunPauseI18nKey('zalo', 'all_accounts_phone_lookup_cooldown')).toBe('campaignRun.zaloPhoneLookupPausedUntil');
    expect(getRunPauseI18nKey({ kind: 'zalo', reason: 'phone_lookup_cooldown' })).toBe('campaignRun.zaloPhoneLookupPausedUntil');

    // 2. Khung giờ yên lặng
    expect(getRunPauseI18nKey('zalo', 'quiet_hours')).toBe('campaignRun.zaloQuietHoursUntil');
    expect(getRunPauseI18nKey({ kind: 'zalo', reason: 'quiet_hours' })).toBe('campaignRun.zaloQuietHoursUntil');

    // 3. Chạm trần tin/giờ
    expect(getRunPauseI18nKey('zalo', 'rate_limited')).toBe('campaignRun.zaloRateLimitedUntil');
    expect(getRunPauseI18nKey({ kind: 'zalo', reason: 'rate_limited' })).toBe('campaignRun.zaloRateLimitedUntil');

    // 4. Khác: giữ zaloPausedUntil
    expect(getRunPauseI18nKey('zalo', 'other_reason')).toBe('campaignRun.zaloPausedUntil');
    expect(getRunPauseI18nKey({ kind: 'zalo', reason: '' })).toBe('campaignRun.zaloPausedUntil');
  });

  it('với non_continuous: all_recipients_waiting_next_due trả về waitingNextDueUntil, không ra SMTP', () => {
    expect(
      getRunPauseI18nKey('non_continuous', 'all_recipients_waiting_next_due')
    ).toBe('campaignRun.waitingNextDueUntil');
    expect(
      getRunPauseI18nKey({ kind: 'non_continuous', reason: 'all_recipients_waiting_next_due' })
    ).toBe('campaignRun.waitingNextDueUntil');
  });

  it('với non_continuous: các lý do SMTP giữ smtpPausedUntil', () => {
    expect(getRunPauseI18nKey('non_continuous', 'smtp_rate_limited')).toBe('campaignRun.smtpPausedUntil');
    expect(getRunPauseI18nKey('non_continuous', 'smtp_daily_quota')).toBe('campaignRun.smtpPausedUntil');
    expect(getRunPauseI18nKey({ kind: 'non_continuous', reason: 'smtp_auth_error' })).toBe('campaignRun.smtpPausedUntil');
  });

  it('với non_continuous: reason rỗng hoặc không xác định trả về chuỗi trung tính genericPausedUntil', () => {
    expect(getRunPauseI18nKey('non_continuous')).toBe('campaignRun.genericPausedUntil');
    expect(getRunPauseI18nKey('non_continuous', '')).toBe('campaignRun.genericPausedUntil');
    expect(getRunPauseI18nKey('non_continuous', 'some_unknown_reason')).toBe('campaignRun.genericPausedUntil');
    expect(getRunPauseI18nKey({ kind: 'non_continuous', reason: '' })).toBe('campaignRun.genericPausedUntil');
  });
});


