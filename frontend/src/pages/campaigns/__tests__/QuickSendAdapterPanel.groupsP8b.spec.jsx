import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickSendAdapterPanel from '../QuickSendAdapterPanel';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../../features/campaigns/services/campaignBuilderApi.service';
import { quickSendSleepWithCountdown } from '../quickSendPacing.util';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';

/**
 * P8b — QuickSendAdapterPanel, nguồn "Nhóm": Telegram (API trả { chatId, title }) và WhatsApp (API trả
 * { recipientKey: '<id>@g.us', title }). Giả ĐÚNG ranh giới: axios bọc `{ data: { data: [...] } }`.
 */
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key, params = {}) => (params && Object.keys(params).length > 0 ? `${key}:${JSON.stringify(params)}` : key),
    locale: 'vi',
  }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../features/campaigns/services/campaignApi.service', () => ({
  default: {
    getQuickSendAdapterConversations: vi.fn(),
    sendQuickAdapterMessage: vi.fn(),
    getQuickSendEstimate: vi.fn(),
    uploadQuickSendAttachment: vi.fn(),
  },
}));
vi.mock('../../../features/templates/services/zaloTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));
vi.mock('../../../features/campaigns/services/campaignBuilderApi.service', () => ({
  default: {
    getTelegramAccountsForBuilder: vi.fn(),
    getWhatsAppAccountsForBuilder: vi.fn(),
    getTelegramAccountGroups: vi.fn(),
    getWhatsAppAccountGroups: vi.fn(),
  },
}));
vi.mock('../quickSendPacing.util', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, quickSendSleepWithCountdown: vi.fn().mockResolvedValue(undefined) };
});

const ok = (recipientKey) => ({ data: { data: { item: { recipientKey, status: 'success' } } } });
const TG_GROUPS = [
  { chatId: -1001, title: 'Nhóm Bán hàng', type: 'supergroup', membersCount: 40 },
  { chatId: -1002, title: 'Nhóm VIP', type: 'group', membersCount: null },
];
const WA_GROUPS = [
  { recipientKey: '120363000000000001@g.us', title: 'Khách VIP', membersCount: 12 },
  { recipientKey: '120363000000000002@g.us', title: 'Đại lý', membersCount: 3 },
];

beforeEach(() => {
  vi.clearAllMocks();
  quickSendSleepWithCountdown.mockResolvedValue(undefined);
  campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({
    data: { data: [{ id: 7, name: 'Bot TG', username: null, openConversationCount: 0 }] },
  });
  campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({
    data: { data: [{ sessionKey: '1-default', display: 'WA Mở', status: 'open', openConversationCount: 0 }] },
  });
  campaignBuilderApiService.getTelegramAccountGroups.mockResolvedValue({ data: { data: TG_GROUPS } });
  campaignBuilderApiService.getWhatsAppAccountGroups.mockResolvedValue({ data: { data: WA_GROUPS } });
  campaignApiService.getQuickSendAdapterConversations.mockResolvedValue({ data: { data: [] } });
  campaignApiService.getQuickSendEstimate.mockResolvedValue({ data: { data: { unit: 'immediate', value: 0, estimatedMs: 0 } } });
  campaignApiService.sendQuickAdapterMessage.mockImplementation((_c, payload) => Promise.resolve(ok(payload.recipientKey)));
  zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
});

async function openGroups(channel) {
  render(<QuickSendAdapterPanel channel={channel} channelLabel={channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'} />);
  fireEvent.click(await screen.findByText('quickSendAdapter.modeGroups'));
  await waitFor(() => expect(screen.getByText('quickSendAdapter.groupsLoad')).not.toBeDisabled());
  fireEvent.click(screen.getByText('quickSendAdapter.groupsLoad'));
}

describe('QuickSendAdapterPanel — nguồn Nhóm', () => {
  it('Telegram: tải nhóm theo tài khoản, chọn 2 nhóm -> gửi từng nhóm bằng chat id âm', async () => {
    await openGroups('telegram');
    await screen.findByText('Nhóm Bán hàng');
    expect(campaignBuilderApiService.getTelegramAccountGroups).toHaveBeenCalledWith('7');
    expect(campaignBuilderApiService.getWhatsAppAccountGroups).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Nhóm Bán hàng/));
    fireEvent.click(screen.getByLabelText(/Nhóm VIP/));
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Xin chào cả nhóm' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    const calls = campaignApiService.sendQuickAdapterMessage.mock.calls;
    expect(calls.map((c) => c[1].recipientKey)).toEqual(['-1001', '-1002']);
    expect(calls[0][0]).toBe('telegram');
    expect(calls[0][1]).toMatchObject({ accountId: '7', message: 'Xin chào cả nhóm' });
  });

  it('WhatsApp: gọi API nhóm WhatsApp theo sessionKey, gửi bằng jid @g.us NGUYÊN VẸN', async () => {
    await openGroups('whatsapp');
    await screen.findByText('Khách VIP');
    expect(campaignBuilderApiService.getWhatsAppAccountGroups).toHaveBeenCalledWith('1-default');
    expect(campaignBuilderApiService.getTelegramAccountGroups).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Khách VIP/));
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào nhóm' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    const [channel, payload] = campaignApiService.sendQuickAdapterMessage.mock.calls[0];
    expect(channel).toBe('whatsapp');
    expect(payload).toMatchObject({ sessionKey: '1-default', recipientKey: '120363000000000001@g.us', message: 'Chào nhóm' });
  });

  it('chưa chọn nhóm nào -> nút gửi tắt; API lỗi -> báo lỗi', async () => {
    campaignBuilderApiService.getWhatsAppAccountGroups.mockRejectedValue(new Error('409'));
    await openGroups('whatsapp');
    expect(await screen.findByText('quickSendAdapter.groupsLoadFailed')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ })).toBeDisabled();
  });
});
