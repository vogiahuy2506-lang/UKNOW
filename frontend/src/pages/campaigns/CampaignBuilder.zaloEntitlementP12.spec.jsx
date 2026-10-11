/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — trình dựng chiến dịch và quyền kênh theo gói. 11/10/2026
 * (PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA): palette KHÔNG ẩn bước của kênh theo gói nữa — bước vẫn nằm trong
 * `allowedActionNodeTypes` / section Zalo vẫn bật nhưng được báo là KHOÁ qua `lockedNodeChannels` (palette vẽ mờ, không kéo
 * thả, bấm mở modal gợi ý mua); thả node lên canvas (getAllowedActionNodeTypesByCampaignType) chỉ cho kênh dùng được.
 * Layout được mock để đọc thẳng các prop mà CampaignBuilder truyền xuống palette.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import CampaignBuilder from './CampaignBuilder';

const { mockUpdateCampaign, mockFetchZaloAccountOptions, entitlementsState, mockGetChannels } = vi.hoisted(() => ({
  entitlementsState: {
    telegram: true, whatsapp: true, zalo: true, limits: {}, enabledAdapterChannels: null, isLoading: false,
  },
  mockGetChannels: vi.fn(),
  mockUpdateCampaign: vi.fn().mockResolvedValue({ data: { data: { id: 391 } } }),
  mockFetchZaloAccountOptions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => entitlementsState,
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
          campaignName: 'Chiến dịch trộn kênh',
          campaignType: 'mixed',
          status: 'draft',
          nodes: [],
          connections: [],
        },
      },
    }),
    updateCampaign: mockUpdateCampaign,
    createCampaign: vi.fn().mockResolvedValue({ data: { data: { id: 391 } } }),
    getChannels: mockGetChannels,
  },
}));

vi.mock('../../features/campaigns/services/campaignRunApi.service', () => ({
  default: {
    getCampaignRuns: vi.fn().mockResolvedValue({ data: { data: [] } }),
    getCampaignSchedules: vi.fn().mockResolvedValue({ data: { data: [] } }),
    runCampaign: vi.fn(),
  },
}));

