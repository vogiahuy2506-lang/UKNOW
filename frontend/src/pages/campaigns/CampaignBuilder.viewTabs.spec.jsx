import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import CampaignBuilder from './CampaignBuilder';

/**
 * PLAN_THIET_LAP_VA_SO_DO_2026-10-17 — PR-2, phía TRÌNH DỰNG: chi tiết chiến dịch có hai tab Thiết lập | Sơ đồ khối, tab nằm trên
 * `?tab=`, hai tab dùng CHUNG nodes/edges/isDirty. Dựng khung cây ReactFlow là giả (như các spec CampaignBuilder khác) nhưng GIỮ chỗ
 * đặt thanh tab và `settingsPanel` THẬT; cờ "chưa lưu" là cờ thật của trình dựng (`isDirty`).
 */
const { mockNavigate, mockUpdateCampaign, mockGetCampaignRuns, mockAllowNext, mockGetCampaignById } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUpdateCampaign: vi.fn(),
  mockGetCampaignRuns: vi.fn(),
  mockAllowNext: vi.fn(),
  mockGetCampaignById: vi.fn(),
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
    getActiveEmailSettings: vi.fn().mockResolvedValue({ data: { data: { items: [{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }] } } }),
    getCampaignById: (...args) => mockGetCampaignById(...args),
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
    openCampaignSchedulesSummaryModal: vi.fn(),
    closeCampaignSchedulesSummaryModal: vi.fn(),
    campaignSchedulesModalCampaign: null,
    isZaloGroupCampaign: () => false,
    getWeeklyDayFromCron: vi.fn(),
    getWeeklyDayLabel: vi.fn(),
    getScheduleStatusLabel: vi.fn(),
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
// Phần tab Thiết lập tự gọi API ước tính / tài khoản — giả để spec này chỉ kiểm cách trình dựng nối hai tab.
vi.mock('../../features/campaigns/hooks/useCampaignEstimate', () => ({ default: () => ({ status: 'idle', estimate: null }) }));
vi.mock('../../features/campaigns/settings/useSettingsAccountLookups', () => ({
  default: () => ({ zaloAccounts: [], telegramAccounts: [], whatsappAccounts: [] }),
}));

// Khung trang giả: GIỮ chỗ đặt thanh tab (`viewTabs`), vẽ `settingsPanel` thật khi đang ở tab Thiết lập (như khung thật), và lộ
// ra trạng thái hộp cấu hình + nhãn khối của sơ đồ để kiểm "sửa ở một tab, tab kia thấy".
vi.mock('../../features/campaigns/components/CampaignBuilderPageLayout', () => ({
  default: ({
    viewTabs, activeTab, settingsPanel, campaignName, setNodes, isDirty, nodes, showConfigModal, nodeToConfig, onNodeConfigSave,
  }) => (
    <div>
      <span data-testid="campaign-name">{campaignName}</span>
      <span data-testid="is-dirty">{String(isDirty)}</span>
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="config-open">{String(showConfigModal)}</span>
      <span data-testid="config-node">{nodeToConfig?.id || ''}</span>
      {viewTabs}
      {activeTab === 'settings' && settingsPanel ? settingsPanel : (
        <ul data-testid="flow-canvas">
          {nodes.map((node) => <li key={node.id}>{node.data.label}</li>)}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setNodes((current) => [
          ...current,
          { id: 'n-moi', type: 'default', position: { x: 10, y: 10 }, data: { label: 'Khối mới', nodeType: 'wait', config: {} } },
        ])}
      >
        Thêm khối giả
      </button>
      <button type="button" onClick={() => onNodeConfigSave({ label: 'Thư đã đổi tên', fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [] })}>
        Lưu cấu hình giả
      </button>
    </div>
  ),
}));

const CAMPAIGN_WITH_MAIL = {
  id: 391,
  campaignName: 'Chiến dịch thư cảm ơn',
  campaignType: 'email',
  status: 'draft',
  origin: 'self_created',
  nodes: [
    { tempId: 'start', nodeSubtype: 'manual_trigger', nodeName: 'Khởi chạy', config: {} },
    { tempId: 'mail', nodeSubtype: 'send_email', nodeName: 'Gửi thư', config: {} },
  ],
  connections: [{ sourceNodeId: 'start', targetNodeId: 'mail' }],
};

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
};

function renderBuilder(path = '/app/campaigns/391') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <LocationProbe />
        <Routes>
          <Route path="/app/campaigns/new" element={<CampaignBuilder />} />
          <Route path="/app/campaigns/:id" element={<CampaignBuilder />} />
          <Route path="/app/campaigns/:id/builder" element={<CampaignBuilder />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));
}

