import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockFindCustomPlanOwnedByUser = jest.fn();
const mockFindAllPricingConfig = jest.fn();
const mockFindAllPricingRows = jest.fn();
const mockFindPricingRowByKey = jest.fn();
const mockUpdatePricingRow = jest.fn();
const mockDeleteOrphanCustomPlans = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/customPlan.repository.js', () => ({
  findCustomPlanOwnedByUser: mockFindCustomPlanOwnedByUser,
  findAllPricingConfig: mockFindAllPricingConfig,
  findAllPricingRows: mockFindAllPricingRows,
  findPricingRowByKey: mockFindPricingRowByKey,
  updatePricingRow: mockUpdatePricingRow,
  deleteOrphanCustomPlans: mockDeleteOrphanCustomPlans,
}));

const { getMyCustomPlan } = await import('../customPlan.service.js');

describe('customPlan.service - getMyCustomPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when activePlanId or userId is missing', async () => {
    expect(await getMyCustomPlan({ userId: null, activePlanId: 10 })).toBeNull();
    expect(await getMyCustomPlan({ userId: 1, activePlanId: null })).toBeNull();
  });

  it('returns formatted custom plan when owned by user', async () => {
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Custom Plan - test@example.com',
      price: '500000',
      price_yearly: '5000000',
      custom_config: { quantities: { emails: 10000 }, billingPeriod: 'monthly' },
      created_at: new Date('2026-08-01'),
    });

    const result = await getMyCustomPlan({ userId: 42, activePlanId: 99 });

    expect(mockFindCustomPlanOwnedByUser).toHaveBeenCalledWith(99, 42);
    expect(result).toEqual({
      id: 99,
      name: 'Custom Plan - test@example.com',
      price: 500000,
      priceYearly: 5000000,
      customConfig: { quantities: { emails: 10000 }, billingPeriod: 'monthly' },
      createdAt: expect.any(Date),
    });
  });

  it('returns null when plan is not found or not owned by user', async () => {
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce(null);

    const result = await getMyCustomPlan({ userId: 42, activePlanId: 100 });
    expect(mockFindCustomPlanOwnedByUser).toHaveBeenCalledWith(100, 42);
    expect(result).toBeNull();
  });
});
