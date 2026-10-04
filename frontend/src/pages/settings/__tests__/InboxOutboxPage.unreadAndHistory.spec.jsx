/**
 * H-01 (tải tin cũ hơn, chỉ đánh dấu đọc phần đã tải), H-03 (số chưa đọc theo phạm vi đang xem),
 * H-25 (khớp SSE theo loại + id), H-27 (tin đến khi đang mở → đánh dấu đọc ở DB, tổng chưa đọc cập nhật).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InboxOutboxPage from '../InboxOutboxPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

const sse = { onNewMessage: null, onReconnected: null };

// `t` PHẢI ổn định giữa các lần render như bản thật (useCallback) — nếu mỗi lần một hàm mới thì
// effect phụ thuộc `t` (fetchMessages) chạy vô hạn khi tải tin thành công.
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
  default: ({ conversations, onSelect }) => (
    <div>
      {conversations.map((c) => (
        <button key={`${c.type}-${c.id}`} type="button" data-testid={`conv-${c.type}-${c.id}`} data-status={c.status} onClick={() => onSelect(c)}>
          {c.visitorName}:{c.unreadCount}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../../../features/inbox/ConversationFilters', () => ({
  default: ({ filters, onChange }) => (
    <button type="button" data-testid="set-channel-web" onClick={() => onChange({ ...filters, channel: 'web' })} />
  ),
}));
vi.mock('../../../features/inbox/MessageThread', () => ({
  default: ({ messages, hasMoreOlder, onLoadOlder }) => (
    <div>
      <div data-testid="message-ids">{messages.map((m) => m.id).join(',')}</div>
      {hasMoreOlder && <button type="button" data-testid="load-older" onClick={() => onLoadOlder()} />}
    </div>
  ),
}));
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

vi.mock('../../../hooks/useInboxSSE', () => ({
  default: (onNewMessage, _onUnread, onReconnected) => {
    sse.onNewMessage = onNewMessage;
    sse.onReconnected = onReconnected;
    return { status: 'connected', retry: vi.fn() };
  },
}));
vi.mock('../../../hooks/useDesktopNotifications', () => ({
  default: () => ({ isEnabled: false, toggleNotifications: vi.fn(), showNotification: vi.fn() }),
}));
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));

const CONVERSATIONS = [
  { id: 41, type: 'zalo_personal', channel: 'zalo_personal', visitorName: 'Hải', unreadCount: 3, status: 'active' },
  { id: 41, type: 'webchat', channel: 'web', visitorName: 'Khách web', unreadCount: 0, status: 'active' },
];

const renderPage = () => render(
  <MemoryRouter initialEntries={['/app/settings/inbox']}>
    <Routes>
      <Route path="/app/settings/inbox" element={<InboxOutboxPage />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  chatbotApi.getConversations.mockResolvedValue({ success: true, data: { conversations: CONVERSATIONS, total: 2 } });
  chatbotApi.getUnreadCount.mockResolvedValue({ success: true, data: { total: 1 } });
  chatbotApi.getContactAlerts.mockResolvedValue({ data: { success: true, data: { openCount: 0 } } });
  chatbotApi.getZaloSyncStatus.mockResolvedValue({ data: { success: true, data: { connected: true, accounts: [] } } });
  // Ids BIGINT từ API là CHUỖI.
  chatbotApi.getMessages.mockResolvedValue({
    success: true,
    hasMore: true,
    data: [
      { id: '900', role: 'visitor', content: 'a', createdAt: '2026-10-04T01:00:00.000Z' },
      { id: '901', role: 'visitor', content: 'b', createdAt: '2026-10-04T01:01:00.000Z' },
    ],
  });
  chatbotApi.markAsRead.mockResolvedValue({ success: true, data: { remainingUnread: 2 } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InboxOutboxPage — số chưa đọc theo phạm vi (H-03)', () => {
  it('hỏi số chưa đọc kèm tab kênh đang xem; đổi tab thì hỏi lại với kênh mới', async () => {
    renderPage();
    await waitFor(() => expect(chatbotApi.getUnreadCount).toHaveBeenCalled());
    expect(chatbotApi.getUnreadCount).toHaveBeenLastCalledWith({ channel: undefined, zaloAccountId: undefined });

    fireEvent.click(screen.getByTestId('set-channel-web'));

    await waitFor(() => expect(chatbotApi.getUnreadCount).toHaveBeenLastCalledWith({ channel: 'web', zaloAccountId: undefined }));
  });
});

describe('InboxOutboxPage — khung đọc (H-01)', () => {
  it('bấm hội thoại có tin chưa đọc: KHÔNG đánh dấu ngay; sau khi tải xong chỉ đánh dấu từ tin cũ nhất đã tải', async () => {
    renderPage();
    const row = await screen.findByTestId('conv-zalo_personal-41');

    // Giữ tải tin lại để thấy markAsRead chưa bị gọi trước khi khung đọc có dữ liệu.
    let release;
    chatbotApi.getMessages.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    fireEvent.click(row);
    await waitFor(() => expect(chatbotApi.getMessages).toHaveBeenCalledWith(41, 'zalo_personal'));
    expect(chatbotApi.markAsRead).not.toHaveBeenCalled();

    await act(async () => {
      release({
        success: true,
        hasMore: true,
        data: [
          { id: '900', role: 'visitor', content: 'a', createdAt: '2026-10-04T01:00:00.000Z' },
          { id: '901', role: 'visitor', content: 'b', createdAt: '2026-10-04T01:01:00.000Z' },
        ],
      });
    });

    await waitFor(() => expect(chatbotApi.markAsRead).toHaveBeenCalledWith(41, 'zalo_personal', { fromMessageId: 900 }));
    // Số chưa đọc của hàng lấy theo phần CÒN LẠI server trả về (tin cũ chưa tải), không ép về 0.
    await waitFor(() => expect(screen.getByTestId('conv-zalo_personal-41').textContent).toBe('Hải:2'));
  });

  it('hasMore=true → có nút tải tin cũ hơn; bấm thì gọi getMessages với before = id cũ nhất và chèn lên đầu', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('conv-zalo_personal-41'));
    const loadOlder = await screen.findByTestId('load-older');
    chatbotApi.getMessages.mockResolvedValueOnce({
      success: true,
      hasMore: false,
      data: [{ id: '850', role: 'visitor', content: 'cũ', createdAt: '2026-10-03T01:00:00.000Z' }],
    });

    fireEvent.click(loadOlder);

    await waitFor(() => expect(chatbotApi.getMessages).toHaveBeenLastCalledWith(41, 'zalo_personal', { before: 900 }));
    await waitFor(() => expect(screen.getByTestId('message-ids').textContent).toBe('850,900,901'));
    expect(screen.queryByTestId('load-older')).toBeNull();
    // Phần vừa tải cũng được đánh dấu đọc, từ tin cũ nhất của trang mới.
    await waitFor(() => expect(chatbotApi.markAsRead).toHaveBeenLastCalledWith(41, 'zalo_personal', { fromMessageId: 850 }));
  });
});

describe('InboxOutboxPage — tin đến qua SSE (H-25, H-27)', () => {
  it('tin khách đến khi đang mở đúng hội thoại → đánh dấu đọc ở DB (gom), không hỏi lại tổng', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('conv-zalo_personal-41'));
    await waitFor(() => expect(chatbotApi.markAsRead).toHaveBeenCalledTimes(1));
    await screen.findByTestId('load-older');
    vi.useFakeTimers();
    chatbotApi.markAsRead.mockClear();
    chatbotApi.getUnreadCount.mockClear();

    act(() => {
      sse.onNewMessage({
        conversationId: 41, type: 'zalo_personal', channel: 'zalo_personal', message: 'xin chào', timestamp: '2026-10-04T02:00:00.000Z',
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(chatbotApi.markAsRead).toHaveBeenCalledWith(41, 'zalo_personal', { fromMessageId: 900 });
  });

  it('tin khách đến ở hội thoại KHÁC → tổng chưa đọc được hỏi lại (trước chỉ Web chat mới cập nhật)', async () => {
    renderPage();
    await screen.findByTestId('conv-zalo_personal-41');
    vi.useFakeTimers();
    chatbotApi.getUnreadCount.mockClear();

    act(() => {
      sse.onNewMessage({
        conversationId: 99, type: 'zalo_personal', channel: 'zalo_personal', message: 'tin mới', senderName: 'Lan', timestamp: '2026-10-04T02:00:00.000Z',
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });

    expect(chatbotApi.getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('tin của AI / chính chủ (role agent) KHÔNG tăng chưa đọc và không hỏi lại tổng', async () => {
    renderPage();
    await screen.findByTestId('conv-zalo_personal-41');
    vi.useFakeTimers();
    chatbotApi.getUnreadCount.mockClear();

    act(() => {
      sse.onNewMessage({
        conversationId: 41, channel: 'zalo_personal', role: 'agent', senderName: 'AI', message: 'dạ ạ', timestamp: '2026-10-04T02:00:00.000Z',
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    expect(chatbotApi.getUnreadCount).not.toHaveBeenCalled();
    expect(screen.getByTestId('conv-zalo_personal-41').textContent).toBe('Hải:3');
  });

  it('trùng số id nhưng khác LOẠI: tin Zalo id 41 không chui vào hội thoại Web chat id 41 đang mở', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('conv-webchat-41'));
    await waitFor(() => expect(chatbotApi.getMessages).toHaveBeenCalledWith(41, 'webchat'));
    await screen.findByTestId('message-ids');
    await waitFor(() => expect(screen.getByTestId('message-ids').textContent).toBe('900,901'));

    act(() => {
      sse.onNewMessage({
        conversationId: 41, type: 'zalo_personal', channel: 'zalo_personal', messageId: 5000, message: 'tin Zalo', timestamp: '2026-10-04T02:00:00.000Z',
      });
    });

    expect(screen.getByTestId('message-ids').textContent).toBe('900,901');
    // Hàng Zalo id 41 được cập nhật (+1), hàng Web chat id 41 giữ nguyên.
    expect(screen.getByTestId('conv-zalo_personal-41').textContent).toBe('Hải:4');
    expect(screen.getByTestId('conv-webchat-41').textContent).toBe('Khách web:0');
  });

  it('hội thoại MỚI đến qua SSE mang status "active" (không bị hiện huy hiệu "Đóng") và tính 1 chưa đọc', async () => {
    renderPage();
    await screen.findByTestId('conv-zalo_personal-41');

    act(() => {
      sse.onNewMessage({
        conversationId: 99, type: 'zalo_personal', channel: 'zalo_personal', senderName: 'Lan', messageType: 'image',
        message: JSON.stringify({ title: '', href: 'https://photo.zdn.vn/x.jpg' }), timestamp: '2026-10-04T02:00:00.000Z',
      });
    });

    const row = screen.getByTestId('conv-zalo_personal-99');
    expect(row.dataset.status).toBe('active');
    expect(row.textContent).toBe('Lan:1');
  });

  it('nối lại SSE sau khi rớt → tải lại danh sách và số chưa đọc (tin trong khe hở không được phát lại)', async () => {
    renderPage();
    await screen.findByTestId('conv-zalo_personal-41');
    chatbotApi.getConversations.mockClear();
    chatbotApi.getUnreadCount.mockClear();

    act(() => { sse.onReconnected(); });

    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalledTimes(1));
    expect(chatbotApi.getUnreadCount).toHaveBeenCalledTimes(1);
  });
});
