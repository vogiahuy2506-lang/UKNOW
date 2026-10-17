import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useCampaignLatestRun from '../useCampaignLatestRun';

const { mockGetLatest } = vi.hoisted(() => ({ mockGetLatest: vi.fn() }));
vi.mock('../../../campaign/services/userDeliveryMonitorApi.service', () => ({
  default: { getCampaignLatestRun: (...args) => mockGetLatest(...args) },
}));

beforeEach(() => {
  mockGetLatest.mockReset();
});

describe('useCampaignLatestRun', () => {
  it('không có campaignId (chiến dịch mới) → idle, không gọi API', () => {
    const { result } = renderHook(() => useCampaignLatestRun(null));
    expect(result.current).toEqual({ status: 'idle', run: null });
    expect(mockGetLatest).not.toHaveBeenCalled();
  });

  it('gọi endpoint theo chiến dịch (số do backend đếm qua sendStats) và trả nguyên lượt đó', async () => {
    const run = { runId: 4, status: 'completed', sent: 7, failed: 1, planned: 10 };
    mockGetLatest.mockResolvedValue({ data: { data: { run } } });
    const { result } = renderHook(() => useCampaignLatestRun('391'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockGetLatest).toHaveBeenCalledWith('391');
    expect(result.current.run).toEqual(run);
  });

  it('chưa chạy lần nào (run null) → ready với run null', async () => {
    mockGetLatest.mockResolvedValue({ data: { data: { run: null } } });
    const { result } = renderHook(() => useCampaignLatestRun(5));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.run).toBeNull();
  });

  it('lỗi mạng → error (không ném)', async () => {
    mockGetLatest.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCampaignLatestRun(5));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('refreshKey đổi → tải lại', async () => {
    mockGetLatest.mockResolvedValue({ data: { data: { run: null } } });
    const { result, rerender } = renderHook(({ k }) => useCampaignLatestRun(5, k), { initialProps: { k: 'a' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ k: 'b' });
    await waitFor(() => expect(mockGetLatest).toHaveBeenCalledTimes(2));
  });
});
