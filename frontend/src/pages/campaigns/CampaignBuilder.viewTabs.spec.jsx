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
vi.mock('../../features/customers/services/customerApi.service', () => ({
  default: { getCustomers: vi.fn().mockResolvedValue({ data: { data: { pagination: { total: 5 } } } }) },
}));
// Phần tab Thiết lập tự gọi API ước tính / tài khoản — giả để spec này chỉ kiểm cách trình dựng nối hai tab.
vi.mock('../../features/campaigns/hooks/useCampaignEstimate', () => ({ default: () => ({ status: 'idle', estimate: null }) }));
vi.mock('../../features/campaigns/settings/useSettingsAccountLookups', () => ({
  default: () => ({ zaloAccounts: [], telegramAccounts: [], whatsappAccounts: [] }),
}));

// Form khối thật có spec riêng; ở đây giả bằng một ô nhập tên khối. Bản "không đổi gì" trả đúng form mà hộp dựng lúc mở (như form thật),
// bản đã đổi tên kèm cấu hình email đủ để kiểm đường Lưu trong hộp cài đặt.
vi.mock('../../features/campaigns/components/NodeConfigForm', async () => {
  const React = await import('react');
  const { createNodeConfigFormData } = await import('../../features/campaigns/utils/nodeConfigModal.helpers');
  return {
    default: function FormStub({ node, onSave, onCancel, campaignType }) {
      const [label, setLabel] = React.useState(node.data.label);
      const pristine = createNodeConfigFormData({
        config: node.data.config || {}, label: node.data.label, normalizeEmailSteps: true, nodeType: node.data.nodeType, campaignType,
      });
      const build = (value) => (value === node.data.label
        ? pristine
        : { ...pristine, label: value, fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [] });
      return (
        <div data-testid="form-stub">
          <input data-testid="stub-input" value={label} onChange={(event) => setLabel(event.target.value)} />
          <button type="button" data-testid="stub-save" onClick={() => onSave(build(label))}>save</button>
          <button type="button" data-testid="stub-cancel" onClick={onCancel}>cancel</button>
        </div>
      );
    },
  };
});

