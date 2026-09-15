/**
 * ChatbotConfigModal: lưu chatbot thất bại phải báo lỗi và giữ modal mở.
 *
 * Bản trước (76aa2be4, thời chatbot còn lưu localStorage) nuốt lỗi API: cập nhật UI bằng dữ liệu
 * form rồi báo "Đã lưu cấu hình" và đóng modal. Mọi lỗi 400 của PUT /custom-chatbots/:id
 * (active_hours, reply_limit_config, response_style...) bị che — phát hiện 15/09 khi review khung giờ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import ChatbotConfigModal from '../ChatbotConfigModal';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    updateChatbot: vi.fn(),
    updateChatbotSettings: vi.fn(),
    listCustomChatDocuments: vi.fn(),
  },
}));
vi.mock('../../../features/auth/services/authApi.service', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock('../KnowledgeTab', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/ChatbotReplyLimitsCard', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/ChatbotActiveHoursCard', () => ({ default: () => null }));
vi.mock('../../../features/billing/AiHandoffAutoResumeCard', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/AvatarUploader', () => ({ default: () => null }));

const chatbot = { id: 7, name: 'Bot thử', widget_key: 'wk_7', suggested_questions: [] };

describe('ChatbotConfigModal — lưu thất bại', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.listCustomChatDocuments.mockResolvedValue({ success: true, data: [] });
    chatbotApi.updateChatbotSettings.mockResolvedValue({ success: true });
  });

  it('API trả 400 → toast lỗi đúng câu backend, không báo thành công, không đóng, không onUpdate', async () => {
    chatbotApi.updateChatbot.mockRejectedValue({
      response: { data: { message: 'Khung giờ không hợp lệ', code: 'CHATBOT_ACTIVE_HOURS_INVALID' } },
    });
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    render(<ChatbotConfigModal open chatbot={chatbot} onClose={onClose} onUpdate={onUpdate} />);

    fireEvent.click(await screen.findByRole('button', { name: /Lưu cấu hình/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Khung giờ không hợp lệ'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(chatbotApi.updateChatbotSettings).not.toHaveBeenCalled();
  });

  it('API thành công → onUpdate dữ liệu server, báo thành công, đóng modal', async () => {
    chatbotApi.updateChatbot.mockResolvedValue({ success: true, data: { id: 7, name: 'Bot thử' } });
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    render(<ChatbotConfigModal open chatbot={chatbot} onClose={onClose} onUpdate={onUpdate} />);

    fireEvent.click(await screen.findByRole('button', { name: /Lưu cấu hình/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
