/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — trình dựng chiến dịch: gói không có kênh Zalo thì palette KHÔNG cho thêm node
 * send_zalo_* (allowedActionNodeTypes) và ẩn section Zalo (zaloEnabled=false); gói có Zalo (kể cả limit=1) giữ nguyên.
 * Layout được mock để đọc thẳng các prop mà CampaignBuilder truyền xuống palette.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import CampaignBuilder from './CampaignBuilder';

const { mockUpdateCampaign, mockFetchZaloAccountOptions, entitlementsState } = vi.hoisted(() => ({
  entitlementsState: { telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false },
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
    getChannels: vi.fn().mockResolvedValue({ data: { data: { channels: [{ key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' }] } } }),
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
  default: ({ campaignName, allowedActionNodeTypes, zaloEnabled }) => (
    <div>
      <span data-testid="campaign-name">{campaignName}</span>
      <span data-testid="allowed-actions">{[...allowedActionNodeTypes].sort().join(',')}</span>
      <span data-testid="zalo-enabled">{String(zaloEnabled)}</span>
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

describe('CampaignBuilder — P12 palette theo quyền kênh Zalo', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    entitlementsState.zalo = true;
    entitlementsState.limits = {};
  });

  it('zalo:false -> palette chỉ còn email (+ kênh adapter đang bật), không có send_zalo_*, section Zalo tắt', async () => {
    entitlementsState.zalo = false;
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch trộn kênh'));
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).toBe('send_email,send_whatsapp'));
    expect(screen.getByTestId('zalo-enabled').textContent).toBe('false');
  });

  it('zalo:true (limit=1) -> palette có đủ send_zalo_personal/friend_request/group', async () => {
    entitlementsState.limits = { zalo: 1 };
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('allowed-actions').textContent).toContain('send_zalo_group'));
    expect(screen.getByTestId('allowed-actions').textContent).toContain('send_zalo_personal');
    expect(screen.getByTestId('allowed-actions').textContent).toContain('send_zalo_friend_request');
    expect(screen.getByTestId('zalo-enabled').textContent).toBe('true');
  });
});
