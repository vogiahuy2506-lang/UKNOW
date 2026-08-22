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
});
