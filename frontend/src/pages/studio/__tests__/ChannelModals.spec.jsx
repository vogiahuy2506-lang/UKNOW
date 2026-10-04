/**
 * 04/10/2026 (S-04) — Facebook và Zalo OA đã GỠ khỏi Studio:
 *  - Facebook: sếp chốt không làm kết nối Facebook (21/09/2026); nút "Kết nối tài khoản Facebook" luôn báo
 *    "Facebook App chưa được cấu hình".
 *  - Zalo OA: `chatbot_channel_connections` 0 dòng — chưa từng có một lần nối nào; trang Kênh tự ghi "chưa khả dụng";
 *    nút "Test webhook" gọi endpoint không tồn tại nên luôn báo "Test thất bại".
 * Bản spec cũ (9 ca) kiểm hai form này; nay chỉ giữ ca bảo đảm hộp không còn vẽ gì và không gọi API cho hai kênh đó.
 * Hộp Zalo cá nhân có spec riêng: ChannelModals.zaloPersonal.spec.jsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ChannelModal } from '../ChannelModals';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getFacebookPageConfig: vi.fn(),
    getFacebookPagesForChatbot: vi.fn(),
    getZaloOaConfig: vi.fn(),
    listZaloAccountsWithChatbotSettings: vi.fn(),
  },
}));
vi.mock('../../../features/chatbot/components/WhatsAppChannelModal', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/TelegramChannelModal', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const chatbot = { id: 7, name: 'Chatbot Kiểm Thử' };

describe('ChannelModal — kênh đã gỡ khỏi Studio (S-04)', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['facebook', 'zalo'])('channel="%s" → không vẽ hộp nào và không gọi API cấu hình kênh đó', (channel) => {
    const { container } = render(<ChannelModal open channel={channel} chatbot={chatbot} onClose={() => {}} />);

    expect(container.firstChild).toBeNull();
    expect(chatbotApi.getFacebookPageConfig).not.toHaveBeenCalled();
    expect(chatbotApi.getFacebookPagesForChatbot).not.toHaveBeenCalled();
    expect(chatbotApi.getZaloOaConfig).not.toHaveBeenCalled();
  });

  it('không còn chữ "Test webhook" / "Kết nối tài khoản Facebook" ở hộp kênh nào còn lại (Zalo cá nhân)', () => {
    chatbotApi.listZaloAccountsWithChatbotSettings.mockResolvedValue({ data: { data: [] } });
    const { container } = render(<ChannelModal open channel="zalo_personal" chatbot={chatbot} onClose={() => {}} />);

    expect(container.textContent).not.toMatch(/Test webhook|Kết nối tài khoản Facebook|Zalo OA/);
  });
});
