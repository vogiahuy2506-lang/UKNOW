import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../../features/campaigns/services/campaignBuilderApi.service';

/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — Gửi nhanh: gói không có kênh Zalo thì ẩn 2 thẻ Zalo (cá nhân, nhóm) và nếu đang
 * chọn Zalo thì chuyển sang Email; gói có Zalo (kể cả limit=1) vẫn đủ 3 thẻ lõi.
 */
const entitlementsState = { telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false };
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => entitlementsState,
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/quick-send', state: null }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key, params = {}) => (params && Object.keys(params).length > 0 ? `${key}:${JSON.stringify(params)}` : key),
    locale: 'vi',
  }),
}));
vi.mock('../../../features/templates/services/emailTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../features/templates/services/zaloTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../features/settings/services/emailSettingsApi.service', () => ({
  default: { listEmailSettings: vi.fn(), sendEmail: vi.fn() },
}));
vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: { listAccounts: vi.fn(), sendMessage: vi.fn(), sendGroupMessage: vi.fn() },
}));
vi.mock('../../../features/campaigns/services/campaignApi.service', () => ({
  default: {
    getChannels: vi.fn(),
    getQuickSendEstimate: vi.fn(),
    testSendQuickCampaign: vi.fn(),
    getQuickSendAdapterConversations: vi.fn(),
    sendQuickAdapterMessage: vi.fn(),
  },
}));
vi.mock('../../../features/campaigns/services/campaignBuilderApi.service', () => ({
  default: {
    getPreviewZaloGroups: vi.fn(),
    getDelayConfig: vi.fn(),
    getTelegramAccountsForBuilder: vi.fn(),
    getWhatsAppAccountsForBuilder: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  emailSettingsApiService.listEmailSettings.mockResolvedValue({ data: { data: { items: [] } } });
  zaloSettingsApiService.listAccounts.mockResolvedValue({ data: { data: { items: [] } } });
  campaignApiService.getQuickSendEstimate.mockResolvedValue({ data: { data: { unit: 'immediate', value: 0 } } });
  campaignApiService.getQuickSendAdapterConversations.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: [] } } });
  campaignBuilderApiService.getDelayConfig.mockResolvedValue({ data: { success: true, data: {} } });
});

describe('QuickSend — P12 quyền kênh Zalo', () => {
  beforeEach(() => {
    entitlementsState.zalo = true;
    entitlementsState.limits = {};
    campaignApiService.getChannels.mockResolvedValue({ data: { data: { channels: [] } } });
  });

  it('zalo:false -> không có thẻ Zalo / Zalo nhóm, còn thẻ Email', async () => {
    entitlementsState.zalo = false;
    render(<QuickSend />);
    await screen.findByText('quickSend.selectChannel');
    expect(screen.queryByTestId('quick-send-channel-zalo')).toBeNull();
    expect(screen.queryByTestId('quick-send-channel-zalo_group')).toBeNull();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('zalo:true với limit=1 -> đủ 3 thẻ lõi (Zalo không biến mất với khách trả phí)', async () => {
    entitlementsState.limits = { zalo: 1 };
    render(<QuickSend />);
    expect(await screen.findByTestId('quick-send-channel-zalo')).toBeInTheDocument();
    expect(screen.getByTestId('quick-send-channel-zalo_group')).toBeInTheDocument();
  });

  it('đang chọn Zalo rồi quyền về false (đổi gói/tải xong) -> chuyển sang Email, thẻ Zalo biến mất', async () => {
    const { rerender } = render(<QuickSend />);
    fireEvent.click(await screen.findByTestId('quick-send-channel-zalo'));
    entitlementsState.zalo = false;
    rerender(<QuickSend />);
    await waitFor(() => expect(screen.queryByTestId('quick-send-channel-zalo')).toBeNull());
    expect(screen.getByText('quickSend.selectSenderAccount')).toBeInTheDocument();
    expect(screen.queryByText('quickSend.zaloRecipientTypeLabel')).toBeNull();
  });
});
