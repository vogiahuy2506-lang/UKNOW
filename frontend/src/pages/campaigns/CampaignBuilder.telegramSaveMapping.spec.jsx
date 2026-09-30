/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 mục 4 Nghiệm thu — "lưu → payload
 * node_type: 'action', node_subtype: 'send_telegram'". Khuôn mượn từ
 * CampaignBuilder.serverActions.spec.jsx (cùng cơ chế mock + luồng "Lưu rồi tiếp tục"),
 * chỉ đổi node được thêm khi bấm "Sửa sơ đồ" thành send_telegram.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import CampaignBuilder from './CampaignBuilder';

const { mockUpdateCampaign, mockFetchZaloAccountOptions } = vi.hoisted(() => ({
  mockUpdateCampaign: vi.fn().mockResolvedValue({ data: { data: { id: 391 } } }),
  mockFetchZaloAccountOptions: vi.fn().mockResolvedValue([]),
}));

// P12 — trang dùng useChannelEntitlements (TanStack Query); spec này không bọc QueryClientProvider nên mock hook (có quyền mọi kênh).
vi.mock('../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false }),
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
    getChannels: vi.fn().mockResolvedValue({ data: { data: { channels: [{ key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' }] } } }),
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
  default: ({ campaignName, setNodes, onRunNow, canUseServerRunActions }) => (
    <div>
      <span data-testid="campaign-name">{campaignName}</span>
      <button
        type="button"
        onClick={() => setNodes((prev) => [...prev, {
          id: 'node-telegram-moi',
          type: 'task',
          position: { x: 10, y: 10 },
          data: {
            label: 'Gửi Telegram',
            nodeType: 'send_telegram',
            config: { telegramAccountId: '7', recipientSource: 'telegram_conversations', steps: [{ message: 'Xin chào' }] },
          },
        }])}
      >
        Thêm node Telegram
      </button>
      <button type="button" onClick={onRunNow} disabled={!canUseServerRunActions}>Chạy ngay</button>
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

describe('CampaignBuilder — lưu node send_telegram (PR-7a mục 4 Nghiệm thu)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockUpdateCampaign.mockResolvedValue({ data: { data: { id: 391 } } });
  });

  it('thêm node send_telegram rồi lưu → payload có nodeType "action", nodeSubtype "send_telegram"', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch trộn kênh'));

    fireEvent.click(screen.getByRole('button', { name: 'Thêm node Telegram' }));

    // Mượn đúng đường lưu thật đã có test khác đi qua (CampaignBuilder.serverActions.spec.jsx):
    // sơ đồ dirty -> "Chạy ngay" mở hộp "Sơ đồ chưa được lưu" -> "Lưu rồi tiếp tục" gọi handleSave() thật.
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));
    await waitFor(() => expect(screen.getByText('Sơ đồ chưa được lưu')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu rồi tiếp tục' }));

    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateCampaign.mock.calls[0];
    const telegramNode = payload.nodes.find((n) => n.nodeSubtype === 'send_telegram');
    expect(telegramNode).toBeDefined();
    expect(telegramNode.nodeType).toBe('action');
  });
});
