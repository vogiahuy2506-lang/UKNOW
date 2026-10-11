/**
 * Hộp thư — tab kênh LUÔN hiện (11/10): chọn một kênh chính CHƯA kết nối thì danh sách rỗng trở thành lời mời kết nối
 * ("Chưa kết nối Telegram" + nút tới đúng tab Cài đặt kênh). Dùng ConversationFilters / ConversationList / ZaloAccountSelector
 * THẬT để bắt cả chỗ nối giữa các phần (props, điều hướng, luật "một nút" ở tab Zalo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import InboxOutboxPage from '../InboxOutboxPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

const auth = { activeContext: { type: 'self', ownerId: 7 } };

vi.mock('../../../i18n', () => {
  const DICT = {
    'inbox.allChannels': 'Tất cả kênh',
    'inbox.channelAllShort': 'Tất cả',
    'inbox.webChat': 'Web Chat',
    'inbox.webChatShort': 'Web chat',
    'inbox.zaloPersonal': 'Zalo Cá nhân',
    'inbox.zaloPersonalShort': 'Zalo',
    'inbox.channelNotConnectedBadge': 'Chưa kết nối',
    'inbox.channelNotConnectedTitle': 'Chưa kết nối {channel}',
    'inbox.channelNotConnectedHint': 'Kết nối {channel} ở Cài đặt kênh để nhận và trả lời tin nhắn ngay tại đây.',
    'inbox.channelNotConnectedEmployeeHint': 'Chủ tài khoản chưa kết nối kênh này hoặc chưa giao cho bạn.',
    'inbox.webNotConnectedHint': 'Tạo chatbot và lấy mã nhúng ở Chatbot của tôi để khách nhắn từ website.',
    'inbox.connectChannel': 'Kết nối {channel}',
    'inbox.openChatbotStudio': 'Mở Chatbot của tôi',
    'inbox.emptyListTitle': 'Chưa có cuộc trò chuyện nào',
    'inbox.emptyFilteredTitle': 'Không có cuộc trò chuyện nào khớp',
    'inbox.noZaloAccount': 'Chưa kết nối Zalo',
  };
  const t = (key, params = {}) => (DICT[key] ?? key).replace(/\{(\w+)\}/g, (_, p) => params[p] ?? `{${p}}`);
  return { useI18n: () => ({ t, locale: 'vi' }) };
});

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => {
    const state = { user: { id: 7 }, activeContext: auth.activeContext };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('../../../features/inbox/MessageThread', () => ({ default: () => <div /> }));
vi.mock('../../../features/inbox/ReplyInput', () => ({ default: () => <div /> }));
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
    markAllAsRead: vi.fn(),
    getInboxChannels: vi.fn(),
    syncZaloAll: vi.fn(),
  },
}));

vi.mock('../../../hooks/useInboxSSE', () => ({ default: () => ({ status: 'connected', retry: vi.fn() }) }));
vi.mock('../../../hooks/useDesktopNotifications', () => ({
  default: () => ({ isEnabled: false, toggleNotifications: vi.fn(), showNotification: vi.fn() }),
}));
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.hash}`}</div>;
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/app/settings/inbox']}>
    <Routes>
      <Route path="/app/settings/inbox" element={<InboxOutboxPage />} />
      <Route path="/app/settings/channels" element={<LocationProbe />} />
      <Route path="/app/chatbot-studio" element={<LocationProbe />} />
    </Routes>
  </MemoryRouter>
);

const withChannels = (channels) => chatbotApi.getInboxChannels.mockResolvedValue({ success: true, data: { channels } });
const employee = (permissions) => { auth.activeContext = { type: 'employee', ownerId: 99, permissions }; };

/** Đợi tới khi danh sách kênh đã nạp xong (tab kênh chưa nối được đánh dấu) rồi bấm tab kênh. */
const openChannelTab = async (shortLabel, markedTitle) => {
  await screen.findByTitle(markedTitle);
  fireEvent.click(screen.getByText(shortLabel));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.activeContext = { type: 'self', ownerId: 7 };
  chatbotApi.getConversations.mockResolvedValue({ success: true, data: { conversations: [], total: 0 } });
  chatbotApi.getUnreadCount.mockResolvedValue({ success: true, data: { total: 0 } });
  chatbotApi.getContactAlerts.mockResolvedValue({ data: { success: true, data: { openCount: 0 } } });
  chatbotApi.getZaloSyncStatus.mockResolvedValue({ data: { success: true, data: { connected: false, accounts: [] } } });
  chatbotApi.getMessages.mockResolvedValue({ success: true, data: [], hasMore: false });
  withChannels(['web', 'zalo_personal']);
});

