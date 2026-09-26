import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetUserPlanLimits = jest.fn();
const mockGetCreditUsageForCycle = jest.fn();
const mockGetSubscriptionStatus = jest.fn();
const mockDbQuery = jest.fn();
const mockGetClient = jest.fn();
const mockTrackUsageRepo = jest.fn();
const mockGetUsageInRange = jest.fn();
const mockGetWalletBalance = jest.fn();
const mockInsertTopupDebit = jest.fn();
const mockAcquireWalletLock = jest.fn();

jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({
  default: {
    getUserPlanLimits: mockGetUserPlanLimits,
    getCreditUsageForCycle: mockGetCreditUsageForCycle,
  },
}));

jest.unstable_mockModule('../../../repositories/payment/usageTracking.repository.js', () => ({
  default: {
    trackUsage: mockTrackUsageRepo,
    getUsageInRange: mockGetUsageInRange,
  },
}));

jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  acquireWalletLock: mockAcquireWalletLock,
  getWalletBalance: mockGetWalletBalance,
  insertTopupDebit: mockInsertTopupDebit,
  sumActiveTopupGrants: jest.fn(),
}));

jest.unstable_mockModule('../../../utils/subscriptionStatus.util.js', () => ({
  getSubscriptionStatus: mockGetSubscriptionStatus,
}));

jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  getBillingCycle: jest.fn(async () => ({
    hasPlan: true,
    billingUserId: 5,
    cycleStart: new Date('2026-06-01'),
    cycleEnd: new Date('2026-07-01'),
  })),
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery, getClient: mockGetClient },
}));

const { default: aiCreditMeter, AI_CREDIT_RESOURCE } = await import('../aiCreditMeter.service.js');

