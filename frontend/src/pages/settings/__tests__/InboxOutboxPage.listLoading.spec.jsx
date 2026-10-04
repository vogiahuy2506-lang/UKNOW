/**
 * H-07 — danh sách tải đúng MỘT lần khi mở trang, tìm kiếm có debounce 300 ms, kết quả về trễ không đè kết quả mới.
 * H-20 — lựa chọn tài khoản Zalo (đã nhớ / "tất cả") được chốt cùng lúc với trạng thái, nên không có lần tải thừa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InboxOutboxPage from '../InboxOutboxPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../i18n', () => {
  const t = (key) => key;
  return { useI18n: () => ({ t }) };
});

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => {
    const state = { user: { id: 1 }, activeContext: { type: 'self', ownerId: 1 } };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('../../../features/inbox/ConversationList', () => ({
  default: ({ conversations }) => <div data-testid="list">{conversations.map((c) => c.visitorName).join('|')}</div>,
}));
vi.mock('../../../features/inbox/ConversationFilters', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/MessageThread', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/ReplyInput', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/ZaloAccountSelector', () => ({ default: () => <div /> }));
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

const ACCOUNTS = [
  { id: 103, displayName: 'Nhật Minh', status: 'connected', isConnected: true },
  { id: 45, displayName: 'Cũ', status: 'needs_reauth', isConnected: false },
];

const renderPage = () => render(
  <MemoryRouter initialEntries={['/app/settings/inbox']}>
    <Routes>
      <Route path="/app/settings/inbox" element={<InboxOutboxPage />} />
    </Routes>
  </MemoryRouter>
);

const conv = (name) => ({ id: name.length, type: 'zalo_personal', visitorName: name, unreadCount: 0, status: 'active' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  chatbotApi.getConversations.mockResolvedValue({ success: true, data: { conversations: [conv('Hải')], total: 1 } });
  chatbotApi.getUnreadCount.mockResolvedValue({ success: true, data: { total: 0 } });
  chatbotApi.getContactAlerts.mockResolvedValue({ data: { success: true, data: { openCount: 0 } } });
  chatbotApi.getZaloSyncStatus.mockResolvedValue({ data: { success: true, data: { connected: true, accounts: ACCOUNTS } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InboxOutboxPage — tải danh sách (H-07, H-20)', () => {
  it('mở trang: danh sách tải đúng 1 lần, theo "tất cả tài khoản" (không zaloAccountId)', async () => {
    renderPage();

    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1);
    expect(chatbotApi.getConversations.mock.calls[0][0].zaloAccountId).toBeUndefined();
    expect(chatbotApi.getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('tài khoản đã nhớ còn trong danh sách → lần tải đầu tiên đã mang đúng tài khoản đó (không tải 2 lần)', async () => {
    localStorage.setItem('uknow.inbox.zaloAccountId.1', '103');

    renderPage();

    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1);
    expect(chatbotApi.getConversations.mock.calls[0][0].zaloAccountId).toBe('103');
    expect(chatbotApi.getUnreadCount).toHaveBeenLastCalledWith({ channel: undefined, zaloAccountId: '103' });
  });

  it('tài khoản đã nhớ không còn nữa → về "tất cả tài khoản"', async () => {
    localStorage.setItem('uknow.inbox.zaloAccountId.1', '999');

    renderPage();

    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    expect(chatbotApi.getConversations.mock.calls[0][0].zaloAccountId).toBeUndefined();
  });

  it('API trạng thái lỗi vẫn tải danh sách (không kẹt ở màn tải)', async () => {
    chatbotApi.getZaloSyncStatus.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderPage();

    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
  });
});

describe('InboxOutboxPage — ô tìm kiếm (H-07)', () => {
  it('gõ liên tiếp 3 ký tự chỉ tải 1 lần, sau 300 ms yên lặng, với từ khoá cuối cùng', async () => {
    renderPage();
    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    chatbotApi.getConversations.mockClear();
    const input = screen.getByPlaceholderText('inbox.searchConversations');

    fireEvent.change(input, { target: { value: 'n' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.change(input, { target: { value: 'ng' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.change(input, { target: { value: 'nguyen' } });
    expect(chatbotApi.getConversations).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(chatbotApi.getConversations).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });

    expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1);
    expect(chatbotApi.getConversations.mock.calls[0][0].search).toBe('nguyen');
    // ô nhập hiện chữ ngay, không đợi
    expect(input.value).toBe('nguyen');
  });

  it('xoá sạch ô tìm kiếm áp ngay, không đợi', async () => {
    renderPage();
    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    const input = screen.getByPlaceholderText('inbox.searchConversations');
    fireEvent.change(input, { target: { value: 'abc' } });
    await waitFor(() => expect(chatbotApi.getConversations.mock.calls.at(-1)[0].search).toBe('abc'));
    chatbotApi.getConversations.mockClear();

    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    expect(chatbotApi.getConversations.mock.calls[0][0].search).toBeUndefined();
  });

  it('kết quả của từ khoá cũ (về chậm) KHÔNG đè kết quả của từ khoá mới', async () => {
    renderPage();
    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    const input = screen.getByPlaceholderText('inbox.searchConversations');

    let releaseSlow;
    chatbotApi.getConversations.mockImplementationOnce(() => new Promise((resolve) => { releaseSlow = resolve; }));
    fireEvent.change(input, { target: { value: 'cu' } });
    await waitFor(() => expect(chatbotApi.getConversations.mock.calls.at(-1)[0].search).toBe('cu'));

    chatbotApi.getConversations.mockResolvedValueOnce({ success: true, data: { conversations: [conv('Mới')], total: 1 } });
    fireEvent.change(input, { target: { value: 'moi' } });
    await waitFor(() => expect(screen.getByTestId('list').textContent).toBe('Mới'));

    await act(async () => {
      releaseSlow({ success: true, data: { conversations: [conv('Cũ')], total: 1 } });
    });

    expect(screen.getByTestId('list').textContent).toBe('Mới');
  });
});
