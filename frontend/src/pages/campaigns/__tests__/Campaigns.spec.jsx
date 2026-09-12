import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Campaigns from '../Campaigns';
import { useAuthStore } from '../../../stores/authStore';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignRunApiService from '../../../features/campaigns/services/campaignRunApi.service';
import viTranslations from '../../../i18n/vi';

// Helper get nested translation
const getNestedTranslation = (obj, path) =>
  path.split('.').reduce((acc, part) => acc?.[part], obj);

const mockT = (key, params) => {
  const val = getNestedTranslation(viTranslations, key);
  if (typeof val === 'string') {
    if (params) {
      let str = val;
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, v);
      }
      return str;
    }
    return val;
  }
  return key;
};

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

vi.mock('../../../features/campaigns/services/campaignApi.service', () => ({
  default: {
    getCampaigns: vi.fn(),
    getSharedWithMe: vi.fn(),
    publishCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    createCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    duplicateCampaign: vi.fn(),
  },
}));

vi.mock('../../../features/campaigns/services/campaignRunApi.service', () => ({
  default: {
    getCampaignRuns: vi.fn(),
    getCampaignSchedules: vi.fn(),
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

describe('Campaigns — Trang gộp Quản lý & Vận hành chiến dịch', () => {
  const sampleCampaigns = [
    {
      id: 101,
      campaignName: 'Chiến dịch Chào thu',
      campaignType: 'email',
      status: 'active',
      runningCount: 0,
      enabledScheduleCount: 2,
      completedCount: 5,
      createdAt: '2026-09-10T10:00:00Z',
      updatedAt: '2026-09-11T10:00:00Z',
      origin: 'self_created',
      createdBy: { name: 'Admin' },
    },
    {
      id: 102,
      campaignName: 'Chiến dịch Nháp Test',
      campaignType: 'zalo',
      status: 'draft',
      runningCount: 0,
      enabledScheduleCount: 0,
      completedCount: 0,
      createdAt: '2026-09-10T10:00:00Z',
      updatedAt: '2026-09-11T10:00:00Z',
      origin: 'self_created',
      createdBy: { name: 'Admin' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, roleCode: 'owner', role: 'owner' },
      activeContext: { type: 'self' },
    });

    campaignApiService.getCampaigns.mockResolvedValue({
      data: {
        data: {
          items: sampleCampaigns,
          pagination: { page: 1, total: 2, totalPages: 1 },
        },
      },
    });

    campaignApiService.getSharedWithMe.mockResolvedValue({
      data: {
        data: {
          items: [],
          pagination: { page: 1, total: 0, totalPages: 1 },
        },
      },
    });

    campaignRunApiService.getCampaignRuns.mockResolvedValue({
      data: { data: [] },
    });

    campaignRunApiService.getCampaignSchedules.mockResolvedValue({
      data: { data: [] },
    });
  });

  const renderComponent = (initialEntries = ['/app/campaigns']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/app/campaigns" element={<Campaigns />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('thanh state gửi đúng tham số state và reset page=1', async () => {
    renderComponent(['/app/campaigns']);

    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10, origin: 'self_created' })
      );
    });

    // 1. Bấm nút "Đang chạy"
    const runningBtn = screen.getByRole('button', { name: 'Đang chạy' });
    fireEvent.click(runningBtn);

    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, limit: 10, state: 'running' })
      );
    });

    // 2. Bấm nút "Đã lên lịch"
    const scheduledBtn = screen.getByRole('button', { name: 'Đã lên lịch' });
    fireEvent.click(scheduledBtn);

    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, limit: 10, state: 'scheduled' })
      );
    });

    // 3. Bấm nút "Tạm ngưng · Không hoạt động"
    const inactiveBtn = screen.getByRole('button', { name: 'Tạm ngưng · Không hoạt động' });
    fireEvent.click(inactiveBtn);

    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, limit: 10, state: 'inactive' })
      );
    });

    // 4. Bấm nút "Tất cả" -> bỏ param state
    const allBtn = screen.getByRole('button', { name: 'Tất cả' });
    fireEvent.click(allBtn);

    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ state: expect.anything() })
      );
    });
  });

  it('nhân viên không có campaigns_run thì không có nút Chạy/Dừng/Lịch', async () => {
    useAuthStore.setState({
      user: { id: 2, role: 'user', fullName: 'Nhân viên View Only' },
      activeContext: {
        type: 'employee',
        permissions: { campaigns_view: true, campaigns_run: false },
      },
    });

    renderComponent(['/app/campaigns']);

    await waitFor(() => {
      expect(screen.getByText('Chiến dịch Chào thu')).toBeInTheDocument();
    });

    // Chiến dịch active nhưng nhân viên không có campaigns_run:
    expect(screen.queryByRole('button', { name: 'Chạy ngay' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lên lịch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dừng' })).toBeNull();
  });

  it('nhân viên có campaigns_run có nút Chạy ngay và Lên lịch khi status active', async () => {
    useAuthStore.setState({
      user: { id: 3, role: 'user', fullName: 'Nhân viên Vận hành' },
      activeContext: {
        type: 'employee',
        permissions: { campaigns_view: true, campaigns_run: true },
      },
    });

    renderComponent(['/app/campaigns']);

    await waitFor(() => {
      expect(screen.getByText('Chiến dịch Chào thu')).toBeInTheDocument();
    });

    // Chiến dịch active có nút Chạy ngay và Lên lịch:
    expect(screen.getByRole('button', { name: 'Chạy ngay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lên lịch' })).toBeInTheDocument();
    // Có completedCount > 0 nên có nút Nhật ký:
    expect(screen.getByRole('button', { name: 'Nhật ký' })).toBeInTheDocument();

    // Chiến dịch draft không có nút Chạy ngay/Lên lịch:
    // Kiểm tra số lượng nút Chạy ngay đúng bằng 1
    const runButtons = screen.getAllByRole('button', { name: 'Chạy ngay' });
    expect(runButtons).toHaveLength(1);
  });

  // Review Claude 12/09: ảnh nghiệm thu tab "Đang chạy" của PR-2b là trang trống — chưa ai nhìn thấy
  // dòng đang chạy được vẽ. Bản đầu truyền cả object vào getCampaignKey (hook nhận id) nên runningRun
  // luôn null: nút Dừng báo "không tìm thấy lượt chạy", badge liên tục không bao giờ hiện. Ca này
  // đi đúng đường thật: poll /campaign-runs trả run đang chạy kèm runMetadata.
  it('dòng đang chạy theo poll: hiện nút Dừng + badge liên tục, bấm Dừng mở modal xác nhận (không báo "không tìm thấy lượt chạy")', async () => {
    campaignRunApiService.getCampaignRuns.mockResolvedValue({
      data: {
        data: [
          {
            id: 900,
            campaignId: 101,
            status: 'running',
            runName: 'Lượt chạy liên tục',
            runMetadata: { continuousMode: true, pollIntervalMs: 300000 },
          },
        ],
      },
    });

    renderComponent(['/app/campaigns']);

    const stopBtn = await screen.findByRole('button', { name: 'Dừng' });
    expect(screen.queryByRole('button', { name: 'Chạy ngay' })).toBeNull();
    // 300000 ms = 5 phút/lần — đọc từ runMetadata.pollIntervalMs, không phải trường bịa ở gốc run
    expect(screen.getByText(/5 phút\/lần/)).toBeInTheDocument();

    fireEvent.click(stopBtn);

    expect(await screen.findByText(viTranslations.campaignRunModals.confirmStopRun)).toBeInTheDocument();
    const toast = (await import('react-hot-toast')).default;
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('chuyển tab Lịch chạy hiển thị CampaignSchedulesTable', async () => {
    renderComponent(['/app/campaigns']);

    await waitFor(() => {
      expect(screen.getByText('Chiến dịch Chào thu')).toBeInTheDocument();
    });

    // Bấm tab "Lịch chạy"
    const schedulesTabBtn = screen.getByRole('button', { name: 'Lịch chạy' });
    fireEvent.click(schedulesTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Lịch chạy đã thiết lập')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Tìm theo tên lịch, tên chiến dịch hoặc ID chiến dịch')).toBeInTheDocument();
    });
  });
});
