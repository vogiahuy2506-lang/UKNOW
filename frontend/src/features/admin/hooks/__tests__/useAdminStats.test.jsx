import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../services/adminStatsApi.service', () => ({
  default: {
    getOverview: vi.fn(),
  },
}));

import adminStatsApiService from '../../services/adminStatsApi.service';
import { useAdminStats } from '../useAdminStats';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAdminStats', () => {
  it('mount → isLoading=true rồi load data thành công', async () => {
    adminStatsApiService.getOverview.mockResolvedValueOnce({
      data: { data: { totalUsers: 100, totalRevenue: 5000 } },
    });
    const { result } = renderHook(() => useAdminStats());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ totalUsers: 100, totalRevenue: 5000 });
    expect(result.current.error).toBeNull();
  });

  it('API lỗi có response.data.message → set error theo message', async () => {
    adminStatsApiService.getOverview.mockRejectedValueOnce({
      response: { data: { message: 'Quyền không đủ' } },
    });
    const { result } = renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Quyền không đủ');
    expect(result.current.data).toBeNull();
  });

  it('API lỗi không có response.data → set error fallback', async () => {
    adminStatsApiService.getOverview.mockRejectedValueOnce(new Error('Network'));
    const { result } = renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Không thể tải dữ liệu dashboard');
  });

  it('refetch → gọi lại API + reset error trước khi load', async () => {
    adminStatsApiService.getOverview
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: { data: { totalUsers: 50 } } });

    const { result } = renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Không thể tải dữ liệu dashboard');

    await act(async () => {
      await result.current.refetch();
    });
    expect(adminStatsApiService.getOverview).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ totalUsers: 50 });
    expect(result.current.error).toBeNull();
  });

  it('refetch callback reference ổn định giữa các render', async () => {
    adminStatsApiService.getOverview.mockResolvedValue({ data: { data: {} } });
    const { result, rerender } = renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const firstRefetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(firstRefetch);
  });
});
