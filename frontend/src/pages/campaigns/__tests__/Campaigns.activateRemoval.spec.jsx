import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Campaigns from '../Campaigns';
import { useAuthStore } from '../../../stores/authStore';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignRunApiService from '../../../features/campaigns/services/campaignRunApi.service';
import viTranslations from '../../../i18n/vi';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-3, Việc 3.
 *
 * Nháp: bỏ hẳn nút "Kích hoạt" — chiến dịch nháp giờ tự kích hoạt khi bấm "Chạy ngay" TRONG
 * TRÌNH DỰNG (backend PR-3 Việc 1), không còn đường tắt kích hoạt riêng từ trang danh sách.
 * Tạm dừng: GIỮ nút, chỉ đổi nhãn thành "Tiếp tục lịch chạy" — hành vi y hệt cũ (publishCampaign,
 * không gửi tin nào), vì "Tạm dừng" là phanh của lịch tự gửi, không được bỏ hết đường bật lại.
 */
const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);

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
    shareCampaign: vi.fn(),
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
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('Campaigns — bỏ nút Kích hoạt (nháp), giữ Tiếp tục lịch chạy (tạm dừng) — PR-3', () => {
  const draftCampaign = {
    id: 501,
    campaignName: 'Chiến dịch Nháp Chưa Chạy',
    campaignType: 'email',
    status: 'draft',
    runningCount: 0,
    enabledScheduleCount: 0,
    completedCount: 0,
    createdAt: '2026-09-16T10:00:00Z',
    updatedAt: '2026-09-16T10:00:00Z',
    origin: 'self_created',
    createdBy: { name: 'Admin' },
  };

  const pausedCampaign = {
    id: 502,
    campaignName: 'Chiến dịch Tạm Dừng',
    campaignType: 'email',
    status: 'paused',
    runningCount: 0,
    enabledScheduleCount: 1,
    completedCount: 2,
    createdAt: '2026-09-16T10:00:00Z',
    updatedAt: '2026-09-16T10:00:00Z',
    origin: 'self_created',
    createdBy: { name: 'Admin' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, roleCode: 'owner', role: 'owner' },
      activeContext: { type: 'self' },
    });

    campaignApiService.getCampaigns.mockResolvedValue({
      data: {
        data: {
          items: [draftCampaign, pausedCampaign],
          pagination: { page: 1, total: 2, totalPages: 1 },
        },
      },
    });
    campaignApiService.getSharedWithMe.mockResolvedValue({
      data: { data: { items: [], pagination: { page: 1, total: 0, totalPages: 1 } } },
    });
    campaignRunApiService.getCampaignRuns.mockResolvedValue({ data: { data: [] } });
    campaignRunApiService.getCampaignSchedules.mockResolvedValue({ data: { data: [] } });
  });

  const renderComponent = () =>
    render(
      <MemoryRouter initialEntries={['/app/campaigns']}>
        <Routes>
          <Route path="/app/campaigns" element={<Campaigns />} />
        </Routes>
      </MemoryRouter>
    );

  // Nút 3 chấm luôn là nút CUỐI trong ô hành động (đứng sau Nhật ký/Chạy ngay/Lịch nếu có).
  function openRowMenu(campaignName) {
    const row = screen.getByText(campaignName).closest('tr');
    const buttons = within(row).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
  }

  it('chiến dịch nháp: menu KHÔNG còn nút "Kích hoạt"', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('Chiến dịch Nháp Chưa Chạy')).toBeInTheDocument());

    openRowMenu('Chiến dịch Nháp Chưa Chạy');

    expect(await screen.findByText('Sửa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kích hoạt/i })).not.toBeInTheDocument();
  });

  it('chiến dịch tạm dừng: menu có nút "Tiếp tục lịch chạy", bấm vào KHÔNG gửi tin nào (chỉ gọi publishCampaign)', async () => {
    campaignApiService.publishCampaign.mockResolvedValue({ data: { success: true } });
    renderComponent();
    await waitFor(() => expect(screen.getByText('Chiến dịch Tạm Dừng')).toBeInTheDocument());

    openRowMenu('Chiến dịch Tạm Dừng');

    const resumeBtn = await screen.findByRole('button', { name: 'Tiếp tục lịch chạy' });
    expect(screen.queryByRole('button', { name: 'Kích hoạt' })).not.toBeInTheDocument();

    fireEvent.click(resumeBtn);

    await waitFor(() => expect(campaignApiService.publishCampaign).toHaveBeenCalledWith(502));
    // Bấm "Tiếp tục lịch chạy" không được gửi tin nào ngay — không có đường gọi API chạy/gửi nào.
    expect(campaignRunApiService.runCampaign).not.toHaveBeenCalled();
  });
});
