/**
 * PR-3 ước tính thời gian gửi — controller: hộp Chạy / Đặt lịch gọi ước tính đúng tham số, và 409 SCHEDULE_OVERLAP
 * hiện câu server + gợi ý trong modal (không đóng modal).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor, render, screen } from '@testing-library/react';
import useCampaignRunController from '../useCampaignRunController';
import campaignRunApiService from '../../services/campaignRunApi.service';
import { ESTIMATE_438 } from '../../utils/__tests__/campaignEstimate.fixtures';
import viTranslations from '../../../../i18n/vi';
import toast from 'react-hot-toast';

vi.mock('../../services/campaignRunApi.service', () => ({
  default: {
    getCampaignById: vi.fn(),
    getCampaignsByStatus: vi.fn(),
    getCampaignSchedules: vi.fn(),
    getCampaignRuns: vi.fn(),
    getCampaignRunDetail: vi.fn(),
    getCampaignEstimate: vi.fn(),
    runCampaign: vi.fn(),
    stopCampaignRun: vi.fn(),
    createCampaignSchedule: vi.fn(),
    deleteCampaignSchedule: vi.fn(),
    updateCampaignSchedule: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() } }));
const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));

/** Hình dạng thật: axios `{ data: { success, data } }`. */
const apiOk = (data) => ({ data: { success: true, data } });
const campaign438 = { id: 438, campaignName: 'Chiến dịch 438', status: 'active', campaignType: 'zalo_personal' };

