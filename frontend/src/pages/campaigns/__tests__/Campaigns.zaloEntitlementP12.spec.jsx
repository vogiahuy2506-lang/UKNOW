/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — modal "Tạo chiến dịch" và kênh Zalo theo gói. 11/10/2026
 * (PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA): gói không có Zalo thì 2 lựa chọn Zalo cá nhân/nhóm KHÔNG còn bị bỏ — vẫn hiện,
 * mờ + khoá, bấm mở modal gợi ý mua; gói có Zalo (kể cả limit=1) dùng được. Telegram/WhatsApp hiện theo cờ HỆ THỐNG
 * (`enabledAdapterChannels`) chứ không theo gói. Bộ lọc loại ở danh sách VẪN có Zalo để tìm chiến dịch cũ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Campaigns from '../Campaigns';
import { useAuthStore } from '../../../stores/authStore';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignRunApiService from '../../../features/campaigns/services/campaignRunApi.service';
import viTranslations from '../../../i18n/vi';

const SYSTEM_ADAPTERS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
];
const entitlementsState = {
  telegram: true, whatsapp: true, zalo: true, limits: {}, enabledAdapterChannels: null, isLoading: false,
};
const meter = (used, limit) => ({ used, limit });
const emptyUsage = () => ({
  email: meter(null, null),
  messaging: meter(null, null),
  telegram: meter(null, null),
  whatsapp: meter(null, null),
  combined: meter(null, null),
});
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
    entitlementsState.telegram = true;
    entitlementsState.whatsapp = true;
    entitlementsState.limits = {};
    entitlementsState.enabledAdapterChannels = null;
    useAuthStore.setState({
      user: { id: 1, roleCode: 'owner', role: 'owner' },
      activeContext: { type: 'self' },
      sendUsage: emptyUsage(),
      billingStatus: null,
      addons: null,
    });
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

  it('zalo:false -> modal VẪN có nút Zalo cá nhân/nhóm nhưng khoá (aria-disabled, mờ, ổ khoá); Email dùng được; bộ lọc loại vẫn liệt kê Zalo', async () => {
    entitlementsState.zalo = false;
    await openCreateModal();
    for (const id of ['zalo', 'zalo_group']) {
      const button = screen.getByTestId(`create-campaign-type-${id}`);
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button.className).toContain('opacity-60');
      expect(within(button).getByTestId('channel-lock-badge')).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: viTranslations.campaigns.zaloPersonal })).toBeTruthy();
    expect(screen.getByRole('button', { name: viTranslations.campaigns.zaloGroup })).toBeTruthy();
    expect(screen.getByTestId('create-campaign-type-email')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('option', { name: viTranslations.campaigns.zaloPersonal })).toBeTruthy();
  });

  it('bấm loại Zalo bị khoá -> modal gợi ý mua slot, KHÔNG đổi loại đang chọn (vẫn Email) và không tạo chiến dịch', async () => {
    entitlementsState.zalo = false;
    await openCreateModal();
    fireEvent.click(screen.getByTestId('create-campaign-type-zalo'));
    const modal = await screen.findByTestId('channel-unavailable-modal');
    expect(modal).toHaveAttribute('data-channel', 'zalo');
    expect(modal).toHaveAttribute('data-reason', 'not_in_plan');
    expect(within(modal).getByTestId('channel-unavailable-action-buySlot')).toBeTruthy();
    expect(screen.getByTestId('create-campaign-type-email').className).toContain('border-orange-500');
    expect(screen.getByTestId('create-campaign-type-zalo').className).not.toContain('border-orange-500');
    expect(campaignApiService.createCampaign).not.toHaveBeenCalled();
  });

  it('zalo:true (limit=1) -> modal có đủ Email, Zalo cá nhân, Zalo nhóm và dùng được cả ba', async () => {
    entitlementsState.limits = { zalo: 1 };
    await openCreateModal();
    await waitFor(() => expect(screen.getByRole('button', { name: viTranslations.campaigns.zaloPersonal })).toBeTruthy());
    expect(screen.getByRole('button', { name: viTranslations.campaigns.zaloGroup })).toBeTruthy();
    for (const id of ['email', 'zalo', 'zalo_group']) {
      expect(screen.getByTestId(`create-campaign-type-${id}`)).not.toHaveAttribute('aria-disabled');
    }
  });

  it('gói không có Telegram/WhatsApp nhưng hệ thống bật: Telegram, Telegram nhóm, WhatsApp VẪN hiện và khoá; không gọi GET /campaigns/channels', async () => {
    entitlementsState.telegram = false;
    entitlementsState.whatsapp = false;
    entitlementsState.enabledAdapterChannels = SYSTEM_ADAPTERS;
    await openCreateModal();
    for (const id of ['telegram', 'telegram_group', 'whatsapp']) {
      expect(screen.getByTestId(`create-campaign-type-${id}`)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(campaignApiService.getChannels).not.toHaveBeenCalled();
    // Bộ lọc loại ở danh sách cũng giữ Telegram/WhatsApp (trước đây mất khi gói hết hạn vì GET /campaigns/channels bị chặn).
    expect(screen.getByRole('option', { name: viTranslations.campaigns.telegram })).toBeTruthy();
    expect(screen.getByRole('option', { name: viTranslations.campaigns.whatsapp })).toBeTruthy();
  });

  it('cờ HỆ THỐNG tắt (enabledAdapterChannels rỗng) -> không có loại Telegram/WhatsApp nào (không bán được)', async () => {
    entitlementsState.enabledAdapterChannels = [];
    await openCreateModal();
    expect(screen.queryByTestId('create-campaign-type-telegram')).toBeNull();
    expect(screen.queryByTestId('create-campaign-type-telegram_group')).toBeNull();
    expect(screen.queryByTestId('create-campaign-type-whatsapp')).toBeNull();
    expect(screen.getByTestId('create-campaign-type-email')).toBeTruthy();
  });

  it('Email hết lượt trong kỳ -> loại mặc định chuyển sang loại dùng được đầu tiên (Zalo cá nhân), Email khoá', async () => {
    useAuthStore.setState({ sendUsage: { ...emptyUsage(), email: meter(1000, 1000) } });
    await openCreateModal();
    expect(screen.getByTestId('create-campaign-type-email')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('create-campaign-type-zalo').className).toContain('border-orange-500');
  });

  it('gói hết hạn: mọi loại khoá; điền tên rồi bấm "Tạo" mở modal Gia hạn thay vì gọi API tạo chiến dịch', async () => {
    useAuthStore.setState({ billingStatus: { isFullyExpired: true, planRevokedAfterExpiry: false } });
    await openCreateModal();
    expect(screen.getByTestId('create-campaign-type-email')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByPlaceholderText(viTranslations.campaigns.campaignNamePlaceholder), { target: { value: 'Chiến dịch X' } });
    fireEvent.click(screen.getByRole('button', { name: viTranslations.campaigns.createAndDesign }));
    const modal = await screen.findByTestId('channel-unavailable-modal');
    expect(modal).toHaveAttribute('data-reason', 'plan_expired');
    expect(campaignApiService.createCampaign).not.toHaveBeenCalled();
  });
});
