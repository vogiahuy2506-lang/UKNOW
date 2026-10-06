/**
 * 05/10/2026 — Hộp thoại Facebook Messenger trong Studio (khôi phục sau 21/09/2026).
 *
 * Bảo vệ 3 hành vi quan trọng nhất:
 *  1. Rỗng → mời sang Cài đặt → Kênh (đừng bắt user dán page_id/token tay như bản cũ).
 *  2. Bấm "Bật" → POST `connectChatbotFacebook` với `channel_connection_id` (token lấy ở server, không
 *     bao giờ gửi credentials xuống client).
 *  3. Sau khi bật → hiện webhook_url + verify_token để dán vào Meta App Dashboard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FacebookChannelModal from '../FacebookChannelModal';
import chatbotApi from '../../services/chatbotApi.service';

vi.mock('../../services/chatbotApi.service', () => ({
  default: {
    getFacebookPagesForChatbot: vi.fn(),
    connectChatbotFacebook: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
// Dùng chung bộ dịch thật (vi.js) với các spec khác của Studio: khoá i18n thiếu sẽ làm spec đỏ ngay.
vi.mock('../../../../i18n', async () => (await import('../../../../pages/studio/__tests__/studioTestI18n.js')).i18nMock);

const webhookUrl = 'https://founderai.biz/api/webhooks/chatbot/facebook/tok_abc123';
const verifyToken = 'verify_xyz';

const pageOff = {
  id: 11,
  fb_page_id: '100200300',
  fb_page_name: 'Fanpage Chính',
  has_credentials: true,
  is_active_on_this_chatbot: false,
};

const pageOn = {
  id: 12,
  fb_page_id: '100200400',
  fb_page_name: 'Fanpage Đang Bật',
  has_credentials: true,
  is_active_on_this_chatbot: true,
};

describe('FacebookChannelModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.getFacebookPagesForChatbot.mockResolvedValue({ data: { data: [pageOff, pageOn] } });
  });

  it('rỗng → mời sang Cài đặt → Kênh, không hỏi page_id/token', async () => {
    chatbotApi.getFacebookPagesForChatbot.mockResolvedValue({ data: { data: [] } });
    render(<FacebookChannelModal open onClose={() => {}} chatbotId={7} />);

    expect(await screen.findByText('Chưa có Fanpage nào được ủy quyền')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Quản lý kênh gửi/ })).toBeTruthy();
  });

  it('bấm "Bật" → gọi connectChatbotFacebook với channel_connection_id rồi hiện webhook + verify token', async () => {
    chatbotApi.connectChatbotFacebook.mockResolvedValue({
      success: true,
      data: { id: 5, webhook_url: webhookUrl, verify_token: verifyToken },
    });

    render(<FacebookChannelModal open onClose={() => {}} chatbotId={7} />);

    const buttons = await screen.findAllByRole('button', { name: 'Bật' });
    expect(buttons).toHaveLength(1); // pageOn đang bật → chỉ pageOff có nút "Bật"
    await userEvent.click(buttons[0]);

    await waitFor(() => {
      expect(chatbotApi.connectChatbotFacebook).toHaveBeenCalledWith(7, { channel_connection_id: 11 });
    });
    expect(await screen.findByText(webhookUrl)).toBeTruthy();
    expect(await screen.findByText(verifyToken)).toBeTruthy();
  });

  it('Fanpage đang bật → hiện huy hiệu "Đang bật", không có nút bật lại', async () => {
    render(<FacebookChannelModal open onClose={() => {}} chatbotId={7} />);

    expect(await screen.findByText('Đang bật')).toBeTruthy();
    expect(screen.getByText('Fanpage Đang Bật')).toBeTruthy();
  });

  it('Fanpage thiếu token → nút bị khoá, ghi "Thiếu token"', async () => {
    chatbotApi.getFacebookPagesForChatbot.mockResolvedValue({
      data: { data: [{ ...pageOff, has_credentials: false }] },
    });
    render(<FacebookChannelModal open onClose={() => {}} chatbotId={7} />);

    const btn = await screen.findByRole('button', { name: 'Thiếu token' });
    expect(btn).toBeDisabled();
  });

  it('open=false → không vẽ gì', () => {
    const { container } = render(<FacebookChannelModal open={false} onClose={() => {}} chatbotId={7} />);
    expect(container.firstChild).toBeNull();
  });
});
