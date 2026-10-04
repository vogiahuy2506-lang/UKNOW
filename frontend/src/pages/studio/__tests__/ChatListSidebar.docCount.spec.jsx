import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import ChatListSidebar from '../ChatListSidebar';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { listChatbots: vi.fn(), createChatbot: vi.fn(), deleteChatbot: vi.fn() },
}));
vi.mock('../../../services/marketplace.service', () => ({ default: {} }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

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
    // 04/10/2026 (S-17): "Chưa có dữ liệu" -> "Chưa có tài liệu" (dùng thống nhất chữ "tài liệu").
    expect(screen.getByText('Chưa có tài liệu')).toBeTruthy();
    expect(screen.queryByText('Chưa có dữ liệu')).toBeNull();
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

  // S-17: document_count chi la tai lieu SAN SANG; tai lieu loi hien rieng "· N loi" mau do.
  it('co tai lieu loi -> hien them "· N lỗi" mau do canh so tai lieu san sang', async () => {
    chatbotApi.listChatbots.mockResolvedValue({
      success: true,
      data: [{ id: 17, name: 'Bot co loi', is_active: true, document_count: 6, document_error_count: 1 }],
    });
    renderIt();

    expect(await screen.findByText('6 tài liệu')).toBeTruthy();
    const err = screen.getByText('· 1 lỗi');
    expect(err.className).toContain('text-red-500');
  });

  it('bot chi co tai lieu loi -> "Chưa có tài liệu" kem "· 1 lỗi" (khong the hien "1 tai lieu")', async () => {
    chatbotApi.listChatbots.mockResolvedValue({
      success: true,
      data: [{ id: 17, name: 'Bot loi het', is_active: true, document_count: 0, document_error_count: 1 }],
    });
    renderIt();

    expect(await screen.findByText('Chưa có tài liệu')).toBeTruthy();
    expect(screen.getByText('· 1 lỗi')).toBeTruthy();
  });

  it('studio:knowledge-changed mang errorCount -> cot trai hien so loi moi', async () => {
    renderIt();
    await screen.findByText('3 tài liệu');
    act(() => {
      document.dispatchEvent(new CustomEvent('studio:knowledge-changed', {
        detail: { chatbotId: '1', count: 2, errorCount: 1 },
      }));
    });
    await waitFor(() => expect(screen.getByText('· 1 lỗi')).toBeTruthy());
    expect(screen.getByText('2 tài liệu')).toBeTruthy();
  });
});
