import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCampaignEstimate from '../useCampaignEstimate';
import campaignRunApiService from '../../services/campaignRunApi.service';
import { ESTIMATE_438 } from '../../utils/__tests__/campaignEstimate.fixtures';

vi.mock('../../services/campaignRunApi.service', () => ({
  default: { getCampaignEstimate: vi.fn() },
}));

/** Hình dạng thật: axios trả `{ data: { success, data } }` (như campaignRunApi.service qua api.get). */
const apiOk = (data) => ({ data: { success: true, data } });

describe('useCampaignEstimate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enabled=false → idle và KHÔNG gọi API', async () => {
    const { result } = renderHook(() => useCampaignEstimate({ campaignId: 438, enabled: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current).toEqual({ status: 'idle', estimate: null });
    expect(campaignRunApiService.getCampaignEstimate).not.toHaveBeenCalled();
  });

  it('gọi sau debounce với startAt + continuous + signal; thành công → ready + estimate', async () => {
    campaignRunApiService.getCampaignEstimate.mockResolvedValue(apiOk(ESTIMATE_438));
    const { result } = renderHook(() => useCampaignEstimate({
      campaignId: 438, enabled: true, startAt: '2026-10-04T23:00:00.000Z', continuous: false, debounceMs: 300,
    }));
    expect(result.current.status).toBe('loading');
    expect(campaignRunApiService.getCampaignEstimate).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(campaignRunApiService.getCampaignEstimate).toHaveBeenCalledWith(
      438,
      { startAt: '2026-10-04T23:00:00.000Z', continuous: false },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.estimate.finishAtLatest).toBe(ESTIMATE_438.finishAtLatest);
  });

  it('API lỗi → status error (không ném, để hộp chỉ hiện câu nhẹ)', async () => {
    campaignRunApiService.getCampaignEstimate.mockRejectedValue(Object.assign(new Error('500'), { response: { status: 500 } }));
    const { result } = renderHook(() => useCampaignEstimate({ campaignId: 438, enabled: true, debounceMs: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current).toEqual({ status: 'error', estimate: null });
  });

  it('phản hồi sai hình dạng (không có data) → error', async () => {
    campaignRunApiService.getCampaignEstimate.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useCampaignEstimate({ campaignId: 438, enabled: true, debounceMs: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.status).toBe('error');
  });

  it('đổi giờ → HUỶ request cũ (signal.aborted) và kết quả muộn của giờ cũ không ghi đè giờ mới', async () => {
    const resolvers = [];
    const signals = [];
    campaignRunApiService.getCampaignEstimate.mockImplementation((id, query, options) => new Promise((resolve) => {
      signals.push(options.signal);
      resolvers.push(resolve);
    }));
    const { result, rerender } = renderHook(
      ({ startAt }) => useCampaignEstimate({ campaignId: 438, enabled: true, startAt, debounceMs: 100 }),
      { initialProps: { startAt: '2026-10-05T00:00:00.000Z' } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    rerender({ startAt: '2026-10-06T00:00:00.000Z' });
    expect(signals[0].aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(signals).toHaveLength(2);

    // Giờ MỚI về trước, giờ CŨ về sau → giữ kết quả giờ mới.
    await act(async () => { resolvers[1](apiOk({ ...ESTIMATE_438, totalActions: 222 })); });
    await act(async () => { resolvers[0](apiOk({ ...ESTIMATE_438, totalActions: 111 })); });
    expect(result.current.estimate.totalActions).toBe(222);
  });

  it('đổi giờ liên tiếp trong khoảng debounce chỉ gọi API MỘT lần (giờ cuối)', async () => {
    campaignRunApiService.getCampaignEstimate.mockResolvedValue(apiOk(ESTIMATE_438));
    const { rerender } = renderHook(
      ({ startAt }) => useCampaignEstimate({ campaignId: 438, enabled: true, startAt, debounceMs: 500 }),
      { initialProps: { startAt: '2026-10-05T00:00:00.000Z' } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    rerender({ startAt: '2026-10-06T00:00:00.000Z' });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    rerender({ startAt: '2026-10-07T00:00:00.000Z' });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(campaignRunApiService.getCampaignEstimate).toHaveBeenCalledTimes(1);
    expect(campaignRunApiService.getCampaignEstimate.mock.calls[0][1].startAt).toBe('2026-10-07T00:00:00.000Z');
  });

  it('tắt (đóng hộp) giữa chừng → huỷ request, về idle', async () => {
    let signal;
    campaignRunApiService.getCampaignEstimate.mockImplementation((id, q, o) => { signal = o.signal; return new Promise(() => {}); });
    const { result, rerender } = renderHook(
      ({ enabled }) => useCampaignEstimate({ campaignId: 438, enabled, debounceMs: 0 }),
      { initialProps: { enabled: true } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    expect(result.current.status).toBe('idle');
  });
});
