import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAiBillingBlockState,
  getSubscriptionUiStatus,
  shouldWarnPlanExpiry,
} from '../subscriptionStatus.util.js';
import { buildBillingStatusFromProfile } from '../billingProfile.util.js';

describe('getSubscriptionUiStatus — tính ngày và trạng thái gói', () => {
  const FIXED_NOW = new Date('2026-09-13T10:00:00+07:00').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('không có gói hoặc không có ngày hết hạn: trả daysUntilExpiry null', () => {
    expect(getSubscriptionUiStatus({ hasPlan: false })).toMatchObject({
      hasPlan: false,
      daysUntilExpiry: null,
      isFullyExpired: false,
    });
    expect(getSubscriptionUiStatus({ hasPlan: true, subscriptionExpiresAt: null })).toMatchObject({
      hasPlan: false,
      daysUntilExpiry: null,
    });
  });

  it('gói còn 4 ngày: daysUntilExpiry = 4, chưa hết hạn, không ân hạn', () => {
    // 4 ngày sau: 2026-09-17T10:00:00+07:00
    const expiresAt = new Date(FIXED_NOW + 4 * 86400000).toISOString();
    const status = getSubscriptionUiStatus({ hasPlan: true, subscriptionExpiresAt: expiresAt });
    expect(status.daysUntilExpiry).toBe(4);
    expect(status.isFullyExpired).toBe(false);
    expect(status.isInGracePeriod).toBe(false);
  });

  it('gói còn 3 ngày: daysUntilExpiry = 3', () => {
    const expiresAt = new Date(FIXED_NOW + 3 * 86400000).toISOString();
    const status = getSubscriptionUiStatus({ hasPlan: true, subscriptionExpiresAt: expiresAt });
    expect(status.daysUntilExpiry).toBe(3);
    expect(status.isFullyExpired).toBe(false);
  });

  it('gói còn 12 tiếng: daysUntilExpiry = 1 (Math.ceil)', () => {
    const expiresAt = new Date(FIXED_NOW + 12 * 3600000).toISOString();
    const status = getSubscriptionUiStatus({ hasPlan: true, subscriptionExpiresAt: expiresAt });
    expect(status.daysUntilExpiry).toBe(1);
    expect(status.isFullyExpired).toBe(false);
  });

  it('quá hạn 1 ngày với ân hạn = 0: isFullyExpired = true, isInGracePeriod = false (mọi gói production)', () => {
    const expiresAt = new Date(FIXED_NOW - 1 * 86400000).toISOString();
    const status = getSubscriptionUiStatus({
      hasPlan: true,
      subscriptionExpiresAt: expiresAt,
      gracePeriodDays: 0,
    });
    expect(status.daysUntilExpiry).toBe(-1);
    expect(status.isFullyExpired).toBe(true);
    expect(status.isInGracePeriod).toBe(false);
    expect(status.graceDaysLeft).toBe(0);
  });

  it('quá hạn 1 ngày với ân hạn = 3: isInGracePeriod = true, graceDaysLeft = 2, isFullyExpired = false (Ca 8)', () => {
    const expiresAt = new Date(FIXED_NOW - 1 * 86400000).toISOString();
    const status = getSubscriptionUiStatus({
      hasPlan: true,
      subscriptionExpiresAt: expiresAt,
      gracePeriodDays: 3,
    });
    expect(status.daysUntilExpiry).toBe(-1);
    expect(status.isInGracePeriod).toBe(true);
    expect(status.isFullyExpired).toBe(false);
    expect(status.graceDaysLeft).toBe(2);
  });

  it('quá hạn 4 ngày với ân hạn = 3: isFullyExpired = true, isInGracePeriod = false', () => {
    const expiresAt = new Date(FIXED_NOW - 4 * 86400000).toISOString();
    const status = getSubscriptionUiStatus({
      hasPlan: true,
      subscriptionExpiresAt: expiresAt,
      gracePeriodDays: 3,
    });
    expect(status.daysUntilExpiry).toBe(-4);
    expect(status.isFullyExpired).toBe(true);
    expect(status.isInGracePeriod).toBe(false);
  });
});

