import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../../features/campaigns/services/campaignBuilderApi.service';

/**
 * PLAN_GUI_NHANH_GOP_THE_ZALO_NHOM (03/10/2026) — Gửi nhanh: thẻ "Zalo nhóm" bỏ đi, "Nhóm" thành lựa chọn thứ ba
 * của ô "Loại người nhận" trong thẻ Zalo (giống Telegram/WhatsApp). Chỉ đổi GIAO DIỆN: kênh nội bộ vẫn là
 * 'zalo_group', nên request ước tính/gửi phải y như trước (channel 'zalo_group', sendGroupMessage, không sendMessage).
 */
const m = vi.hoisted(() => ({
  locationState: null,
  // PHẢI là một hàm ổn định: effect nạp bản nháp có `navigate` trong dependency — useNavigate trả hàm mới mỗi lần
  // render thì effect chạy lại vô hạn khi có bản nháp (đã làm sập worker vitest vì hết heap).
  navigate: vi.fn(),
  entitlements: { telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false },
}));

vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => m.entitlements,
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/quick-send', state: m.locationState }),
  useNavigate: () => m.navigate,
}));
// `t` PHẢI ổn định giữa các lần render (bản thật dùng useCallback([locale])): resolveGroupNames là useCallback([t])
// nằm trong dependency của effect — t đổi tham chiếu mỗi render làm effect chạy lại vô hạn khi kênh là Zalo nhóm.
const stableT = (key, params) => (params && Object.keys(params).length > 0 ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: stableT, locale: 'vi' }) }));
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
vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { getZaloFriends: vi.fn().mockResolvedValue({ data: { data: { items: [], totalPages: 1 } } }) },
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

const ZALO_TEMPLATE = { id: 7, templateName: 'Mẫu Zalo A', bodyText: 'Nội dung mẫu Zalo A' };
const GROUPS = [
  { groupId: 'g1', groupName: 'Nhóm Alpha' },
  { groupId: 'g2', groupName: 'Nhóm Beta' },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.locationState = null;
  m.entitlements = { telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false };
  emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [ZALO_TEMPLATE] } } });
  zaloTemplateApiService.getTemplateById.mockResolvedValue({ data: { data: ZALO_TEMPLATE } });
  emailSettingsApiService.listEmailSettings.mockResolvedValue({ data: { data: { items: [] } } });
  zaloSettingsApiService.listAccounts.mockResolvedValue({
    data: { data: { items: [{ id: 9, displayName: 'TK Zalo 9', isDefault: true }] } },
  });
  zaloSettingsApiService.sendGroupMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
  zaloSettingsApiService.sendMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
  campaignApiService.getChannels.mockResolvedValue({ data: { data: { channels: [] } } });
  campaignApiService.getQuickSendEstimate.mockResolvedValue({ data: { data: { unit: 'immediate', value: 0 } } });
  campaignApiService.getQuickSendAdapterConversations.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
  campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: GROUPS } } });
  campaignBuilderApiService.getDelayConfig.mockResolvedValue({ data: { success: true, data: {} } });
});
afterEach(cleanup);

const groupRadio = () => screen.getByRole('radio', { name: 'quickSend.zaloRecipientTypeGroup' });
const phoneRadio = () => screen.getByRole('radio', { name: 'quickSend.zaloRecipientTypePhone' });
const GROUP_PICKER_TITLE = 'aiChatbot.wizardGroupTitle';

/** Vào thẻ Zalo, chọn "Nhóm", tick Nhóm Alpha và bấm "Dùng các nhóm đã chọn". */
async function pickGroupAlphaViaRadio() {
  fireEvent.click(await screen.findByTestId('quick-send-channel-zalo'));
  fireEvent.click(groupRadio());
  const alpha = await screen.findByRole('checkbox', { name: /Nhóm Alpha/ });
  fireEvent.click(alpha);
  fireEvent.click(screen.getByRole('button', { name: 'aiChatbot.wizardUseGroups' }));
}

