import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetSubscriptionStatus = jest.fn();
const mockResolveBillingUserId = jest.fn();
const mockGetBillingCycle = jest.fn();

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
  getWalletSnapshot: jest.fn(),
}));

const {
  checkUserEmailSendLimit,
  checkUserZaloSendLimit,
  checkSendQuota,
  countEmailSentThisMonth,
  countZaloSentThisMonth,
  nextVnMidnight,
  nextVnMonthStart,
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

describe('userSendLimit.util', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetSubscriptionStatus.mockReset();
    mockResolveBillingUserId.mockReset();
    mockGetBillingCycle.mockReset();
    mockGetSubscriptionStatus.mockResolvedValue(activeSubscription);
    mockResolveBillingUserId.mockImplementation(async (userId) => userId);
    mockGetBillingCycle.mockResolvedValue({
      hasPlan: true,
      cycleStart: new Date('2025-12-31T17:00:00.000Z'),
      cycleEnd: new Date('2026-01-31T17:00:00.000Z'),
      billingUserId: 10,
    });
    _clearQuotaCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('nextVnMidnight / nextVnMonthStart', () => {
    it('biên 23:59 VN 31/1 → daily & monthly resetAt = 2026-01-31T17:00:00Z', () => {
      const now = new Date('2026-01-31T16:59:00.000Z');
      expect(nextVnMidnight(now).toISOString()).toBe('2026-01-31T17:00:00.000Z');
      expect(nextVnMonthStart(now).toISOString()).toBe('2026-01-31T17:00:00.000Z');
    });
  });

  describe('checkUserEmailSendLimit', () => {
    it('admin bypass — không gọi DB', async () => {
      const result = await checkUserEmailSendLimit({ userId: 1, roleCode: 'admin' });
      expect(result).toEqual({
        allowed: true,
        limit: null,
        currentCount: 0,
        period: null,
        message: null,
        resetAt: null,
        limitType: null,
      });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockResolveBillingUserId).not.toHaveBeenCalled();
    });

    it('không có plan (join trả rỗng) → từ chối gửi', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBeNull();
      expect(result.message).toMatch(/chưa có gói/i);
    });

    it('plan có daily_email_limit = null → không giới hạn theo ngày, kiểm tra tháng', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planRow()] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('count ngày < daily_email_limit → cho phép gửi', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 500 })] })
        .mockResolvedValueOnce({ rows: [{ total: 200 }] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(true);
    });

    it('count ngày == daily_email_limit → chặn (boundary)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 100, monthly_email_limit: 3000 })] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(100);
      expect(result.currentCount).toBe(100);
      expect(result.period).toBe('daily');
      expect(result.limitType).toBe('daily');
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.message).toContain('100/100');
    });

    it('count ngày > daily_email_limit → chặn', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 50 })] })
        .mockResolvedValueOnce({ rows: [{ total: 55 }] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('daily');
    });

    it('daily OK → tiếp tục check monthly và chặn nếu vượt tháng', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 500, monthly_email_limit: 1000 })] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] })
        .mockResolvedValueOnce({ rows: [{ total: 1000 }] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('monthly');
      expect(result.limitType).toBe('monthly');
      expect(result.limit).toBe(1000);
      expect(result.message).toContain('trong tháng');
    });

    it('cả daily và monthly đều OK → cho phép', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 500, monthly_email_limit: 10000 })] })
        .mockResolvedValueOnce({ rows: [{ total: 200 }] })
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(true);
    });

    it('parse limit từ string (pg trả varchar)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: '100' })] })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });
      const result = await checkUserEmailSendLimit({ userId: 5 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(100);
      expect(result.currentCount).toBe(100);
    });

    it('daily_email_limit = 0 → không hỗ trợ, không query count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 0 })] });
      const result = await checkUserEmailSendLimit({ userId: 5 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
      expect(result.limitType).toBe('disabled');
      expect(result.resetAt).toBeNull();
      expect(result.message).toContain('không được hỗ trợ');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('monthly_email_limit = 0 → không hỗ trợ (daily OK)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 500, monthly_email_limit: 0 })] })
        .mockResolvedValueOnce({ rows: [{ total: 10 }] });
      const result = await checkUserEmailSendLimit({ userId: 5 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
      expect(result.period).toBeNull();
      expect(result.limitType).toBe('disabled');
      expect(result.message).toContain('không được hỗ trợ');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('gói hết hạn (qua ân hạn) → chặn trước khi check limit', async () => {
      mockGetSubscriptionStatus.mockResolvedValueOnce({
        hasPlan: true,
        isExpired: true,
        expiresAt: new Date(Date.now() - 86400000),
        graceDays: 0,
        graceUntil: new Date(Date.now() - 86400000),
        isInGracePeriod: false,
      });
      const result = await checkUserEmailSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('expired');
      expect(result.message).toContain('hết hạn');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('checkUserZaloSendLimit', () => {
    it('admin bypass', async () => {
      const result = await checkUserZaloSendLimit({ userId: 1, roleCode: 'admin' });
      expect(result.allowed).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('không có plan → từ chối gửi', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect((await checkUserZaloSendLimit({ userId: 10 })).allowed).toBe(false);
    });

    it('vượt daily_zalo_limit → chặn', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_zalo_limit: 200, monthly_zalo_limit: 2000 })] })
        .mockResolvedValueOnce({ rows: [{ total: 200 }] });
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('daily');
      expect(result.message).toContain('Zalo');
    });

    it('vượt monthly_zalo_limit → chặn', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_zalo_limit: 200, monthly_zalo_limit: 2000 })] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] })
        .mockResolvedValueOnce({ rows: [{ total: 2001 }] });
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('monthly');
    });

    it('cả daily và monthly đều OK → cho phép', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_zalo_limit: 200, monthly_zalo_limit: 2000 })] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] })
        .mockResolvedValueOnce({ rows: [{ total: 999 }] });
      expect((await checkUserZaloSendLimit({ userId: 10 })).allowed).toBe(true);
    });

    it('daily_zalo_limit = null → skip daily, vẫn check monthly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ monthly_zalo_limit: 100 })] })
        .mockResolvedValueOnce({ rows: [{ total: 100 }] });
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.period).toBe('monthly');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('daily_zalo_limit = 0 → không hỗ trợ, không query count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planRow({ daily_zalo_limit: 0 })] });
      const result = await checkUserZaloSendLimit({ userId: 10 });
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
      expect(result.limitType).toBe('disabled');
      expect(result.message).toContain('Zalo');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkSendQuota', () => {
    it('admin bypass không query DB', async () => {
      const result = await checkSendQuota({ userId: 1, channel: 'email', roleCode: 'admin' });
      expect(result.allowed).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockResolveBillingUserId).not.toHaveBeenCalled();
    });

    it('employee → owner (assert query bằng owner id)', async () => {
      mockResolveBillingUserId.mockResolvedValueOnce(99);
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_zalo_limit: 1 })] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await checkSendQuota({
        userId: 5,
        channel: 'zalo',
        ownerContextId: 99,
      });
      expect(mockResolveBillingUserId).toHaveBeenCalledWith(5, { ownerContextId: 99 });
      expect(result.allowed).toBe(false);
      expect(result.billingUserId).toBe(99);
      expect(mockQuery.mock.calls[0][1][0]).toBe(99);
    });

    it('daily deny → limitType daily + resetAt nửa đêm VN', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-31T16:59:00.000Z'));
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 10 })] })
        .mockResolvedValueOnce({ rows: [{ total: 10 }] });
      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('daily');
      expect(result.resetAt.toISOString()).toBe('2026-01-31T17:00:00.000Z');
    });

    it('preflight nhiều người nhận chặn trước khi batch vượt daily limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 10 })] })
        .mockResolvedValueOnce({ rows: [{ total: 8 }] });

      const result = await checkSendQuota({
        userId: 10,
        channel: 'email',
        requiredCount: 3,
      });

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('daily');
      expect(result.currentCount).toBe(8);
    });

    it('monthly deny → resetAt = 00:00 VN mùng 1 tháng sau', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ monthly_email_limit: 5 })] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });
      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('monthly');
      expect(result.resetAt.toISOString()).toBe('2026-01-31T17:00:00.000Z');
    });

    it('period: count ≥ limit ⇒ deny với resetAt = cycleEnd', async () => {
      const cycleEnd = new Date('2026-02-15T00:00:00.000Z');
      mockGetBillingCycle.mockResolvedValueOnce({
        hasPlan: true,
        billingUserId: 10,
        cycleStart: new Date('2026-01-16T00:00:00.000Z'),
        cycleEnd,
        durationDays: 30,
      });
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ messages_per_period: 2 })] })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] });
      const result = await checkSendQuota({ userId: 10, channel: 'zalo' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('period');
      expect(result.resetAt).toEqual(cycleEnd);
      expect(result.message).toContain('2/2');
    });

    it('period dưới limit ⇒ allowed', async () => {
      mockGetBillingCycle.mockResolvedValueOnce({
        hasPlan: true,
        billingUserId: 10,
        cycleStart: new Date('2026-01-01T00:00:00.000Z'),
        cycleEnd: new Date('2026-01-31T00:00:00.000Z'),
        durationDays: 30,
      });
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ messages_per_period: 10 })] })
        .mockResolvedValueOnce({ rows: [{ total: 3 }] });
      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(true);
      expect(mockGetBillingCycle).toHaveBeenCalled();
    });

    it('messages_per_period = null ⇒ skip lớp period (không gọi getBillingCycle)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planRow({ messages_per_period: null })] });
      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(true);
      expect(mockGetBillingCycle).not.toHaveBeenCalled();
    });

    it('messages_per_period = 0 ⇒ disabled, resetAt null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planRow({ messages_per_period: 0 })] });
      const result = await checkSendQuota({ userId: 10, channel: 'zalo' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('disabled');
      expect(result.resetAt).toBeNull();
      expect(mockGetBillingCycle).not.toHaveBeenCalled();
    });

    it('precedence: daily chặn trước period', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [planRow({ daily_email_limit: 1, messages_per_period: 100 })] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.limitType).toBe('daily');
      expect(mockGetBillingCycle).not.toHaveBeenCalled();
    });

    it('expired ⇒ limitType expired', async () => {
      mockGetSubscriptionStatus.mockResolvedValueOnce({
        hasPlan: true,
        isExpired: true,
      });
      const result = await checkSendQuota({ userId: 10, channel: 'email' });
      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('expired');
      expect(result.resetAt).toBeNull();
    });

    it('TTL cache: 2 call trong 10s chỉ query DB 1 lần cho limits', async () => {
      mockQuery.mockResolvedValue({ rows: [planRow()] });
      await checkSendQuota({ userId: 10, channel: 'email' });
      await checkSendQuota({ userId: 10, channel: 'email' });
      // 1 query limits (cached on 2nd call)
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    describe('Employee send limits (Tier 1)', () => {
      it('nhân viên bị khóa (status != active) → chặn gửi (limitType: employee_inactive)', async () => {
        mockResolveBillingUserId.mockResolvedValueOnce(1); // ownerId = 1
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 5, status: 'inactive', daily_email_limit: 100, monthly_email_limit: 1000 }],
        });

        const result = await checkSendQuota({
          userId: 2,
          channel: 'email',
          ownerContextId: 1,
        });

        expect(result.allowed).toBe(false);
        expect(result.limitType).toBe('employee_inactive');
        expect(result.message).toMatch(/tạm khóa/i);
      });

      it('nhân viên vượt daily_email_limit của riêng mình → chặn với limitType: employee', async () => {
        mockResolveBillingUserId.mockResolvedValueOnce(1); // ownerId = 1
        // 1. query user_members limits
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 5, status: 'active', daily_email_limit: 50, monthly_email_limit: 500 }],
        });
        // 2. query employee daily count
        mockQuery.mockResolvedValueOnce({
          rows: [{ total: 50 }],
        });

        const result = await checkSendQuota({
          userId: 2,
          channel: 'email',
          ownerContextId: 1,
          requiredCount: 1,
        });

        expect(result.allowed).toBe(false);
        expect(result.limitType).toBe('employee');
        expect(result.limit).toBe(50);
        expect(result.currentCount).toBe(50);
        expect(result.message).toMatch(/giới hạn gửi email trong ngày của nhân viên/i);
      });

      it('nhân viên chưa vượt limit của mình nhưng workspace hết quota → chặn với limitType của workspace', async () => {
        mockResolveBillingUserId.mockResolvedValueOnce(1); // ownerId = 1
        // 1. query user_members limits
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 5, status: 'active', daily_email_limit: 100, monthly_email_limit: null }],
        });
        // 2. query employee daily count
        mockQuery.mockResolvedValueOnce({
          rows: [{ total: 10 }],
        });
        // 3. query workspace plan limits
        mockQuery.mockResolvedValueOnce({
          rows: [planRow({ daily_email_limit: 200 })],
        });
        // 4. query workspace daily count
        mockQuery.mockResolvedValueOnce({
          rows: [{ total: 200 }],
        });

        const result = await checkSendQuota({
          userId: 2,
          channel: 'email',
          ownerContextId: 1,
          requiredCount: 1,
        });

        expect(result.allowed).toBe(false);
        expect(result.limitType).toBe('daily');
        expect(result.limit).toBe(200);
      });
    });
  });

  describe('countEmailSentThisMonth & countZaloSentThisMonth', () => {
    it('countEmailSentThisMonth ném lỗi khi thiếu cycleStart hoặc cycleEnd', async () => {
      await expect(countEmailSentThisMonth(10, null, null)).rejects.toThrow(
        /countEmailSentThisMonth requires explicit cycleStart and cycleEnd/
      );
      await expect(countEmailSentThisMonth(10, new Date(), null)).rejects.toThrow(
        /countEmailSentThisMonth requires explicit cycleStart and cycleEnd/
      );
    });

    it('countZaloSentThisMonth ném lỗi khi thiếu cycleStart hoặc cycleEnd', async () => {
      await expect(countZaloSentThisMonth(10, null, null)).rejects.toThrow(
        /countZaloSentThisMonth requires explicit cycleStart and cycleEnd/
      );
      await expect(countZaloSentThisMonth(10, null, new Date())).rejects.toThrow(
        /countZaloSentThisMonth requires explicit cycleStart and cycleEnd/
      );
    });

    it('gọi với cycleStart và cycleEnd hợp lệ → đếm qua SQL cycle', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 42 }] });
      const count = await countEmailSentThisMonth(10, new Date('2026-01-01'), new Date('2026-02-01'));
      expect(count).toBe(42);
    });
  });
});