describe('buildBillingStatusFromProfile — planRevokedAfterExpiry (Mục 3.2b)', () => {
  const FIXED_NOW = new Date('2026-09-13T10:00:00+07:00').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sau khi cron thu hồi: activePlanId = null, subscriptionExpiresAt quá khứ → planRevokedAfterExpiry = true (Ca 9b)', () => {
    const profile = {
      activePlanId: null,
      subscriptionExpiresAt: new Date(FIXED_NOW - 2 * 86400000).toISOString(),
      planGracePeriodDays: 0,
    };
    const status = buildBillingStatusFromProfile(profile);
    expect(status.planRevokedAfterExpiry).toBe(true);
    // isFullyExpired từ getSubscriptionUiStatus là false vì hasPlan false, nhưng planRevokedAfterExpiry bắt đúng lỗ hổng
    expect(status.isFullyExpired).toBe(false);
  });

  it('tài khoản chưa từng có gói: subscriptionExpiresAt null → planRevokedAfterExpiry = false (Ca 9c)', () => {
    const profile = {
      activePlanId: null,
      subscriptionExpiresAt: null,
    };
    const status = buildBillingStatusFromProfile(profile);
    expect(status.planRevokedAfterExpiry).toBe(false);
  });

  it('tài khoản đang có gói active: planRevokedAfterExpiry = false', () => {
    const profile = {
      activePlanId: 'pro',
      subscriptionExpiresAt: new Date(FIXED_NOW + 10 * 86400000).toISOString(),
    };
    const status = buildBillingStatusFromProfile(profile);
    expect(status.planRevokedAfterExpiry).toBe(false);
  });
});

describe('shouldWarnPlanExpiry — hàm thuần kiểm tra điều kiện popup cảnh báo', () => {
  it('trả false khi billingStatus là null hoặc rỗng', () => {
    expect(shouldWarnPlanExpiry(null)).toBe(false);
    expect(shouldWarnPlanExpiry({})).toBe(false);
  });

  it('Ca 1: còn 4 ngày → false (chưa đến ngưỡng cảnh báo)', () => {
    expect(shouldWarnPlanExpiry({
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 4,
    })).toBe(false);
  });

  it('Ca 2: còn 3 ngày → true (đạt ngưỡng cảnh báo)', () => {
    expect(shouldWarnPlanExpiry({
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 3,
    })).toBe(true);
  });

  it('còn 1 ngày → true', () => {
    expect(shouldWarnPlanExpiry({
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 1,
    })).toBe(true);
  });

  it('Ca 8: trong ân hạn (isInGracePeriod = true) → true', () => {
    expect(shouldWarnPlanExpiry({
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: true,
      daysUntilExpiry: -1,
    })).toBe(true);
  });

  it('Ca 9: đã hết hạn hoàn toàn (isFullyExpired = true) → true', () => {
    expect(shouldWarnPlanExpiry({
      hasPlan: true,
      isFullyExpired: true,
      isInGracePeriod: false,
      daysUntilExpiry: -1,
    })).toBe(true);
  });

  it('Ca 9b: sau khi cron thu hồi (planRevokedAfterExpiry = true, isFullyExpired = false) → true', () => {
    expect(shouldWarnPlanExpiry({
      hasPlan: false,
      isFullyExpired: false,
      isInGracePeriod: false,
      planRevokedAfterExpiry: true,
      daysUntilExpiry: null,
    })).toBe(true);
  });

  it('Ca 9c: chưa từng có gói (mọi cờ đều false, daysUntilExpiry null) → false', () => {
    expect(shouldWarnPlanExpiry({
      hasPlan: false,
      isFullyExpired: false,
      isInGracePeriod: false,
      planRevokedAfterExpiry: false,
      daysUntilExpiry: null,
    })).toBe(false);
  });
});

describe('getAiBillingBlockState', () => {
  const billingOk = { isFullyExpired: false };

  it('trả null cho admin', () => {
    expect(getAiBillingBlockState({
      isAdmin: true,
      billingStatus: billingOk,
      aiCredits: { used: 100, limit: 10 },
    })).toBeNull();
  });

  it('trả expired khi gói hết hạn hoàn toàn', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: { isFullyExpired: true },
      aiCredits: { used: 0, limit: 100 },
    })).toEqual({ type: 'expired' });
  });

  it('trả credits khi hết hạn mức gói và ví rỗng', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: billingOk,
      aiCredits: { used: 100, limit: 100 },
      walletRemaining: 0,
    })).toEqual({ type: 'credits' });
  });

  it('không chặn khi hết hạn mức gói nhưng ví còn credit', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: billingOk,
      aiCredits: { used: 100, limit: 100 },
      walletRemaining: 5,
    })).toBeNull();
  });

  it('không chặn khi còn hạn mức gói', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: billingOk,
      aiCredits: { used: 50, limit: 100 },
      walletRemaining: 0,
    })).toBeNull();
  });
});
