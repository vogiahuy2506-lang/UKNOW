import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetSubscriptionStatus = jest.fn();
const mockResolveBillingUserId = jest.fn();
const mockGetBillingCycle = jest.fn();
const mockGetWalletSnapshot = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../subscriptionStatus.util.js', () => ({
  getSubscriptionStatus: mockGetSubscriptionStatus,
}));

jest.unstable_mockModule('../billingCycle.util.js', () => ({
  EFFECTIVE_PLAN_ID_SQL: 'u.active_plan_id',
  resolveBillingUserId: mockResolveBillingUserId,
  getBillingCycle: mockGetBillingCycle,
}));

jest.unstable_mockModule('../../services/payment/topupWallet.service.js', () => ({
  hasWalletRemaining: jest.fn(async () => false),
  WALLET_ITEM_BY_CHANNEL: { email: 'emails', zalo: 'zalo_messages' },
  maybeDebitWalletForSend: jest.fn(),
  getWalletSnapshot: mockGetWalletSnapshot,
}));

const {
  checkSendQuota,
  _clearQuotaCache,
} = await import('../userSendLimit.util.js');

const activeSubscription = {
  hasPlan: true,
  expiresAt: new Date(Date.now() + 86400000),
  graceDays: 0,
  graceUntil: null,
  isExpired: false,
  isInGracePeriod: false,
};

const planRow = (overrides = {}) => ({
  daily_email_limit: null,
  monthly_email_limit: null,
  daily_zalo_limit: null,
  monthly_zalo_limit: null,
  messages_per_period: null,
  ...overrides,
});