// Khung trang giả: GIỮ chỗ đặt thanh tab (`viewTabs`), vẽ `settingsPanel` thật khi đang ở tab Thiết lập (như khung thật), và lộ
// ra trạng thái hộp cấu hình + nhãn khối của sơ đồ để kiểm "sửa ở một tab, tab kia thấy".
vi.mock('../../features/campaigns/components/CampaignBuilderPageLayout', () => ({
  default: ({
    viewTabs, activeTab, settingsPanel, campaignName, setNodes, isDirty, nodes, showConfigModal, nodeToConfig, onNodeConfigSave,
    setNodeToConfig, setShowConfigModal,
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
      <button type="button" onClick={() => { setNodeToConfig(nodes.find((node) => node.id === 'mail')); setShowConfigModal(true); }}>
        Mở hộp giả
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

// Email lưu kiểu cũ (`emailTemplateId`, không có bước): mục Nội dung KHÔNG sửa nhanh được → chỉ còn "Cài đặt nâng cao" mở hộp cài đặt của khối.
const CAMPAIGN_WITH_LEGACY_MAIL = {
  ...CAMPAIGN_WITH_MAIL,
  nodes: [
    CAMPAIGN_WITH_MAIL.nodes[0],
    { tempId: 'mail', nodeSubtype: 'send_email', nodeName: 'Gửi thư', config: { emailTemplateId: 7 } },
  ],
};
const openMailModal = async () => {
  mockGetCampaignById.mockResolvedValue({ data: { data: CAMPAIGN_WITH_LEGACY_MAIL } });
  renderBuilder('/app/campaigns/391');
  await waitForLoaded();
  fireEvent.click(await screen.findByTestId('settings-content-advanced-mail'));
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

  it('chiến dịch mới (/new): cũng mặc định tab THIẾT LẬP (thẻ "Gửi cho ai?"), vẫn có thanh tab', async () => {
    renderBuilder('/app/campaigns/new');
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toBeInTheDocument());
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings');
    expect(screen.getByTestId('campaign-tab-settings')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('campaign-settings-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-canvas')).not.toBeInTheDocument();
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

  it('Cài đặt nâng cao của mục Nội dung (nội dung lưu kiểu cũ) mở HỘP cài đặt của khối gửi (hộp của Sơ đồ khối, không phải form nhúng) và không đụng hộp của trình dựng', async () => {
    await openMailModal();
    expect(screen.getByTestId('config-open')).toHaveTextContent('false');
    expect(screen.getByTestId('form-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-node-card')).not.toBeInTheDocument();
  });

  it('Lưu trong hộp cài đặt = áp + lưu chiến dịch: updateCampaign nhận config MỚI (không phải cũ), "Chưa lưu" về false, Sơ đồ khối thấy giá trị mới', async () => {
    await openMailModal();
    fireEvent.change(screen.getByTestId('stub-input'), { target: { value: 'Thư đã đổi tên' } });
    fireEvent.click(screen.getByTestId('stub-save'));

    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(1));
    const [campaignId, payload] = mockUpdateCampaign.mock.calls[0];
    expect(String(campaignId)).toBe('391');
    const mail = payload.nodes.find((n) => n.tempId === 'mail');
    expect(mail.nodeName).toBe('Thư đã đổi tên');
    expect(mail.config.recipientEmails).toBe('a@x.vn');
    expect(payload.flowJson.nodes.find((n) => n.id === 'mail').data.config.fromEmailId).toBe(3);
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toHaveTextContent('false'));

    expect(await screen.findByText('CSKH (cskh@abc.vn)')).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-summary-audience')).toHaveTextContent('1 email nhập tay');
    expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('campaign-tab-flow'));
    expect(await within(await screen.findByTestId('flow-canvas')).findByText('Thư đã đổi tên')).toBeInTheDocument();
  });

  it('Lưu thất bại (mạng / 500) → thay đổi vẫn áp cục bộ, thanh vẫn "Chưa lưu", hộp đóng', async () => {
    mockUpdateCampaign.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500, data: { message: 'Lỗi máy chủ' } } }));
    await openMailModal();
    fireEvent.change(screen.getByTestId('stub-input'), { target: { value: 'Thư lưu lỗi' } });
    fireEvent.click(screen.getByTestId('stub-save'));

    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toHaveTextContent('true'));
    expect(screen.getByTestId('settings-section-summary-audience')).toHaveTextContent('1 email nhập tay');
    expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument();
  });

  it('Lưu trong hộp khi form không đổi → đóng hộp, KHÔNG gọi API', async () => {
    await openMailModal();
    fireEvent.click(screen.getByTestId('stub-save'));
    await waitFor(() => expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument());
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
    expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');
  });

  it('đổi tab khi biểu mẫu Gửi cho ai đang sửa dở → hỏi xác nhận; "Tiếp tục sửa" ở lại Thiết lập, "Bỏ thay đổi" sang Sơ đồ khối', async () => {
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    fireEvent.click(await screen.findByTestId('settings-section-edit-audience'));
    fireEvent.click(screen.getByTestId('settings-audience-manual'));
    fireEvent.change(screen.getByLabelText('Danh sách email'), { target: { value: 'dang-go@x.vn' } });

    fireEvent.click(screen.getByTestId('campaign-tab-flow'));
    expect(await screen.findByText('Bỏ thay đổi đang sửa?')).toBeInTheDocument();
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings');

    fireEvent.click(screen.getByText('Tiếp tục sửa'));
    expect(screen.queryByText('Bỏ thay đổi đang sửa?')).not.toBeInTheDocument();
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings');
    expect(screen.getByLabelText('Danh sách email')).toHaveValue('dang-go@x.vn');

    fireEvent.click(screen.getByTestId('campaign-tab-flow'));
    fireEvent.click(await screen.findByText('Bỏ thay đổi'));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('flow'));
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it('đổi tab khi biểu mẫu chưa đổi gì → sang thẳng, không hỏi', async () => {
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    fireEvent.click(await screen.findByTestId('settings-section-edit-audience'));
    fireEvent.click(screen.getByTestId('campaign-tab-flow'));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('flow'));
    expect(screen.queryByText('Bỏ thay đổi đang sửa?')).not.toBeInTheDocument();
  });

  it('hộp cấu hình của Sơ đồ khối vẫn chỉ áp cục bộ (Chưa lưu), không gọi API', async () => {
    renderBuilder('/app/campaigns/391?tab=flow');
    await waitForLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Mở hộp giả' }));
    expect(screen.getByTestId('config-node')).toHaveTextContent('mail');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình giả' }));
    expect(await within(await screen.findByTestId('flow-canvas')).findByText('Thư đã đổi tên')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toHaveTextContent('true'));
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
    expect(screen.getByTestId('config-open')).toHaveTextContent('false');
  });

  it('thêm khối ở Sơ đồ khối → sang Thiết lập thấy dải nhắc phần chưa nối vào luồng chạy', async () => {
    renderBuilder('/app/campaigns/391?tab=flow');
    await waitForLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khối giả' }));
    fireEvent.click(screen.getByTestId('campaign-tab-settings'));
    expect(await screen.findByTestId('settings-unconnected')).toBeInTheDocument();
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
    expect(screen.queryByTestId('settings-section-edit-sender')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-content-edit-mail')).not.toBeInTheDocument();
  });
});

