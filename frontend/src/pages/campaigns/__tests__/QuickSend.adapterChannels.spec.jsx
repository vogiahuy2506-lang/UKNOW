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
 * W7a — thẻ kênh Telegram/WhatsApp trong trang Gửi nhanh: chỉ hiện khi GET /campaigns/channels báo bật
 * (rỗng/lỗi/BE cũ -> ẩn); chọn thẻ -> panel riêng, ẩn thanh bước Email/Zalo; đổi lại Zalo -> panel biến mất.
 */
// P12 — trang dùng useChannelEntitlements (TanStack Query); spec này không bọc QueryClientProvider nên mock hook (có quyền mọi kênh).
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false }),
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

beforeEach(() => {
  vi.clearAllMocks();
  emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  emailSettingsApiService.listEmailSettings.mockResolvedValue({ data: { data: { items: [] } } });
  zaloSettingsApiService.listSelectableAccounts.mockResolvedValue({ data: { data: { items: [] } } });
  campaignApiService.getQuickSendEstimate.mockResolvedValue({ data: { data: { unit: 'immediate', value: 0 } } });
  campaignApiService.getQuickSendAdapterConversations.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: [] } } });
  campaignBuilderApiService.getDelayConfig.mockResolvedValue({ data: { success: true, data: {} } });
});

describe('QuickSend — thẻ kênh adapter', () => {
  it('/campaigns/channels rỗng -> không có thẻ Telegram/WhatsApp', async () => {
    campaignApiService.getChannels.mockResolvedValue({ data: { data: { channels: [] } } });
    render(<QuickSend />);
    await waitFor(() => expect(campaignApiService.getChannels).toHaveBeenCalled());
    await screen.findByText('quickSend.selectChannel');
    expect(screen.queryByTestId('quick-send-channel-telegram')).toBeNull();
    expect(screen.queryByTestId('quick-send-channel-whatsapp')).toBeNull();
  });

  it('/campaigns/channels lỗi -> không có thẻ (ẩn, không vỡ trang)', async () => {
    campaignApiService.getChannels.mockRejectedValue(new Error('404'));
    render(<QuickSend />);
    await screen.findByText('quickSend.selectChannel');
    expect(screen.queryByTestId('quick-send-channel-telegram')).toBeNull();
  });

  it('có telegram + whatsapp -> 2 thẻ; chọn Telegram -> panel đồng bộ 3 bước và giữ thanh bước; quay về Zalo -> panel biến mất', async () => {
    campaignApiService.getChannels.mockResolvedValue({
      data: { data: { channels: [
        { key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' },
        { key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' },
      ] } },
    });
    render(<QuickSend />);
    const telegramCard = await screen.findByTestId('quick-send-channel-telegram');
    expect(screen.getByTestId('quick-send-channel-whatsapp')).toBeInTheDocument();
    expect(screen.getByText('quickSend.stepRecipients')).toBeInTheDocument();

    fireEvent.click(telegramCard);
    expect(await screen.findByTestId('quick-send-adapter-panel')).toBeInTheDocument();
    // Thanh bước đồng bộ 3 bước luôn hiển thị
    expect(screen.getByText('quickSend.stepRecipients')).toBeInTheDocument();
    expect(screen.getByText('quickSend.stepTemplate')).toBeInTheDocument();
    expect(screen.getByText('quickSend.stepPreview')).toBeInTheDocument();
    expect(campaignBuilderApiService.getTelegramAccountsForBuilder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Zalo'));
    await waitFor(() => expect(screen.queryByTestId('quick-send-adapter-panel')).toBeNull());
    expect(screen.getByText('quickSend.stepRecipients')).toBeInTheDocument();
  });

  it('chỉ WhatsApp bật -> chỉ có thẻ WhatsApp', async () => {
    campaignApiService.getChannels.mockResolvedValue({
      data: { data: { channels: [{ key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' }] } },
    });
    render(<QuickSend />);
    expect(await screen.findByTestId('quick-send-channel-whatsapp')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-send-channel-telegram')).toBeNull();
  });

  it('kênh adapter Telegram chuyển bước 1 -> 2 -> 3 -> quay lại mượt mà không mất dữ liệu', async () => {
    campaignApiService.getChannels.mockResolvedValue({
      data: { data: { channels: [{ key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' }] } },
    });
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({
      data: { data: [{ id: 1, botUsername: 'bot_alpha', name: 'Bot Alpha', ref: 'bot_alpha' }] },
    });

    render(<QuickSend />);
    const telegramCard = await screen.findByTestId('quick-send-channel-telegram');
    fireEvent.click(telegramCard);

    // Bước 1: Người nhận
    expect(await screen.findByText('Bot Alpha')).toBeInTheDocument();
    fireEvent.click(screen.getByText('quickSendAdapter.modeManualTelegram'));
    const textarea = screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderTelegram');
    fireEvent.change(textarea, { target: { value: '123456789' } });

    // Bấm tiếp tục sang bước 2
    const nextBtn1 = screen.getByText('quickSend.next');
    expect(nextBtn1).not.toBeDisabled();
    fireEvent.click(nextBtn1);

    // Bước 2: Soạn nội dung
    expect(await screen.findByText('quickSendAdapter.messageTitle')).toBeInTheDocument();
    const messageInput = screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder');
    fireEvent.change(messageInput, { target: { value: 'Xin chao Telegram' } });

    // Bấm tiếp tục sang bước 3
    const nextBtn2 = screen.getByText('quickSend.next');
    expect(nextBtn2).not.toBeDisabled();
    fireEvent.click(nextBtn2);

    // Bước 3: Xem trước
    expect(await screen.findByText('quickSend.previewAndSend')).toBeInTheDocument();
    expect(screen.getByText('Xin chao Telegram')).toBeInTheDocument();
    expect(screen.getByText('Bot Alpha')).toBeInTheDocument();

    // Bấm quay lại bước 2
    const backBtn = screen.getByText('quickSend.back');
    fireEvent.click(backBtn);
    expect(await screen.findByText('quickSendAdapter.messageTitle')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Xin chao Telegram')).toBeInTheDocument();
  });
});
