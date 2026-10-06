/**
 * 05/10/2026 — Facebook Messenger được KHÔI PHỤC trong Studio (trước đó gỡ 21/09/2026 vì chưa có
 * FACEBOOK_APP_ID/SECRET nên nút OAuth luôn báo "Facebook App chưa được cấu hình").
 *
 * Ca còn giữ từ bản S-04: Zalo OA vẫn gỡ (chưa từng có một lần nối nào) → hộp rỗng, không gọi API.
 * Hộp Zalo cá nhân có spec riêng: ChannelModals.zaloPersonal.spec.jsx.
 * Hộp Facebook có spec riêng: FacebookChannelModal.spec.jsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ChannelModal } from '../ChannelModals';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getFacebookPageConfig: vi.fn(),
    getFacebookPagesForChatbot: vi.fn(),
    connectChatbotFacebook: vi.fn(),
    getZaloOaConfig: vi.fn(),
    listZaloAccountsWithChatbotSettings: vi.fn(),
  },
}));
vi.mock('../../../features/chatbot/components/WhatsAppChannelModal', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/TelegramChannelModal', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/FacebookChannelModal', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const chatbot = { id: 7, name: 'Chatbot Kiểm Thử' };

describe('ChannelModal — Zalo OA vẫn gỡ khỏi Studio (S-04)', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['zalo_oa', 'zalo'])('channel="%s" → không vẽ hộp nào và không gọi API cấu hình kênh đó', (channel) => {
    const { container } = render(<ChannelModal open channel={channel} chatbot={chatbot} onClose={() => {}} />);

    expect(container.firstChild).toBeNull();
    expect(chatbotApi.getZaloOaConfig).not.toHaveBeenCalled();
  });

  it('không còn chữ "Test webhook" / "Kết nối tài khoản Facebook" ở hộp kênh nào còn lại (Zalo cá nhân)', () => {
    chatbotApi.listZaloAccountsWithChatbotSettings.mockResolvedValue({ data: { data: [] } });
    const { container } = render(<ChannelModal open channel="zalo_personal" chatbot={chatbot} onClose={() => {}} />);

    expect(container.textContent).not.toMatch(/Test webhook|Kết nối tài khoản Facebook|Zalo OA/);
  });
});