describe('CampaignBuilder — hai tab Thiết lập | Sơ đồ khối', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({ activeContext: { type: 'self' } });
    mockGetCampaignRuns.mockResolvedValue({ data: { data: [] } });
    mockUpdateCampaign.mockResolvedValue({ data: { data: { id: 391 } } });
    mockGetCampaignById.mockResolvedValue({ data: { data: CAMPAIGN_WITH_MAIL } });
  });

  it('chiến dịch đã có: mặc định tab THIẾT LẬP (hiện panel thiết lập, không hiện sơ đồ)', async () => {
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings');
    expect(screen.getByTestId('campaign-tab-settings')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('campaign-tab-flow')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('campaign-settings-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-canvas')).not.toBeInTheDocument();
  });

  it('chiến dịch mới (/new): mặc định tab SƠ ĐỒ KHỐI, vẫn có thanh tab', async () => {
    renderBuilder('/app/campaigns/new');
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toBeInTheDocument());
    expect(screen.getByTestId('active-tab')).toHaveTextContent('flow');
    expect(screen.getByTestId('campaign-tab-flow')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('flow-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('campaign-settings-panel')).not.toBeInTheDocument();
  });

  it('?tab=flow mở sơ đồ; link cũ /:id/builder vẫn là cùng trang và mặc định Thiết lập; ?tab lạ rơi về mặc định', async () => {
    const { unmount } = renderBuilder('/app/campaigns/391?tab=flow');
    await waitForLoaded();
    expect(screen.getByTestId('active-tab')).toHaveTextContent('flow');
    unmount();

    const second = renderBuilder('/app/campaigns/391/builder');
    await waitForLoaded();
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings');
    second.unmount();

    renderBuilder('/app/campaigns/391?tab=khong-co');
    await waitForLoaded();
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings');
  });

  it('bấm tab ghi ?tab= lên URL (thay thế, không thêm lịch sử) và KHÔNG hiện hộp "Lưu rồi chuyển" dù đang có thay đổi chưa lưu', async () => {
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khối giả' }));
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toHaveTextContent('true'));

    fireEvent.click(screen.getByTestId('campaign-tab-flow'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/campaigns/391?tab=flow'));
    expect(screen.getByTestId('active-tab')).toHaveTextContent('flow');
    // Cho bộ chặn rời trang qua đúng một lần — nếu không, đổi tab lúc đang bẩn bị hỏi "rời trang?".
    expect(mockAllowNext).toHaveBeenCalled();
    expect(screen.queryByTestId('campaign-tab-switch-modal')).not.toBeInTheDocument();
    expect(mockUpdateCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('campaign-tab-settings'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/campaigns/391?tab=settings'));
    expect(screen.getByTestId('is-dirty')).toHaveTextContent('true');
  });

  it('nút Sửa ở tab Thiết lập mở CHÍNH hộp cấu hình của trình dựng cho đúng khối', async () => {
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    expect(screen.getByTestId('config-open')).toHaveTextContent('false');
    fireEvent.click(await screen.findByTestId('settings-edit-mail'));
    expect(screen.getByTestId('config-open')).toHaveTextContent('true');
    expect(screen.getByTestId('config-node')).toHaveTextContent('mail');
  });

  it('sửa khối ở tab Thiết lập → tab Sơ đồ khối thấy ngay (chưa lưu) và ngược lại', async () => {
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    fireEvent.click(await screen.findByTestId('settings-edit-mail'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình giả' }));

    // Tab Thiết lập cập nhật ngay: tên khối + giá trị mới, trạng thái "chưa lưu".
    const card = await screen.findByText('Thư đã đổi tên');
    const mailCard = card.closest('[data-testid="settings-node-card"]');
    expect(within(mailCard).getByText('CSKH (cskh@abc.vn)')).toBeInTheDocument();
    expect(within(mailCard).getByText('1 email nhập tay')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toHaveTextContent('true'));
    expect(mockUpdateCampaign).not.toHaveBeenCalled();

    // Sang Sơ đồ khối: cùng nodes → thấy tên mới.
    fireEvent.click(screen.getByTestId('campaign-tab-flow'));
    expect(await within(await screen.findByTestId('flow-canvas')).findByText('Thư đã đổi tên')).toBeInTheDocument();

    // Ngược lại: thêm khối ở Sơ đồ khối → sang Thiết lập thấy thẻ mới.
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khối giả' }));
    fireEvent.click(screen.getByTestId('campaign-tab-settings'));
    await waitFor(() => expect(screen.getAllByTestId('settings-node-card').map((c) => c.getAttribute('data-node-id'))).toContain('n-moi'));
  });

  it('nút "Sang Sơ đồ khối" ở trạng thái rỗng đổi sang tab sơ đồ', async () => {
    mockGetCampaignById.mockResolvedValue({ data: { data: { ...CAMPAIGN_WITH_MAIL, nodes: [], connections: [] } } });
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    fireEvent.click(await screen.findByTestId('settings-go-flow'));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('flow'));
  });

  it('nhân viên không có quyền tạo chiến dịch: tab Sơ đồ khối khoá, ?tab=flow bị ép về Thiết lập, không có nút Sửa', async () => {
    useAuthStore.setState({ activeContext: { type: 'employee', permissions: { campaigns_view: true, campaigns_create: false } } });
    renderBuilder('/app/campaigns/391?tab=flow');
    await waitForLoaded();
    expect(screen.getByTestId('campaign-tab-flow')).toBeDisabled();
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings');
    await screen.findByTestId('campaign-settings-panel');
    expect(screen.queryByTestId('settings-edit-mail')).not.toBeInTheDocument();
  });
});
