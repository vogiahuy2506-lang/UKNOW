import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockTrackUsage = jest.fn();
const mockGetUserPlanLimits = jest.fn();
const mockGetCreditUsageForCycle = jest.fn();
const mockGetSubscriptionStatus = jest.fn();
const mockDbQuery = jest.fn();

jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({
  default: {
    trackUsage: mockTrackUsage,
    getUserPlanLimits: mockGetUserPlanLimits,
    getCreditUsageForCycle: mockGetCreditUsageForCycle,
  },
}));

jest.unstable_mockModule('../../../utils/subscriptionStatus.util.js', () => ({
  getSubscriptionStatus: mockGetSubscriptionStatus,
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery },
}));

const { default: aiCreditMeter, AI_CREDIT_RESOURCE } = await import('../aiCreditMeter.service.js');

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
    mockTrackUsage.mockResolvedValue({});
  });

  it('skips charge when userId is missing', async () => {
    await aiCreditMeter.consume(null, { feature: 'test' });
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  it('admin bypasses credit limit', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    await aiCreditMeter.consume(1, { feature: 'test' });
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  it('assertAvailable throws when credits exhausted', async () => {
    mockGetCreditUsageForCycle.mockResolvedValueOnce({ used: 10, cycle: {} });
    await expect(aiCreditMeter.assertAvailable(5)).rejects.toMatchObject({
      status: 403,
      code: 'RESOURCE_LIMIT_EXCEEDED',
      resource: AI_CREDIT_RESOURCE,
      upgradeRequired: true,
    });
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  it('consume does not re-check limit when creditContext provided', async () => {
    mockGetCreditUsageForCycle.mockResolvedValueOnce({ used: 10, cycle: {} });
    const creditContext = {
      skip: false,
      billingUserId: 5,
      cycle: { cycleStart: new Date('2026-06-01'), cycleEnd: new Date('2026-07-01') },
      limit: 10,
      used: 9,
    };
    await aiCreditMeter.consume(5, { feature: 'ai_chat', creditContext });
    expect(mockTrackUsage).toHaveBeenCalledWith(5, AI_CREDIT_RESOURCE, 1, expect.objectContaining({
      feature: 'ai_chat',
    }));
    expect(mockGetCreditUsageForCycle).not.toHaveBeenCalled();
  });

  it('tracks one credit per consume call', async () => {
    await aiCreditMeter.consume(5, { feature: 'ai_chat' });
    expect(mockTrackUsage).toHaveBeenCalledWith(5, AI_CREDIT_RESOURCE, 1, expect.objectContaining({
      feature: 'ai_chat',
    }));
  });

  it('unlimited when plan limit is null or zero', async () => {
    mockGetUserPlanLimits.mockResolvedValueOnce({ ai_credits_per_period: null });
    await aiCreditMeter.consume(5, { feature: 'ai_chat' });
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });
});
