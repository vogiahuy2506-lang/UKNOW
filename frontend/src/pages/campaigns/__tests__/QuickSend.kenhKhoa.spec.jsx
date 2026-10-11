import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../../features/campaigns/services/campaignBuilderApi.service';
import { useAuthStore } from '../../../stores/authStore';

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — Gửi nhanh KHÔNG ẩn thẻ kênh nữa: thẻ chưa dùng được (gói không có kênh /
 * gói hết hạn / hết lượt) vẫn hiện, mờ + aria-disabled, bấm mở modal gợi ý mua và KHÔNG đổi kênh đang chọn.
 */
const SYSTEM_ADAPTERS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
];
const entitlementsState = {
  telegram: true,
  whatsapp: true,
  zalo: true,
  limits: {},
  enabledAdapterChannels: SYSTEM_ADAPTERS,
  isLoading: false,
};
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
  default: { listSelectableAccounts: vi.fn(), sendMessage: vi.fn(), sendGroupMessage: vi.fn() },
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

const meter = (used, limit) => ({ used, limit });
const emptyUsage = () => ({
  email: meter(null, null),
  messaging: meter(null, null),
  telegram: meter(null, null),
  whatsapp: meter(null, null),
  combined: meter(null, null),
});

beforeEach(() => {
  vi.clearAllMocks();
  entitlementsState.telegram = true;
  entitlementsState.whatsapp = true;
  entitlementsState.zalo = true;
  entitlementsState.enabledAdapterChannels = SYSTEM_ADAPTERS;
  useAuthStore.setState({
    user: { id: 1, role: 'user' },
    activeContext: { type: 'self' },
    sendUsage: emptyUsage(),
    billingStatus: null,
    addons: null,
  });
  emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  emailSettingsApiService.listEmailSettings.mockResolvedValue({ data: { data: { items: [] } } });
  zaloSettingsApiService.listSelectableAccounts.mockResolvedValue({ data: { data: { items: [] } } });
  campaignApiService.getChannels.mockRejectedValue(new Error('403 PLAN_EXPIRED'));
  campaignApiService.getQuickSendEstimate.mockResolvedValue({ data: { data: { unit: 'immediate', value: 0 } } });
  campaignApiService.getQuickSendAdapterConversations.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: [] } } });
  campaignBuilderApiService.getDelayConfig.mockResolvedValue({ data: { success: true, data: {} } });
});

const CARDS = ['email', 'zalo', 'telegram', 'whatsapp'];

