/**
 * temperature = 0 (số) không được bị đổi thành 0.7 khi mở hộp Cấu hình rồi Lưu.
 * pg trả DECIMAL dạng chuỗi "0.00" cũng phải giữ nguyên.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatbotConfigModal from '../ChatbotConfigModal';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { updateChatbot: vi.fn(), updateChatbotSettings: vi.fn(), listCustomChatDocuments: vi.fn() },
}));
vi.mock('../../../features/auth/services/authApi.service', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);
vi.mock('../KnowledgeTab', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/ChatbotReplyLimitsCard', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/ChatbotActiveHoursCard', () => ({ default: () => null }));
vi.mock('../../../features/billing/AiHandoffAutoResumeCard', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/AvatarUploader', () => ({ default: () => null }));

describe('ChatbotConfigModal — temperature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.listCustomChatDocuments.mockResolvedValue({ success: true, data: [] });
    chatbotApi.updateChatbotSettings.mockResolvedValue({ success: true });
    chatbotApi.updateChatbot.mockResolvedValue({ success: true, data: { id: 7 } });
  });

  const saveWith = async (temperature) => {
    const chatbot = { id: 7, name: 'Bot', widget_key: 'wk_7', suggested_questions: [], temperature };
    render(<ChatbotConfigModal open chatbot={chatbot} onClose={() => {}} onUpdate={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lưu cấu hình/ }));
    await waitFor(() => expect(chatbotApi.updateChatbot).toHaveBeenCalledTimes(1));
    return chatbotApi.updateChatbot.mock.calls[0][1];
  };

  it('temperature số 0 -> giữ 0', async () => {
    expect((await saveWith(0)).temperature).toBe(0);
  });

  it('temperature chuỗi "0.00" -> giữ nguyên, không thành 0.7', async () => {
    expect(Number((await saveWith('0.00')).temperature)).toBe(0);
  });

  it('thiếu temperature (null) -> mặc định 0.7', async () => {
    expect((await saveWith(null)).temperature).toBe(0.7);
  });
});
