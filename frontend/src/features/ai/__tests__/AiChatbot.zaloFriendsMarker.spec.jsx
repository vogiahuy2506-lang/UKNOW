/**
 * Rà soát C P3-4 — chọn bạn bè Zalo: marker chỉ mang SỐ LƯỢNG, UID ghi lên server bằng PATCH wizard-state.
 *
 * Trước đây marker `[wizard]{"gate":"zaloFriends","friendIds":[…UID…]}` + câu "Tôi chọn N bạn bè: <≤5 tên>" nằm trong lịch sử chat nên mọi lượt sau
 * Gemini nhận nguyên danh sách. Phép thử đo trên CHÍNH lịch sử FE gửi cho `aiApi.chat`, và thứ tự: PATCH xong rồi mới gửi marker.
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
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn() } }));

const UIDS = ['100000000000001', '100000000000002'];
const NAMES = ['Nguyễn Văn Riêng Tư', 'Trần Thị Bí Mật'];

describe('AiChatbot — chọn bạn bè Zalo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    aiApi.patchWizardState.mockResolvedValue({ success: true });
    // Hình dạng THẬT của GET /ai/chatbot/zalo-personal/friends (chatbotApi.getZaloFriends): { data: { data: { items, total, page, totalPages } } }.
    api.get.mockResolvedValue({
      data: {
        data: {
          items: UIDS.map((id, index) => ({ friend_id: id, display_name: NAMES[index], phone: null })),
          total: 2,
          page: 1,
          totalPages: 1,
        },
      },
    });
    api.post.mockResolvedValue({ data: {} });
  });

  const openFriendPickerAndChoose = async () => {
    aiApi.chat.mockResolvedValueOnce({
      success: true,
      data: { type: 'zalo_friend_picker', content: 'Chọn bạn bè', data: { accountId: 5, maxRecipients: 1000 }, sessionId: 's1', sessionTitle: 'Zalo' },
    });
    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );
    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: 'Tạo chiến dịch Zalo gửi cho bạn bè' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    const first = await screen.findByText(NAMES[0]);
    fireEvent.click(first.closest('label').querySelector('input[type="checkbox"]'));
    fireEvent.click(screen.getByText(NAMES[1]).closest('label').querySelector('input[type="checkbox"]'));
  };

  it('bấm "Dùng N bạn bè": PATCH set_zalo_friends mang UID TRƯỚC, rồi marker chỉ có friendCount — lịch sử gửi chat KHÔNG chứa UID hay tên', async () => {
    await openFriendPickerAndChoose();
    aiApi.chat.mockResolvedValueOnce({ success: true, data: { type: 'text', content: 'ok', sessionId: 's1' } });

    fireEvent.click(screen.getByRole('button', { name: 'aiChatbot.wizardUseFriends' }));

    await waitFor(() => expect(aiApi.chat).toHaveBeenCalledTimes(2));
    expect(aiApi.patchWizardState).toHaveBeenCalledWith('s1', 'set_zalo_friends', { friendIds: UIDS });
    // Thứ tự: danh sách ghi lên server xong rồi mới gửi marker.
    expect(aiApi.patchWizardState.mock.invocationCallOrder[0]).toBeLessThan(aiApi.chat.mock.invocationCallOrder[1]);

    const sentHistory = aiApi.chat.mock.calls[1][0];
    const markerMessage = sentHistory.find((m) => String(m.content).includes('"gate":"zaloFriends"'));
    expect(markerMessage.content).toContain('"friendCount":2');
    const everythingSent = JSON.stringify(sentHistory);
    UIDS.forEach((uid) => expect(everythingSent).not.toContain(uid));
    NAMES.forEach((name) => expect(everythingSent).not.toContain(name));
  });

  it('PATCH lỗi → DỪNG: không gửi marker (không quay lại nhét UID vào lịch sử), người dùng được báo để thử lại', async () => {
    aiApi.patchWizardState.mockRejectedValue(new Error('network'));
    await openFriendPickerAndChoose();

    fireEvent.click(screen.getByRole('button', { name: 'aiChatbot.wizardUseFriends' }));

    await waitFor(() => expect(aiApi.patchWizardState).toHaveBeenCalled());
    // Chờ đủ lâu để một lượt chat (nếu code lỡ vẫn gửi marker sau khi PATCH lỗi) kịp xảy ra rồi mới khẳng định "không có".
    await new Promise((resolve) => { setTimeout(resolve, 80); });
    expect(aiApi.chat).toHaveBeenCalledTimes(1);
  });
});
