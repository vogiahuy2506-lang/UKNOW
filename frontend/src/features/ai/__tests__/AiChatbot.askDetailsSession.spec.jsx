/**
 * Rà soát C P2-4 — thẻ `ask_campaign_details` KHÔNG qua cổng wizard (model tự hỏi) phải trả lời trong PHIÊN ĐANG MỞ.
 *
 * Trước đây `handleCampaignDetailsSubmit` gọi `aiApi.chat(history, files, null, locale)` — `sessionId = null` làm server
 * tạo một phiên MỚI mỗi lần bấm "tạo", nên thẻ xác nhận nằm ở phiên khác với cuộc trò chuyện đang xem (phiên mồ côi).
 * Hai nhánh cũ `ask_campaign_type` / `ask_audience` (không còn trong prompt, server không bao giờ trả) cũng gọi với `null`
 * kèm câu hội thoại bịa — đã xoá; ca cuối khoá việc thẻ cũ không còn được dựng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';

vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, role: 'user' },
    isAuthenticated: true,
    fetchAiCredits: vi.fn().mockResolvedValue(undefined),
    refreshAiCredits: vi.fn().mockResolvedValue(undefined),
    billingStatus: 'active',
    aiCredits: 100,
    addons: null,
    activeContext: null,
  }),
}));
vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null, refreshQuota: vi.fn() }),
}));
vi.mock('../../settings/services/zaloSettingsApi.service', () => ({
  default: { getChannels: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../../services/help.service', () => ({
  getHelpArticle: vi.fn().mockResolvedValue(null),
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

// Câu hỏi KHÔNG có wizardGate (model tự hỏi) — đúng ca đi vào nhánh chữ thường của handleCampaignDetailsSubmit.
const FREE_FORM_CARD = {
  channel: 'zalo',
  questions: [{
    id: 'sendStyle',
    label: 'Bạn muốn gửi thế nào?',
    options: [{ value: 'once', label: 'Gửi một lần' }],
  }],
};

describe('AiChatbot — thẻ ask_campaign_details tự do trả lời trong phiên đang mở (C P2-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  const sendMessage = async (text) => {
    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );
    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: text } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
  };

  it('bấm trả lời thẻ → lượt chat thứ hai mang ĐÚNG sessionId của phiên đã mở, không phải null', async () => {
    aiApi.chat.mockResolvedValueOnce({
      success: true,
      data: { type: 'ask_campaign_details', content: 'Chọn cách gửi', data: FREE_FORM_CARD, sessionId: 's1', sessionTitle: 'Zalo' },
    });
    aiApi.chat.mockResolvedValueOnce({
      success: true,
      data: { type: 'text', content: 'Đã rõ', sessionId: 's1' },
    });

    await sendMessage('Tạo chiến dịch gửi cho học viên cũ');

    fireEvent.click(await screen.findByText('Gửi một lần'));
    fireEvent.click(await screen.findByRole('button', { name: /createCampaignWithOptions/ }));

    await waitFor(() => expect(aiApi.chat).toHaveBeenCalledTimes(2));
    const [, , sessionIdOfSecondCall] = aiApi.chat.mock.calls[1];
    expect(sessionIdOfSecondCall).toBe('s1');
  });

  it('server (cũ) trả ask_campaign_type / ask_audience → KHÔNG dựng lại thẻ chọn kênh / đối tượng đã xoá', async () => {
    aiApi.chat.mockResolvedValueOnce({
      success: true,
      data: {
        type: 'ask_campaign_type',
        content: 'Bạn muốn gửi qua kênh nào?',
        data: { campaignOptions: [{ value: 'email', label: 'Email', description: 'Gửi email' }] },
        sessionId: 's2',
        sessionTitle: 'Cũ',
      },
    });

    await sendMessage('Tạo chiến dịch email');

    await waitFor(() => expect(aiApi.chat).toHaveBeenCalledTimes(1));
    // Thẻ cũ có tiêu đề aiChatbot.selectCampaignChannel + câu hỏi aiChatbot.whichChannel — cả hai không được xuất hiện.
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(screen.queryByText('aiChatbot.selectCampaignChannel')).not.toBeInTheDocument();
    expect(screen.queryByText('aiChatbot.whichChannel')).not.toBeInTheDocument();
  });
});
