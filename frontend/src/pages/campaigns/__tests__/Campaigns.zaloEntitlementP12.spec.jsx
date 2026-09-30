/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — modal "Tạo chiến dịch": gói không có kênh Zalo thì bỏ 2 lựa chọn Zalo cá nhân/nhóm
 * (chỉ còn Email); gói có Zalo (kể cả limit=1) giữ đủ. Bộ lọc loại ở danh sách VẪN có Zalo để tìm chiến dịch cũ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Campaigns from '../Campaigns';
import { useAuthStore } from '../../../stores/authStore';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignRunApiService from '../../../features/campaigns/services/campaignRunApi.service';
import viTranslations from '../../../i18n/vi';

const entitlementsState = { telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false };
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => entitlementsState,
}));

const getNested = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);
vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => (typeof getNested(viTranslations, key) === 'string' ? getNested(viTranslations, key) : key) }),
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
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const renderComponent = () => render(
  <MemoryRouter initialEntries={['/app/campaigns']}>
    <Routes>
      <Route path="/app/campaigns" element={<Campaigns />} />
    </Routes>
  </MemoryRouter>,
);

async function openCreateModal() {
  renderComponent();
  await screen.findByText('Chiến dịch cũ');
  fireEvent.click(screen.getByRole('button', { name: viTranslations.campaigns.create }));
  await screen.findByPlaceholderText(viTranslations.campaigns.campaignNamePlaceholder);
}

describe('Campaigns — P12 quyền kênh Zalo ở modal tạo chiến dịch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlementsState.zalo = true;
    entitlementsState.limits = {};
    useAuthStore.setState({ user: { id: 1, roleCode: 'owner', role: 'owner' }, activeContext: { type: 'self' } });
    campaignApiService.getChannels.mockResolvedValue({ data: { data: { channels: [] } } });
    campaignApiService.getSharedWithMe.mockResolvedValue({ data: { data: { items: [], pagination: { page: 1, total: 0, totalPages: 1 } } } });
    campaignApiService.getCampaigns.mockResolvedValue({
      data: {
        data: {
          items: [{
            id: 1, campaignName: 'Chiến dịch cũ', campaignType: 'zalo', status: 'draft', runningCount: 0,
            enabledScheduleCount: 0, completedCount: 0, createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-11T10:00:00Z',
            origin: 'self_created', createdBy: { name: 'A' },
          }],
          pagination: { page: 1, total: 1, totalPages: 1 },
        },
      },
    });
    campaignRunApiService.getCampaignRuns.mockResolvedValue({ data: { data: [] } });
    campaignRunApiService.getCampaignSchedules.mockResolvedValue({ data: { data: [] } });
  });

  it('zalo:false -> modal không có nút Zalo cá nhân/nhóm, vẫn có Email; bộ lọc loại vẫn liệt kê Zalo', async () => {
    entitlementsState.zalo = false;
    await openCreateModal();
    const modalButtons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(modalButtons).toContain(viTranslations.campaigns.email);
    expect(screen.queryByRole('button', { name: viTranslations.campaigns.zaloPersonal })).toBeNull();
    expect(screen.queryByRole('button', { name: viTranslations.campaigns.zaloGroup })).toBeNull();
    expect(screen.getByRole('option', { name: viTranslations.campaigns.zaloPersonal })).toBeTruthy();
  });

  it('zalo:true (limit=1) -> modal có đủ Email, Zalo cá nhân, Zalo nhóm', async () => {
    entitlementsState.limits = { zalo: 1 };
    await openCreateModal();
    await waitFor(() => expect(screen.getByRole('button', { name: viTranslations.campaigns.zaloPersonal })).toBeTruthy());
    expect(screen.getByRole('button', { name: viTranslations.campaigns.zaloGroup })).toBeTruthy();
  });
});
