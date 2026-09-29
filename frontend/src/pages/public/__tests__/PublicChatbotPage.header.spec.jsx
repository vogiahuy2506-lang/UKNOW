/**
 * embed_show_header (PLAN_TUY_CHINH_WIDGET_THAT_2026-09-29): false → trang /chat/:id không vẽ thanh header.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicChatbotPage from '../PublicChatbotPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getPublicChatbot: vi.fn(),
    sendPublicChatbotMessage: vi.fn(),
    uploadPublicChatAttachment: vi.fn(),
    deletePublicChatAttachment: vi.fn(),
  },
}));

const bot = { id: 5, name: 'Bot Cong Khai', welcome_message: 'Chao ban', show_avatar: true, suggested_questions: [] };

function renderPage(data) {
  chatbotApi.getPublicChatbot.mockResolvedValue({ data: { success: true, data } });
  return render(
    <MemoryRouter initialEntries={['/chat/5']}>
      <Routes>
        <Route path="/chat/:chatbotId" element={<PublicChatbotPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicChatbotPage — ẩn/hiện header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('embed_show_header:false → không có header', async () => {
    renderPage({ ...bot, embed_show_header: false });
    await screen.findByText('Chao ban');
    expect(screen.queryByTestId('public-chat-header')).toBeNull();
    expect(screen.queryByText('Đang trò chuyện')).toBeNull();
  });

  it('embed_show_header:true → có header', async () => {
    renderPage({ ...bot, embed_show_header: true });
    await screen.findByText('Chao ban');
    expect(screen.getByTestId('public-chat-header')).toBeInTheDocument();
  });

  it('server cũ không trả embed_show_header → vẫn có header', async () => {
    renderPage(bot);
    await screen.findByText('Chao ban');
    expect(screen.getByTestId('public-chat-header')).toBeInTheDocument();
  });
});

describe('PublicChatbotPage — bo góc khi chạy trong iframe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const withIframe = (fn) => async () => {
    const spy = vi.spyOn(window, 'top', 'get').mockReturnValue({});
    try { await fn(); } finally { spy.mockRestore(); }
  };

  it('trong iframe: border_radius 0 -> khung vuông; 12 -> 12px; 99 -> kẹp 32px', withIframe(async () => {
    const { unmount } = renderPage({ ...bot, border_radius: 0 });
    await screen.findByText('Chao ban');
    expect(screen.getByTestId('public-chat-frame').style.borderRadius).toBe('0px');
    unmount();

    const r2 = renderPage({ ...bot, border_radius: 12 });
    await screen.findByText('Chao ban');
    expect(screen.getByTestId('public-chat-frame').style.borderRadius).toBe('12px');
    r2.unmount();

    renderPage({ ...bot, border_radius: 99 });
    await screen.findByText('Chao ban');
    expect(screen.getByTestId('public-chat-frame').style.borderRadius).toBe('32px');
  }));

  it('ngoài iframe (Public Link toàn màn hình): không bo', async () => {
    renderPage({ ...bot, border_radius: 24 });
    await screen.findByText('Chao ban');
    expect(screen.getByTestId('public-chat-frame').style.borderRadius).toBe('0px');
  });
});