vi.mock('../../features/campaigns/utils/campaignBuilderRunExecutor', () => ({
  executeCampaignRun: vi.fn(),
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

vi.mock('../../features/campaigns/components/CampaignBuilderPageLayout', () => ({
  default: ({
    campaignName, campaignType, allowedActionNodeTypes, zaloEnabled, lockedNodeChannels, onLockedNodeClick,
    getAllowedActionNodeTypesByCampaignType,
  }) => (
    <div>
      <span data-testid="campaign-name">{campaignName}</span>
      <span data-testid="allowed-actions">{[...allowedActionNodeTypes].sort().join(',')}</span>
      <span data-testid="drop-allowed">{[...getAllowedActionNodeTypesByCampaignType(campaignType)].sort().join(',')}</span>
      <span data-testid="zalo-enabled">{String(zaloEnabled)}</span>
      <span data-testid="locked-nodes">{JSON.stringify(lockedNodeChannels)}</span>
      <button type="button" onClick={() => onLockedNodeClick('telegram')}>open-telegram-lock</button>
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
    </MemoryRouter>,
  );
}

const SYSTEM_ADAPTERS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
];
const meter = (used, limit) => ({ used, limit });
const emptyUsage = () => ({
  email: meter(null, null),
  messaging: meter(null, null),
  telegram: meter(null, null),
  whatsapp: meter(null, null),
  combined: meter(null, null),
});
const ZALO_NODES = [
  'get_all_friends', 'get_all_groups', 'select_zalo_account', 'send_zalo_friend_request', 'send_zalo_group', 'send_zalo_personal',
];

const readLocked = () => JSON.parse(screen.getByTestId('locked-nodes').textContent);

describe('CampaignBuilder — palette theo quyền kênh (khoá thay vì ẩn)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    entitlementsState.zalo = true;
    entitlementsState.telegram = true;
    entitlementsState.whatsapp = true;
    entitlementsState.limits = {};
    entitlementsState.enabledAdapterChannels = null;
    mockGetChannels.mockResolvedValue({
      data: { data: { channels: [{ key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' }] } },
    });
    useAuthStore.setState({
      user: { id: 1, role: 'user' },
      activeContext: { type: 'self' },
      sendUsage: emptyUsage(),
      billingStatus: null,
      addons: null,
    });
  });

  it('zalo:false -> bước Zalo VẪN nằm trong palette (section Zalo vẫn bật) nhưng bị khoá; thả lên canvas thì KHÔNG cho send_zalo_*', async () => {
    entitlementsState.zalo = false;
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch trộn kênh'));
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).toContain('send_whatsapp'));
    const palette = screen.getByTestId('allowed-actions').textContent;
    expect(palette).toContain('send_zalo_group');
    expect(palette).toContain('send_zalo_personal');
    expect(palette).toContain('send_email');
    expect(screen.getByTestId('zalo-enabled').textContent).toBe('true');
    const locked = readLocked();
    expect(Object.keys(locked).sort()).toEqual(ZALO_NODES);
    expect(new Set(Object.values(locked))).toEqual(new Set(['zalo']));
    expect(screen.getByTestId('drop-allowed').textContent).toBe('send_email,send_whatsapp');
  });

  it('zalo:true (limit=1) -> không khoá bước nào; thả lên canvas được đủ send_zalo_personal/friend_request/group', async () => {
    entitlementsState.limits = { zalo: 1 };
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).toContain('send_zalo_group'));
    expect(screen.getByTestId('allowed-actions').textContent).toContain('send_zalo_personal');
    expect(screen.getByTestId('allowed-actions').textContent).toContain('send_zalo_friend_request');
    expect(screen.getByTestId('zalo-enabled').textContent).toBe('true');
    expect(readLocked()).toEqual({});
    expect(screen.getByTestId('drop-allowed').textContent).toContain('send_zalo_group');
  });

  it('gói không có WhatsApp nhưng hệ thống bật: send_whatsapp vẫn trong palette, bị khoá; không gọi GET /campaigns/channels', async () => {
    entitlementsState.whatsapp = false;
    entitlementsState.enabledAdapterChannels = SYSTEM_ADAPTERS;
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).toContain('send_telegram'));
    expect(screen.getByTestId('allowed-actions').textContent).toContain('send_whatsapp');
    expect(readLocked()).toEqual({ send_whatsapp: 'whatsapp' });
    expect(screen.getByTestId('drop-allowed').textContent).not.toContain('send_whatsapp');
    expect(mockGetChannels).not.toHaveBeenCalled();
  });

  it('cờ HỆ THỐNG tắt (enabledAdapterChannels rỗng) -> không có bước Telegram/WhatsApp trong palette (không bán được)', async () => {
    entitlementsState.enabledAdapterChannels = [];
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch trộn kênh'));
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).not.toBe(''));
    expect(screen.getByTestId('allowed-actions').textContent).not.toContain('send_telegram');
    expect(screen.getByTestId('allowed-actions').textContent).not.toContain('send_whatsapp');
  });

  it('gói HẾT HẠN: mọi bước gửi bị khoá (kể cả Email), thả lên canvas không cho kênh nào', async () => {
    entitlementsState.enabledAdapterChannels = SYSTEM_ADAPTERS;
    useAuthStore.setState({ billingStatus: { isFullyExpired: true, planRevokedAfterExpiry: false } });
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).toContain('send_telegram'));
    const locked = readLocked();
    for (const type of ['send_email', 'send_telegram', 'send_whatsapp', ...ZALO_NODES]) {
      expect(locked[type], type).toBeTruthy();
    }
    expect(screen.getByTestId('drop-allowed').textContent).toBe('');
  });

  it('Email hết lượt trong kỳ: chỉ send_email bị khoá, Zalo/Telegram/WhatsApp kéo bình thường', async () => {
    entitlementsState.enabledAdapterChannels = SYSTEM_ADAPTERS;
    useAuthStore.setState({ sendUsage: { ...emptyUsage(), email: meter(1000, 1000) } });
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).toContain('send_telegram'));
    expect(readLocked()).toEqual({ send_email: 'email' });
    expect(screen.getByTestId('drop-allowed').textContent).not.toContain('send_email');
    expect(screen.getByTestId('drop-allowed').textContent).toContain('send_telegram');
  });

  it('bấm bước bị khoá (layout gọi onLockedNodeClick) mở modal gợi ý mua đúng kênh', async () => {
    entitlementsState.telegram = false;
    entitlementsState.enabledAdapterChannels = SYSTEM_ADAPTERS;
    renderBuilder();
    fireEvent.click(await screen.findByRole('button', { name: 'open-telegram-lock' }));
    const modal = await screen.findByTestId('channel-unavailable-modal');
    expect(modal).toHaveAttribute('data-channel', 'telegram');
    expect(modal).toHaveAttribute('data-reason', 'not_in_plan');
  });
});
