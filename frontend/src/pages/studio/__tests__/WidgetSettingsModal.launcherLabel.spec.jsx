/**
 * Nhãn nút mở chat (launcher_label) trên WidgetSettingsModal.
 *
 * Bối cảnh: ô nhập này từng bị ẩn bằng `{false && (...)}` vì không có cột DB tương ứng
 * (trường chết). Sau khi mở lại cột `custom_chatbots.launcher_label`, hai điều PHẢI đúng:
 *   1. Ô nhập phải thực sự hiện ra (không còn bị `{false && (...)}` chặn).
 *   2. State KHÔNG được điền sẵn 'Chat với chúng tôi' — nếu điền sẵn, lần lưu cấu hình
 *      bất kỳ (kể cả chỉ đổi màu) sẽ tự ghi nhãn vào DB và tự bật nhãn trên site khách
 *      mà không ai yêu cầu (xem quyết định 2.1 trong plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WidgetSettingsModal from '../WidgetSettingsModal';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    updateChatbot: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const baseChatbot = {
  id: 42,
  name: 'Test Bot',
  widget_key: 'wk_test',
  avatar_url: null,
  primary_color: '#ee7518',
  background_color: '#ffffff',
  text_color: '#1f2937',
  accent_color: '#f19342',
  position: 'bottom-right',
  show_avatar: true,
  border_radius: 16,
  // Chatbot CHƯA từng cấu hình nhãn — DB trả NULL cho cột này.
  launcher_label: null,
};

describe('WidgetSettingsModal — nhãn nút mở chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.updateChatbot.mockResolvedValue({
      success: true,
      data: { ...baseChatbot, launcher_label: '' },
    });
  });

  it('hiện ô nhập "Nhãn nút mở chat" (không còn bị ẩn bởi trường chết)', () => {
    render(
      <WidgetSettingsModal
        open
        chatbot={baseChatbot}
        embedKind="script"
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    expect(screen.getByText('Nhãn nút mở chat')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Chat với chúng tôi');
    expect(input).toBeInTheDocument();
    // Placeholder khác value: chatbot chưa có nhãn thì Ô PHẢI RỖNG, không phải đã điền sẵn.
    expect(input.value).toBe('');
  });

  it('chatbot chưa có nhãn → payload lưu gửi launcher_label rỗng, không phải giá trị mặc định cũ', async () => {
    render(
      <WidgetSettingsModal
        open
        chatbot={baseChatbot}
        embedKind="script"
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Lưu cấu hình'));

    await waitFor(() => {
      expect(chatbotApi.updateChatbot).toHaveBeenCalledTimes(1);
    });

    const [, payload] = chatbotApi.updateChatbot.mock.calls[0];
    expect(payload.launcher_label).toBe('');
    expect(payload.launcher_label).not.toBe('Chat với chúng tôi');
  });

  it('nhập nhãn rồi lưu → payload mang đúng nội dung đã nhập', async () => {
    render(
      <WidgetSettingsModal
        open
        chatbot={baseChatbot}
        embedKind="script"
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    const input = screen.getByPlaceholderText('Chat với chúng tôi');
    fireEvent.change(input, { target: { value: 'Tư vấn ngay' } });
    fireEvent.click(screen.getByText('Lưu cấu hình'));

    await waitFor(() => {
      expect(chatbotApi.updateChatbot).toHaveBeenCalledTimes(1);
    });

    const [, payload] = chatbotApi.updateChatbot.mock.calls[0];
    expect(payload.launcher_label).toBe('Tư vấn ngay');
  });

  it('bấm nút áp dụng nhanh "+ Bấm để áp dụng "Chat với chúng tôi"" → ô tự điền và badge đổi sang "Đang bật"', async () => {
    render(
      <WidgetSettingsModal
        open
        chatbot={baseChatbot}
        embedKind="script"
        onClose={() => {}}
        onUpdate={() => {}}
      />
    );

    expect(screen.getByText('Chưa đặt nhãn (chỉ hiện nút tròn)')).toBeInTheDocument();
    const quickBtn = screen.getByText('+ Bấm để áp dụng "Chat với chúng tôi"');
    fireEvent.click(quickBtn);

    const input = screen.getByPlaceholderText('Chat với chúng tôi');
    expect(input.value).toBe('Chat với chúng tôi');
    expect(screen.getByText('Đang bật')).toBeInTheDocument();

    // Bấm xoá nhãn
    const clearBtn = screen.getByText('Xoá nhãn (tắt)');
    fireEvent.click(clearBtn);
    expect(input.value).toBe('');
    expect(screen.getByText('Chưa đặt nhãn (chỉ hiện nút tròn)')).toBeInTheDocument();
  });
});