describe('CampaignBuilder — tab Thiết lập: tạo từ chiến dịch trống + thao tác bước (PR-B)', () => {
  const EMPTY_CAMPAIGN = { ...CAMPAIGN_WITH_MAIL, nodes: [], connections: [] };
  const subtypesOf = (payload) => payload.nodes.map((n) => n.nodeSubtype);

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ activeContext: { type: 'self' } });
    mockGetCampaignRuns.mockResolvedValue({ data: { data: [] } });
    mockUpdateCampaign.mockResolvedValue({ data: { data: { id: 391 } } });
    mockGetCampaignById.mockResolvedValue({ data: { data: EMPTY_CAMPAIGN } });
  });

  /** Chiến dịch email trống → chọn nguồn (+ điền) → bấm Tạo → trả payload lưu lần đầu. */
  const startWith = async (type) => {
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    fireEvent.click(await screen.findByTestId(`settings-audience-${type}`));
    if (type === 'manual') fireEvent.change(screen.getByLabelText('Danh sách email'), { target: { value: 'a@x.vn, b@x.vn' } });
    await waitFor(() => expect(screen.getByTestId('settings-audience-save')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('settings-audience-save'));
    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(1));
    return mockUpdateCampaign.mock.calls[0][1];
  };

  it('chiến dịch email trống: Gửi cho ai → chọn khách đã lưu → Tạo → dựng khung + LƯU NGAY bằng đúng bộ nodes/edges mới; chỉ còn Nội dung thiếu, không mở form khối nào', async () => {
    const payload = await startWith('customers');
    expect(subtypesOf(payload)).toEqual(['manual_trigger', 'read_interested_customers', 'send_email']);
    expect(payload.connections.map((c) => [c.sourceNodeId, c.targetNodeId])).toEqual([
      [payload.nodes[0].tempId, payload.nodes[1].tempId],
      [payload.nodes[1].tempId, payload.nodes[2].tempId],
    ]);
    const send = payload.nodes[2];
    expect(send.config).toMatchObject({ fromEmailId: 3, recipientSource: 'node', recipientNodeId: payload.nodes[1].tempId, recipientField: 'email' });
    expect(payload.flowJson.nodes.map((n) => n.id)).toEqual(payload.nodes.map((n) => n.tempId));
    await waitFor(() => expect(screen.getByTestId('is-dirty')).toHaveTextContent('false'));
    expect(await screen.findByTestId('settings-section-summary-audience')).toHaveTextContent('Khách hàng đã lưu');
    expect(screen.getByTestId('settings-section-content').getAttribute('data-status')).toBe('missing');
    expect(screen.getByTestId('settings-status')).toHaveAttribute('data-missing-count', '1');
    expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-audience-editor')).not.toBeInTheDocument();
  });

  it('chọn nguồn thì Sơ đồ khối thấy ngay chuỗi khối vừa dựng', async () => {
    await startWith('customers');
    fireEvent.click(screen.getByTestId('campaign-tab-flow'));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('flow'));
    expect((await screen.findByTestId('flow-canvas')).querySelectorAll('li')).toHaveLength(3);
  });

  it('Đổi nguồn ở mục Gửi cho ai (khách đã lưu → tự nhập): gỡ khối nguồn, nối lại cạnh, giữ tài khoản gửi, lưu ngay', async () => {
    const first = await startWith('customers');
    const oldSourceId = first.nodes[1].tempId;
    fireEvent.click(await screen.findByTestId('settings-section-edit-audience'));
    fireEvent.click(screen.getByTestId('settings-audience-manual'));
    fireEvent.change(screen.getByLabelText('Danh sách email'), { target: { value: 'a@x.vn' } });
    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('settings-audience-save'));

    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(2));
    const payload = mockUpdateCampaign.mock.calls[1][1];
    expect(subtypesOf(payload)).toEqual(['manual_trigger', 'send_email']);
    expect(payload.nodes[1].config).toMatchObject({ fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn', recipientNodeId: '' });
    expect(payload.connections.map((c) => [c.sourceNodeId, c.targetNodeId])).toEqual([[payload.nodes[0].tempId, payload.nodes[1].tempId]]);
    expect(JSON.stringify(payload)).not.toContain(oldSourceId);
  });

  it('Thêm bước Lưu khách hàng rồi Xoá bước: nối đúng, lưu sau mỗi thao tác', async () => {
    const first = await startWith('customers');
    fireEvent.click(await screen.findByTestId('settings-add-step-button'));
    fireEvent.click(await screen.findByTestId('settings-add-step-save_customer'));

    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(2));
    const added = mockUpdateCampaign.mock.calls[1][1];
    expect(subtypesOf(added)).toEqual(['manual_trigger', 'read_interested_customers', 'send_email', 'save_customer']);
    const tagId = added.nodes[3].tempId;
    expect(added.connections.map((c) => [c.sourceNodeId, c.targetNodeId])).toContainEqual([first.nodes[2].tempId, tagId]);
    expect(added.nodes[3].config.saveCustomerNodeId).toBe(first.nodes[1].tempId);

    // Bước mới tự mở hộp cài đặt để điền: đóng rồi xoá.
    fireEvent.click(await screen.findByTestId('stub-cancel'));
    fireEvent.click(await screen.findByTestId(`settings-remove-${tagId}`));
    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá bước' }).pop());
    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(3));
    const removed = mockUpdateCampaign.mock.calls[2][1];
    expect(subtypesOf(removed)).toEqual(['manual_trigger', 'read_interested_customers', 'send_email']);
    expect(removed.connections).toHaveLength(2);
  });

  it('sơ đồ rẽ nhánh: hiện dải thông báo, nút Thêm bước tắt, Gửi cho ai không sửa nhanh, bước phụ không xoá được; nội dung vẫn sửa được', async () => {
    mockGetCampaignById.mockResolvedValue({
      data: {
        data: {
          ...CAMPAIGN_WITH_MAIL,
          nodes: [
            { tempId: 'start', nodeSubtype: 'manual_trigger', nodeName: 'Khởi chạy', config: {} },
            { tempId: 'src', nodeSubtype: 'read_interested_customers', nodeName: 'Khách', config: { interestedCustomerType: 'all' } },
            { tempId: 'cond', nodeSubtype: 'condition', nodeName: 'Điều kiện', config: {} },
            { tempId: 'mail', nodeSubtype: 'send_email', nodeName: 'Gửi thư', config: {} },
            { tempId: 'tag', nodeSubtype: 'tag_contact', nodeName: 'Gắn thẻ', config: {} },
          ],
          connections: [
            { sourceNodeId: 'start', targetNodeId: 'src' },
            { sourceNodeId: 'src', targetNodeId: 'cond' },
            { sourceNodeId: 'cond', targetNodeId: 'mail', connectionLabel: 'Đúng' },
            { sourceNodeId: 'cond', targetNodeId: 'tag', connectionLabel: 'Sai' },
          ],
        },
      },
    });
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    expect(await screen.findByTestId('settings-branch-banner')).toBeInTheDocument();
    expect(screen.getByTestId('settings-add-step-button')).toBeDisabled();
    expect(screen.queryByTestId('settings-section-edit-audience')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-section-advanced-audience')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-remove-tag')).not.toBeInTheDocument();
    // Nội dung từng bước vẫn sửa được.
    expect(screen.getByTestId('settings-content-edit-mail')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('settings-branch-go-flow'));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('flow'));
  });

  it('chuỗi thẳng bình thường KHÔNG hiện dải rẽ nhánh', async () => {
    mockGetCampaignById.mockResolvedValue({ data: { data: CAMPAIGN_WITH_MAIL } });
    renderBuilder('/app/campaigns/391');
    await waitForLoaded();
    await screen.findByTestId('campaign-settings-panel');
    expect(screen.queryByTestId('settings-branch-banner')).not.toBeInTheDocument();
  });
});
