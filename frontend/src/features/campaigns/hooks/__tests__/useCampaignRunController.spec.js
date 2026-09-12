import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useCampaignRunController from '../useCampaignRunController';
import campaignRunApiService from '../../services/campaignRunApi.service';
import toast from 'react-hot-toast';

vi.mock('../../services/campaignRunApi.service', () => ({
  default: {
    getCampaignById: vi.fn(),
    getCampaignsByStatus: vi.fn(),
    getCampaignSchedules: vi.fn(),
    getCampaignRuns: vi.fn(),
    getCampaignRunDetail: vi.fn(),
    runCampaign: vi.fn(),
    stopCampaignRun: vi.fn(),
    createCampaignSchedule: vi.fn(),
    deleteCampaignSchedule: vi.fn(),
    updateCampaignSchedule: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({
    t: (key) => key,
  }),
}));

describe('useCampaignRunController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignRunApiService.getCampaignSchedules.mockResolvedValue({
      data: { data: [] },
    });
    campaignRunApiService.getCampaignRuns.mockResolvedValue({
      data: { data: [] },
    });
  });

  it('mount → gọi getCampaignRuns("limit=100"), run status:"running" làm isCampaignRunningById(id) true', async () => {
    campaignRunApiService.getCampaignRuns.mockResolvedValueOnce({
      data: {
        data: [
          { id: 1, campaignId: 101, status: 'running' },
          { id: 2, campaignId: 102, status: 'completed' },
        ],
      },
    });

    const { result } = renderHook(() => useCampaignRunController());

    await waitFor(() => {
      expect(campaignRunApiService.getCampaignRuns).toHaveBeenCalledWith('limit=100');
      expect(result.current.isCampaignRunningById(101)).toBe(true);
    });

    expect(result.current.isCampaignRunningById(102)).toBe(false);
    expect(result.current.isCampaignRunningById(999)).toBe(false);
  });

  it('openRunConfirmModal với chiến dịch đang chạy → toast.error, modal không mở', async () => {
    campaignRunApiService.getCampaignRuns.mockResolvedValueOnce({
      data: {
        data: [{ id: 1, campaignId: 101, status: 'running' }],
      },
    });

    const { result } = renderHook(() => useCampaignRunController());

    await waitFor(() => {
      expect(result.current.isCampaignRunningById(101)).toBe(true);
    });

    await act(async () => {
      await result.current.openRunConfirmModal({ id: 101, campaignName: 'Running Campaign' });
    });

    expect(toast.error).toHaveBeenCalledWith('campaigns.runningBlockRunConfirm');
    expect(result.current.showRunConfirmModal).toBe(false);
  });

  it('handleRunNow gửi source:"campaign_run", continuousMode:false cho zalo_group kể cả khi bật liên tục', async () => {
    campaignRunApiService.runCampaign.mockResolvedValueOnce({
      data: { success: true },
    });

    const { result } = renderHook(() => useCampaignRunController());

    await waitFor(() => {
      expect(campaignRunApiService.getCampaignRuns).toHaveBeenCalled();
    });

    const zaloGroupCampaign = {
      id: 202,
      campaignName: 'Nhóm Zalo VIP',
      campaignType: 'zalo_group',
    };

    await act(async () => {
      await result.current.openRunConfirmModal(zaloGroupCampaign);
    });

    expect(result.current.showRunConfirmModal).toBe(true);

    // Bật continuous mode
    act(() => {
      result.current.setRunContinuousMode(true);
    });

    await act(async () => {
      await result.current.handleRunNow();
    });

    expect(campaignRunApiService.runCampaign).toHaveBeenCalledWith(
      202,
      expect.objectContaining({
        source: 'campaign_run',
        continuousMode: false,
      })
    );
    expect(result.current.showRunConfirmModal).toBe(false);
  });

  it('handleToggleSchedule với lịch một lần đã chạy → không gọi API', async () => {
    const completedOnceSchedule = {
      id: 303,
      campaignId: 404,
      scheduleName: 'Lịch một lần đã hoàn thành',
      scheduleType: 'once',
      runCount: 1,
      enabled: false,
    };

    campaignRunApiService.getCampaignSchedules.mockResolvedValueOnce({
      data: { data: [completedOnceSchedule] },
    });

    const { result } = renderHook(() => useCampaignRunController());

    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    await act(async () => {
      await result.current.handleToggleSchedule(303, false);
    });

    expect(toast.error).toHaveBeenCalledWith('campaigns.scheduleOneTimeCompleted');
    expect(campaignRunApiService.updateCampaignSchedule).not.toHaveBeenCalled();
  });
});
