import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetUsageInRange = jest.fn();
const mockGetBillingCycle = jest.fn();
const mockGetSubscriptionStatus = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/usageTracking.repository.js', () => ({
  default: {
    getUsageInRange: mockGetUsageInRange,
  },
}));

jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  getBillingCycle: mockGetBillingCycle,
}));

jest.unstable_mockModule('../../../utils/subscriptionStatus.util.js', () => ({
  getSubscriptionStatus: mockGetSubscriptionStatus,
}));

const { default: usageTrackingService } = await import('../usageTracking.service.js');

describe('usageTracking.service getCreditUsageForCycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBillingCycle.mockResolvedValue({
      hasPlan: true,
      billingUserId: 7,
      cycleStart: new Date('2026-06-01T00:00:00.000Z'),
      cycleEnd: new Date('2026-06-30T00:00:00.000Z'),
    });
    mockGetSubscriptionStatus.mockResolvedValue({
      hasPlan: true,
      isExpired: false,
      isInGracePeriod: true,
    });
    mockGetUsageInRange.mockResolvedValue(2);
  });

  it('counts usage up to now while subscription is active or in grace', async () => {
    const result = await usageTrackingService.getCreditUsageForCycle(7);

    expect(result.used).toBe(2);
    expect(mockGetUsageInRange).toHaveBeenCalledWith(
      7,
      'ai_credit',
      new Date('2026-06-01T00:00:00.000Z'),
      expect.any(Date)
    );
    const rangeEnd = mockGetUsageInRange.mock.calls[0][3];
    expect(rangeEnd.getTime()).toBeGreaterThan(new Date('2026-06-30T00:00:00.000Z').getTime());
  });

  it('caps usage at cycle end after subscription fully expired', async () => {
    mockGetSubscriptionStatus.mockResolvedValueOnce({
      hasPlan: true,
      isExpired: true,
      isInGracePeriod: false,
    });

    await usageTrackingService.getCreditUsageForCycle(7);

    expect(mockGetUsageInRange).toHaveBeenCalledWith(
      7,
      'ai_credit',
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T00:00:00.000Z')
    );
  });
});