function mockTxClient() {
  return {
    query: jest.fn(async (sql) => {
      if (String(sql).includes('BEGIN') || String(sql).includes('COMMIT') || String(sql).includes('ROLLBACK') || String(sql).includes('pg_advisory')) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
}

describe('aiCreditMeter.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSubscriptionStatus.mockResolvedValue({
      hasPlan: true,
      isExpired: false,
    });
    mockGetUserPlanLimits.mockResolvedValue({ ai_credits_per_period: 10 });
    mockGetCreditUsageForCycle.mockResolvedValue({
      used: 0,
      cycle: { cycleStart: new Date('2026-06-01'), cycleEnd: new Date('2026-07-01') },
    });
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    mockGetWalletBalance.mockResolvedValue({ granted: 0, used: 0, remaining: 0, rawRemaining: 0 });
    mockGetUsageInRange.mockResolvedValue(0);
    mockTrackUsageRepo.mockResolvedValue({ id: 99 });
    mockInsertTopupDebit.mockResolvedValue({ id: 1 });
    mockAcquireWalletLock.mockResolvedValue(undefined);
    mockGetClient.mockImplementation(async () => mockTxClient());
  });

  it('skips charge when userId is missing', async () => {
    await aiCreditMeter.consume(null, { feature: 'test' });
    expect(mockTrackUsageRepo).not.toHaveBeenCalled();
  });

  it('admin bypasses credit limit', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    await aiCreditMeter.consume(1, { feature: 'test' });
    expect(mockTrackUsageRepo).not.toHaveBeenCalled();
  });

  it('assertAvailable throws when plan + wallet exhausted', async () => {
    mockGetCreditUsageForCycle.mockResolvedValueOnce({ used: 10, cycle: {} });
    mockGetWalletBalance.mockResolvedValueOnce({ granted: 0, used: 0, remaining: 0, rawRemaining: 0 });
    await expect(aiCreditMeter.assertAvailable(5)).rejects.toMatchObject({
      status: 402,
      code: 'RESOURCE_LIMIT_EXCEEDED',
      resource: AI_CREDIT_RESOURCE,
      upgradeRequired: true,
    });
  });

  it('assertAvailable allows when plan exhausted but wallet remaining', async () => {
    mockGetCreditUsageForCycle.mockResolvedValueOnce({ used: 10, cycle: {} });
    mockGetWalletBalance.mockResolvedValueOnce({ granted: 5, used: 0, remaining: 5, rawRemaining: 5 });
    await expect(aiCreditMeter.assertAvailable(5)).resolves.toMatchObject({
      used: 10,
      limit: 10,
      walletRemaining: 5,
    });
  });

  it('consume does not debit wallet while within plan', async () => {
    mockGetUsageInRange.mockResolvedValueOnce(3);
    await aiCreditMeter.consume(5, {
      feature: 'ai_chat',
      creditContext: {
        skip: false,
        billingUserId: 5,
        cycle: { hasPlan: true, cycleStart: new Date('2026-06-01'), cycleEnd: new Date('2026-07-01') },
        limit: 10,
        used: 3,
      },
    });
    expect(mockTrackUsageRepo).toHaveBeenCalled();
    expect(mockInsertTopupDebit).not.toHaveBeenCalled();
  });

  it('consume debits wallet when over plan limit', async () => {
    mockGetUsageInRange.mockResolvedValueOnce(10);
    await aiCreditMeter.consume(5, {
      feature: 'ai_chat',
      creditContext: {
        skip: false,
        billingUserId: 5,
        cycle: { hasPlan: true, cycleStart: new Date('2026-06-01'), cycleEnd: new Date('2026-07-01') },
        limit: 10,
        used: 10,
      },
    });
    expect(mockInsertTopupDebit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        itemKey: 'ai_credits',
        sourceKey: 'ai_credit:99',
      }),
      expect.anything(),
    );
  });

  it('unlimited when plan limit is null or zero', async () => {
    mockGetUserPlanLimits.mockResolvedValueOnce({ ai_credits_per_period: null });
    await aiCreditMeter.consume(5, { feature: 'ai_chat' });
    expect(mockTrackUsageRepo).not.toHaveBeenCalled();
  });

  describe('Employee AI Credit limits', () => {
    it('employee inactive throws EMPLOYEE_INACTIVE', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ role: 'user' }] }) // getUserRole
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'inactive' }] }); // user_members

      await expect(
        aiCreditMeter.resolveCreditContext(2, { ownerContextId: 5 })
      ).rejects.toMatchObject({
        status: 403,
        code: 'EMPLOYEE_INACTIVE',
      });
    });

    it('employee daily AI limit reached throws EMPLOYEE_AI_LIMIT_EXCEEDED', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ role: 'user' }] }) // getUserRole
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'active', daily_ai_credit_limit: 5 }] }) // user_members
        .mockResolvedValueOnce({ rows: [{ used: 5 }] }); // daily usage

      await expect(
        aiCreditMeter.resolveCreditContext(2, { ownerContextId: 5 })
      ).rejects.toMatchObject({
        status: 403,
        code: 'EMPLOYEE_AI_LIMIT_EXCEEDED',
        limit: 5,
        used: 5,
      });
    });

    it('employee period AI limit reached throws EMPLOYEE_AI_LIMIT_EXCEEDED', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ role: 'user' }] }) // getUserRole
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'active', daily_ai_credit_limit: null, period_ai_credit_limit: 20 }] }) // user_members
        .mockResolvedValueOnce({ rows: [{ used: 20 }] }); // period usage

      await expect(
        aiCreditMeter.resolveCreditContext(2, { ownerContextId: 5 })
      ).rejects.toMatchObject({
        status: 403,
        code: 'EMPLOYEE_AI_LIMIT_EXCEEDED',
        limit: 20,
        used: 20,
      });
    });
  });

  describe('PR-3, Việc 3.4 — chủ hết gói vẫn dùng AI không giới hạn qua chatbot công khai', () => {
    it('vai 1 — chủ KHÔNG có gói hiệu lực (cron đã gỡ, active_plan_id=NULL) → assertAvailable NÉM LỖI, không skip', async () => {
      // Đúng hình dạng getSubscriptionStatus trả về khi effective_plan_id rỗng (utils/subscriptionStatus.util.js).
      mockGetSubscriptionStatus.mockResolvedValueOnce({
        hasPlan: false,
        expiresAt: null,
        graceDays: 0,
        graceUntil: null,
        isExpired: false,
        isInGracePeriod: false,
      });

      await expect(aiCreditMeter.assertAvailable(5)).rejects.toMatchObject({
        status: 402,
        code: 'RESOURCE_LIMIT_EXCEEDED',
        resource: AI_CREDIT_RESOURCE,
        subscriptionExpired: true,
        upgradeRequired: true,
      });
      // Chặn TRƯỚC khi kịp đọc hạn mức gói — không được lọt tới nhánh "baseLimit<=0 = không giới hạn".
      expect(mockGetUserPlanLimits).not.toHaveBeenCalled();
    });

    it('vai 2 — chủ CÒN gói hiệu lực (mặc định mock hasPlan:true, isExpired:false) → chạy bình thường, không ném lỗi', async () => {
      await expect(aiCreditMeter.assertAvailable(5)).resolves.toMatchObject({ skip: false });
    });

    it('vai 2b — chủ đang trong ÂN HẠN (hạ gói chủ động, chưa qua grace_period_days) → vẫn chạy, KHÔNG chặn', async () => {
      mockGetSubscriptionStatus.mockResolvedValueOnce({
        hasPlan: true,
        expiresAt: new Date('2026-09-20'),
        graceDays: 7,
        graceUntil: new Date('2026-09-27'),
        isExpired: false,
        isInGracePeriod: true,
      });

      await expect(aiCreditMeter.assertAvailable(5)).resolves.toMatchObject({ skip: false });
    });

    it('vai 3 — nhân viên của chủ CÒN gói (ownerContextId) → chạy bình thường', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ role: 'employee' }] }) // getUserRole
        .mockResolvedValueOnce({ rows: [] }); // user_members: không tìm thấy -> bỏ qua trần nhân viên
      mockGetSubscriptionStatus.mockResolvedValueOnce({ hasPlan: true, isExpired: false });

      await expect(
        aiCreditMeter.assertAvailable(2, { ownerContextId: 5 })
      ).resolves.toMatchObject({ skip: false });
      expect(mockGetSubscriptionStatus).toHaveBeenCalledWith(2, { ownerContextId: 5 });
    });

    it('nhân viên của chủ ĐÃ hết gói (quy về chủ qua ownerContextId) → cũng bị chặn, không phải chỉ chủ gọi trực tiếp mới bị', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ role: 'employee' }] })
        .mockResolvedValueOnce({ rows: [] });
      mockGetSubscriptionStatus.mockResolvedValueOnce({ hasPlan: false, isExpired: false });

      await expect(
        aiCreditMeter.assertAvailable(2, { ownerContextId: 5 })
      ).rejects.toMatchObject({ subscriptionExpired: true });
    });

    it('vẫn ném lỗi hết gói dù bản ghi cũ có isExpired:true kèm hasPlan:true (tương thích ngược, không phá hành vi đã đúng)', async () => {
      mockGetSubscriptionStatus.mockResolvedValueOnce({ hasPlan: true, isExpired: true });

      await expect(aiCreditMeter.assertAvailable(5)).rejects.toMatchObject({
        subscriptionExpired: true,
      });
    });

    it('admin vẫn skip dù chủ hết gói (chốt role đứng TRƯỚC chốt hết gói)', async () => {
      // KHÔNG set mockGetSubscriptionStatus riêng cho ca này — đường admin thoát ngay sau khi đọc
      // role, không bao giờ gọi tới getSubscriptionStatus. Một mockResolvedValueOnce() ở đây sẽ
      // không được tiêu thụ và RÒ sang ca kế tiếp (bài học tự bắt được lúc chạy thật: nó làm đỏ
      // nhầm ca deductCredits ngay sau).
      mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

      const ctx = await aiCreditMeter.resolveCreditContext(1);
      expect(ctx).toEqual({ skip: true });
      expect(mockGetSubscriptionStatus).not.toHaveBeenCalled();
    });
  });

  describe('deductCredits', () => {
    it('khi gói đã dùng hết: trừ toàn bộ vào ví, không vượt trần gói, không ghi usage log gói', async () => {
      mockGetUserPlanLimits.mockResolvedValue({ ai_credits_per_period: 200 });
      mockGetUsageInRange.mockResolvedValue(200); // 200/200 đã dùng hết
      mockGetWalletBalance.mockResolvedValue({ granted: 300, used: 0, remaining: 300, rawRemaining: 300 });

      const result = await aiCreditMeter.deductCredits(5, 150);

      expect(result.success).toBe(true);
      expect(result.deducted).toBe(150);
      expect(result.breakdown).toEqual({ planDeducted: 0, walletDeducted: 150 });
      expect(result.remaining.plan).toBe(0);
      expect(result.remaining.wallet).toBe(150);
      expect(mockTrackUsageRepo).not.toHaveBeenCalled();
      expect(mockInsertTopupDebit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 5,
          itemKey: 'ai_credits',
          qty: 150,
        }),
        expect.anything()
      );
    });

    it('khi gói còn một phần: trừ hết phần còn của gói rồi trừ phần thiếu vào ví', async () => {
      mockGetUserPlanLimits.mockResolvedValue({ ai_credits_per_period: 200 });
      mockGetUsageInRange.mockResolvedValue(150); // còn 50
      mockGetWalletBalance.mockResolvedValue({ granted: 300, used: 0, remaining: 300, rawRemaining: 300 });

      const result = await aiCreditMeter.deductCredits(5, 150);

      expect(result.success).toBe(true);
      expect(result.deducted).toBe(150);
      expect(result.breakdown).toEqual({ planDeducted: 50, walletDeducted: 100 });
      expect(result.remaining.plan).toBe(0);
      expect(result.remaining.wallet).toBe(200);
      expect(mockTrackUsageRepo).toHaveBeenCalledWith(
        5,
        'ai_credit',
        50,
        expect.anything(),
        expect.anything()
      );
      expect(mockInsertTopupDebit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 5,
          itemKey: 'ai_credits',
          qty: 100,
        }),
        expect.anything()
      );
    });

    it('throw INSUFFICIENT_CREDITS khi tổng gói + ví không đủ', async () => {
      mockGetUserPlanLimits.mockResolvedValue({ ai_credits_per_period: 200 });
      mockGetUsageInRange.mockResolvedValue(200);
      mockGetWalletBalance.mockResolvedValue({ granted: 50, used: 0, remaining: 50, rawRemaining: 50 });

      await expect(aiCreditMeter.deductCredits(5, 150)).rejects.toMatchObject({
        status: 400,
        code: 'INSUFFICIENT_CREDITS',
        available: 50,
        required: 150,
      });
      expect(mockTrackUsageRepo).not.toHaveBeenCalled();
      expect(mockInsertTopupDebit).not.toHaveBeenCalled();
    });
  });
});

