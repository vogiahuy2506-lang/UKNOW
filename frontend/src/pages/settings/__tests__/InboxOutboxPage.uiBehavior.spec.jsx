/**
 * Trang Hộp thư — hành vi giao diện của đợt 04/10: H-16 (gửi lỗi ném lại để giữ nội dung), H-29 (toast sau khi gửi),
 * H-11 (nút quay lại "Hộp thư" trên điện thoại), H-12 (tab kênh theo kênh user có), H-23 (không còn hàng tiêu đề +
 * số chưa đọc chỉ một chỗ), H-28/H-29 (nút đồng bộ chỉ cho nhóm Zalo), H-31 (banner trung tính), "Đánh dấu tất cả đã đọc".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import toast from 'react-hot-toast';
import InboxOutboxPage from '../InboxOutboxPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

const ui = { isMobile: false, sendResult: null, filtersProps: null, selectorProps: null };

vi.mock('../../../i18n', () => {
  const DICT = {
    'inbox.sentToast': 'Đã gửi',
    'inbox.sentWithAiPause': 'Đã gửi. AI tạm nghỉ ở cuộc trò chuyện này {n} phút.',
    'inbox.zaloReloginBanner': 'Zalo {name} cần đăng nhập lại để nhận tin mới.',
    'inbox.zaloReloginBannerMany': 'Có {n} tài khoản Zalo cần đăng nhập lại để nhận tin mới.',
    'inbox.openChannelSettings': 'Mở Cài đặt kênh',
    'inbox.markAllRead': 'Đánh dấu tất cả đã đọc',
    'inbox.markAllReadConfirmBtn': 'Đánh dấu đã đọc',
    'inbox.unreadConversationsTooltip': '{n} cuộc trò chuyện có tin chưa đọc',
    'inbox.backToInbox': 'Hộp thư',
    'inbox.title': 'Hộp thư',
    'inbox.aiReportTab': 'Báo cáo AI',
    'inbox.contactAlertsTab': 'Liên hệ để lại',
    'inbox.syncNow': 'Đồng bộ ngay',
  };
  const t = (key, params = {}) => (DICT[key] ?? key).replace(/\{(\w+)\}/g, (_, p) => params[p] ?? `{${p}}`);
  return { useI18n: () => ({ t }) };
});

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => {
    const state = { user: { id: 7 }, activeContext: { type: 'self', ownerId: 7 } };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('../../../features/inbox/ConversationList', () => ({
  default: ({ conversations, onSelect, onDelete }) => (
    <div>
      {conversations.map((c) => (
        <button key={`${c.type}-${c.id}`} type="button" data-testid={`conv-${c.type}-${c.id}`} onClick={() => onSelect(c)}>
          {c.visitorName}
        </button>
      ))}
      <span data-testid="can-delete">{String(Boolean(onDelete))}</span>
    </div>
  ),
}));
vi.mock('../../../features/inbox/ConversationFilters', () => ({
  default: (props) => {
    ui.filtersProps = props;
    return <div data-testid="filters" />;
  },
}));
vi.mock('../../../features/inbox/MessageThread', () => ({ default: () => <div data-testid="thread" /> }));
vi.mock('../../../features/inbox/ReplyInput', () => ({
  default: ({ onSend }) => (
    <button
      type="button"
      data-testid="send"
      onClick={() => {
        ui.sendResult = 'pending';
        onSend('nội dung', undefined, []).then(() => { ui.sendResult = 'resolved'; }, () => { ui.sendResult = 'rejected'; });
      }}
    />
  ),
}));
vi.mock('../../../features/inbox/ZaloAccountSelector', () => ({
  default: (props) => {
    ui.selectorProps = props;
    return <div data-testid="selector" />;
  },
}));
vi.mock('../../../features/inbox/ConversationDetails', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/AiActivityReport', () => ({ default: () => <div data-testid="ai-report" /> }));
vi.mock('../../../features/inbox/ContactAlertsPanel', () => ({ default: () => <div data-testid="contact-alerts" /> }));

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getConversations: vi.fn(),
    getUnreadCount: vi.fn(),
    getZaloSyncStatus: vi.fn(),
    getContactAlerts: vi.fn(),
    getMessages: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getInboxChannels: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock('../../../hooks/useInboxSSE', () => ({ default: () => ({ status: 'connected', retry: vi.fn() }) }));
vi.mock('../../../hooks/useDesktopNotifications', () => ({
  default: () => ({ isEnabled: false, toggleNotifications: vi.fn(), showNotification: vi.fn() }),
}));
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => ui.isMobile }));

const personal = (over = {}) => ({
  id: 41, type: 'zalo_personal', channel: 'zalo_personal', visitorName: 'Hải', unreadCount: 2, chatbotEnabled: true,
  idZaloSetting: 103, visitorInfo: {}, ...over,
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/app/settings/inbox']}>
    <Routes>
      <Route path="/app/settings/inbox" element={<InboxOutboxPage />} />
      <Route path="/app/settings/channels" element={<div data-testid="channels-page" />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  ui.isMobile = false;
  ui.sendResult = null;
  chatbotApi.getConversations.mockResolvedValue({ success: true, data: { conversations: [personal()], total: 1 } });
  chatbotApi.getUnreadCount.mockResolvedValue({ success: true, data: { total: 29 } });
  chatbotApi.getContactAlerts.mockResolvedValue({ data: { success: true, data: { openCount: 0 } } });
  chatbotApi.getZaloSyncStatus.mockResolvedValue({
    data: { success: true, data: { connected: true, accounts: [{ id: 103, displayName: 'Nhật Minh', isConnected: true }] } },
  });
  chatbotApi.getInboxChannels.mockResolvedValue({ success: true, data: { channels: ['web', 'zalo_personal'] } });
  chatbotApi.getMessages.mockResolvedValue({ success: true, data: [], hasMore: false });
  chatbotApi.markAsRead.mockResolvedValue({ success: true, data: { remainingUnread: 0 } });
  chatbotApi.markAllAsRead.mockResolvedValue({ success: true, data: { updatedMessages: 5 } });
});

const openConversation = async (conv = personal()) => {
  chatbotApi.getConversations.mockResolvedValue({ success: true, data: { conversations: [conv], total: 1 } });
  renderPage();
  fireEvent.click(await screen.findByTestId(`conv-${conv.type}-${conv.id}`));
  await screen.findByTestId('send');
};

describe('gửi tin (H-16, H-29)', () => {
  it('gửi lỗi → toast lỗi và NÉM LẠI để ô nhập giữ nội dung', async () => {
    chatbotApi.sendMessage.mockRejectedValue({ response: { data: { message: 'Đã hết hạn mức gửi' } } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await openConversation();

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => expect(ui.sendResult).toBe('rejected'));
    expect(toast.error).toHaveBeenCalledWith('Đã hết hạn mức gửi');
  });

  it('gửi được, chatbot chưa bật → chỉ "Đã gửi" (không nói chuyện AI tạm dừng)', async () => {
    chatbotApi.sendMessage.mockResolvedValue({
      success: true, messageId: 9001, sendStatus: 'sent', aiPaused: true,
      aiPausedAt: '2026-10-04T10:00:00.000Z', aiResumeAt: '2026-10-04T10:05:00.000Z',
    });
    await openConversation(personal({ chatbotEnabled: false }));

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => expect(ui.sendResult).toBe('resolved'));
    expect(toast.success).toHaveBeenCalledWith('Đã gửi');
  });

  it('gửi trong nhóm → chỉ "Đã gửi", kể cả khi server trả cờ tạm dừng', async () => {
    chatbotApi.sendMessage.mockResolvedValue({
      success: true, messageId: 9002, sendStatus: 'sent', aiPaused: true,
      aiPausedAt: '2026-10-04T10:00:00.000Z', aiResumeAt: '2026-10-04T10:05:00.000Z',
    });
    await openConversation(personal({ isGroup: true, visitorInfo: { is_group: true } }));

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => expect(ui.sendResult).toBe('resolved'));
    expect(toast.success).toHaveBeenCalledWith('Đã gửi');
  });

  it('gửi được, chatbot đang bật ở hội thoại 1-1 → "Đã gửi. AI tạm nghỉ ... 5 phút."', async () => {
    chatbotApi.sendMessage.mockResolvedValue({
      success: true, messageId: 9003, sendStatus: 'sent', aiPaused: true,
      aiPausedAt: '2026-10-04T10:00:00.000Z', aiResumeAt: '2026-10-04T10:05:00.000Z',
    });
    await openConversation();

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => expect(ui.sendResult).toBe('resolved'));
    expect(toast.success).toHaveBeenCalledWith('Đã gửi. AI tạm nghỉ ở cuộc trò chuyện này 5 phút.');
  });
});

describe('số chưa đọc và tiêu đề (H-23)', () => {
  it('không còn hàng tiêu đề "Hộp thư · N chưa đọc": số chỉ xuất hiện MỘT lần, ở tab Hộp thư, kèm tooltip', async () => {
    renderPage();

    const tab = await screen.findByRole('button', { name: /Hộp thư/ });
    await waitFor(() => expect(tab.textContent).toContain('29'));
    expect(tab.getAttribute('title')).toBe('29 cuộc trò chuyện có tin chưa đọc');
    expect(screen.getAllByText('29')).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('số lớn gọn thành 99+', async () => {
    chatbotApi.getUnreadCount.mockResolvedValue({ success: true, data: { total: 317 } });
    renderPage();

    expect(await screen.findByText('99+')).toBeInTheDocument();
  });
});

describe('điện thoại (H-11)', () => {
  it('mở tab "Liên hệ để lại" / "Báo cáo AI" trên điện thoại có nút quay lại "Hộp thư"', async () => {
    ui.isMobile = true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Liên hệ để lại/ }));

    expect(screen.getByTestId('contact-alerts')).toBeInTheDocument();
    const back = screen.getByRole('button', { name: 'Hộp thư' });
    fireEvent.click(back);
    expect(screen.queryByTestId('contact-alerts')).not.toBeInTheDocument();
    expect(screen.getByTestId('filters')).toBeInTheDocument();
  });

  it('trên máy tính không có thanh quay lại (cột trái vẫn hiện sẵn)', async () => {
    ui.isMobile = false;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Báo cáo AI/ }));

    expect(screen.getByTestId('ai-report')).toBeInTheDocument();
    // tab "Hộp thư" có kèm số chưa đọc trong tên nên không trùng; không có nút quay lại riêng
    expect(screen.queryByRole('button', { name: 'Hộp thư' })).not.toBeInTheDocument();
  });
});

describe('tab kênh (H-12) và banner (H-31)', () => {
  it('truyền cho bộ lọc đúng danh sách kênh server trả về', async () => {
    chatbotApi.getInboxChannels.mockResolvedValue({ success: true, data: { channels: ['web', 'telegram'] } });
    renderPage();

    await waitFor(() => expect(ui.filtersProps.availableChannels).toEqual(['web', 'telegram']));
  });

  it('lỗi tải danh sách kênh không chặn Hộp thư', async () => {
    chatbotApi.getInboxChannels.mockRejectedValue(new Error('500'));
    renderPage();

    expect(await screen.findByTestId('conv-zalo_personal-41')).toBeInTheDocument();
    expect(ui.filtersProps.availableChannels).toEqual([]);
  });

  it('không tài khoản nào đang kết nối → dòng xám trung tính có tên tài khoản + nút tới Cài đặt kênh', async () => {
    chatbotApi.getZaloSyncStatus.mockResolvedValue({
      data: { success: true, data: { connected: false, accounts: [{ id: 45, displayName: 'Cũ', isConnected: false }] } },
    });
    renderPage();

    expect(await screen.findByText('Zalo Cũ cần đăng nhập lại để nhận tin mới.')).toBeInTheDocument();
    expect(screen.queryByText(/mất kết nối/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở Cài đặt kênh' }));
    expect(await screen.findByTestId('channels-page')).toBeInTheDocument();
  });

  it('nhiều tài khoản đều hết phiên → gộp một câu có số lượng', async () => {
    chatbotApi.getZaloSyncStatus.mockResolvedValue({
      data: { success: true, data: { connected: false, accounts: [
        { id: 1, displayName: 'A', isConnected: false }, { id: 2, displayName: 'B', isConnected: false },
      ] } },
    });
    renderPage();

    expect(await screen.findByText('Có 2 tài khoản Zalo cần đăng nhập lại để nhận tin mới.')).toBeInTheDocument();
  });

  it('còn ít nhất một tài khoản kết nối → không hiện banner', async () => {
    renderPage();
    await screen.findByTestId('conv-zalo_personal-41');

    expect(screen.queryByText(/cần đăng nhập lại/)).not.toBeInTheDocument();
  });
});

describe('Đánh dấu tất cả đã đọc', () => {
  it('có hội thoại chưa đọc → hiện nút; xác nhận rồi gọi API theo bộ lọc đang xem và tải lại danh sách', async () => {
    renderPage();
    await screen.findByTestId('conv-zalo_personal-41');
    act(() => { ui.filtersProps.onChange({ ...ui.filtersProps.filters, kind: 'group' }); });
    await waitFor(() => expect(chatbotApi.getConversations.mock.calls.at(-1)[0].kind).toBe('group'));
    chatbotApi.getConversations.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    expect(chatbotApi.markAllAsRead).not.toHaveBeenCalled(); // phải xác nhận trước
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));

    await waitFor(() => expect(chatbotApi.markAllAsRead).toHaveBeenCalledWith(expect.objectContaining({ kind: 'group' })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('inbox.markAllReadDone'));
    await waitFor(() => expect(chatbotApi.getConversations).toHaveBeenCalled());
  });

  it('không có hội thoại nào chưa đọc → không hiện nút', async () => {
    chatbotApi.getConversations.mockResolvedValue({ success: true, data: { conversations: [personal({ unreadCount: 0 })], total: 1 } });
    renderPage();
    await screen.findByTestId('conv-zalo_personal-41');

    expect(screen.queryByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).not.toBeInTheDocument();
  });
});
