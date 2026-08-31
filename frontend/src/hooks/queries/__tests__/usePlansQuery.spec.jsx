import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlansQuery } from '../usePlansQuery';
import * as planService from '../../../services/plan.service';


vi.mock('../../../services/plan.service', () => ({
  getPlans: vi.fn(),
}));

describe('usePlansQuery', () => {
  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fetches and returns plans from getPlans API', async () => {
    const mockPlans = [
      { id: 1, code: 'starter', name: 'Starter', price: 99000, is_active: true },
      { id: 2, code: 'pro', name: 'Pro', price: 299000, is_active: true },
    ];

    planService.getPlans.mockResolvedValue({
      data: { plans: mockPlans },
    });

    const { result } = renderHook(() => usePlansQuery(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockPlans);
    expect(planService.getPlans).toHaveBeenCalledTimes(1);
  });

  it('deduplicates multiple concurrent hook invocations to 1 API call', async () => {
    const mockPlans = [{ id: 1, code: 'starter' }];
    planService.getPlans.mockResolvedValue({
      data: { plans: mockPlans },
    });

    const { result: hook1 } = renderHook(() => usePlansQuery(), { wrapper });
    const { result: hook2 } = renderHook(() => usePlansQuery(), { wrapper });

    await waitFor(() => {
      expect(hook1.current.isSuccess).toBe(true);
      expect(hook2.current.isSuccess).toBe(true);
    });

    expect(hook1.current.data).toEqual(mockPlans);
    expect(hook2.current.data).toEqual(mockPlans);
    expect(planService.getPlans).toHaveBeenCalledTimes(1);
  });
});