describe('kênh chưa nối — lời mời kết nối thay cho danh sách rỗng', () => {
  it('chủ chọn Telegram khi chưa nối → "Chưa kết nối Telegram" + hint + nút → Cài đặt kênh, tab Telegram', async () => {
    renderPage();
    await openChannelTab('TG', 'Telegram — Chưa kết nối');

    expect(await screen.findByText('Chưa kết nối Telegram')).toBeInTheDocument();
    expect(screen.getByText('Kết nối Telegram ở Cài đặt kênh để nhận và trả lời tin nhắn ngay tại đây.')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có cuộc trò chuyện nào')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kết nối Telegram' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/app/settings/channels#telegram');
  });

  it('WhatsApp chưa nối → nút "Kết nối WhatsApp" dẫn tới tab WhatsApp', async () => {
    renderPage();
    await openChannelTab('WA', 'WhatsApp — Chưa kết nối');

    expect(await screen.findByText('Chưa kết nối WhatsApp')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối WhatsApp' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/app/settings/channels#whatsapp');
  });

  it('Web chat chưa có widget → hint riêng + nút "Mở Chatbot của tôi" → /app/chatbot-studio (không phải Cài đặt kênh)', async () => {
    withChannels(['telegram']);
    renderPage();
    await openChannelTab('Web chat', 'Web Chat — Chưa kết nối');

    expect(await screen.findByText('Chưa kết nối Web Chat')).toBeInTheDocument();
    expect(screen.getByText('Tạo chatbot và lấy mã nhúng ở Chatbot của tôi để khách nhắn từ website.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở Chatbot của tôi' }));
    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/app\/chatbot-studio$/);
  });

  it('kênh ĐÃ nối nhưng 0 hội thoại → giữ giọng cũ (chọn kênh = đang lọc → "không khớp"), không mời kết nối', async () => {
    withChannels(['telegram']);
    renderPage();
    await openChannelTab('Web chat', 'Web Chat — Chưa kết nối');
    fireEvent.click(screen.getByText('TG'));

    expect(await screen.findByText('Không có cuộc trò chuyện nào khớp')).toBeInTheDocument();
    expect(screen.queryByText(/Chưa kết nối Telegram/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kết nối/ })).not.toBeInTheDocument();
  });

  it('đang ở "Tất cả" (không chọn kênh) → giọng cũ, không lời mời kết nối', async () => {
    renderPage();
    await screen.findByTitle('Telegram — Chưa kết nối');

    expect(await screen.findByText('Chưa có cuộc trò chuyện nào')).toBeInTheDocument();
    expect(screen.queryByText(/Chưa kết nối (Telegram|WhatsApp)/)).not.toBeInTheDocument();
  });
});

describe('chưa biết kênh nào đã nối → không nói "Chưa kết nối"', () => {
  it('danh sách kênh chưa về → chọn Telegram vẫn là giọng cũ, tab không có chấm', async () => {
    chatbotApi.getInboxChannels.mockReturnValue(new Promise(() => {}));
    renderPage();

    fireEvent.click(await screen.findByText('TG'));

    expect(await screen.findByText('Không có cuộc trò chuyện nào khớp')).toBeInTheDocument();
    expect(screen.queryByText('Chưa kết nối Telegram')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết nối Telegram' })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Chưa kết nối/)).not.toBeInTheDocument();
  });

  it('tải danh sách kênh LỖI → cũng không khẳng định "Chưa kết nối" (lỗi mạng ≠ chưa nối)', async () => {
    chatbotApi.getInboxChannels.mockRejectedValue(new Error('500'));
    renderPage();
    await waitFor(() => expect(chatbotApi.getInboxChannels).toHaveBeenCalled());

    fireEvent.click(await screen.findByText('TG'));

    expect(await screen.findByText('Không có cuộc trò chuyện nào khớp')).toBeInTheDocument();
    expect(screen.queryByText('Chưa kết nối Telegram')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Chưa kết nối/)).not.toBeInTheDocument();
  });
});

