/**
 * TiktokConversationList.spec.jsx
 *
 * Test component cha (group conversations theo tiktok_business_account).
 * Pattern copy từ các spec khác trong features/inbox/__tests__/.
 *
 * Truyền accounts/conversations qua prop (override) để không gọi API thật.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../../i18n';

const setConversationAiPausedMock = vi.fn();

vi.mock('../../chatbot/services/chatbotApi.service', () => ({
  default: {
    setConversationAiPaused: (...args) => setConversationAiPausedMock(...args),
  },
}));

const importComponent = () =>
  import('../TiktokConversationList.jsx').then((m) => m.default);

const renderList = async (props = {}) => {
  const TiktokConversationList = await importComponent();
  return render(
    <I18nProvider>
      <TiktokConversationList {...props} />
    </I18nProvider>
  );
};

const fakeAccount = (overrides = {}) => ({
  id: 1,
  business_id: 'biz_abc',
  display_name: 'My Shop',
  region: 'APAC',
  is_active: true,
  ...overrides,
});

const fakeConv = (overrides = {}) => ({
  id: 10,
  channel: 'tiktok_business',
  external_channel_id: 1, // trùng account.id
  visitorName: 'Alice',
  lastMessage: 'Hello!',
  lastMessageAt: new Date(Date.now() - 60000).toISOString(),
  aiPaused: false,
  unread: true,
  ...overrides,
});

describe('TiktokConversationList — empty / loading', () => {
  beforeEach(() => {
    setConversationAiPausedMock.mockReset();
  });

  it('Loading ban đầu (khi gọi API)', async () => {
    // Không truyền accounts → component sẽ gọi listAccounts thật (chưa mock)
    // → fallback loading
    await renderList();
    // Nếu listAccounts fail, sẽ ở error. Nếu truyền rỗng → loading rồi empty.
  });

  it('Truyền accounts=[] rỗng → empty state "Chưa có tài khoản"', async () => {
    await renderList({ accounts: [] });
    expect(await screen.findByTestId('tiktok-inbox-empty')).toBeInTheDocument();
    expect(screen.getByText(/Chưa có tài khoản TikTok/)).toBeInTheDocument();
  });
});

describe('TiktokConversationList — render', () => {
  beforeEach(() => {
    setConversationAiPausedMock.mockReset();
  });

  it('Hiển thị 2 account trong sidebar', async () => {
    const accounts = [
      fakeAccount({ id: 1, display_name: 'Shop A' }),
      fakeAccount({ id: 2, display_name: 'Shop B' }),
    ];
    await renderList({ accounts });
    expect(await screen.findByTestId('tiktok-channel-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('tiktok-channel-card-2')).toBeInTheDocument();
  });

  it('Chỉ filter conversation thuộc account đang chọn', async () => {
    const accounts = [fakeAccount({ id: 1 }), fakeAccount({ id: 2, business_id: 'biz_xyz', display_name: 'Shop 2' })];
    const conversations = [
      fakeConv({ id: 10, external_channel_id: 1, visitorName: 'Alice' }),
      fakeConv({ id: 20, external_channel_id: 2, visitorName: 'Bob' }),
    ];
    await renderList({ accounts, conversations });
    // Mặc định chọn account 1 → chỉ thấy Alice
    expect(await screen.findByTestId('tiktok-conv-row-10')).toBeInTheDocument();
    expect(screen.queryByTestId('tiktok-conv-row-20')).not.toBeInTheDocument();
  });

  it('Click account 2 → chuyển sang conversation của Bob', async () => {
    const user = userEvent.setup();
    const accounts = [fakeAccount({ id: 1 }), fakeAccount({ id: 2 })];
    const conversations = [
      fakeConv({ id: 10, external_channel_id: 1 }),
      fakeConv({ id: 20, external_channel_id: 2, visitorName: 'Bob' }),
    ];
    await renderList({ accounts, conversations });
    await user.click(await screen.findByTestId('tiktok-channel-card-2'));
    await waitFor(() => {
      expect(screen.getByTestId('tiktok-conv-row-20')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('tiktok-conv-row-10')).not.toBeInTheDocument();
  });

  it('Account không có conversation → "Chưa có hội thoại nào"', async () => {
    const accounts = [fakeAccount({ id: 1 })];
    const conversations = []; // không có conv nào
    await renderList({ accounts, conversations });
    expect(await screen.findByTestId('tiktok-inbox-conv-empty')).toBeInTheDocument();
  });
});

describe('TiktokConversationList — toggle AI', () => {
  beforeEach(() => {
    setConversationAiPausedMock.mockReset();
  });

  it('Chọn conversation → hiển thị nút "Tạm dừng AI"', async () => {
    const accounts = [fakeAccount({ id: 1 })];
    const conversations = [fakeConv({ id: 10, aiPaused: false })];
    await renderList({ accounts, conversations });
    // Click conversation trước
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('tiktok-conv-row-10'));
    expect(await screen.findByTestId('tiktok-inbox-toggle-ai')).toBeInTheDocument();
  });

  it('Click "Tạm dừng AI" → gọi setConversationAiPaused(id, "tiktok_business", true)', async () => {
    setConversationAiPausedMock.mockResolvedValueOnce({ data: { success: true } });
    const user = userEvent.setup();
    const accounts = [fakeAccount({ id: 1 })];
    const conversations = [fakeConv({ id: 10, aiPaused: false })];
    await renderList({ accounts, conversations });
    await user.click(await screen.findByTestId('tiktok-conv-row-10'));
    await user.click(await screen.findByTestId('tiktok-inbox-toggle-ai'));
    await waitFor(() => {
      expect(setConversationAiPausedMock).toHaveBeenCalledWith(10, 'tiktok_business', true);
    });
  });

  it('Conversation đã paused → button đổi thành "Bật AI"', async () => {
    const accounts = [fakeAccount({ id: 1 })];
    const conversations = [fakeConv({ id: 10, aiPaused: true })];
    await renderList({ accounts, conversations });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('tiktok-conv-row-10'));
    const btn = await screen.findByTestId('tiktok-inbox-toggle-ai');
    expect(btn).toHaveTextContent(/Bật AI/);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
