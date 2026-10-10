/**
 * M3-1 (đợt 2) — hộp Telegram / WhatsApp: 1 tài khoản = 1 chatbot (như Zalo S-12).
 * Backend trả other_chatbot_name khi chatbot KHÁC đang bật → huy hiệu "Đang bật cho: <tên>" và khoá công tắc;
 * 409 (màn đã cũ) → toast câu của máy chủ và tải lại danh sách.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import TelegramChannelModal from '../TelegramChannelModal';
import WhatsAppChannelModal from '../WhatsAppChannelModal';
import chatbotApi from '../../services/chatbotApi.service';

vi.mock('../../services/chatbotApi.service', () => ({
  default: {
    listTelegramAccountsWithChatbotSettings: vi.fn(),
    toggleTelegramAccountChatbot: vi.fn(),
    listWhatsAppAccountsWithChatbotSettings: vi.fn(),
    toggleWhatsAppAccountChatbot: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../i18n', async () => (await import('../../../../pages/studio/__tests__/studioTestI18n.js')).i18nMock);

const switchOf = (name) => screen.getByText(name).closest('div.flex.items-center.gap-3').querySelector('[role="switch"]');

describe('TelegramChannelModal — 1 tài khoản = 1 chatbot', () => {
  const rows = [
    { id: 1, username: 'shopa', is_active: true, is_loaded: true, chatbot_enabled: null, other_chatbot_id: 11, other_chatbot_name: 'Bot Tư vấn' },
    { id: 2, username: 'shopb', is_active: true, is_loaded: true, chatbot_enabled: false, other_chatbot_name: null },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.listTelegramAccountsWithChatbotSettings.mockResolvedValue({ data: { data: rows } });
    chatbotApi.toggleTelegramAccountChatbot.mockResolvedValue({ data: { success: true } });
  });

  it('huy hiệu "Đang bật cho: <tên>" + khoá công tắc tài khoản bị bot khác giữ; tài khoản trống bật được', async () => {
    render(<TelegramChannelModal open onClose={() => {}} chatbotId={12} />);
    expect(await screen.findByText('Đang bật cho: Bot Tư vấn')).toBeInTheDocument();
    expect(switchOf('shopa')).toBeDisabled();
    expect(switchOf('shopb')).not.toBeDisabled();
    fireEvent.click(switchOf('shopb'));
    await waitFor(() => expect(chatbotApi.toggleTelegramAccountChatbot).toHaveBeenCalledWith(2, true, 12));
  });

  it('409 -> toast câu máy chủ và tải lại danh sách', async () => {
    chatbotApi.toggleTelegramAccountChatbot.mockRejectedValue({ response: { status: 409, data: { message: 'Đang bật cho Bot X' } } });
    render(<TelegramChannelModal open onClose={() => {}} chatbotId={12} />);
    await screen.findByText('shopb');
    fireEvent.click(switchOf('shopb'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Đang bật cho Bot X'));
    await waitFor(() => expect(chatbotApi.listTelegramAccountsWithChatbotSettings).toHaveBeenCalledTimes(2));
  });
});

describe('WhatsAppChannelModal — 1 tài khoản = 1 chatbot', () => {
  const rows = [
    { id: '5-shop', provider: 'baileys', display_name: 'Shop A', is_active: true, chatbot_enabled: false, other_chatbot_name: 'Bot Tư vấn' },
    { id: '5-kho', provider: 'baileys', display_name: 'Kho B', is_active: true, chatbot_enabled: false, other_chatbot_name: null },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.listWhatsAppAccountsWithChatbotSettings.mockResolvedValue({ data: { data: rows } });
    chatbotApi.toggleWhatsAppAccountChatbot.mockResolvedValue({ data: { success: true } });
  });

  it('huy hiệu + khoá công tắc tài khoản bị bot khác giữ; tài khoản trống bật được', async () => {
    render(<WhatsAppChannelModal open onClose={() => {}} chatbotId={12} />);
    expect(await screen.findByText('Đang bật cho: Bot Tư vấn')).toBeInTheDocument();
    expect(switchOf('Shop A')).toBeDisabled();
    expect(switchOf('Kho B')).not.toBeDisabled();
  });

  it('409 -> toast câu máy chủ và tải lại danh sách', async () => {
    chatbotApi.toggleWhatsAppAccountChatbot.mockRejectedValue({ response: { status: 409, data: { message: 'Đang bật cho Bot X' } } });
    render(<WhatsAppChannelModal open onClose={() => {}} chatbotId={12} />);
    await screen.findByText('Kho B');
    fireEvent.click(switchOf('Kho B'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Đang bật cho Bot X'));
    await waitFor(() => expect(chatbotApi.listWhatsAppAccountsWithChatbotSettings).toHaveBeenCalledTimes(2));
  });
});
