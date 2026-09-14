import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InboxOutboxPage from '../InboxOutboxPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key) => key,
  }),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, name: 'Owner', activeContext: { type: 'owner' } },
  }),
}));

vi.mock('../../../features/inbox/ConversationList', () => ({
  default: () => <div data-testid="conversation-list" />,
}));
vi.mock('../../../features/inbox/ConversationFilters', () => ({
  default: () => <div data-testid="conversation-filters" />,
}));
vi.mock('../../../features/inbox/MessageThread', () => ({
  default: () => <div data-testid="message-thread" />,
}));
vi.mock('../../../features/inbox/ReplyInput', () => ({
  default: () => <div data-testid="reply-input" />,
}));
vi.mock('../../../features/inbox/ZaloAccountSelector', () => ({
  default: () => <div data-testid="zalo-account-selector" />,
}));
vi.mock('../../../features/inbox/ConversationDetails', () => ({
  default: () => <div data-testid="conversation-details" />,
}));
vi.mock('../../../features/inbox/AiActivityReport', () => ({
  default: () => <div data-testid="ai-activity-report" />,
}));
vi.mock('../../../features/inbox/ContactAlertsPanel', () => ({
  default: () => <div data-testid="contact-alerts-panel" />,
}));

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getConversations: vi.fn().mockResolvedValue({
      data: { success: true, data: { items: [], total: 0, hasMore: false } },
    }),
    getUnreadCount: vi.fn().mockResolvedValue({
      data: { success: true, data: { count: 0 } },
    }),
    getZaloAccountsStatus: vi.fn().mockResolvedValue({
      data: { success: true, data: { connected: true, accounts: [] } },
    }),
    getContactAlerts: vi.fn().mockResolvedValue({
      data: { success: true, data: { items: [], total: 0, openCount: 3 } },
    }),
    getMessages: vi.fn().mockResolvedValue({
      data: { success: true, data: { items: [], hasMore: false } },
    }),
    markAsRead: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../hooks/useInboxSSE', () => ({
  default: () => ({
    isConnected: true,
  }),
}));

vi.mock('../../../hooks/useDesktopNotifications', () => ({
  default: () => ({
    showNotification: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useIsMobile', () => ({
  default: () => false,
}));

describe('InboxOutboxPage — deep-link query params', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens conversation with id=41 and type=webchat when query param ?conversation=41&type=webchat is present', async () => {
    render(
      <MemoryRouter initialEntries={['/app/settings/inbox?conversation=41&type=webchat']}>
        <Routes>
          <Route path="/app/settings/inbox" element={<InboxOutboxPage />} />
        </Routes>
      </MemoryRouter>
    );

    // chatbotApi.getMessages should be called for conversation 41 of type webchat
    await waitFor(() => {
      expect(chatbotApi.getMessages).toHaveBeenCalledWith(41, 'webchat');
    });
  });
});
