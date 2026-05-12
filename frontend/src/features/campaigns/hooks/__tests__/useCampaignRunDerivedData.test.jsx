import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../utils/campaignExecutionLogs', () => ({
  buildWorkspaceLogsFromExecution: vi.fn((logs, { flowOrderByNodeId } = {}) => {
    const order = flowOrderByNodeId || {};
    return (Array.isArray(logs) ? logs : [])
      .slice()
      .sort((a, b) => (order[a.nodeId] ?? 999) - (order[b.nodeId] ?? 999))
      .map((l) => ({ id: `node-${l.nodeId}`, nodeId: l.nodeId, message: l.message }));
  }),
}));

import useCampaignRunDerivedData from '../useCampaignRunDerivedData';

const baseProps = {
  selectedRunDetail: null,
  flowOrderByNodeId: {},
  selectedCampaignForLogs: null,
  campaigns: [],
  activeCampaignSearch: '',
  schedules: [],
  scheduledCampaignSearch: '',
  pausedCampaigns: [],
  pausedCampaignSearch: '',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCampaignRunDerivedData — workspaceLogs', () => {
  it('selectedRunDetail null → []', () => {
    const { result } = renderHook(() => useCampaignRunDerivedData(baseProps));
    expect(result.current.workspaceLogs).toEqual([]);
  });

  it('status="completed" → system start + node logs + run-end (info "Hoàn tất")', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        selectedRunDetail: {
          id: 99,
          status: 'completed',
          startedAt: '2026-05-01T10:00:00Z',
          completedAt: '2026-05-01T10:05:00Z',
          executionLogs: [
            { nodeId: 'a', message: 'na' },
            { nodeId: 'b', message: 'nb' },
          ],
        },
        flowOrderByNodeId: { a: 0, b: 1 },
      })
    );
    const logs = result.current.workspaceLogs;
    expect(logs[0].id).toBe('run-start-99');
    expect(logs[0].status).toBe('info');
    expect(logs[0].nodeName).toBe('Hệ thống');
    expect(logs[0].message).toBe('Bắt đầu chạy chiến dịch');
    expect(logs[1].nodeId).toBe('a');
    expect(logs[2].nodeId).toBe('b');
    expect(logs[3].id).toBe('run-end-99');
    expect(logs[3].status).toBe('info');
    expect(logs[3].message).toBe('Hoàn tất chạy chiến dịch');
    expect(logs[0].timestamp).toBeInstanceOf(Date);
    expect(logs[3].timestamp).toBeInstanceOf(Date);
  });

  it('status="failed" → run-end status=failed, message từ errorMessage', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        selectedRunDetail: {
          id: 7,
          status: 'failed',
          errorMessage: 'Sheet API down',
          startedAt: '2026-05-01T10:00:00Z',
          completedAt: '2026-05-01T10:01:00Z',
          executionLogs: [],
        },
      })
    );
    const logs = result.current.workspaceLogs;
    expect(logs.at(-1).id).toBe('run-end-7');
    expect(logs.at(-1).status).toBe('failed');
    expect(logs.at(-1).message).toBe('Sheet API down');
    expect(logs.at(-1).result.output.error).toBe('Sheet API down');
  });

  it('status="failed" không có errorMessage → fallback "Chiến dịch chạy thất bại"', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        selectedRunDetail: { id: 8, status: 'failed', executionLogs: [] },
      })
    );
    expect(result.current.workspaceLogs.at(-1).message).toBe('Chiến dịch chạy thất bại');
    expect(result.current.workspaceLogs.at(-1).result.output.error).toBeNull();
  });

  it('status khác completed/failed → KHÔNG có run-end log (chỉ start + node logs)', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        selectedRunDetail: {
          id: 10,
          status: 'running',
          executionLogs: [{ nodeId: 'a', message: 'x' }],
        },
      })
    );
    const logs = result.current.workspaceLogs;
    expect(logs).toHaveLength(2);
    expect(logs[0].id).toBe('run-start-10');
    expect(logs[1].nodeId).toBe('a');
    expect(logs.some((l) => l.id?.startsWith('run-end-'))).toBe(false);
  });

  it('startedAt/completedAt thiếu → fallback Date.now() (không crash)', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        selectedRunDetail: { id: 1, status: 'completed', executionLogs: [] },
      })
    );
    expect(result.current.workspaceLogs[0].timestamp).toBeInstanceOf(Date);
  });

  it('executionLogs không phải array → coi như rỗng (buildWorkspaceLogsFromExecution xử lý)', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        selectedRunDetail: { id: 2, status: 'completed', executionLogs: null },
      })
    );
    const logs = result.current.workspaceLogs;
    expect(logs[0].id).toBe('run-start-2');
    expect(logs.at(-1).id).toBe('run-end-2');
  });
});

