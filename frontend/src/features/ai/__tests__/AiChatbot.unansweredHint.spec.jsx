/**
 * PR-B (LENH_GIAO_TRO_LY_AI_PR4_2026-09-29) Việc 3.1 — lối ra khi chưa có tài liệu chính thức.
 * Backend đặt data.unanswered=true (helpAssistant.service.js); FE chỉ hiển thị gợi ý tĩnh
 * (không gọi API mới): dòng nhỏ + link Xem mục Hướng dẫn (/huong-dan) + Liên hệ hỗ trợ (/contact).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';

vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));
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

describe('AiChatbot — gợi ý khi chưa có tài liệu (data.unanswered)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  const sendAndGetReply = async (text) => {
    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );
    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: text } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
  };

  it('data.unanswered === true → hiện dòng gợi ý + 2 link Hướng dẫn/Liên hệ hỗ trợ', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'text',
        content: 'Mình chưa có tài liệu chính thức phần này, nhưng thường thì…',
        data: { helpRoute: 'hỏi_đáp', sources: [], unanswered: true, softFallback: true },
        sessionId: 'sess_1',
        sessionTitle: 'Câu hỏi lạ',
      },
    });

    await sendAndGetReply('cách dùng tính năng abc xyz chưa từng nghe');

    await screen.findByText('aiChatbot.unansweredHint');
    const helpLink = screen.getByText('aiChatbot.unansweredHelpLink');
    const contactLink = screen.getByText('aiChatbot.unansweredContactLink');
    expect(helpLink.closest('a')).toHaveAttribute('href', '/huong-dan');
    expect(contactLink.closest('a')).toHaveAttribute('href', '/contact');
  });

  it('thiếu data.unanswered → KHÔNG hiện gợi ý (hành vi cũ)', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'text',
        content: 'Bước 1: vào Cài đặt > Zalo nhóm.',
        data: { helpRoute: 'hỏi_đáp', sources: [] },
        sessionId: 'sess_2',
        sessionTitle: 'Zalo nhóm',
      },
    });

    await sendAndGetReply('làm sao tạo nhóm zalo');

    await screen.findByText('Bước 1: vào Cài đặt > Zalo nhóm.');
    expect(screen.queryByText('aiChatbot.unansweredHint')).not.toBeInTheDocument();
  });

  it('data.unanswered === false → KHÔNG hiện gợi ý', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'text',
        content: 'Có, mình làm được tạo landing page.',
        data: { helpRoute: 'hỏi_đáp', unanswered: false },
        sessionId: 'sess_3',
        sessionTitle: 'Landing page',
      },
    });

    await sendAndGetReply('bạn có tạo được landing page không');

    await screen.findByText('Có, mình làm được tạo landing page.');
    expect(screen.queryByText('aiChatbot.unansweredHint')).not.toBeInTheDocument();
  });
});
