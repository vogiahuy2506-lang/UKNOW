/**
 * 04/10/2026 — Hộp "Zalo cá nhân" trong Studio:
 *  - S-12: 1 tài khoản Zalo = 1 chatbot. Tài khoản đang bật cho chatbot KHÁC hiện huy hiệu "Đang bật cho: <tên>" và
 *          không bật thêm được ở bot này; backend trả 409 (bản đã cũ trên màn) thì báo đúng câu và tải lại danh sách.
 *  - S-25: nút tải lại chỉ tải lại danh sách tài khoản, KHÔNG tải lại cả trang.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { ChannelModal } from '../ChannelModals';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    listZaloAccountsWithChatbotSettings: vi.fn(),
    toggleZaloAccountChatbot: vi.fn(),
  },
}));
vi.mock('../../../features/chatbot/components/WhatsAppChannelModal', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/TelegramChannelModal', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const BOT = { id: 12, name: 'Bot đang xem' };

const ACCOUNTS = [
  // Đang bật cho bot KHÁC, bot này chưa bật → khoá công tắc.
  { id: 1, display_name: 'Nick Shop A', zalo_phone: '0901 000 001', chatbot_enabled: null, other_chatbot_id: 11, other_chatbot_name: 'Bot Tư vấn' },
  // Tài khoản trống → bật được.
  { id: 2, display_name: 'Nick Shop B', zalo_phone: '0901 000 002', chatbot_enabled: false, other_chatbot_name: null },
  // Dữ liệu cũ trùng (cả hai bot cùng bật): vẫn TẮT được.
  { id: 3, display_name: 'Nick Shop C', zalo_phone: '0901 000 003', chatbot_enabled: true, other_chatbot_name: 'Bot Cũ' },
];

const switchOf = (name) => {
  const row = screen.getByText(name).closest('div.flex.items-center.gap-3');
  return row.querySelector('[role="switch"]');
};

describe('ChannelModals — Zalo cá nhân: 1 tài khoản = 1 chatbot (S-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.listZaloAccountsWithChatbotSettings.mockResolvedValue({ data: { data: ACCOUNTS } });
    chatbotApi.toggleZaloAccountChatbot.mockResolvedValue({ data: { success: true } });
  });

  it('tài khoản đang bật cho bot khác → huy hiệu "Đang bật cho: <tên>" và công tắc bị khoá; tài khoản trống bật được', async () => {
    render(<ChannelModal open channel="zalo_personal" chatbot={BOT} onClose={() => {}} />);

    expect(await screen.findByText('Đang bật cho: Bot Tư vấn')).toBeInTheDocument();
    expect(switchOf('Nick Shop A')).toBeDisabled();
    expect(switchOf('Nick Shop B')).not.toBeDisabled();

    fireEvent.click(switchOf('Nick Shop B'));
    await waitFor(() => expect(chatbotApi.toggleZaloAccountChatbot).toHaveBeenCalledWith(2, true, 12));
  });

  it('dòng cũ trùng (bot này đang bật + bot khác cũng bật) → có huy hiệu nhưng vẫn TẮT được', async () => {
    render(<ChannelModal open channel="zalo_personal" chatbot={BOT} onClose={() => {}} />);

    expect(await screen.findByText('Đang bật cho: Bot Cũ')).toBeInTheDocument();
    expect(switchOf('Nick Shop C')).not.toBeDisabled();

    fireEvent.click(switchOf('Nick Shop C'));
    await waitFor(() => expect(chatbotApi.toggleZaloAccountChatbot).toHaveBeenCalledWith(3, false, 12));
  });

  it('backend trả 409 (màn đã cũ) → toast đúng câu của máy chủ và tải lại danh sách', async () => {
    chatbotApi.toggleZaloAccountChatbot.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'ZALO_ACCOUNT_BOUND_TO_OTHER_CHATBOT', message: 'Tài khoản Zalo này đang bật cho chatbot "Bot Tư vấn".' },
      },
    });
    render(<ChannelModal open channel="zalo_personal" chatbot={BOT} onClose={() => {}} />);
    await screen.findByText('Nick Shop B');

    fireEvent.click(switchOf('Nick Shop B'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Tài khoản Zalo này đang bật cho chatbot "Bot Tư vấn".'));
    await waitFor(() => expect(chatbotApi.listZaloAccountsWithChatbotSettings).toHaveBeenCalledTimes(2));
  });
});

describe('ChannelModals — nút tải lại Zalo cá nhân (S-25)', () => {
  let errorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    chatbotApi.listZaloAccountsWithChatbotSettings.mockResolvedValue({ data: { data: ACCOUNTS } });
  });

  afterEach(() => errorSpy.mockRestore());

  it('bấm "Tải lại" → chỉ tải lại danh sách tài khoản, không gọi location.reload (jsdom sẽ báo "not implemented: navigation")', async () => {
    render(<ChannelModal open channel="zalo_personal" chatbot={BOT} onClose={() => {}} />);
    await screen.findByText('Nick Shop A');
    expect(chatbotApi.listZaloAccountsWithChatbotSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Tải lại'));

    await waitFor(() => expect(chatbotApi.listZaloAccountsWithChatbotSettings).toHaveBeenCalledTimes(2));
    const navigations = errorSpy.mock.calls.filter((args) => String(args[0]?.message || args[0]).includes('Not implemented'));
    expect(navigations).toEqual([]);
  });
});
