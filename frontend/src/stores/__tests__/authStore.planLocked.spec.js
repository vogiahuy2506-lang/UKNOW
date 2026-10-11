/**
 * Cổng khoá gói hết hạn (PLAN_CONG_KHOA_GOI_HET_HAN_2026-10-11) — `planLockedCode` trong authStore:
 * api.js ghi mã khi nhận 403 PLAN_EXPIRED / NO_ACTIVE_PLAN; mã được gỡ khi đăng xuất, đổi không gian, hoặc
 * hồ sơ nạp lại cho thấy đã có gói còn hiệu lực (gia hạn xong). Gói chưa từng có / đã thu hồi thì GIỮ mã.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
  setAuthStore: vi.fn(),
}));

const { useAuthStore } = await import('../authStore');

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 1, memberships: [{ ownerId: 7, ownerName: 'Chủ 7', permissions: [] }] },
    isAuthenticated: true,
    activeContext: { type: 'self' },
    planLockedCode: null,
  });
});

describe('authStore.planLockedCode', () => {
  it('mặc định null; setPlanLockedCode ghi mã', () => {
    expect(useAuthStore.getState().planLockedCode).toBeNull();
    useAuthStore.getState().setPlanLockedCode('PLAN_EXPIRED');
    expect(useAuthStore.getState().planLockedCode).toBe('PLAN_EXPIRED');
  });

  it('hồ sơ cho thấy gói còn hiệu lực → gỡ mã khoá (gia hạn xong)', () => {
    useAuthStore.getState().setPlanLockedCode('PLAN_EXPIRED');
    useAuthStore.getState().syncBillingFromProfile({
      activePlanId: 18,
      subscriptionExpiresAt: inDays(20),
      planGracePeriodDays: 0,
    });
    expect(useAuthStore.getState().planLockedCode).toBeNull();
    expect(useAuthStore.getState().billingStatus.isFullyExpired).toBe(false);
  });

  it('hồ sơ vẫn hết hạn → GIỮ mã khoá', () => {
    useAuthStore.getState().setPlanLockedCode('PLAN_EXPIRED');
    useAuthStore.getState().syncBillingFromProfile({
      activePlanId: 18,
      subscriptionExpiresAt: inDays(-1),
      planGracePeriodDays: 0,
    });
    expect(useAuthStore.getState().billingStatus.isFullyExpired).toBe(true);
    expect(useAuthStore.getState().planLockedCode).toBe('PLAN_EXPIRED');
  });

  it('tài khoản không có gói (NO_ACTIVE_PLAN) → nạp lại hồ sơ KHÔNG gỡ mã (tránh nhấp nháy)', () => {
    useAuthStore.getState().setPlanLockedCode('NO_ACTIVE_PLAN');
    useAuthStore.getState().syncBillingFromProfile({ activePlanId: null, subscriptionExpiresAt: null });
    expect(useAuthStore.getState().planLockedCode).toBe('NO_ACTIVE_PLAN');
  });

  it('đổi không gian làm việc (switchContext) → xoá mã', async () => {
    useAuthStore.getState().setPlanLockedCode('PLAN_EXPIRED');
    await useAuthStore.getState().switchContext(7);
    expect(useAuthStore.getState().activeContext.type).toBe('employee');
    expect(useAuthStore.getState().planLockedCode).toBeNull();

    useAuthStore.getState().setPlanLockedCode('PLAN_EXPIRED');
    await useAuthStore.getState().switchContext(null);
    expect(useAuthStore.getState().planLockedCode).toBeNull();
  });

  it('đăng xuất → xoá mã', async () => {
    useAuthStore.getState().setPlanLockedCode('PLAN_EXPIRED');
    await useAuthStore.getState().logout({ skipServer: true });
    expect(useAuthStore.getState().planLockedCode).toBeNull();
  });
});