describe('sendQuotaPolicy Contract Specification (PR-Q0)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetSubscriptionStatus.mockReset();
    mockResolveBillingUserId.mockReset();
    mockGetBillingCycle.mockReset();
    mockGetWalletSnapshot.mockReset();

    mockGetSubscriptionStatus.mockResolvedValue(activeSubscription);
    mockResolveBillingUserId.mockImplementation(async (userId) => userId);
    mockGetBillingCycle.mockResolvedValue({
      hasPlan: true,
      cycleStart: new Date('2026-01-01T00:00:00.000Z'),
      cycleEnd: new Date('2026-01-31T00:00:00.000Z'),
      billingUserId: 10,
    });
    mockGetWalletSnapshot.mockResolvedValue({ remaining: 0 });
    _clearQuotaCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Tier 0: Admin Bypass Contract', () => {
    it('bypasses send quota for admin role on email channel without DB queries', async () => {
      const result = await checkSendQuota({ userId: 1, channel: 'email', roleCode: 'admin' });
      expect(result).toEqual({
        allowed: true,
        limit: null,
        currentCount: 0,
        message: null,
        resetAt: null,
        limitType: null,
        billingUserId: null,
      });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockResolveBillingUserId).not.toHaveBeenCalled();
    });

    it('bypasses send quota for admin role on zalo channel without DB queries', async () => {
      const result = await checkSendQuota({ userId: 1, channel: 'zalo', roleCode: 'admin' });
      expect(result).toEqual({
        allowed: true,
        limit: null,
        currentCount: 0,
        message: null,
        resetAt: null,
        limitType: null,
        billingUserId: null,
      });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockResolveBillingUserId).not.toHaveBeenCalled();
    });
  });

  describe('Tier 1: Employee Limits Policy Contract', () => {
    it('denies inactive employee with employee_inactive limitType', async () => {
      mockResolveBillingUserId.mockResolvedValueOnce(100);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'inactive', daily_email_limit: 10, monthly_email_limit: 100 }],
      });

      const result = await checkSendQuota({
        userId: 2,
        channel: 'email',
        ownerContextId: 100,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('employee_inactive');
      expect(result.limit).toBe(0);
      expect(result.message).toMatch(/tạm khóa|không còn trong workspace/i);
    });

    it('denies employee when daily limit is 0 (disabled)', async () => {
      mockResolveBillingUserId.mockResolvedValueOnce(100);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'active', daily_email_limit: 0, monthly_email_limit: 100 }],
      });

      const result = await checkSendQuota({
        userId: 2,
        channel: 'email',
        ownerContextId: 100,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('employee');
      expect(result.limit).toBe(0);
      expect(result.message).toMatch(/hạn mức gửi email trong ngày của bạn là 0/i);
    });

    it('denies employee when daily send count reaches employee limit', async () => {
      mockResolveBillingUserId.mockResolvedValueOnce(100);
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'active', daily_email_limit: 5, monthly_email_limit: 100 }],
        })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });

      const result = await checkSendQuota({
        userId: 2,
        channel: 'email',
        ownerContextId: 100,
        requiredCount: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('employee');
      expect(result.limit).toBe(5);
      expect(result.currentCount).toBe(5);
      expect(result.message).toMatch(/giới hạn gửi email trong ngày của nhân viên/i);
    });

    it('denies employee when monthly send count reaches employee limit', async () => {
      mockResolveBillingUserId.mockResolvedValueOnce(100);
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'active', daily_email_limit: null, monthly_email_limit: 20 }],
        })
        .mockResolvedValueOnce({ rows: [{ total: 20 }] });

      const result = await checkSendQuota({
        userId: 2,
        channel: 'email',
        ownerContextId: 100,
        requiredCount: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('employee');
      expect(result.limit).toBe(20);
      expect(result.currentCount).toBe(20);
      expect(result.message).toMatch(/giới hạn gửi email trong tháng của nhân viên/i);
    });
  });

  describe('Tier 2: Workspace Subscription & Plan Limits Contract', () => {
    it('denies when subscription is expired', async () => {
      mockGetSubscriptionStatus.mockResolvedValueOnce({
        hasPlan: true,
        isExpired: true,
      });

      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('expired');
      expect(result.message).toMatch(/hết hạn/i);
    });

    it('denies when workspace has no plan joined', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('no_plan');
      expect(result.message).toMatch(/chưa có gói/i);
    });

    it('denies when daily limit is 0 (channel disabled in plan)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planRow({ daily_zalo_limit: 0 })] });

      const result = await checkSendQuota({ userId: 10, channel: 'zalo' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('disabled');
      expect(result.limit).toBe(0);
      expect(result.message).toMatch(/không được hỗ trợ/i);
    });

    it('denies when daily send count reaches workspace limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 50 })] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] });

      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('daily');
      expect(result.limit).toBe(50);
      expect(result.currentCount).toBe(50);
      expect(result.message).toMatch(/giới hạn gửi email trong ngày/i);
    });
  });

  describe('Tier 3: Monthly Limit & Top-up Wallet Availability Contract', () => {
    it('denies when monthly limit reached and no wallet credits available', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ monthly_email_limit: 100 })] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });
      mockGetWalletSnapshot.mockResolvedValueOnce({ remaining: 0 });

      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('monthly');
      expect(result.limit).toBe(100);
      expect(result.currentCount).toBe(100);
      expect(result.message).toMatch(/giới hạn gửi email trong tháng/i);
    });

    it('allows pre-flight when monthly limit reached but top-up wallet has sufficient balance', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ monthly_email_limit: 100 })] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });
      mockGetWalletSnapshot.mockResolvedValueOnce({ remaining: 10 });

      const result = await checkSendQuota({ userId: 10, channel: 'email', requiredCount: 5 });
      expect(result.allowed).toBe(true);
      expect(result.billingUserId).toBe(10);
    });
  });

  describe('Tier 4: Combined Messages Per Period Contract', () => {
    it('denies when messages_per_period reached across email and zalo', async () => {
      mockGetBillingCycle.mockResolvedValueOnce({
        hasPlan: true,
        billingUserId: 10,
        cycleStart: new Date('2026-01-01T00:00:00.000Z'),
        cycleEnd: new Date('2026-01-31T00:00:00.000Z'),
        durationDays: 30,
      });
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ messages_per_period: 500 })] })
        .mockResolvedValueOnce({ rows: [{ total: 500 }] });

      const result = await checkSendQuota({ userId: 10, channel: 'zalo' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('period');
      expect(result.limit).toBe(500);
      expect(result.currentCount).toBe(500);
      expect(result.message).toMatch(/hạn mức tin nhắn trong kỳ/i);
    });
  });

  describe('Precedence & Inter-Tier Policy Contracts (PR-Q0 Precedence Lock)', () => {
    it('precedence: employee active within limits, but workspace daily limit exceeded → workspace daily deny wins', async () => {
      mockResolveBillingUserId.mockResolvedValueOnce(100); // ownerId = 100
      // 1. Employee limits check (daily limit 100, no monthly limit set on employee)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'active', daily_email_limit: 100, monthly_email_limit: null }],
      });
      // 2. Employee daily count: 5/100
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 5 }] });
      // 3. Workspace plan limits (daily limit 50)
      mockQuery.mockResolvedValueOnce({
        rows: [planRow({ daily_email_limit: 50 })],
      });
      // 4. Workspace daily count: 50/50 (exceeded!)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 50 }] });

      const result = await checkSendQuota({
        userId: 2,
        channel: 'email',
        ownerContextId: 100,
        requiredCount: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('daily');
      expect(result.limit).toBe(50);
      expect(result.message).toMatch(/giới hạn gửi email trong ngày/i);
    });

    it('precedence: monthly limit exceeded with wallet allowed, but combined period limit exceeded → period deny wins', async () => {
      mockGetBillingCycle.mockResolvedValue({
        hasPlan: true,
        billingUserId: 10,
        cycleStart: new Date('2026-01-01T00:00:00.000Z'),
        cycleEnd: new Date('2026-01-31T00:00:00.000Z'),
        durationDays: 30,
      });
      // 1. Workspace plan limits (monthly 100, period 500)
      mockQuery.mockResolvedValueOnce({
        rows: [planRow({ monthly_email_limit: 100, messages_per_period: 500 })],
      });
      // 2. Monthly count: 100/100 (exceeded)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 100 }] });
      // 3. Top-up wallet has balance 10 -> Tier 3 passes via wallet!
      mockGetWalletSnapshot.mockResolvedValueOnce({ remaining: 10 });
      // 4. Combined period count: 500/500 -> Tier 4 check!
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 500 }] });

      const result = await checkSendQuota({
        userId: 10,
        channel: 'email',
        requiredCount: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('period');
      expect(result.limit).toBe(500);
      expect(result.currentCount).toBe(500);
      expect(result.message).toMatch(/hạn mức tin nhắn trong kỳ/i);
    });

    it('precedence short-circuit: employee tier deny stops before querying workspace plan or counts', async () => {
      mockResolveBillingUserId.mockResolvedValueOnce(100);
      // Employee inactive
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'inactive', daily_email_limit: 10, monthly_email_limit: 100 }],
      });

      const result = await checkSendQuota({
        userId: 2,
        channel: 'email',
        ownerContextId: 100,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('employee_inactive');
      // Only queried user_members, did not query plans, daily counts, or monthly counts
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockGetSubscriptionStatus).not.toHaveBeenCalled();
      expect(mockGetWalletSnapshot).not.toHaveBeenCalled();
    });

    it('precedence short-circuit: workspace daily deny stops before querying monthly or period counts', async () => {
      // Workspace plan with daily 10, monthly 100, period 500
      mockQuery
        .mockResolvedValueOnce({
          rows: [planRow({ daily_email_limit: 10, monthly_email_limit: 100, messages_per_period: 500 })],
        })
        .mockResolvedValueOnce({ rows: [{ total: 10 }] }); // daily count 10/10

      const result = await checkSendQuota({ userId: 10, channel: 'email' });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('daily');
      // Only queried plan limit + daily count (2 queries), did not query monthly count, cycle, or period count
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockGetBillingCycle).not.toHaveBeenCalled();
      expect(mockGetWalletSnapshot).not.toHaveBeenCalled();
    });

    describe('requiredCount Multi-Recipient Batch Boundaries', () => {
      it('requiredCount causes employee limit exceed even when currentCount < limit', async () => {
        mockResolveBillingUserId.mockResolvedValueOnce(100);
        mockQuery
          .mockResolvedValueOnce({
            rows: [{ id: 1, status: 'active', daily_email_limit: 10, monthly_email_limit: 100 }],
          })
          .mockResolvedValueOnce({ rows: [{ total: 8 }] }); // current = 8, limit = 10

        const result = await checkSendQuota({
          userId: 2,
          channel: 'email',
          ownerContextId: 100,
          requiredCount: 3, // 8 + 3 = 11 > 10
        });

        expect(result.allowed).toBe(false);
        expect(result.limitType).toBe('employee');
        expect(result.currentCount).toBe(8);
      });

      it('requiredCount causes workspace daily exceed even when currentCount < limit', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 20 })] })
          .mockResolvedValueOnce({ rows: [{ total: 18 }] }); // 18 + 5 = 23 > 20

        const result = await checkSendQuota({
          userId: 10,
          channel: 'email',
          requiredCount: 5,
        });

        expect(result.allowed).toBe(false);
        expect(result.limitType).toBe('daily');
        expect(result.currentCount).toBe(18);
      });

      it('requiredCount partially covered by monthly plan and remainder covered by wallet → allowed', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [planRow({ monthly_email_limit: 100 })] })
          .mockResolvedValueOnce({ rows: [{ total: 98 }] }); // 98/100, remaining plan = 2
        // requiredCount = 5 -> needs 3 from top-up wallet
        mockGetWalletSnapshot.mockResolvedValueOnce({ remaining: 3 });

        const result = await checkSendQuota({
          userId: 10,
          channel: 'email',
          requiredCount: 5,
        });

        expect(result.allowed).toBe(true);
        expect(mockGetWalletSnapshot).toHaveBeenCalledWith(10, 'emails', expect.anything());
      });

      it('requiredCount partially covered by monthly plan but wallet balance insufficient for remainder → monthly deny', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [planRow({ monthly_email_limit: 100 })] })
          .mockResolvedValueOnce({ rows: [{ total: 98 }] }); // remaining plan = 2
        // requiredCount = 5 -> needs 3, but wallet only has 2
        mockGetWalletSnapshot.mockResolvedValueOnce({ remaining: 2 });

        const result = await checkSendQuota({
          userId: 10,
          channel: 'email',
          requiredCount: 5,
        });

        expect(result.allowed).toBe(false);
        expect(result.limitType).toBe('monthly');
        expect(result.currentCount).toBe(98);
      });

      it('requiredCount causes combined messages_per_period exceed even when currentCount < periodLimit', async () => {
        mockGetBillingCycle.mockResolvedValueOnce({
          hasPlan: true,
          billingUserId: 10,
          cycleStart: new Date('2026-01-01T00:00:00.000Z'),
          cycleEnd: new Date('2026-01-31T00:00:00.000Z'),
          durationDays: 30,
        });
        mockQuery
          .mockResolvedValueOnce({ rows: [planRow({ messages_per_period: 50 })] })
          .mockResolvedValueOnce({ rows: [{ total: 48 }] }); // current = 48, period limit = 50

        const result = await checkSendQuota({
          userId: 10,
          channel: 'zalo',
          requiredCount: 3, // 48 + 3 = 51 > 50
        });

        expect(result.allowed).toBe(false);
        expect(result.limitType).toBe('period');
        expect(result.limit).toBe(50);
        expect(result.currentCount).toBe(48);
        expect(result.message).toMatch(/hạn mức tin nhắn trong kỳ/i);
      });
    });
  });
});