const clickNext = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'quickSend.next' }));
};

describe('QuickSend — gộp thẻ Zalo nhóm vào thẻ Zalo', () => {
  it('không còn thẻ Zalo nhóm: đủ quyền Zalo + Telegram + WhatsApp -> đúng 4 thẻ, lưới 4 cột', async () => {
    campaignApiService.getChannels.mockResolvedValue({
      data: { data: { channels: [
        { key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' },
        { key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' },
      ] } },
    });
    render(<QuickSend />);

    const zaloCard = await screen.findByTestId('quick-send-channel-zalo');
    await screen.findByTestId('quick-send-channel-telegram');
    expect(screen.getByTestId('quick-send-channel-whatsapp')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-send-channel-zalo_group')).toBeNull();
    expect(screen.queryByText('quickSend.channelZaloGroup')).toBeNull();

    const grid = zaloCard.parentElement;
    expect(grid.children).toHaveLength(4);
    expect(grid.className).toContain('sm:grid-cols-4');
    expect(grid.className).not.toContain('sm:grid-cols-5');
  });

  it('thẻ Zalo chưa chọn thì chưa có ô "Loại người nhận"; chọn Zalo -> ô hiện đủ 3 lựa chọn, mặc định Số điện thoại', async () => {
    render(<QuickSend />);
    const zaloCard = await screen.findByTestId('quick-send-channel-zalo');
    expect(screen.queryByText('quickSend.zaloRecipientTypeLabel')).toBeNull();

    fireEvent.click(zaloCard);

    expect(screen.getByText('quickSend.zaloRecipientTypeLabel')).toBeInTheDocument();
    expect(phoneRadio()).toBeChecked();
    expect(screen.getByRole('radio', { name: 'quickSend.zaloRecipientTypeUid' })).not.toBeChecked();
    expect(groupRadio()).not.toBeChecked();
    expect(screen.queryByText(GROUP_PICKER_TITLE)).toBeNull();
  });

  it('Zalo -> radio Nhóm -> hiện bộ chọn nhóm; gửi đi đúng như kênh Zalo nhóm cũ (estimate channel zalo_group, sendGroupMessage)', async () => {
    render(<QuickSend />);
    await pickGroupAlphaViaRadio();

    expect(await screen.findByText(GROUP_PICKER_TITLE)).toBeInTheDocument();
    expect(groupRadio()).toBeChecked();
    expect(screen.getByTestId('quick-send-channel-zalo').className).toContain('border-orange-500');

    await clickNext();
    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Thông báo tới nhóm' },
    });
    await clickNext();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await waitFor(() => expect(campaignApiService.getQuickSendEstimate).toHaveBeenCalledWith({
      channel: 'zalo_group',
      recipients: 1,
    }));
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(1));
    const [payload] = zaloSettingsApiService.sendGroupMessage.mock.calls[0];
    expect(payload).toMatchObject({ accountId: 9, groupId: 'g1', message: 'Thông báo tới nhóm' });
    expect(zaloSettingsApiService.sendMessage).not.toHaveBeenCalled();
  });

  it('Nhóm -> Số điện thoại -> Nhóm: nhóm đã chọn và mẫu đã chọn còn nguyên, vẫn gửi vào đúng nhóm đó', async () => {
    render(<QuickSend />);
    await pickGroupAlphaViaRadio();

    // Sang bước Nội dung chọn một mẫu, rồi quay lại bước Người nhận để đổi loại người nhận.
    await clickNext();
    fireEvent.click(await screen.findByText('Mẫu Zalo A'));
    await waitFor(() => expect(zaloTemplateApiService.getTemplateById).toHaveBeenCalledWith(7));
    expect(await screen.findByText('quickSend.selectedTemplate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'quickSend.back' }));

    fireEvent.click(await screen.findByRole('radio', { name: 'quickSend.zaloRecipientTypePhone' }));
    expect(phoneRadio()).toBeChecked();
    expect(screen.queryByText(GROUP_PICKER_TITLE)).toBeNull();
    expect(screen.getByPlaceholderText(/0901234567/)).toBeInTheDocument();

    fireEvent.click(groupRadio());
    expect(groupRadio()).toBeChecked();
    const chips = screen.getByText('quickSend.groupSelectedListLabel').parentElement;
    expect(within(chips).getByText('Nhóm Alpha')).toBeInTheDocument();

    await clickNext();
    // Mẫu chưa bị xoá khi đổi qua lại giữa Số điện thoại và Nhóm (cùng danh sách mẫu Zalo).
    expect(await screen.findByText('quickSend.selectedTemplate')).toBeInTheDocument();
    await clickNext();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });
    await waitFor(() => expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(1));
    const [payload] = zaloSettingsApiService.sendGroupMessage.mock.calls[0];
    expect(payload).toMatchObject({ groupId: 'g1', message: 'Nội dung mẫu Zalo A' });
    expect(zaloSettingsApiService.sendMessage).not.toHaveBeenCalled();
  });

  it('đang ở Nhóm mà bấm lại thẻ Zalo -> giữ nguyên Nhóm, không rơi về Số điện thoại', async () => {
    render(<QuickSend />);
    fireEvent.click(await screen.findByTestId('quick-send-channel-zalo'));
    fireEvent.click(groupRadio());
    expect(await screen.findByText(GROUP_PICKER_TITLE)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('quick-send-channel-zalo'));

    expect(groupRadio()).toBeChecked();
    expect(phoneRadio()).not.toBeChecked();
    expect(screen.getByText(GROUP_PICKER_TITLE)).toBeInTheDocument();
    expect(screen.getByTestId('quick-send-channel-zalo').className).toContain('border-orange-500');
  });

  it('từ Email bấm thẻ Zalo -> vào Zalo cá nhân (Số điện thoại), không tự vào Nhóm', async () => {
    render(<QuickSend />);
    const zaloCard = await screen.findByTestId('quick-send-channel-zalo');
    expect(zaloCard.className).not.toContain('border-orange-500');

    fireEvent.click(zaloCard);

    expect(phoneRadio()).toBeChecked();
    expect(zaloCard.className).toContain('border-orange-500');
    expect(screen.queryByText(GROUP_PICKER_TITLE)).toBeNull();
  });

  it('bản nháp trợ lý AI channel zalo_group -> thẻ Zalo sáng, radio ở Nhóm, nhóm của bản nháp hiện trong danh sách đã chọn', async () => {
    m.locationState = { quickSendDraft: { channel: 'zalo_group', recipients: ['g2'], accountId: 9 } };
    render(<QuickSend />);

    await waitFor(() => expect(groupRadio()).toBeChecked());
    expect(screen.getByTestId('quick-send-channel-zalo').className).toContain('border-orange-500');
    expect(screen.getByText(GROUP_PICKER_TITLE)).toBeInTheDocument();
    // Tên nhóm được đối chiếu lại từ danh sách nhóm thật của tài khoản (Bẫy 4: không hiện id trần).
    const chips = (await screen.findByText('quickSend.groupSelectedListLabel')).parentElement;
    await waitFor(() => expect(within(chips).getByText('Nhóm Beta')).toBeInTheDocument());
  });

  it('gói không có kênh Zalo -> không có thẻ Zalo và không có ô Loại người nhận', async () => {
    m.entitlements = { telegram: true, whatsapp: true, zalo: false, limits: {}, isLoading: false };
    render(<QuickSend />);
    await screen.findByText('quickSend.selectChannel');

    expect(screen.queryByTestId('quick-send-channel-zalo')).toBeNull();
    expect(screen.queryByTestId('quick-send-channel-zalo_group')).toBeNull();
    expect(screen.queryByText('quickSend.zaloRecipientTypeLabel')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'quickSend.zaloRecipientTypeGroup' })).toBeNull();
  });
});
