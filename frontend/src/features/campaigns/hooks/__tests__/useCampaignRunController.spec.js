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

  // PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-3, Việc 2: "Chạy ngay" (trình
  // dựng lẫn trang danh sách đều dùng chung handleRunNow này) phải gửi autoActivate: true để
  // backend tự kích hoạt chiến dịch nháp/tạm dừng trong cùng giao dịch chạy.
  it('handleRunNow gửi autoActivate: true', async () => {
    campaignRunApiService.runCampaign.mockResolvedValueOnce({
      data: { success: true },
    });

    const { result } = renderHook(() => useCampaignRunController());

    await waitFor(() => {
      expect(campaignRunApiService.getCampaignRuns).toHaveBeenCalled();
    });

    const draftCampaign = {
      id: 303,
      campaignName: 'Chiến dịch nháp',
      campaignType: 'email',
    };

    await act(async () => {
      await result.current.openRunConfirmModal(draftCampaign);
    });

    await act(async () => {
      await result.current.handleRunNow();
    });

    expect(campaignRunApiService.runCampaign).toHaveBeenCalledWith(
      303,
      expect.objectContaining({ autoActivate: true })
    );
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

  // Lệnh giao 21/09/2026, PR-1 Việc 1.4: catch cũ nuốt thông điệp server nên câu 409
  // CAMPAIGN_NOT_ACTIVE ("Bấm «Chạy ngay» một lần…") không bao giờ tới màn hình.
  describe('thông điệp lỗi của server phải tới người dùng', () => {
    const NOT_ACTIVE_MESSAGE = 'Chiến dịch đang ở trạng thái Nháp nên lịch sẽ không chạy. Bấm «Chạy ngay» một lần để kích hoạt chiến dịch, rồi đặt lịch lại.';
    const serverError = (message) => Object.assign(new Error('Request failed with status code 409'), {
      response: { status: 409, data: { success: false, code: 'CAMPAIGN_NOT_ACTIVE', message } },
    });

    const openAndFillScheduleForm = async (result) => {
      await act(async () => {
        result.current.openScheduleModal({ id: 395, campaignName: 'Nhắc lịch' });
      });
      await act(async () => {
        result.current.setScheduleForm((prev) => ({
          ...prev, scheduleType: 'daily', scheduleTime: '09:00', enabled: true,
        }));
      });
    };

    it('tạo lịch bị 409 → toast hiện ĐÚNG câu của server, không phải "createScheduleFailed"', async () => {
      campaignRunApiService.createCampaignSchedule.mockRejectedValueOnce(serverError(NOT_ACTIVE_MESSAGE));
      const { result } = renderHook(() => useCampaignRunController());
      await waitFor(() => expect(campaignRunApiService.getCampaignSchedules).toHaveBeenCalled());
      await openAndFillScheduleForm(result);

      await act(async () => {
        await result.current.handleSaveSchedule();
      });

      expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(NOT_ACTIVE_MESSAGE, expect.objectContaining({ duration: expect.any(Number) }));
      expect(toast.error).not.toHaveBeenCalledWith('campaigns.createScheduleFailed', expect.anything());
    });

    it('tạo lịch lỗi mạng (không có phản hồi server) → rơi về chuỗi mặc định', async () => {
      campaignRunApiService.createCampaignSchedule.mockRejectedValueOnce(new Error('Network Error'));
      const { result } = renderHook(() => useCampaignRunController());
      await waitFor(() => expect(campaignRunApiService.getCampaignSchedules).toHaveBeenCalled());
      await openAndFillScheduleForm(result);

      await act(async () => {
        await result.current.handleSaveSchedule();
      });

      expect(toast.error).toHaveBeenCalledWith('campaigns.createScheduleFailed', expect.anything());
    });

    it('bật lại lịch bị 409 CAMPAIGN_NOT_ACTIVE → toast hiện câu của server', async () => {
      campaignRunApiService.getCampaignSchedules.mockResolvedValueOnce({
        data: { data: [{ id: 177, campaignId: 395, scheduleName: 'Nhắc lịch', scheduleType: 'daily', runCount: 0, enabled: false, campaignStatus: 'draft' }] },
      });
      campaignRunApiService.updateCampaignSchedule.mockRejectedValueOnce(serverError(NOT_ACTIVE_MESSAGE));
      const { result } = renderHook(() => useCampaignRunController());
      await waitFor(() => expect(result.current.schedules).toHaveLength(1));

      await act(async () => {
        await result.current.handleToggleSchedule(177, false);
      });

      expect(campaignRunApiService.updateCampaignSchedule).toHaveBeenCalledWith(177, { enabled: true });
      expect(toast.error).toHaveBeenCalledWith(NOT_ACTIVE_MESSAGE, expect.objectContaining({ duration: expect.any(Number) }));
    });
  });

  // PLAN_DAT_LICH_CHIEN_DICH_NHAP_2026-09-23, PR-2 Việc 6: tạo lịch BẬT cho chiến dịch draft/paused
  // phải tự gắn cờ activateCampaign vào payload — người dùng chỉ bấm MỘT nút, không tự đánh dấu gì thêm.
  describe('tạo lịch kèm activateCampaign (PR-2 Việc 6)', () => {
    const openAndFillScheduleForm = async (result, campaign, formOverrides = {}) => {
      await act(async () => {
        result.current.openScheduleModal(campaign);
      });
      await act(async () => {
        result.current.setScheduleForm((prev) => ({
          ...prev, scheduleType: 'daily', scheduleTime: '09:00', enabled: true, ...formOverrides,
        }));
      });
    };

    it('chiến dịch draft + lịch BẬT → payload có activateCampaign:true, toast báo đã kích hoạt, refresh campaign', async () => {
      campaignRunApiService.createCampaignSchedule.mockResolvedValueOnce({ data: { success: true } });
      const onCampaignsChanged = vi.fn();
      const onCampaignActivated = vi.fn();
      const { result } = renderHook(() => useCampaignRunController({ onCampaignsChanged, onCampaignActivated }));
      await waitFor(() => expect(campaignRunApiService.getCampaignSchedules).toHaveBeenCalled());
      await openAndFillScheduleForm(result, { id: 395, campaignName: 'CSKH', status: 'draft' });

      await act(async () => {
        await result.current.handleSaveSchedule();
      });

      expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ campaignId: 395, activateCampaign: true }),
      );
      expect(toast.success).toHaveBeenCalledWith('campaignRunModals.scheduleActivatedSuccess');
      expect(onCampaignActivated).toHaveBeenCalledWith(395);
      expect(onCampaignsChanged).toHaveBeenCalledTimes(1);
    });

    it('chiến dịch active → payload activateCampaign:false, KHÔNG gọi onCampaignsChanged/onCampaignActivated (giữ hành vi cũ)', async () => {
      campaignRunApiService.createCampaignSchedule.mockResolvedValueOnce({ data: { success: true } });
      const onCampaignsChanged = vi.fn();
      const onCampaignActivated = vi.fn();
      const { result } = renderHook(() => useCampaignRunController({ onCampaignsChanged, onCampaignActivated }));
      await waitFor(() => expect(campaignRunApiService.getCampaignSchedules).toHaveBeenCalled());
      await openAndFillScheduleForm(result, { id: 1, campaignName: 'A', status: 'active' });

      await act(async () => {
        await result.current.handleSaveSchedule();
      });

      expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ activateCampaign: false }),
      );
      expect(toast.success).toHaveBeenCalledWith('campaigns.scheduleCreated');
      expect(onCampaignActivated).not.toHaveBeenCalled();
      expect(onCampaignsChanged).not.toHaveBeenCalled();
    });

    it('chiến dịch draft nhưng lịch soạn TẮT → payload activateCampaign:false (backend cho tạo luôn, không cần kích hoạt)', async () => {
      campaignRunApiService.createCampaignSchedule.mockResolvedValueOnce({ data: { success: true } });
      const { result } = renderHook(() => useCampaignRunController());
      await waitFor(() => expect(campaignRunApiService.getCampaignSchedules).toHaveBeenCalled());
      await openAndFillScheduleForm(result, { id: 395, campaignName: 'CSKH', status: 'draft' }, { enabled: false });

      await act(async () => {
        await result.current.handleSaveSchedule();
      });

      expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ activateCampaign: false }),
      );
    });

    it('409 CANNOT_ACTIVATE_EMPTY_CAMPAIGN → scheduleFormError nhận đúng câu lỗi, KHÔNG đóng modal', async () => {
      const emptyErr = Object.assign(new Error('Request failed with status code 409'), {
        response: { status: 409, data: { success: false, code: 'CANNOT_ACTIVATE_EMPTY_CAMPAIGN', message: 'Không thể kích hoạt chiến dịch khi chưa có node nào' } },
      });
      campaignRunApiService.createCampaignSchedule.mockRejectedValueOnce(emptyErr);
      const { result } = renderHook(() => useCampaignRunController());
      await waitFor(() => expect(campaignRunApiService.getCampaignSchedules).toHaveBeenCalled());
      await openAndFillScheduleForm(result, { id: 395, campaignName: 'CSKH', status: 'draft' });

      await act(async () => {
        await result.current.handleSaveSchedule();
      });

      expect(result.current.scheduleFormError).toBe('Không thể kích hoạt chiến dịch khi chưa có node nào');
      expect(result.current.showScheduleModal).toBe(true);
      expect(result.current.selectedCampaign).not.toBeNull();
    });

    it('mở lại modal → scheduleFormError của lần trước được xoá', async () => {
      const emptyErr = Object.assign(new Error('boom'), {
        response: { status: 409, data: { message: 'lỗi cũ' } },
      });
      campaignRunApiService.createCampaignSchedule.mockRejectedValueOnce(emptyErr);
      const { result } = renderHook(() => useCampaignRunController());
      await waitFor(() => expect(campaignRunApiService.getCampaignSchedules).toHaveBeenCalled());
      await openAndFillScheduleForm(result, { id: 395, campaignName: 'CSKH', status: 'draft' });
      await act(async () => {
        await result.current.handleSaveSchedule();
      });
      expect(result.current.scheduleFormError).toBe('lỗi cũ');

      await act(async () => {
        result.current.openScheduleModal({ id: 395, campaignName: 'CSKH', status: 'draft' });
      });

      expect(result.current.scheduleFormError).toBeNull();
    });
  });
});
