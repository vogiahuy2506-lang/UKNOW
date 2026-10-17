import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import CampaignBuilder from './CampaignBuilder';

/**
 * PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17 — PR-B, phía TRÌNH DỰNG: thanh tab Từng bước ⇄ Sơ đồ khối và hộp hỏi khi
 * đổi tab lúc còn thay đổi chưa lưu (Lưu rồi chuyển / Bỏ thay đổi / Ở lại). Dựng khung cây ReactFlow là giả (như các spec
 * CampaignBuilder khác); cờ "chưa lưu" là cờ THẬT của trình dựng (`isDirty`), bật bằng cách thêm một khối qua `setNodes`.
 */
const { mockNavigate, mockUpdateCampaign, mockGetCampaignRuns, mockAllowNext } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUpdateCampaign: vi.fn(),
  mockGetCampaignRuns: vi.fn(),
  mockAllowNext: vi.fn(),
}));

vi.mock('../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../features/templates/utils/fetchAllTemplateListPages', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('../../features/campaigns/services/campaignApi.service', () => ({ default: {} }));
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
          origin: 'self_created',
          nodes: [],
          connections: [],
        },
      },
    }),
    updateCampaign: mockUpdateCampaign,
    createCampaign: vi.fn(),
    getChannels: vi.fn().mockResolvedValue({ data: { data: { channels: [] } } }),
  },
}));
vi.mock('../../features/campaigns/services/campaignRunApi.service', () => ({
  default: { getCampaignRuns: mockGetCampaignRuns, getCampaignSchedules: vi.fn().mockResolvedValue({ data: { data: [] } }), runCampaign: vi.fn() },
}));
vi.mock('../../features/campaigns/utils/campaignBuilderRunExecutor', () => ({ executeCampaignRun: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../features/campaigns/hooks/useBrowserRouterBlocker', () => ({
  default: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn(), allowNext: mockAllowNext }),
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
    openRunConfirmModal: vi.fn(),
    openScheduleModal: vi.fn(),
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

// Khung trang giả nhưng GIỮ chỗ đặt thanh tab (`viewTabs`) và nút làm "bẩn" sơ đồ thật qua `setNodes`.
vi.mock('../../features/campaigns/components/CampaignBuilderPageLayout', () => ({
  default: ({ viewTabs, campaignName, setNodes, isDirty }) => (
    <div>
      <span data-testid="campaign-name">{campaignName}</span>
      <span data-testid="is-dirty">{String(isDirty)}</span>
      {viewTabs}
      <button
        type="button"
        onClick={() => setNodes((current) => [
          ...current,
          { id: 'n-moi', type: 'default', position: { x: 10, y: 10 }, data: { label: 'Khối mới', nodeType: 'wait', config: {} } },
        ])}
      >
        Thêm khối giả
      </button>
    </div>
  ),
}));

function renderBuilder(path = '/app/campaigns/391/builder') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          <Route path="/app/campaigns/:id/builder" element={<CampaignBuilder />} />
          <Route path="/app/campaigns/new/builder" element={<CampaignBuilder />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

async function makeBuilderDirty() {
  await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));
  fireEvent.click(screen.getByRole('button', { name: 'Thêm khối giả' }));
  await waitFor(() => expect(screen.getByTestId('is-dirty')).toHaveTextContent('true'));
}

describe('CampaignBuilder — thanh tab Từng bước ⇄ Sơ đồ khối', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockGetCampaignRuns.mockResolvedValue({ data: { data: [] } });
    mockUpdateCampaign.mockResolvedValue({ data: { data: { id: 391 } } });
  });

  it('chiến dịch đã có: tab Sơ đồ khối đang chọn; chưa sửa gì thì bấm Từng bước chuyển luôn tới /simple, không hỏi', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));
    expect(screen.getByTestId('campaign-tab-builder')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('campaign-tab-simple'));
    expect(mockNavigate).toHaveBeenCalledWith('/app/campaigns/391/simple');
    expect(screen.queryByTestId('campaign-tab-switch-modal')).not.toBeInTheDocument();
  });

  it('chiến dịch mới chưa lưu: KHÔNG có thanh tab (chưa có gì để xem ở Từng bước)', async () => {
    renderBuilder('/app/campaigns/new/builder');
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toBeInTheDocument());
    expect(screen.queryByTestId('campaign-view-tabs')).not.toBeInTheDocument();
  });

  it('còn thay đổi chưa lưu → hộp hỏi đủ 3 lựa chọn, chưa điều hướng', async () => {
    renderBuilder();
    await makeBuilderDirty();
    fireEvent.click(screen.getByTestId('campaign-tab-simple'));
    const modal = await screen.findByTestId('campaign-tab-switch-modal');
    expect(modal).toHaveTextContent('Lưu rồi chuyển');
    expect(modal).toHaveTextContent('Bỏ thay đổi');
    expect(modal).toHaveTextContent('Ở lại');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Ở lại → đóng hộp, không lưu, không chuyển', async () => {
    renderBuilder();
    await makeBuilderDirty();
    fireEvent.click(screen.getByTestId('campaign-tab-simple'));
    fireEvent.click(await screen.findByTestId('campaign-tab-switch-stay'));
    await waitFor(() => expect(screen.queryByTestId('campaign-tab-switch-modal')).not.toBeInTheDocument());
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Bỏ thay đổi → sang /simple mà KHÔNG lưu', async () => {
    renderBuilder();
    await makeBuilderDirty();
    fireEvent.click(screen.getByTestId('campaign-tab-simple'));
    fireEvent.click(await screen.findByTestId('campaign-tab-switch-discard'));
    expect(mockNavigate).toHaveBeenCalledWith('/app/campaigns/391/simple');
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it('Lưu rồi chuyển → updateCampaign xong mới sang /simple', async () => {
    renderBuilder();
    await makeBuilderDirty();
    fireEvent.click(screen.getByTestId('campaign-tab-simple'));
    fireEvent.click(await screen.findByTestId('campaign-tab-switch-save'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app/campaigns/391/simple'));
    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1);
    expect(mockUpdateCampaign.mock.calls[0][0]).toBe('391');
    expect(mockUpdateCampaign.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
    // Cho bộ chặn rời trang qua đúng một lần — nếu không, lần điều hướng này lại bị hỏi thêm một hộp nữa.
    expect(mockAllowNext).toHaveBeenCalled();
  });

  it('Lưu rồi chuyển mà lưu LỖI → ở lại sơ đồ khối, không chuyển', async () => {
    mockUpdateCampaign.mockRejectedValue({ response: { status: 500, data: { message: 'Lỗi máy chủ' } } });
    renderBuilder();
    await makeBuilderDirty();
    fireEvent.click(screen.getByTestId('campaign-tab-simple'));
    fireEvent.click(await screen.findByTestId('campaign-tab-switch-save'));
    await waitFor(() => expect(screen.queryByTestId('campaign-tab-switch-modal')).not.toBeInTheDocument());
    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
