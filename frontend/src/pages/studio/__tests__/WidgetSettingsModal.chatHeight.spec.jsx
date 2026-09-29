/**
 * Hộp Giao diện Widget không có ô chiều cao -> KHÔNG được gửi chat_height
 * (backend COALESCE giữ giá trị cũ; gửi cứng '600px' ghi đè chiều cao chatbot khác).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WidgetSettingsModal from '../WidgetSettingsModal';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({ default: { updateChatbot: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const chatbot = { id: 42, name: 'Bot', widget_key: 'wk', chat_height: '800px' };

describe('WidgetSettingsModal — chat_height', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.updateChatbot.mockResolvedValue({ success: true, data: chatbot });
  });

  it('Lưu -> payload không có khoá chat_height', async () => {
    render(<WidgetSettingsModal open chatbot={chatbot} embedKind="script" onClose={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByText('Lưu cấu hình'));
    await waitFor(() => expect(chatbotApi.updateChatbot).toHaveBeenCalledTimes(1));
    const [, payload] = chatbotApi.updateChatbot.mock.calls[0];
    expect(Object.prototype.hasOwnProperty.call(payload, 'chat_height')).toBe(false);
  });
});
