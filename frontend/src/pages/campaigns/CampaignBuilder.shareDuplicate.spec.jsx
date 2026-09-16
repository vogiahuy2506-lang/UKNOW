import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import CampaignBuilder from './CampaignBuilder';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-2.
 *
 * Bẫy cần canh: API nhân bản trả 201 với `{ data: <campaign đã nhân bản> }`
 * (campaign.controller.js:896-900) — id bản sao phải đọc từ ĐÚNG hình dạng này, không đoán.
 * Và nhân bản xong KHÔNG được tự điều hướng ngầm — phải hỏi "Mở bản sao?" trước.
 */
const {
  mockDuplicateCampaign,
  mockNavigate,
  mockUpdateCampaign,
  mockGetCampaignRuns,
} = vi.hoisted(() => ({
  mockDuplicateCampaign: vi.fn(),
  mockNavigate: vi.fn(),
  mockUpdateCampaign: vi.fn().mockResolvedValue({ data: { data: { id: 391 } } }),
  mockGetCampaignRuns: vi.fn().mockResolvedValue({ data: { data: [] } }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../features/templates/utils/fetchAllTemplateListPages', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../features/campaigns/services/campaignApi.service', () => ({
  default: {
    duplicateCampaign: mockDuplicateCampaign,
  },
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
          origin: 'self_created',
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
  executeCampaignRun: vi.fn().mockResolvedValue(undefined),
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

// Chỉ mock phần cây ReactFlow khổng lồ — giữ nguyên onOpenShare/canShare/onOpenDuplicate làm nút
// thật để canh đúng nút nào mở modal nào (đặt tên khác "Nhân bản" để không đụng nút submit CÙNG
// tên bên trong CampaignDuplicateModal thật khi modal đã mở).
vi.mock('../../features/campaigns/components/CampaignBuilderPageLayout', () => ({
  default: ({ onOpenShare, canShare, onOpenDuplicate, campaignName }) => (
    <div>
      <span data-testid="campaign-name">{campaignName}</span>
      {canShare && <button type="button" onClick={onOpenShare}>Mở modal chia sẻ</button>}
      <button type="button" onClick={onOpenDuplicate}>Mở modal nhân bản</button>
    </div>
  ),
}));

function renderBuilder(path = '/app/campaigns/391/builder') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          <Route path="/app/campaigns/:id/builder" element={<CampaignBuilder />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('CampaignBuilder — Nhân bản trong sơ đồ (PR-2)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockGetCampaignRuns.mockResolvedValue({ data: { data: [] } });
    mockDuplicateCampaign.mockResolvedValue({
      data: {
        data: { id: 999, campaignName: 'Chiến dịch thư cảm ơn (Bản sao)', campaignType: 'email', status: 'draft' },
      },
    });
  });

  it('bấm Nhân bản → điền tên có sẵn → gọi đúng API với id + tên đã trim', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Mở modal nhân bản' }));

    const nameInput = await screen.findByPlaceholderText('Nhập tên chiến dịch mới');
    expect(nameInput).toHaveValue('Chiến dịch thư cảm ơn (Bản sao)');

    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản' }));

    await waitFor(() => expect(mockDuplicateCampaign).toHaveBeenCalledTimes(1));
    expect(mockDuplicateCampaign).toHaveBeenCalledWith('391', {
      campaignName: 'Chiến dịch thư cảm ơn (Bản sao)',
    });
  });

  it('nhân bản xong → hỏi "Mở bản sao?", bấm xác nhận mới điều hướng sang id MỚI đọc từ response.data.data.id', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Mở modal nhân bản' }));
    await screen.findByPlaceholderText('Nhập tên chiến dịch mới');
    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản' }));

    await waitFor(() => expect(mockDuplicateCampaign).toHaveBeenCalledTimes(1));

    // Chưa điều hướng ngay — phải hỏi trước.
    expect(mockNavigate).not.toHaveBeenCalled();
    const confirmDialog = await screen.findByText('Nhân bản thành công');
    expect(confirmDialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở bản sao' }));

    expect(mockNavigate).toHaveBeenCalledWith('/app/campaigns/999/builder');
  });

  it('nhân bản xong, hộp "Mở bản sao?" bấm "Ở lại" → KHÔNG điều hướng, ở lại trang', async () => {
    renderBuilder();
    await waitFor(() => expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn'));

    fireEvent.click(screen.getByRole('button', { name: 'Mở modal nhân bản' }));
    await screen.findByPlaceholderText('Nhập tên chiến dịch mới');
    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản' }));

    await waitFor(() => expect(mockDuplicateCampaign).toHaveBeenCalledTimes(1));
    await screen.findByText('Nhân bản thành công');

    fireEvent.click(screen.getByRole('button', { name: 'Ở lại' }));

    expect(mockNavigate).not.toHaveBeenCalled();
    // Hộp thoại đóng lại, không còn trên màn hình.
    expect(screen.queryByText('Nhân bản thành công')).not.toBeInTheDocument();
    // Vẫn ở đúng trang builder cũ.
    expect(screen.getByTestId('campaign-name')).toHaveTextContent('Chiến dịch thư cảm ơn');
  });
});
