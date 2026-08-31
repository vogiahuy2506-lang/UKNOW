import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvalidateQueries = vi.fn().mockResolvedValue();

vi.mock('../../../../lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: mockInvalidateQueries,
  },
}));

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    patch: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

const { default: adminPlansApiService } = await import('../adminPlansApi.service');

describe('adminPlansApiService TanStack Query Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createPlan invalidates PLANS_QUERY_KEY', async () => {
    await adminPlansApiService.createPlan({ code: 'new_plan' });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['plans', 'public'] });
  });

  it('updatePlan invalidates PLANS_QUERY_KEY', async () => {
    await adminPlansApiService.updatePlan(10, { price: 299000 });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['plans', 'public'] });
  });

  it('deletePlan invalidates PLANS_QUERY_KEY', async () => {
    await adminPlansApiService.deletePlan(10);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['plans', 'public'] });
  });

  it('updateCustomPricing invalidates PLANS_QUERY_KEY', async () => {
    await adminPlansApiService.updateCustomPricing('dailyEmail', { price: 50 });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['plans', 'public'] });
  });
});