describe('useCampaignRunDerivedData — filteredActiveCampaigns', () => {
  const campaigns = [
    { id: 1, campaignName: 'Welcome Email' },
    { id: 2, campaignName: 'Promo Summer' },
    { id: 12, campaignName: 'Reminder' },
  ];

  it('search rỗng + không selectedLogCampaignId → trả full', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({ ...baseProps, campaigns })
    );
    expect(result.current.filteredActiveCampaigns).toHaveLength(3);
  });

  it('selectedLogCampaignId → chỉ giữ campaign khớp id (cast Number)', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        campaigns,
        selectedCampaignForLogs: { id: '2' },
      })
    );
    expect(result.current.filteredActiveCampaigns).toHaveLength(1);
    expect(result.current.filteredActiveCampaigns[0].id).toBe(2);
  });

  it('search keyword khớp name (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        campaigns,
        activeCampaignSearch: 'PROMO',
      })
    );
    expect(result.current.filteredActiveCampaigns).toHaveLength(1);
    expect(result.current.filteredActiveCampaigns[0].campaignName).toBe('Promo Summer');
  });

  it('search keyword khớp substring ID', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        campaigns,
        activeCampaignSearch: '12',
      })
    );
    const out = result.current.filteredActiveCampaigns;
    expect(out.some((c) => c.id === 12)).toBe(true);
  });

  it('selectedLogCampaignId ưu tiên hơn search', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        campaigns,
        selectedCampaignForLogs: { id: 1 },
        activeCampaignSearch: 'NoMatch',
      })
    );
    expect(result.current.filteredActiveCampaigns).toHaveLength(1);
    expect(result.current.filteredActiveCampaigns[0].id).toBe(1);
  });

  it('search khớp space (trim) — "  welcome  " vẫn match', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        campaigns,
        activeCampaignSearch: '   welcome  ',
      })
    );
    expect(result.current.filteredActiveCampaigns).toHaveLength(1);
  });
});

describe('useCampaignRunDerivedData — filteredSchedules', () => {
  const schedules = [
    { id: 1, scheduleName: 'Daily Promo', campaignName: 'Promo', campaignId: 100 },
    { id: 2, scheduleName: 'Weekly Recap', campaignName: 'Recap', campaignId: 200 },
    { id: 3, scheduleName: 'Custom', campaignName: 'X', campaignId: 12 },
  ];

  it('search rỗng → trả full', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({ ...baseProps, schedules })
    );
    expect(result.current.filteredSchedules).toHaveLength(3);
  });

  it('search keyword khớp scheduleName', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        schedules,
        scheduledCampaignSearch: 'WEEKLY',
      })
    );
    expect(result.current.filteredSchedules).toHaveLength(1);
    expect(result.current.filteredSchedules[0].scheduleName).toBe('Weekly Recap');
  });

  it('search keyword khớp campaignName', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        schedules,
        scheduledCampaignSearch: 'recap',
      })
    );
    expect(result.current.filteredSchedules).toHaveLength(1);
  });

  it('search keyword khớp substring campaignId', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        schedules,
        scheduledCampaignSearch: '12',
      })
    );
    expect(result.current.filteredSchedules.some((s) => s.campaignId === 12)).toBe(true);
  });
});

describe('useCampaignRunDerivedData — filteredPausedCampaigns', () => {
  const pausedCampaigns = [
    { id: 1, campaignName: 'Old Promo' },
    { id: 2, campaignName: 'Legacy' },
  ];

  it('selectedLogCampaignId → chỉ giữ campaign khớp', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        pausedCampaigns,
        selectedCampaignForLogs: { id: '1' },
      })
    );
    expect(result.current.filteredPausedCampaigns).toHaveLength(1);
    expect(result.current.filteredPausedCampaigns[0].id).toBe(1);
  });

  it('search rỗng → trả full', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({ ...baseProps, pausedCampaigns })
    );
    expect(result.current.filteredPausedCampaigns).toHaveLength(2);
  });

  it('search keyword khớp name/ID', () => {
    const { result } = renderHook(() =>
      useCampaignRunDerivedData({
        ...baseProps,
        pausedCampaigns,
        pausedCampaignSearch: 'legacy',
      })
    );
    expect(result.current.filteredPausedCampaigns).toHaveLength(1);
  });
});
