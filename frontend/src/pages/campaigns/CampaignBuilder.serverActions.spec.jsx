import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import CampaignBuilder from './CampaignBuilder';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-1.
 *
 * Bẫy lớn nhất của 2 nút mới: "Chạy ngay" gửi lệnh cho MÁY CHỦ, mà máy chủ đọc flow_json TRONG DB.
 * Sơ đồ đang sửa dở (isDirty) mà chạy luôn nghĩa là gửi theo bản cũ trong im lặng — tin đã đi rồi
 * mới biết. Vì vậy các ca dưới canh: chưa lưu thì KHÔNG được gọi API chạy, và "Lưu rồi tiếp tục"
 * phải lưu TRƯỚC rồi mới mở hộp xác nhận chạy.
 *
 * "Chạy thử" là nút cũ, chạy ngay trong trình duyệt — phải giữ nguyên, không được trỏ nhầm sang
 * đường gửi thật.
 */
const {
  mockOpenRunConfirmModal,
  mockOpenScheduleModal,
  mockExecuteCampaignRun,
  mockUpdateCampaign,
  mockGetCampaignRuns,
  mockFetchZaloAccountOptions,
} = vi.hoisted(() => ({
  mockOpenRunConfirmModal: vi.fn(),
  mockOpenScheduleModal: vi.fn(),
  mockExecuteCampaignRun: vi.fn().mockResolvedValue(undefined),
  mockUpdateCampaign: vi.fn().mockResolvedValue({ data: { data: { id: 391 } } }),
  mockGetCampaignRuns: vi.fn().mockResolvedValue({ data: { data: [] } }),
  mockFetchZaloAccountOptions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../features/campaigns/utils/nodeConfigModal.helpers', () => ({
  fetchZaloAccountOptions: mockFetchZaloAccountOptions,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../features/templates/utils/fetchAllTemplateListPages', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../features/campaigns/services/campaignBuilderApi.service', () => ({
  default: {
    getActiveEmailSettings: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
    getCampaignById: vi.fn().mockResolvedValue({
      data: {
        data: {
          id: 391,
          campaignName: 'Chiến dịch thư cảm ơn',
          campaignType: 'email',
          status: 'draft',
          nodes: [],
          connections: [],
        },
      },
    }),
    updateCampaign: mockUpdateCampaign,
    createCampaign: vi.fn().mockResolvedValue({ data: { data: { id: 391 } } }),
  },
}));

vi.mock('../../features/campaigns/services/campaignRunApi.service', () => ({
  default: {
    getCampaignRuns: mockGetCampaignRuns,
    getCampaignSchedules: vi.fn().mockResolvedValue({ data: { data: [] } }),
    runCampaign: vi.fn(),
  },
}));

vi.mock('../../features/campaigns/utils/campaignBuilderRunExecutor', () => ({
  executeCampaignRun: mockExecuteCampaignRun,
}));

vi.mock('../../features/campaigns/hooks/useBrowserRouterBlocker', () => ({
  default: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
}));

vi.mock('../../features/campaigns/hooks/useCampaignBuilderLayoutState', () => ({
  default: () => ({
    runLogHeight: 240,
    isResizingLog: false,
    logListWidth: 240,
    isResizingLogSplit: false,
    builderSidebarWidth: 240,
    isResizingBuilderSidebar: false,
    logPanelRef: { current: null },
    handleLogResizeStart: vi.fn(),
    handleLogSplitResizeStart: vi.fn(),
    handleBuilderSidebarResizeStart: vi.fn(),
  }),
}));

vi.mock('../../features/campaigns/hooks/useCampaignRunController', () => ({
  default: () => ({
    openRunConfirmModal: mockOpenRunConfirmModal,
    openScheduleModal: mockOpenScheduleModal,
    isZaloGroupCampaign: () => false,
    schedules: [],
    weeklyDayOptions: [],
    showRunConfirmModal: false,
    showScheduleModal: false,
    showScheduleDetailModal: false,
    scheduleForm: {},
    setScheduleForm: vi.fn(),
    setRunNameInput: vi.fn(),
    setRunContinuousMode: vi.fn(),
    setRunPollIntervalMinutes: vi.fn(),
    setRunResumeMode: vi.fn(),
    setRunResumeFromId: vi.fn(),
    continuousResumeRunOptions: [],
    stoppingRunIds: new Set(),
    scheduleRuns: [],
  }),
}));

vi.mock('../../utils/campaignDraftStorage', () => ({
  readCampaignDraft: vi.fn(() => null),
  writeCampaignDraft: vi.fn(),
  clearCampaignDraft: vi.fn(),
}));

vi.mock('../../features/campaigns/components/CampaignBuilderPageLayout', () => ({
  default: ({
    onRunNow,
    onOpenSchedule,
    onRunCampaign,
    canUseServerRunActions,
    serverRunActionsDisabledHint,
    campaignName,
    setNodes,
  }) => (
    <div>
      <span data-testid="campaign-name">{campaignName}</span>
      <span data-testid="can-use-server-actions">{String(canUseServerRunActions)}</span>
      <span data-testid="disabled-hint">{serverRunActionsDisabledHint}</span>
      <button type="button" onClick={onRunNow} disabled={!canUseServerRunActions}>Chạy ngay</button>
      <button type="button" onClick={onOpenSchedule} disabled={!canUseServerRunActions}>Lên lịch</button>
      <button type="button" onClick={onRunCampaign}>Chạy thử</button>
      <button
        type="button"
        onClick={() => setNodes((prev) => [...prev, {
          id: 'node-moi',
          type: 'task',
          position: { x: 10, y: 10 },
          data: { label: 'Node mới', nodeType: 'send_email', config: {} },
        }])}
      >
        Sửa sơ đồ
      </button>
    </div>
  ),
}));

function renderBuilder(path = '/app/campaigns/391') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          <Route path="/app/campaigns/:id" element={<CampaignBuilder />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('CampaignBuilder — nút gửi thật trong sơ đồ (PR-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockGetCampaignRuns.mockResolvedValue({ data: { data: [] } });
    mockUpdateCampaign.mockResolvedValue({ data: { data: { id: 391 } } });
  });

  it('sơ đồ đã lưu → "Chạy ngay" mở thẳng hộp xác nhận chạy', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));

    await waitFor(() => expect(mockOpenRunConfirmModal).toHaveBeenCalledTimes(1));
    expect(mockOpenRunConfirmModal).toHaveBeenCalledWith(expect.objectContaining({
      id: '391',
      campaignName: 'Chiến dịch thư cảm ơn',
      campaignType: 'email',
    }));
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it('sơ đồ sửa chưa lưu → hiện hộp "Sơ đồ chưa được lưu", KHÔNG mở hộp chạy', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Sửa sơ đồ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));

    await waitFor(() => expect(screen.getByText('Sơ đồ chưa được lưu')).toBeInTheDocument());
    expect(mockOpenRunConfirmModal).not.toHaveBeenCalled();
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it('bấm "Lưu rồi tiếp tục" → lưu TRƯỚC, lưu xong mới mở hộp xác nhận chạy', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Sửa sơ đồ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));
    await waitFor(() => expect(screen.getByText('Sơ đồ chưa được lưu')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Lưu rồi tiếp tục' }));

    await waitFor(() => expect(mockOpenRunConfirmModal).toHaveBeenCalledTimes(1));
    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1);
    expect(mockUpdateCampaign.mock.invocationCallOrder[0])
      .toBeLessThan(mockOpenRunConfirmModal.mock.invocationCallOrder[0]);
  });

  it('lưu HỎNG → không chạy tiếp bằng bản cũ trong DB', async () => {
    mockUpdateCampaign.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Lỗi máy chủ' } } });
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Sửa sơ đồ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));
    await waitFor(() => expect(screen.getByText('Sơ đồ chưa được lưu')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu rồi tiếp tục' }));

    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(1));
    expect(mockOpenRunConfirmModal).not.toHaveBeenCalled();
  });

  it('"Lên lịch" đi qua đúng cùng một chốt chặn chưa lưu', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Lên lịch' }));
    await waitFor(() => expect(mockOpenScheduleModal).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Sửa sơ đồ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lên lịch' }));
    await waitFor(() => expect(screen.getByText('Sơ đồ chưa được lưu')).toBeInTheDocument());
    expect(mockOpenScheduleModal).toHaveBeenCalledTimes(1);
  });

  it('"Chạy thử" vẫn chạy trong trình duyệt, KHÔNG đụng đường gửi thật', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử' }));

    await waitFor(() => expect(mockExecuteCampaignRun).toHaveBeenCalledTimes(1));
    expect(mockOpenRunConfirmModal).not.toHaveBeenCalled();
    expect(mockOpenScheduleModal).not.toHaveBeenCalled();
  });

  it('chiến dịch mới chưa lưu lần nào → 2 nút gửi thật bị vô hiệu kèm gợi ý', async () => {
    renderBuilder('/app/campaigns/new');

    await waitFor(() => expect(screen.getByTestId('can-use-server-actions')).toHaveTextContent('false'));
    expect(screen.getByRole('button', { name: 'Chạy ngay' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lên lịch' })).toBeDisabled();
    expect(screen.getByTestId('disabled-hint')).toHaveTextContent('Lưu chiến dịch trước đã');
  });

  it('chiến dịch Zalo cá nhân có tài khoản bị giới hạn tra số → hiện hộp xác nhận trước khi chạy', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockFetchZaloAccountOptions.mockResolvedValue([
      {
        id: 'acc1',
        displayName: 'SIM1-DIGISO',
        phoneLookupCooldownUntil: new Date(Date.now() + 3600000).toISOString(),
      },
    ]);

    const { default: api } = await import('../../features/campaigns/services/campaignBuilderApi.service');
    api.getCampaignById.mockResolvedValueOnce({
      data: {
        data: {
          id: 391,
          campaignName: 'Zalo cá nhân chăm sóc',
          campaignType: 'zalo',
          status: 'draft',
          nodes: [
            {
              id: 'n-zalo',
              nodeType: 'action',
              nodeSubtype: 'select_zalo_account',
              config: { zaloAccountId: 'acc1' },
            },
          ],
          connections: [],
        },
      },
    });

    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Zalo cá nhân chăm sóc'));

    // TH1: Người dùng bấm Huỷ (false) -> không mở hộp chạy
    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1);
    });
    expect(confirmSpy.mock.calls[0][0]).toContain('SIM1-DIGISO đang bị giới hạn tới');
    expect(mockOpenRunConfirmModal).not.toHaveBeenCalled();

    // TH2: Người dùng bấm Đồng ý (true) -> mở hộp chạy
    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));

    await waitFor(() => {
      expect(mockOpenRunConfirmModal).toHaveBeenCalledTimes(1);
    });
    confirmSpy.mockRestore();
  });

  it('chiến dịch Zalo nhóm cùng tài khoản đó → không hỏi xác nhận, mở thẳng hộp chạy', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockFetchZaloAccountOptions.mockResolvedValue([
      {
        id: 'acc1',
        displayName: 'SIM1-DIGISO',
        phoneLookupCooldownUntil: new Date(Date.now() + 3600000).toISOString(),
      },
    ]);

    const { default: api } = await import('../../features/campaigns/services/campaignBuilderApi.service');
    api.getCampaignById.mockResolvedValueOnce({
      data: {
        data: {
          id: 391,
          campaignName: 'Zalo nhóm thông báo',
          campaignType: 'zalo_group',
          status: 'draft',
          nodes: [
            {
              id: 'n-zalo',
              nodeType: 'action',
              nodeSubtype: 'select_zalo_account',
              config: { zaloAccountId: 'acc1' },
            },
          ],
          connections: [],
        },
      },
    });

    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Zalo nhóm thông báo'));

    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));

    await waitFor(() => {
      expect(mockOpenRunConfirmModal).toHaveBeenCalledTimes(1);
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
