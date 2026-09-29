/**
 * Tuỳ chỉnh Giao diện Widget chạy thật (PLAN_TUY_CHINH_WIDGET_THAT_2026-09-29):
 * 3 khoá lưu vào custom_chatbots (widget_auto_open, embed_show_header, embed_size);
 * hai toggle vô ích (Câu hỏi gợi ý, Yêu cầu nhập tên) và các khoá cũ không còn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WidgetSettingsModal from '../WidgetSettingsModal';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { updateChatbot: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const chatbot = {
  id: 7,
  name: 'Bot',
  widget_key: 'wk',
  avatar_url: null,
  primary_color: '#ee7518',
  background_color: '#ffffff',
  text_color: '#1f2937',
  accent_color: '#f19342',
  position: 'bottom-right',
  show_avatar: true,
  border_radius: 16,
  launcher_label: null,
  widget_auto_open: false,
  embed_show_header: true,
  embed_size: 'medium',
};

// <p>label</p> nằm trong <div> cạnh Toggle; Toggle là sibling của <div> đó.
const toggleOf = (label) =>
  screen.getByText(label).parentElement.parentElement.querySelector('[role="switch"]');

function renderModal(bot, kind) {
  return render(
    <WidgetSettingsModal open chatbot={bot} embedKind={kind} onClose={() => {}} onUpdate={() => {}} />
  );
}

describe('WidgetSettingsModal — tuỳ chỉnh chạy thật', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.updateChatbot.mockResolvedValue({ success: true, data: chatbot });
  });

  it('bật Tự động mở chat + chọn Lớn + tắt header → payload có 3 khoá mới, không còn khoá cũ', async () => {
    renderModal(chatbot, 'script');
    fireEvent.click(toggleOf('Tự động mở chat'));
    fireEvent.click(screen.getByRole('button', { name: /iFrame/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Lớn/ }));
    fireEvent.click(toggleOf('Hiển thị header'));
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/ }));

    await waitFor(() => expect(chatbotApi.updateChatbot).toHaveBeenCalledTimes(1));
    const payload = chatbotApi.updateChatbot.mock.calls[0][1];
    expect(payload.widget_auto_open).toBe(true);
    expect(payload.embed_show_header).toBe(false);
    expect(payload.embed_size).toBe('large');
    for (const k of ['show_suggested', 'require_name', 'size', 'show_header', 'auto_open']) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it('mở lại với giá trị đã lưu → toggle và kích thước đúng', () => {
    renderModal({ ...chatbot, widget_auto_open: true, embed_show_header: false, embed_size: 'small' }, 'script');
    expect(toggleOf('Tự động mở chat').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /iFrame/ }));
    expect(toggleOf('Hiển thị header').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: /^Nhỏ/ }).className).toContain('border-primary-500');
    expect(screen.getByRole('button', { name: /^Lớn/ }).className).not.toContain('border-primary-500');
  });

  it('không còn toggle Câu hỏi gợi ý / Yêu cầu nhập tên ở Public Link; chân hộp không nói "riêng cho dạng"', () => {
    renderModal(chatbot, 'public_link');
    expect(screen.queryByText('Câu hỏi gợi ý')).toBeNull();
    expect(screen.queryByText('Yêu cầu nhập tên')).toBeNull();
    expect(screen.queryByText(/áp dụng riêng/)).toBeNull();
    expect(screen.getByText(/áp dụng cho cả 3 dạng nhúng/)).toBeInTheDocument();
  });
});