describe('nhân viên', () => {
  it('không có quyền kết nối kênh → title + hint cho nhân viên, KHÔNG có nút', async () => {
    employee({ inbox_view: true });
    renderPage();
    await openChannelTab('TG', 'Telegram — Chưa kết nối');

    expect(await screen.findByText('Chưa kết nối Telegram')).toBeInTheDocument();
    expect(screen.getByText('Chủ tài khoản chưa kết nối kênh này hoặc chưa giao cho bạn.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kết nối/ })).not.toBeInTheDocument();
  });

  it('có chatbot_channels_manage nhưng KHÔNG có chatbots_manage → WhatsApp có nút, Web chat không (trang đích chặn quyền)', async () => {
    employee({ inbox_view: true, chatbot_channels_manage: true });
    withChannels([]);
    renderPage();
    await screen.findByTitle('WhatsApp — Chưa kết nối');

    fireEvent.click(screen.getByText('WA'));
    expect(await screen.findByRole('button', { name: 'Kết nối WhatsApp' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Web chat'));
    expect(await screen.findByText('Chưa kết nối Web Chat')).toBeInTheDocument();
    expect(screen.getByText('Chủ tài khoản chưa kết nối kênh này hoặc chưa giao cho bạn.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở Chatbot của tôi' })).not.toBeInTheDocument();
  });

  it('có chatbots_manage → Web chat có nút "Mở Chatbot của tôi"', async () => {
    employee({ inbox_view: true, chatbots_manage: true });
    withChannels([]);
    renderPage();
    await openChannelTab('Web chat', 'Web Chat — Chưa kết nối');

    expect(await screen.findByRole('button', { name: 'Mở Chatbot của tôi' })).toBeInTheDocument();
  });
});

describe('luật một nút ở tab Zalo', () => {
  it('chưa có tài khoản Zalo nào → chỉ MỘT nút kết nối (của ô chọn tài khoản), trạng thái rỗng chỉ có chữ', async () => {
    withChannels(['web']);
    renderPage();
    await openChannelTab('Zalo', 'Zalo Cá nhân — Chưa kết nối');

    expect(await screen.findByText('Chưa kết nối Zalo Cá nhân')).toBeInTheDocument();
    expect(screen.getByText('Kết nối Zalo Cá nhân ở Cài đặt kênh để nhận và trả lời tin nhắn ngay tại đây.')).toBeInTheDocument();
    // nút duy nhất là CTA của ZaloAccountSelector ("Chưa kết nối Zalo"), hiện sau khi nạp xong trạng thái tài khoản
    expect(await screen.findByRole('button', { name: 'Chưa kết nối Zalo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết nối Zalo Cá nhân' })).not.toBeInTheDocument();
    const connectButtons = screen.getAllByRole('button').filter((b) => /kết nối/i.test(b.textContent));
    expect(connectButtons).toHaveLength(1);
  });

  it('đã có tài khoản Zalo (ô chọn không vẽ nút) mà kênh vẫn chưa tính là nối → nút ở trạng thái rỗng là đường duy nhất, tới tab Zalo', async () => {
    withChannels(['web']);
    chatbotApi.getZaloSyncStatus.mockResolvedValue({
      data: { success: true, data: { connected: false, accounts: [{ id: 45, displayName: 'Cũ', isConnected: false }] } },
    });
    renderPage();
    await openChannelTab('Zalo', 'Zalo Cá nhân — Chưa kết nối');

    fireEvent.click(await screen.findByRole('button', { name: 'Kết nối Zalo Cá nhân' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/app/settings/channels#zalo');
  });

  it('nhân viên không quyền ở tab Zalo chưa nối → không có nút nào kết nối', async () => {
    employee({ inbox_view: true });
    withChannels(['web']);
    renderPage();
    await openChannelTab('Zalo', 'Zalo Cá nhân — Chưa kết nối');

    expect(await screen.findByText('Chủ tài khoản chưa kết nối kênh này hoặc chưa giao cho bạn.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kết nối/ })).not.toBeInTheDocument();
  });
});
