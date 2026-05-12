import { describe, it, expect, vi } from 'vitest';
import {
  getMaxExecutionLogUpdatedAt,
  fetchCampaignRunDetailAllExecutionLogs,
} from '../campaignRunExecutionLogLoader';

describe('getMaxExecutionLogUpdatedAt', () => {
  it('empty/null → null', () => {
    expect(getMaxExecutionLogUpdatedAt([])).toBeNull();
    expect(getMaxExecutionLogUpdatedAt()).toBeNull();
    expect(getMaxExecutionLogUpdatedAt([{}, { updatedAt: '' }])).toBeNull();
  });

  it('ưu tiên updatedAt, fallback createdAt', () => {
    const logs = [
      { updatedAt: '2026-03-15T10:00:00Z', createdAt: '2026-03-15T09:00:00Z' },
      { createdAt: '2026-03-15T11:00:00Z' },
    ];
    expect(getMaxExecutionLogUpdatedAt(logs)).toBe('2026-03-15T11:00:00Z');
  });

  it('chọn max theo string compare (ISO sortable)', () => {
    const logs = [
      { updatedAt: '2026-03-15T10:00:00Z' },
      { updatedAt: '2026-03-15T12:30:00Z' },
      { updatedAt: '2026-03-15T08:00:00Z' },
    ];
    expect(getMaxExecutionLogUpdatedAt(logs)).toBe('2026-03-15T12:30:00Z');
  });
});

describe('fetchCampaignRunDetailAllExecutionLogs', () => {
  it('1 trang (hasMore=false) — trả run + executionLogs', async () => {
    const getDetail = vi.fn().mockResolvedValueOnce({
      data: {
        data: {
          id: 1,
          status: 'completed',
          executionLogs: [{ id: 1 }, { id: 2 }],
          executionLogsHasMore: false,
        },
      },
    });
    const out = await fetchCampaignRunDetailAllExecutionLogs(getDetail, 1);
    expect(out.id).toBe(1);
    expect(out.status).toBe('completed');
    expect(out.executionLogs).toEqual([{ id: 1 }, { id: 2 }]);
    expect(out.executionLogsHasMore).toBeUndefined();
    expect(getDetail).toHaveBeenCalledTimes(1);
    expect(getDetail).toHaveBeenCalledWith(1, { executionLogsLimit: 150 });
  });

  it('multi-page cursor — gọi tiếp với executionLogsAfterId, gộp logs', async () => {
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 7,
            executionLogs: [{ id: 1 }, { id: 2 }],
            executionLogsHasMore: true,
            executionLogsNextAfterId: 2,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 7,
            executionLogs: [{ id: 3 }],
            executionLogsHasMore: false,
          },
        },
      });
    const out = await fetchCampaignRunDetailAllExecutionLogs(getDetail, 7, 50);
    expect(out.executionLogs.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(getDetail).toHaveBeenNthCalledWith(1, 7, { executionLogsLimit: 50 });
    expect(getDetail).toHaveBeenNthCalledWith(2, 7, { executionLogsLimit: 50, executionLogsAfterId: 2 });
  });

  it('data rỗng → throw MISSING_RUN_DATA', async () => {
    const getDetail = vi.fn().mockResolvedValueOnce({ data: null });
    await expect(fetchCampaignRunDetailAllExecutionLogs(getDetail, 1)).rejects.toMatchObject({
      message: 'Thiếu dữ liệu lượt chạy',
      code: 'MISSING_RUN_DATA',
    });
  });

  it('hasMore=true nhưng nextAfterId null → break không lặp vô hạn', async () => {
    const getDetail = vi.fn().mockResolvedValueOnce({
      data: {
        data: {
          id: 1,
          executionLogs: [{ id: 1 }],
          executionLogsHasMore: true,
          executionLogsNextAfterId: null,
        },
      },
    });
    const out = await fetchCampaignRunDetailAllExecutionLogs(getDetail, 1);
    expect(out.executionLogs).toEqual([{ id: 1 }]);
    expect(getDetail).toHaveBeenCalledTimes(1);
  });
});