describe('useCampaignRunController — ước tính thời gian gửi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignRunApiService.getCampaignSchedules.mockResolvedValue({ data: { data: [] } });
    campaignRunApiService.getCampaignRuns.mockResolvedValue({ data: { data: [] } });
    campaignRunApiService.getCampaignEstimate.mockResolvedValue(apiOk(ESTIMATE_438));
  });

  it('mở hộp Chạy → gọi ước tính của chiến dịch (không startAt = bây giờ, continuous=false) và có kết quả', async () => {
    const { result } = renderHook(() => useCampaignRunController());
    await act(async () => { await result.current.openRunConfirmModal(campaign438); });

    await waitFor(() => expect(result.current.runEstimate.status).toBe('ready'));
    expect(campaignRunApiService.getCampaignEstimate).toHaveBeenCalledWith(
      438, { startAt: null, continuous: false }, { signal: expect.any(AbortSignal) },
    );
    expect(result.current.runEstimate.estimate.finishAtLatest).toBe(ESTIMATE_438.finishAtLatest);
  });

  it('bật "chạy liên tục" → gọi lại với continuous=true', async () => {
    const { result } = renderHook(() => useCampaignRunController());
    await act(async () => { await result.current.openRunConfirmModal(campaign438); });
    await waitFor(() => expect(result.current.runEstimate.status).toBe('ready'));
    act(() => { result.current.setRunContinuousMode(true); });
    await waitFor(() => expect(campaignRunApiService.getCampaignEstimate).toHaveBeenLastCalledWith(
      438, { startAt: null, continuous: true }, { signal: expect.any(AbortSignal) },
    ));
  });

  it('ước tính lỗi → runEstimate.status "error", nút chạy không bị chặn (handleRunNow vẫn gọi API chạy)', async () => {
    campaignRunApiService.getCampaignEstimate.mockRejectedValue(new Error('500'));
    campaignRunApiService.runCampaign.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useCampaignRunController());
    await act(async () => { await result.current.openRunConfirmModal(campaign438); });
    await waitFor(() => expect(result.current.runEstimate.status).toBe('error'));
    await act(async () => { await result.current.handleRunNow(); });
    expect(campaignRunApiService.runCampaign).toHaveBeenCalledTimes(1);
  });

  it('hộp Đặt lịch: ước tính theo GIỜ NỔ đã chọn (05/10 06:00 giờ VN = 04/10 23:00Z), gọi lại khi đổi giờ', async () => {
    const { result } = renderHook(() => useCampaignRunController());
    act(() => { result.current.openScheduleModal(campaign438); });
    // Chưa chọn ngày/giờ → chưa gọi.
    expect(campaignRunApiService.getCampaignEstimate).not.toHaveBeenCalled();

    act(() => {
      result.current.setScheduleForm((prev) => ({ ...prev, scheduleType: 'once', scheduleDate: '2026-10-05', scheduleTime: '06:00' }));
    });
    await waitFor(() => expect(campaignRunApiService.getCampaignEstimate).toHaveBeenCalledWith(
      438, { startAt: '2026-10-04T23:00:00.000Z', continuous: false }, { signal: expect.any(AbortSignal) },
    ), { timeout: 3000 });
    await waitFor(() => expect(result.current.scheduleEstimate.status).toBe('ready'));

    act(() => {
      result.current.setScheduleForm((prev) => ({ ...prev, scheduleDate: '2026-10-06' }));
    });
    await waitFor(() => expect(campaignRunApiService.getCampaignEstimate).toHaveBeenLastCalledWith(
      438, { startAt: '2026-10-05T23:00:00.000Z', continuous: false }, { signal: expect.any(AbortSignal) },
    ), { timeout: 3000 });
  });

  it('đóng hộp Đặt lịch → ước tính về idle', async () => {
    const { result } = renderHook(() => useCampaignRunController());
    act(() => { result.current.openScheduleModal(campaign438); });
    act(() => {
      result.current.setScheduleForm((prev) => ({ ...prev, scheduleDate: '2026-10-05', scheduleTime: '06:00' }));
    });
    await waitFor(() => expect(result.current.scheduleEstimate.status).toBe('ready'), { timeout: 3000 });
    act(() => { result.current.closeScheduleModal(); });
    await waitFor(() => expect(result.current.scheduleEstimate.status).toBe('idle'));
  });

  it('409 SCHEDULE_OVERLAP khi tạo lịch → hiện NGUYÊN message server + 3 gợi ý, modal KHÔNG đóng', async () => {
    const serverMessage = 'Lượt chạy lúc 03/10 09:00 dự kiến xong khoảng 06/10 10:00, lịch kế tiếp lúc 04/10 09:00 sẽ bị bỏ qua.';
    campaignRunApiService.createCampaignSchedule.mockRejectedValue({
      response: {
        status: 409,
        data: { success: false, code: 'SCHEDULE_OVERLAP', message: serverMessage, overlap: {}, suggestions: ['use_steps', 'add_accounts', 'spread_schedule'] },
      },
    });
    const { result } = renderHook(() => useCampaignRunController());
    act(() => { result.current.openScheduleModal(campaign438); });
    act(() => {
      result.current.setScheduleForm((prev) => ({ ...prev, scheduleName: 'Lịch 2', scheduleType: 'once', scheduleDate: '2099-10-05', scheduleTime: '09:00' }));
    });
    await act(async () => { await result.current.handleSaveSchedule(); });

    expect(result.current.scheduleFormError).toBe(serverMessage);
    expect(result.current.scheduleOverlapSuggestions).toEqual([
      viTranslations.campaignEstimate.suggestion.use_steps,
      viTranslations.campaignEstimate.suggestion.add_accounts,
      viTranslations.campaignEstimate.suggestion.spread_schedule,
    ]);
    expect(result.current.showScheduleModal).toBe(true);
    // Modal đã hiện khối lỗi → KHÔNG toast thêm (trước đây câu hiện hai lần).
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.custom).not.toHaveBeenCalled();
  });

  it('409 khác (CAMPAIGN_NOT_ACTIVE) → có message, KHÔNG có gợi ý chồng lịch', async () => {
    campaignRunApiService.createCampaignSchedule.mockRejectedValue({
      response: { status: 409, data: { success: false, code: 'CAMPAIGN_NOT_ACTIVE', message: 'Chiến dịch chưa active' } },
    });
    const { result } = renderHook(() => useCampaignRunController());
    act(() => { result.current.openScheduleModal({ ...campaign438, status: 'active' }); });
    act(() => {
      result.current.setScheduleForm((prev) => ({ ...prev, scheduleName: 'Lịch', scheduleType: 'once', scheduleDate: '2099-10-05', scheduleTime: '09:00' }));
    });
    await act(async () => { await result.current.handleSaveSchedule(); });
    expect(result.current.scheduleFormError).toBe('Chiến dịch chưa active');
    expect(result.current.scheduleOverlapSuggestions).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('lỗi không có phản hồi (mạng) khi tạo lịch → khối lỗi trong modal nhận câu mặc định, không toast', async () => {
    campaignRunApiService.createCampaignSchedule.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useCampaignRunController());
    act(() => { result.current.openScheduleModal({ ...campaign438, status: 'active' }); });
    act(() => {
      result.current.setScheduleForm((prev) => ({ ...prev, scheduleName: 'Lịch', scheduleType: 'once', scheduleDate: '2099-10-05', scheduleTime: '09:00' }));
    });
    await act(async () => { await result.current.handleSaveSchedule(); });
    expect(result.current.scheduleFormError).toBe(viTranslations.campaigns.createScheduleFailed);
    expect(toast.error).not.toHaveBeenCalled();
  });

  describe('bật lại lịch (handleToggleSchedule)', () => {
    it('409 SCHEDULE_OVERLAP → toast.custom dài 12 giây có câu server + đủ 3 gợi ý + nút đóng; KHÔNG toast.error', async () => {
      const serverMessage = 'Lượt chạy lúc 03/10 09:00 dự kiến xong khoảng 06/10 10:00, lịch kế tiếp lúc 04/10 09:00 sẽ bị bỏ qua.';
      campaignRunApiService.updateCampaignSchedule.mockRejectedValue({
        response: {
          status: 409,
          data: { success: false, code: 'SCHEDULE_OVERLAP', message: serverMessage, overlap: {}, suggestions: ['use_steps', 'add_accounts', 'spread_schedule'] },
        },
      });
      const { result } = renderHook(() => useCampaignRunController());
      await act(async () => { await result.current.handleToggleSchedule(7, false); });

      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.custom).toHaveBeenCalledTimes(1);
      const [renderFn, options] = toast.custom.mock.calls[0];
      expect(options.duration).toBeGreaterThanOrEqual(12000);
      render(renderFn({ visible: true, id: 'toast-1' }));
      expect(screen.getByRole('alert')).toHaveTextContent(serverMessage);
      expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        viTranslations.campaignEstimate.suggestion.use_steps,
        viTranslations.campaignEstimate.suggestion.add_accounts,
        viTranslations.campaignEstimate.suggestion.spread_schedule,
      ]);
      screen.getByRole('button', { name: viTranslations.common.close }).click();
      expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
    });

    it('lỗi khác (409 CAMPAIGN_NOT_ACTIVE) → toast.error với câu server như cũ, KHÔNG toast.custom', async () => {
      campaignRunApiService.updateCampaignSchedule.mockRejectedValue({
        response: { status: 409, data: { success: false, code: 'CAMPAIGN_NOT_ACTIVE', message: 'Chiến dịch chưa active' } },
      });
      const { result } = renderHook(() => useCampaignRunController());
      await act(async () => { await result.current.handleToggleSchedule(7, false); });
      expect(toast.error).toHaveBeenCalledWith('Chiến dịch chưa active', expect.anything());
      expect(toast.custom).not.toHaveBeenCalled();
    });

    it('lỗi mạng → toast.error với câu mặc định', async () => {
      campaignRunApiService.updateCampaignSchedule.mockRejectedValue(new Error('Network Error'));
      const { result } = renderHook(() => useCampaignRunController());
      await act(async () => { await result.current.handleToggleSchedule(7, false); });
      expect(toast.error).toHaveBeenCalledWith(viTranslations.campaigns.updateScheduleFailed, expect.anything());
      expect(toast.custom).not.toHaveBeenCalled();
    });
  });
});
