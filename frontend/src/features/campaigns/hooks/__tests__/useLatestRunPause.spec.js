import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import campaignRunApiService from '../../services/campaignRunApi.service';
import { LATEST_RUN_PAUSE_POLL_INTERVAL_MS, useLatestRunPause } from '../useLatestRunPause';

vi.mock('../../services/campaignRunApi.service', () => ({
  default: {
    getCampaignRuns: vi.fn(),
  },
}));

describe('useLatestRunPause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('không gọi API khi campaignId là null hoặc undefined', async () => {
    const { result } = renderHook(() => useLatestRunPause(null));
    expect(result.current.activePause).toBeNull();
    expect(result.current.latestRun).toBeNull();
    expect(campaignRunApiService.getCampaignRuns).not.toHaveBeenCalled();
  });

  it('tính đúng activePause khi run gần nhất mang status running và có metadata hoãn Zalo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));

    const mockRun = {
      id: 501,
      status: 'running',
      runMetadata: {
        zaloOutboundDeferredUntil: '2026-09-16T12:00:00.000Z',
        zaloDeferredReason: 'phone_lookup_cooldown',
        zaloDeferredAccountName: 'SIM1-DIGISO',
      },
    };

    campaignRunApiService.getCampaignRuns.mockResolvedValueOnce({
      data: { data: [mockRun] },
    });

    const { result } = renderHook(() => useLatestRunPause(391));

    await waitFor(() => {
      expect(result.current.activePause).not.toBeNull();
    });

    expect(campaignRunApiService.getCampaignRuns).toHaveBeenCalledWith('campaignId=391&limit=1');
    expect(result.current.activePause).toEqual({
      untilIso: '2026-09-16T12:00:00.000Z',
      untilMs: Date.parse('2026-09-16T12:00:00.000Z'),
      reason: 'phone_lookup_cooldown',
      kind: 'zalo',
      accountName: 'SIM1-DIGISO',
    });
    expect(result.current.latestRun).toEqual(mockRun);

    // Kiểm tra polling mỗi 60 giây khi running
    campaignRunApiService.getCampaignRuns.mockResolvedValueOnce({
      data: { data: [{ ...mockRun, id: 501 }] },
    });

    vi.advanceTimersByTime(LATEST_RUN_PAUSE_POLL_INTERVAL_MS);

    await waitFor(() => {
      expect(campaignRunApiService.getCampaignRuns).toHaveBeenCalledTimes(2);
    });
  });

  it('không poll khi status là completed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));

    const mockRun = {
      id: 502,
      status: 'completed',
      runMetadata: {},
    };

    campaignRunApiService.getCampaignRuns.mockResolvedValueOnce({
      data: { data: [mockRun] },
    });

    const { result } = renderHook(() => useLatestRunPause(392));

    await waitFor(() => {
      expect(result.current.latestRun).toEqual(mockRun);
    });

    expect(result.current.activePause).toBeNull();

    vi.advanceTimersByTime(LATEST_RUN_PAUSE_POLL_INTERVAL_MS * 2);
    // Vẫn chỉ gọi 1 lần ban đầu
    expect(campaignRunApiService.getCampaignRuns).toHaveBeenCalledTimes(1);
  });
});
