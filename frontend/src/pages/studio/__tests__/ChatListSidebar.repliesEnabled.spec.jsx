import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ChatListSidebar from '../ChatListSidebar';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { listChatbots: vi.fn(), createChatbot: vi.fn(), deleteChatbot: vi.fn() },
}));
vi.mock('../../../services/marketplace.service', () => ({ default: {} }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));

describe('ChatListSidebar - chấm trạng thái theo replies_enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    chatbotApi.listChatbots.mockResolvedValue({
      success: true,
      data: [
        { id: 1, name: 'Bot Bat', is_active: true, replies_enabled: true, document_count: 3 },
        { id: 2, name: 'Bot Tat', is_active: true, replies_enabled: false, document_count: 4 },
      ],
    });
  });

  it('chấm xanh khi bật, xám khi replies_enabled:false', async () => {
    render(<ChatListSidebar selectedBot={null} onSelectBot={() => {}} />);
    const on = (await screen.findByText('3 tài liệu')).previousElementSibling;
    const off = (await screen.findByText('4 tài liệu')).previousElementSibling;
    expect(on.className).toContain('bg-emerald-500');
    expect(off.className).toContain('bg-slate-300');
    expect(off.className).not.toContain('bg-emerald-500');
  });

  it('studio:bot-updated → gộp đúng bot (chấm xám + tên mới), giữ document_count, bot khác nguyên; chọn lại nhận object mới', async () => {
    const onSelectBot = vi.fn();
    render(<ChatListSidebar selectedBot={null} onSelectBot={onSelectBot} />);
    await screen.findByText('4 tài liệu');
    onSelectBot.mockClear();

    act(() => {
      document.dispatchEvent(new CustomEvent('studio:bot-updated', {
        detail: { id: 1, replies_enabled: false, name: 'Mới' },
      }));
    });

    const updatedDot = (await screen.findByText('3 tài liệu')).previousElementSibling;
    expect(updatedDot.className).toContain('bg-slate-300');
    expect(screen.getByText('Mới')).toBeTruthy();
    expect(screen.queryByText('Bot Bat')).toBeNull();
    // Bot khác giữ nguyên.
    const otherDot = screen.getByText('4 tài liệu').previousElementSibling;
    expect(otherDot.className).toContain('bg-slate-300'); // Bot Tat vốn đã tắt
    expect(screen.getByText('Bot Tat')).toBeTruthy();

    fireEvent.click(screen.getByText('Mới'));
    expect(onSelectBot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, replies_enabled: false, name: 'Mới', document_count: 3 })
    );
  });
});
