import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Campaigns from '../Campaigns';
import { useAuthStore } from '../../../stores/authStore';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignRunApiService from '../../../features/campaigns/services/campaignRunApi.service';
import viTranslations from '../../../i18n/vi';

/**
 * PR-10 (lặt vặt số liệu, phía khách) — danh sách chiến dịch:
 * - C-18 cột "Hoàn thành" là số LƯỢT CHẠY hoàn tất → "Lượt chạy xong";
 * - C-15 huy hiệu chờ dùng class không tồn tại `badge-danger` → `badge-warning` (chờ ≠ lỗi);
 * - C-10 bộ lọc loại thiếu Telegram / WhatsApp / Đa kênh;
 * - C-28 hộp thoại "Duyệt & gửi" không được nói "0 người nhận".
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

// P12 — trang dùng useChannelEntitlements (TanStack Query); spec này không bọc QueryClientProvider nên mock hook (có quyền mọi kênh).
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false }),
}));
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
    approveCampaign: vi.fn(),
    getChannels: vi.fn(),
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

const baseCampaign = {
  campaignType: 'email',
  status: 'active',
  runningCount: 0,
  enabledScheduleCount: 0,
  completedCount: 0,
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-11T10:00:00Z',
  origin: 'self_created',
  createdBy: { name: 'Admin' },
};

const mockCampaignList = (items) => {
  campaignApiService.getCampaigns.mockResolvedValue({
    data: { data: { items, pagination: { page: 1, total: items.length, totalPages: 1 } } },
  });
};

const renderComponent = () =>
  render(
    <MemoryRouter initialEntries={['/app/campaigns']}>
      <Routes>
        <Route path="/app/campaigns" element={<Campaigns />} />
      </Routes>
    </MemoryRouter>
  );

describe('Campaigns — PR-10 lặt vặt số liệu (phía khách)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, roleCode: 'owner', role: 'owner' },
      activeContext: { type: 'self' },
    });
    campaignApiService.getChannels.mockResolvedValue({ data: { data: { channels: [] } } });
    campaignApiService.getSharedWithMe.mockResolvedValue({
      data: { data: { items: [], pagination: { page: 1, total: 0, totalPages: 1 } } },
    });
    campaignRunApiService.getCampaignRuns.mockResolvedValue({ data: { data: [] } });
    campaignRunApiService.getCampaignSchedules.mockResolvedValue({ data: { data: [] } });
    mockCampaignList([{ ...baseCampaign, id: 101, campaignName: 'Chiến dịch A', completedCount: 5 }]);
  });

  it('C-18: tiêu đề cột là "Lượt chạy xong", không còn "Hoàn thành"', async () => {
    renderComponent();
    await screen.findByText('Chiến dịch A');
    expect(screen.getByRole('columnheader', { name: 'Lượt chạy xong' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Hoàn thành' })).toBeNull();
  });

  it('C-15: huy hiệu "đang chờ" của lượt chạy tạm dừng dùng badge-warning, KHÔNG dùng badge-danger (không tồn tại)', async () => {
    mockCampaignList([{ ...baseCampaign, id: 101, campaignName: 'Chiến dịch A', runningCount: 1 }]);
    campaignRunApiService.getCampaignRuns.mockResolvedValue({
      data: {
        data: [
          {
            id: 900,
            campaignId: 101,
            status: 'running',
            runMetadata: {
              quotaDeferredReason: 'plan_quota_email_daily',
              quotaDeferredUntil: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
            },
          },
        ],
      },
    });

    const { container } = renderComponent();
    await screen.findByText('Chiến dịch A');
    await waitFor(() => {
      expect(container.querySelector('span.badge.text-xs.font-normal')).not.toBeNull();
    });
    const waitingBadge = container.querySelector('span.badge.text-xs.font-normal');
    expect(waitingBadge.className).toContain('badge-warning');
    expect(container.querySelector('.badge-danger')).toBeNull();
  });

  it('C-10: bộ lọc loại có "Đa kênh"; Telegram/WhatsApp chỉ hiện khi kênh được bật', async () => {
    renderComponent();
    await screen.findByText('Chiến dịch A');
    const typeSelect = screen.getByRole('option', { name: 'Tất cả loại' }).closest('select');
    const optionNames = () => within(typeSelect).getAllByRole('option').map((o) => o.textContent);

    expect(optionNames()).toContain('Đa kênh');
    expect(optionNames()).not.toContain('Telegram');
    expect(optionNames()).not.toContain('WhatsApp');

    fireEvent.change(typeSelect, { target: { value: 'mixed' } });
    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'mixed', page: 1 })
      );
    });
  });

  it('C-10: kênh Telegram + WhatsApp bật → có thêm Telegram, Telegram nhóm, WhatsApp và lọc gửi đúng type', async () => {
    campaignApiService.getChannels.mockResolvedValue({
      data: { data: { channels: [{ key: 'telegram' }, { key: 'whatsapp' }] } },
    });
    renderComponent();
    await screen.findByText('Chiến dịch A');
    const typeSelect = screen.getByRole('option', { name: 'Tất cả loại' }).closest('select');

    await waitFor(() => {
      expect(within(typeSelect).getByRole('option', { name: 'WhatsApp' })).toBeInTheDocument();
    });
    expect(within(typeSelect).getByRole('option', { name: 'Telegram' })).toBeInTheDocument();
    expect(within(typeSelect).getByRole('option', { name: 'Telegram nhóm' })).toBeInTheDocument();

    fireEvent.change(typeSelect, { target: { value: 'whatsapp' } });
    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'whatsapp' })
      );
    });
  });

  it('C-28: hộp thoại duyệt hiện số người nhận API trả về (đã ước tính cho chiến dịch chờ duyệt)', async () => {
    mockCampaignList([
      { ...baseCampaign, id: 201, campaignName: 'Chờ duyệt lớn', status: 'pending_owner_approval', totalCustomers: 250 },
    ]);
    renderComponent();
    await screen.findByText('Chờ duyệt lớn');
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));

    expect(await screen.findByText(/sẽ được gửi đến 250 người nhận/)).toBeInTheDocument();
    expect(screen.getByText('250', { selector: 'strong' })).toBeInTheDocument();
  });

  it('C-28: chưa biết số người nhận (0) → hộp thoại KHÔNG in "0 người nhận"', async () => {
    mockCampaignList([
      { ...baseCampaign, id: 202, campaignName: 'Chờ duyệt chưa đếm', status: 'pending_owner_approval', totalCustomers: 0 },
    ]);
    const { baseElement } = renderComponent();
    await screen.findByText('Chờ duyệt chưa đếm');
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));

    expect(await screen.findByText(/Số người nhận sẽ được xác định khi chiến dịch chạy/)).toBeInTheDocument();
    expect(baseElement.textContent).not.toMatch(/0 người nhận/);
    expect(baseElement.textContent).not.toContain('Số người nhận:');
  });
});