describe('QuickSend — thẻ kênh khoá thay vì ẩn', () => {
  it('gói không có Telegram: thẻ Telegram vẫn hiện, aria-disabled + mờ + ổ khoá; WhatsApp/Email/Zalo dùng được', async () => {
    entitlementsState.telegram = false;
    render(<QuickSend />);
    const telegram = await screen.findByTestId('quick-send-channel-telegram');
    expect(telegram).toHaveAttribute('aria-disabled', 'true');
    expect(telegram.className).toContain('opacity-60');
    expect(within(telegram).getByTestId('channel-lock-badge')).toBeInTheDocument();
    for (const key of ['email', 'zalo', 'whatsapp']) {
      expect(screen.getByTestId(`quick-send-channel-${key}`)).not.toHaveAttribute('aria-disabled');
    }
    // Backend mới có danh sách kênh hệ thống nên KHÔNG cần gọi GET /campaigns/channels (bị chặn khi gói hết hạn).
    expect(campaignApiService.getChannels).not.toHaveBeenCalled();
  });

  it('bấm thẻ Telegram bị khoá -> modal "Mua thêm slot", KHÔNG chọn kênh (không mở panel Telegram, vẫn ở Email)', async () => {
    entitlementsState.telegram = false;
    render(<QuickSend />);
    fireEvent.click(await screen.findByTestId('quick-send-channel-telegram'));
    const modal = await screen.findByTestId('channel-unavailable-modal');
    expect(modal).toHaveAttribute('data-channel', 'telegram');
    expect(modal).toHaveAttribute('data-reason', 'not_in_plan');
    expect(within(modal).getByTestId('channel-unavailable-action-buySlot')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-send-adapter-panel')).toBeNull();
    expect(campaignBuilderApiService.getTelegramAccountsForBuilder).not.toHaveBeenCalled();
    expect(screen.getByText('quickSend.selectSenderAccount')).toBeInTheDocument();
    expect(screen.getByTestId('quick-send-channel-telegram').className).not.toContain('border-orange-500');
  });

  it('gói HẾT HẠN + GET /campaigns/channels bị chặn: vẫn thấy đủ 4 thẻ, tất cả khoá; bấm mở modal "Gia hạn gói"', async () => {
    useAuthStore.setState({ billingStatus: { isFullyExpired: true, planRevokedAfterExpiry: false } });
    render(<QuickSend />);
    for (const key of CARDS) {
      const card = await screen.findByTestId(`quick-send-channel-${key}`);
      expect(card).toHaveAttribute('aria-disabled', 'true');
    }
    fireEvent.click(screen.getByTestId('quick-send-channel-whatsapp'));
    const modal = await screen.findByTestId('channel-unavailable-modal');
    expect(modal).toHaveAttribute('data-reason', 'plan_expired');
    expect(within(modal).getByTestId('channel-unavailable-action-renew')).toBeInTheDocument();
  });

  it('hết lượt Zalo trong kỳ: thẻ Zalo khoá, bấm mở modal hết lượt (300/300); Email vẫn là kênh đang chọn', async () => {
    useAuthStore.setState({ sendUsage: { ...emptyUsage(), messaging: meter(300, 300) } });
    render(<QuickSend />);
    const zalo = await screen.findByTestId('quick-send-channel-zalo');
    expect(zalo).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(zalo);
    const modal = await screen.findByTestId('channel-unavailable-modal');
    expect(modal).toHaveAttribute('data-reason', 'quota_exhausted');
    expect(within(modal).getByText('channelUnavailable.quotaTitle:{"channel":"Zalo","used":"300","limit":"300"}')).toBeInTheDocument();
    expect(within(modal).getByTestId('channel-unavailable-action-buyQuota')).toBeInTheDocument();
    expect(screen.getByText('quickSend.selectSenderAccount')).toBeInTheDocument();
  });

  it('hết lượt gói nhưng VÍ mua thêm còn lượt: thẻ Zalo KHÔNG khoá (cổng gửi vẫn cho)', async () => {
    useAuthStore.setState({
      sendUsage: { ...emptyUsage(), messaging: meter(300, 300) },
      addons: { zaloMessages: { granted: 100, used: 10, remaining: 90 } },
    });
    render(<QuickSend />);
    expect(await screen.findByTestId('quick-send-channel-zalo')).not.toHaveAttribute('aria-disabled');
  });

  it('Email hết lượt thì kênh mặc định tự chuyển sang kênh dùng được đầu tiên (Zalo); thẻ Email khoá', async () => {
    useAuthStore.setState({ sendUsage: { ...emptyUsage(), email: meter(1000, 1000) } });
    render(<QuickSend />);
    await waitFor(() => expect(screen.getByTestId('quick-send-channel-zalo').className).toContain('border-orange-500'));
    expect(screen.getByTestId('quick-send-channel-email')).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByText('quickSend.zaloRecipientTypeLabel')).toBeInTheDocument();
  });

  it('cờ hệ thống tắt hết (enabledAdapterChannels = []) -> không có thẻ Telegram/WhatsApp (không bán được), Email + Zalo vẫn hiện', async () => {
    entitlementsState.enabledAdapterChannels = [];
    render(<QuickSend />);
    await screen.findByText('quickSend.selectChannel');
    expect(screen.queryByTestId('quick-send-channel-telegram')).toBeNull();
    expect(screen.queryByTestId('quick-send-channel-whatsapp')).toBeNull();
    expect(screen.getByTestId('quick-send-channel-email')).toBeInTheDocument();
    expect(screen.getByTestId('quick-send-channel-zalo')).toBeInTheDocument();
  });

  it('backend CŨ (thiếu enabledAdapterChannels): dùng GET /campaigns/channels như trước; thẻ kênh có quyền chọn được bình thường', async () => {
    entitlementsState.enabledAdapterChannels = null;
    campaignApiService.getChannels.mockResolvedValue({
      data: { data: { channels: [{ key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' }] } },
    });
    render(<QuickSend />);
    const telegram = await screen.findByTestId('quick-send-channel-telegram');
    expect(telegram).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByTestId('quick-send-channel-whatsapp')).toBeNull();
    fireEvent.click(telegram);
    expect(await screen.findByTestId('quick-send-adapter-panel')).toBeInTheDocument();
  });
});
