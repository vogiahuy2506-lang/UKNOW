import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import ChatListSidebar from '../ChatListSidebar';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { listChatbots: vi.fn(), createChatbot: vi.fn(), deleteChatbot: vi.fn() },
}));
vi.mock('../../../services/marketplace.service', () => ({ default: {} }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));

describe('ChatListSidebar - so tai lieu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    chatbotApi.listChatbots.mockResolvedValue({
      success: true,
      data: [
        { id: 1, name: 'Bot Mot', is_active: true, document_count: 3 },
        { id: 2, name: 'Bot Hai', is_active: true, document_count: 0 },
      ],
    });
  });

  const renderIt = () =>
    render(<ChatListSidebar selectedBot={null} onSelectBot={() => {}} />);

  it('hien so tai lieu that tu document_count', async () => {
    renderIt();
    expect(await screen.findByText('3 tài liệu')).toBeTruthy();
    expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
  });

  it('cap nhat dung bot khi nhan studio:knowledge-changed', async () => {
    renderIt();
    await screen.findByText('3 tài liệu');
    act(() => {
      document.dispatchEvent(new CustomEvent('studio:knowledge-changed', {
        detail: { chatbotId: '2', count: 5 },
      }));
    });
    await waitFor(() => expect(screen.getByText('5 tài liệu')).toBeTruthy());
    expect(screen.getByText('3 tài liệu')).toBeTruthy();
  });
});
