/**
 * H-05 — trang Hộp thư nạp trạng thái tài khoản Zalo MỘT lần khi mở, không chạy lại theo bộ lọc / phím gõ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InboxOutboxPage from '../InboxOutboxPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => {
    const state = { user: { id: 1 }, activeContext: { type: 'self', ownerId: 1 } };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('../../../features/inbox/ConversationList', () => ({
  default: () => <div data-testid="conversation-list" />,
}));
vi.mock('../../../features/inbox/ConversationFilters', () => ({
  default: ({ filters, onChange }) => (
    <button
      type="button"
      data-testid="set-channel-web"
      onClick={() => onChange({ ...filters, channel: 'web' })}
    />
  ),
}));
vi.mock('../../../features/inbox/MessageThread', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/ReplyInput', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/ZaloAccountSelector', () => ({
  default: ({ statusAccounts }) => (
    <div data-testid="zalo-account-selector" data-count={(statusAccounts || []).length} />
  ),
}));
vi.mock('../../../features/inbox/ConversationDetails', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/AiActivityReport', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/ContactAlertsPanel', () => ({ default: () => <div /> }));

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getConversations: vi.fn(),
    getUnreadCount: vi.fn(),
    getZaloSyncStatus: vi.fn(),
    getContactAlerts: vi.fn(),
    getMessages: vi.fn(),
    markAsRead: vi.fn(),
  },
}));

vi.mock('../../../hooks/useInboxSSE', () => ({ default: () => ({ status: 'connected', retry: vi.fn() }) }));
vi.mock('../../../hooks/useDesktopNotifications', () => ({
  default: () => ({ isEnabled: false, toggleNotifications: vi.fn(), showNotification: vi.fn() }),
}));
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/app/settings/inbox']}>
    <Routes>
      <Route path="/app/settings/inbox" element={<InboxOutboxPage />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  chatbotApi.getConversations.mockResolvedValue({ success: true, data: { conversations: [], total: 0 } });
  chatbotApi.getUnreadCount.mockResolvedValue({ success: true, data: { total: 0 } });
  chatbotApi.getContactAlerts.mockResolvedValue({ data: { success: true, data: { openCount: 0 } } });
  chatbotApi.getZaloSyncStatus.mockResolvedValue({
    data: {
      success: true,
      data: {
        connected: true,
        accounts: [{ id: 103, displayName: 'Nhật Minh', conversationCount: 25, status: 'connected', isConnected: true }],
      },
    },
  });
});

describe('InboxOutboxPage — trạng thái tài khoản Zalo (H-05)', () => {
  it('nạp trạng thái đúng 1 lần khi mở trang và truyền xuống ô chọn tài khoản qua props', async () => {
    renderPage();

    await waitFor(() => expect(chatbotApi.getZaloSyncStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('zalo-account-selector').dataset.count).toBe('1'));
  });

  it('đổi bộ lọc kênh KHÔNG nạp lại trạng thái tài khoản, nhưng vẫn nạp lại danh sách', async () => {
    renderPage();
    await waitFor(() => expect(chatbotApi.getZaloSyncStatus).toHaveBeenCalledTimes(1));
    const conversationCallsBefore = chatbotApi.getConversations.mock.calls.length;

    fireEvent.click(screen.getByTestId('set-channel-web'));

    await waitFor(() => expect(chatbotApi.getConversations.mock.calls.length).toBeGreaterThan(conversationCallsBefore));
    expect(chatbotApi.getZaloSyncStatus).toHaveBeenCalledTimes(1);
  });

  it('gõ ô tìm kiếm KHÔNG nạp lại trạng thái tài khoản', async () => {
    renderPage();
    await waitFor(() => expect(chatbotApi.getZaloSyncStatus).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText('inbox.searchConversations');
    fireEvent.change(input, { target: { value: 'ng' } });
    fireEvent.change(input, { target: { value: 'ngu' } });
    fireEvent.change(input, { target: { value: 'nguyen' } });

    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalled());
    expect(chatbotApi.getZaloSyncStatus).toHaveBeenCalledTimes(1);
  });
});
