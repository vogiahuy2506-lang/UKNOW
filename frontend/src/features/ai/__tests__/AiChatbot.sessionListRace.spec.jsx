/**
 * Gửi tin TRƯỚC khi danh sách phiên tải xong (mở /app rồi gõ ngay, hoặc bấm gợi ý "Tạo landing page").
 * Tìm ra 25/09/2026 khi chẩn đoán nghiệm thu landing: getSessions trả về sau lượt chat → effect mở panel
 * gọi startNewChat() → khung chat bị xoá trắng, và setSessions(danh sách server) làm mất tab phiên vừa tạo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';

const mockToast = vi.hoisted(() => {
  const toast = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  toast.loading = vi.fn();
  toast.dismiss = vi.fn();
  return toast;
});
vi.mock('react-hot-toast', () => ({ toast: mockToast, default: mockToast, Toaster: () => null }));
vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
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

describe('AiChatbot — gửi tin trước khi danh sách phiên tải xong', () => {
  let resolveSessions;

  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
    aiApi.getSessions.mockReturnValue(new Promise((r) => { resolveSessions = r; }));
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { type: 'text', content: 'Chào bạn, tôi giúp gì được?', sessionId: 'sess_new', sessionTitle: 'Phiên vừa tạo' },
    });
  });

  const renderAndSend = async (text) => {
    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );
    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: text } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    await screen.findByText('Chào bạn, tôi giúp gì được?');
  };

  it('danh sách phiên về SAU câu trả lời → không xoá trắng khung chat', async () => {
    await renderAndSend('Xin chào');

    await act(async () => { resolveSessions({ data: [{ id: 'sess_old', title: 'Phiên cũ' }] }); });

    expect(screen.getByText('Chào bạn, tôi giúp gì được?')).toBeInTheDocument();
    expect(screen.getByText('Xin chào')).toBeInTheDocument();
  });

  it('danh sách phiên về SAU → giữ tab phiên vừa tạo, thêm các phiên cũ, không trùng', async () => {
    await renderAndSend('Xin chào');

    await act(async () => {
      resolveSessions({ data: [{ id: 'sess_new', title: 'Phiên vừa tạo' }, { id: 'sess_old', title: 'Phiên cũ' }] });
    });

    expect(screen.getAllByText('Phiên vừa tạo')).toHaveLength(1);
    expect(screen.getByText('Phiên cũ')).toBeInTheDocument();
  });

  it('danh sách phiên về SAU mà không chứa phiên vừa tạo → tab phiên vừa tạo vẫn còn', async () => {
    await renderAndSend('Xin chào');

    await act(async () => { resolveSessions({ data: [{ id: 'sess_old', title: 'Phiên cũ' }] }); });

    expect(screen.getByText('Phiên vừa tạo')).toBeInTheDocument();
    expect(screen.getByText('Phiên cũ')).toBeInTheDocument();
  });

  it('danh sách phiên lỗi → khung chat vẫn giữ nguyên', async () => {
    aiApi.getSessions.mockReturnValue(new Promise((_, reject) => { resolveSessions = reject; }));
    await renderAndSend('Xin chào');

    await act(async () => { resolveSessions(new Error('mạng')); });

    expect(screen.getByText('Chào bạn, tôi giúp gì được?')).toBeInTheDocument();
  });

  it('mở bình thường (danh sách về trước khi gõ) → hiện lời chào và danh sách phiên', async () => {
    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );
    await act(async () => { resolveSessions({ data: [{ id: 'sess_old', title: 'Phiên cũ' }] }); });

    expect(await screen.findByText('Phiên cũ')).toBeInTheDocument();
    await waitFor(() => expect(aiApi.chat).not.toHaveBeenCalled());
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
