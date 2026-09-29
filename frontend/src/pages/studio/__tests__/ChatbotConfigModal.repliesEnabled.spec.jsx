/**
 * ChatbotConfigModal: công tắc "Trạng thái hoạt động" ghi custom_chatbots.replies_enabled của TỪNG chatbot
 * (PLAN_CONG_TAC_TRANG_THAI_CHATBOT_2026-09-29 PR-2). Không gửi is_active (cờ xoá mềm) và không ghi
 * is_enabled vào chatbot_settings (bảng theo tài khoản, không theo chatbot).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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


const baseBot = { id: 7, name: 'Bot thử', widget_key: 'wk_7', suggested_questions: [] };

function statusSwitch() {
  const row = screen.getByText('Trạng thái hoạt động').closest('div.flex');
  return within(row).getByRole('switch');
}

describe('ChatbotConfigModal — công tắc trả lời', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.listCustomChatDocuments.mockResolvedValue({ success: true, data: [] });
    chatbotApi.updateChatbotSettings.mockResolvedValue({ success: true });
    chatbotApi.updateChatbot.mockResolvedValue({ success: true, data: { id: 7, name: 'Bot thử', replies_enabled: false } });
  });

  it('tắt công tắc + Lưu → updateChatbot nhận replies_enabled:false, không is_active; cài đặt kênh KHÔNG có is_enabled', async () => {
    render(<ChatbotConfigModal open chatbot={baseBot} onClose={vi.fn()} onUpdate={vi.fn()} />);
    const sw = statusSwitch();
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(statusSwitch()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(await screen.findByRole('button', { name: /Lưu cấu hình/ }));

    await waitFor(() => expect(chatbotApi.updateChatbot).toHaveBeenCalled());
    const payload = chatbotApi.updateChatbot.mock.calls[0][1];
    expect(payload.replies_enabled).toBe(false);
    expect('is_active' in payload).toBe(false);

    await waitFor(() => expect(chatbotApi.updateChatbotSettings).toHaveBeenCalled());
    for (const call of chatbotApi.updateChatbotSettings.mock.calls) {
      expect('is_enabled' in call[1]).toBe(false);
    }
  });

  it('mở lại với replies_enabled:false → công tắc tắt; thiếu trường → bật', async () => {
    const { unmount } = render(
      <ChatbotConfigModal open chatbot={{ ...baseBot, replies_enabled: false }} onClose={vi.fn()} onUpdate={vi.fn()} />
    );
    await waitFor(() => expect(statusSwitch()).toHaveAttribute('aria-checked', 'false'));
    unmount();
    render(<ChatbotConfigModal open chatbot={baseBot} onClose={vi.fn()} onUpdate={vi.fn()} />);
    await waitFor(() => expect(statusSwitch()).toHaveAttribute('aria-checked', 'true'));
  });
});
