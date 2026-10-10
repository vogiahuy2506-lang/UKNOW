import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickSendAdapterPanel from '../QuickSendAdapterPanel';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../../features/campaigns/services/campaignBuilderApi.service';
import { quickSendSleepWithCountdown } from '../quickSendPacing.util';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import api from '../../../services/api';

/**
 * W7a — QuickSendAdapterPanel (Telegram/WhatsApp): mỗi người một request, giãn cách TRƯỚC mỗi tin trừ tin đầu,
 * chặn quá trần / dữ liệu sai TRƯỚC khi gọi API, xử lý deferred / failed.
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
// P5 — mẫu tin (kho mẫu Zalo), tải tệp tạm và hạn mức lưu trữ: giả ở ranh giới đúng hình dạng thật (`{ data: { data } }`).
vi.mock('../../../features/templates/services/zaloTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));
vi.mock('../../../features/campaigns/services/campaignBuilderApi.service', () => ({
  default: { getTelegramAccountsForBuilder: vi.fn(), getWhatsAppAccountsForBuilder: vi.fn() },
}));
// Không chờ thật: ghi lại mỗi lần "chờ" để kiểm số lần/khoảng chờ.
vi.mock('../quickSendPacing.util', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, quickSendSleepWithCountdown: vi.fn().mockResolvedValue(undefined) };
});

const ok = (recipientKey) => ({ data: { data: { item: { recipientKey, status: 'success' } } } });
const item = (overrides) => ({ data: { data: { item: overrides } } });

const TG_CONVERSATIONS = [
  { recipientKey: '1001', name: 'An' },
  { recipientKey: '1002', name: 'Bình' },
  { recipientKey: '1003', name: 'Chi' },
];

beforeEach(() => {
  vi.clearAllMocks();
  quickSendSleepWithCountdown.mockResolvedValue(undefined);
  campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({
    data: { data: [{ id: 7, name: 'Bot TG', username: null, openConversationCount: 3 }] },
  });
  campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({
    data: {
      data: [
        { sessionKey: '1-default', display: 'WA Mở', status: 'open', openConversationCount: 0 },
        { sessionKey: '1-off', display: 'WA Tắt', status: 'offline', openConversationCount: 0 },
      ],
    },
  });
  campaignApiService.getQuickSendAdapterConversations.mockResolvedValue({ data: { data: TG_CONVERSATIONS } });
  campaignApiService.getQuickSendEstimate.mockResolvedValue({
    data: { data: { unit: 'seconds', value: 15, estimatedMs: 15000, quietHours: { startFormatted: '23:00', endFormatted: '06:00' } } },
  });
  campaignApiService.sendQuickAdapterMessage.mockImplementation((_channel, payload) => Promise.resolve(ok(payload.recipientKey)));
  zaloTemplateApiService.getTemplates.mockResolvedValue({
    data: { data: { items: [{ id: 5, templateName: 'Báo giá', bodyText: 'tóm tắt', attachments: [] }] } },
  });
  zaloTemplateApiService.getTemplateById.mockResolvedValue({
    data: {
      data: {
        id: 5,
        templateName: 'Báo giá',
        bodyText: 'Chào {{ten}}, báo giá đây',
        attachments: [{ key: 'uploads/1/zalo-templates/bg.pdf', name: 'bg.pdf', size: 2048 }],
      },
    },
  });
});

async function renderTelegramWithAllSelected(text = 'Xin chào') {
  render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
  fireEvent.click(await screen.findByText('quickSendAdapter.selectAll'));
  fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: text } });
  return screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ });
}

describe('QuickSendAdapterPanel — Telegram', () => {
  it('chọn 3 người -> gọi API 3 lần, chờ 2 lần (KHÔNG chờ trước người đầu), khoảng chờ 5-10s, khoá `${base}-${idx}`', async () => {
    const events = [];
    campaignApiService.sendQuickAdapterMessage.mockImplementation((_c, payload) => {
      events.push('send');
      return Promise.resolve(ok(payload.recipientKey));
    });
    quickSendSleepWithCountdown.mockImplementation(async () => { events.push('wait'); });

    const button = await renderTelegramWithAllSelected();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(events).toEqual(['send', 'wait', 'send', 'wait', 'send']);
    const waits = quickSendSleepWithCountdown.mock.calls.map((c) => c[0]);
    expect(waits).toHaveLength(2);
    waits.forEach((ms) => {
      expect(ms).toBeGreaterThanOrEqual(5000);
      expect(ms).toBeLessThanOrEqual(10000);
    });
    const calls = campaignApiService.sendQuickAdapterMessage.mock.calls;
    expect(calls.map((c) => c[1].recipientKey)).toEqual(['1001', '1002', '1003']);
    expect(calls[0][0]).toBe('telegram');
    expect(calls[0][1]).toMatchObject({ accountId: '7', message: 'Xin chào' });
    const keys = calls.map((c) => c[2].idempotencyKey);
    const base = keys[0].replace(/-0$/, '');
    expect(keys).toEqual([`${base}-0`, `${base}-1`, `${base}-2`]);
    expect(screen.getByText(/resultSent/)).toHaveTextContent('"count":3');
  });

  it('101 người nhập tay -> chặn, nút gửi tắt, KHÔNG gọi API', async () => {
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    fireEvent.click(await screen.findByText('quickSendAdapter.modeManualTelegram'));
    const ids = Array.from({ length: 101 }, (_, i) => String(5000 + i)).join('\n');
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderTelegram'), { target: { value: ids } });
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });

    expect(screen.getByTestId('quick-send-adapter-over-limit')).toHaveTextContent('"max":100');
    const button = screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(campaignApiService.sendQuickAdapterMessage).not.toHaveBeenCalled();
  });

  it('đúng 100 người -> KHÔNG bị chặn', async () => {
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    fireEvent.click(await screen.findByText('quickSendAdapter.modeManualTelegram'));
    const ids = Array.from({ length: 100 }, (_, i) => String(5000 + i)).join('\n');
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderTelegram'), { target: { value: ids } });
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    expect(screen.queryByTestId('quick-send-adapter-over-limit')).toBeNull();
    expect(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ })).not.toBeDisabled();
  });

  it.each([['12;34'], ['abc']])('chat id "%s" -> liệt kê dòng sai, không cho gửi, không gọi API', async (bad) => {
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    fireEvent.click(await screen.findByText('quickSendAdapter.modeManualTelegram'));
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderTelegram'), {
      target: { value: `123456\n${bad}` },
    });
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    expect(screen.getByTestId('quick-send-adapter-invalid')).toHaveTextContent(bad);
    const button = screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(campaignApiService.sendQuickAdapterMessage).not.toHaveBeenCalled();
  });

  it('deferred inter_message_delay ngắn -> chờ đúng retryAfterMs rồi gửi lại CÙNG khoá', async () => {
    campaignApiService.sendQuickAdapterMessage
      .mockResolvedValueOnce(item({ recipientKey: '1001', status: 'deferred', reason: 'inter_message_delay', retryAfterMs: 3000, resumeAt: Date.now() + 3000 }))
      .mockImplementation((_c, payload) => Promise.resolve(ok(payload.recipientKey)));
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    fireEvent.click(await screen.findByText('quickSendAdapter.modeManualTelegram'));
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderTelegram'), { target: { value: '1001' } });
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    const calls = campaignApiService.sendQuickAdapterMessage.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][2].idempotencyKey).toBe(calls[0][2].idempotencyKey);
    expect(quickSendSleepWithCountdown.mock.calls[0][0]).toBe(3000);
    expect(screen.getByText(/resultSent/)).toHaveTextContent('"count":1');
  });

  it('deferred giờ nghỉ -> dừng ngay, người còn lại ở "chưa gửi", không thử thêm', async () => {
    campaignApiService.sendQuickAdapterMessage.mockResolvedValue(
      item({ recipientKey: '1001', status: 'deferred', reason: 'quiet_hours', retryAfterMs: 6 * 3600 * 1000, resumeAt: Date.now() + 6 * 3600 * 1000 })
    );
    const button = await renderTelegramWithAllSelected();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(campaignApiService.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/unsentCount/)).toHaveTextContent('"count":3');
    expect(screen.getByText(/deferredResumeNotice/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retryRemaining/ })).toBeInTheDocument();
  });

  it('failed auth ở người 2 -> dừng đợt, người 3 KHÔNG được gọi', async () => {
    campaignApiService.sendQuickAdapterMessage
      .mockResolvedValueOnce(ok('1001'))
      .mockResolvedValueOnce(item({ recipientKey: '1002', status: 'failed', errorCategory: 'auth', error: 'hết phiên' }));
    const button = await renderTelegramWithAllSelected();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(campaignApiService.sendQuickAdapterMessage).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/batchStopped/)).toBeInTheDocument();
    expect(screen.getByText(/unsentCount/)).toHaveTextContent('"count":1');
  });

  it('failed hard ở người 2 -> chỉ người đó lỗi, người 3 vẫn được gửi', async () => {
    campaignApiService.sendQuickAdapterMessage
      .mockResolvedValueOnce(ok('1001'))
      .mockResolvedValueOnce(item({ recipientKey: '1002', status: 'failed', errorCategory: 'hard', error: 'PEER_ID_INVALID' }))
      .mockResolvedValueOnce(ok('1003'));
    const button = await renderTelegramWithAllSelected();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(campaignApiService.sendQuickAdapterMessage).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/resultSent/)).toHaveTextContent('"count":2');
    expect(screen.getByText(/resultFailed/)).toHaveTextContent('"count":1');
  });

  it('HTTP 409 (kênh tắt/tài khoản chưa sẵn sàng) -> dừng đợt', async () => {
    campaignApiService.sendQuickAdapterMessage.mockRejectedValue({
      response: { status: 409, data: { code: 'TELEGRAM_ACCOUNT_NOT_READY', message: 'Chưa sẵn sàng' } },
    });
    const button = await renderTelegramWithAllSelected();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(campaignApiService.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/unsentCount/)).toHaveTextContent('"count":3');
  });

  it('không có tài khoản -> hướng dẫn kết nối, không có nút gửi hoạt động', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    expect(await screen.findByText(/noAccounts/)).toBeInTheDocument();
    expect(screen.getByText('quickSendAdapter.goConnect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ })).toBeDisabled();
  });

  it('PLAN_GIAO_TK_TG_WA H2: nhân viên 0 tài khoản được giao -> câu "chưa giao" (không phải "chưa kết nối")', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [] } });
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" isEmployeeContext />);
    expect(await screen.findByText(/quickSendAdapter\.noAccountsAssigned/)).toBeInTheDocument();
    expect(screen.queryByText(/quickSendAdapter\.noAccounts:/)).not.toBeInTheDocument();
  });
});

describe('QuickSendAdapterPanel — WhatsApp', () => {
  it('phiên offline bị khoá; gõ "0912 345 678" -> gửi với SĐT đã chuẩn hoá 84912345678 và tối đa 60/lần', async () => {
    render(<QuickSendAdapterPanel channel="whatsapp" channelLabel="WhatsApp" />);
    fireEvent.click(await screen.findByText('quickSendAdapter.modeManualWhatsApp'));
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).not.toBeDisabled();
    expect(radios[1]).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderWhatsApp'), { target: { value: '0912 345 678' } });
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));

    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    const [channel, payload] = campaignApiService.sendQuickAdapterMessage.mock.calls[0];
    expect(channel).toBe('whatsapp');
    expect(payload).toEqual({ sessionKey: '1-default', recipientKey: '84912345678', message: 'Chào' });
  });

  it('61 số -> chặn (trần WhatsApp 60/lần); giãn cách WA trong [8000, 20000]', async () => {
    render(<QuickSendAdapterPanel channel="whatsapp" channelLabel="WhatsApp" />);
    fireEvent.click(await screen.findByText('quickSendAdapter.modeManualWhatsApp'));
    const phones = Array.from({ length: 61 }, (_, i) => `8491234${String(1000 + i)}`).join('\n');
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderWhatsApp'), { target: { value: phones } });
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    expect(screen.getByTestId('quick-send-adapter-over-limit')).toHaveTextContent('"max":60');
    expect(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ })).toBeDisabled();

    // 2 số -> có đúng 1 lần chờ, trong khoảng WhatsApp.
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderWhatsApp'), { target: { value: '0912345678\n0913456789' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));
    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(quickSendSleepWithCountdown).toHaveBeenCalledTimes(1);
    const ms = quickSendSleepWithCountdown.mock.calls[0][0];
    expect(ms).toBeGreaterThanOrEqual(8000);
    expect(ms).toBeLessThanOrEqual(20000);
  });

  it('đổi kênh (key khác) không mang người nhận đã chọn sang kênh kia', async () => {
    const { rerender } = render(<QuickSendAdapterPanel key="telegram" channel="telegram" channelLabel="Telegram" />);
    fireEvent.click(await screen.findByText('quickSendAdapter.selectAll'));
    expect(screen.getByText(/selectedCount/)).toHaveTextContent('"count":3');

    campaignApiService.getQuickSendAdapterConversations.mockResolvedValue({ data: { data: [{ recipientKey: '84912345678', name: 'Lan' }] } });
    rerender(<QuickSendAdapterPanel key="whatsapp" channel="whatsapp" channelLabel="WhatsApp" />);
    expect(await screen.findByText(/selectedCount/)).toHaveTextContent('"count":0');
    expect(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ })).toBeDisabled();
  });
});

describe('QuickSendAdapterPanel — mẫu tin + đính kèm (P5)', () => {
  async function pickTemplate() {
    fireEvent.click(await screen.findByRole('button', { name: 'channelAttachments.templatePlaceholder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Báo giá' }));
    await waitFor(() => expect(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder')).toHaveValue('Chào {{ten}}, báo giá đây'));
  }

  async function fillManualRecipient() {
    fireEvent.click(await screen.findByText('quickSendAdapter.modeManualTelegram'));
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.manualPlaceholderTelegram'), { target: { value: '1001' } });
  }

  it('chọn mẫu -> điền nội dung + hiện tệp của mẫu; gửi kèm attachments (chỉ trường cần thiết)', async () => {
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    await fillManualRecipient();
    await pickTemplate();
    expect(screen.getByText('bg.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));
    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    const [channel, payload] = campaignApiService.sendQuickAdapterMessage.mock.calls[0];
    expect(channel).toBe('telegram');
    expect(payload).toEqual({
      accountId: '7',
      recipientKey: '1001',
      message: 'Chào {{ten}}, báo giá đây',
      attachments: [{ key: 'uploads/1/zalo-templates/bg.pdf', name: 'bg.pdf', size: 2048 }],
    });
  });

  it('không mẫu/không tệp -> payload KHÔNG có trường attachments (hợp đồng cũ)', async () => {
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    await fillManualRecipient();
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));
    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(campaignApiService.sendQuickAdapterMessage.mock.calls[0][1]).toEqual({
      accountId: '7', recipientKey: '1001', message: 'Chào',
    });
  });

  it('tải thêm tệp: đăng ký từng tệp qua /uploads/temp + quick-send/attachments rồi gửi kèm', async () => {
    api.post.mockResolvedValue({ data: { data: { tempId: 't1', originalName: 'a.jpg', contentType: 'image/jpeg', size: 10 } } });
    campaignApiService.uploadQuickSendAttachment.mockResolvedValue({
      data: { data: { key: 'uploads/1/quick-send/a.jpg', originalName: 'a.jpg', size: 10, contentType: 'image/jpeg' } },
    });
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    await fillManualRecipient();
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Ảnh đây' } });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('quick-send-adapter-file-input'), { target: { files: [file] } });
    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    expect(campaignApiService.uploadQuickSendAttachment).toHaveBeenCalledWith({
      tempId: 't1', originalName: 'a.jpg', contentType: 'image/jpeg', size: 10,
    });

    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));
    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(campaignApiService.sendQuickAdapterMessage.mock.calls[0][1].attachments).toEqual([
      { key: 'uploads/1/quick-send/a.jpg', originalName: 'a.jpg', size: 10 },
    ]);
  });

  it('vượt giới hạn 5 ảnh (tệp của mẫu) -> báo đỏ, nút gửi tắt, KHÔNG gọi API', async () => {
    zaloTemplateApiService.getTemplateById.mockResolvedValue({
      data: {
        data: {
          id: 5,
          bodyText: 'Nhiều ảnh',
          attachments: Array.from({ length: 6 }, (_, i) => ({ key: `uploads/1/z/a${i}.jpg`, name: `a${i}.jpg`, size: 10 })),
        },
      },
    });
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    await fillManualRecipient();
    fireEvent.click(await screen.findByRole('button', { name: 'channelAttachments.templatePlaceholder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Báo giá' }));
    expect(await screen.findByTestId('channel-attachment-problem')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(campaignApiService.sendQuickAdapterMessage).not.toHaveBeenCalled();
  });

  it('tệp sau tin đầu lỗi (partialError) -> vẫn tính đã gửi, kèm cảnh báo', async () => {
    campaignApiService.sendQuickAdapterMessage.mockResolvedValue(
      item({ recipientKey: '1001', status: 'success', partialError: 'IMAGE_PROCESS_FAILED' })
    );
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    await fillManualRecipient();
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ }));
    await waitFor(() => expect(screen.getByTestId('quick-send-adapter-done')).toBeInTheDocument());
    expect(screen.getByText(/resultSent/)).toHaveTextContent('"count":1');
    expect(screen.getByTestId('quick-send-adapter-partial')).toHaveTextContent('IMAGE_PROCESS_FAILED');
  });

  it('lỗi tải mẫu -> vẫn soạn tay và gửi được', async () => {
    zaloTemplateApiService.getTemplates.mockRejectedValue(new Error('down'));
    render(<QuickSendAdapterPanel channel="telegram" channelLabel="Telegram" />);
    await fillManualRecipient();
    expect(await screen.findByText('channelAttachments.templatesLoadFailed')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('quickSendAdapter.messagePlaceholder'), { target: { value: 'Chào' } });
    expect(screen.getByRole('button', { name: /quickSendAdapter\.sendButton/ })).not.toBeDisabled();
  });
});
