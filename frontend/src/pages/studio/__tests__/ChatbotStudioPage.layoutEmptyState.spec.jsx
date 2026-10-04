/**
 * 04/10/2026 — Khung giữa và bố cục của màn Studio (phần b báo cáo rà soát):
 *  - S-02: <1024px có đường mở hộp Cấu hình (PlaygroundHeader vẽ ở mọi cỡ màn hình); tab di động thứ ba đổi tên "Triển khai".
 *  - S-06: khung trống hiện lời chào của bot, câu hỏi gợi ý, dải "chưa có tài liệu" + nút "Thêm tài liệu" (mở Cấu hình ở
 *          mục Kiến thức), nút "Cuộc trò chuyện mới" luôn hiện.
 *  - C2 (quyết định 04/10): giữ trừ credit chat thử và GHI RÕ dưới ô nhập; gói không giới hạn credit thì không hứa "1 credit".
 *  - S-19: 1024–1279px cột Triển khai thành ngăn kéo mở bằng nút "Triển khai"; từ 1280px là cột cố định.
 *  - S-20: chưa chọn bot → câu hướng dẫn, không còn "Chào bạn, tôi có thể giúp gì?".
 *  - S-29: "Cuộc trò chuyện gần đây" có "Xem thêm" khi quá 5 phiên.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ChatbotStudioPage from '../ChatbotStudioPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';
import { useAuthStore } from '../../../stores/authStore';

const media = { compact: false, large: true, wide: true };
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: (query) => {
    if (query.includes('max-width: 1023')) return media.compact;
    if (query.includes('min-width: 1280')) return media.wide;
    if (query.includes('min-width: 1024')) return media.large;
    return false;
  },
}));

const BOT = {
  id: 7,
  name: 'Bot A',
  replies_enabled: true,
  document_count: 0,
  greeting_msg: 'Chào bạn, mình là trợ lý của shop!',
  suggested_questions: ['Giá bao nhiêu?', 'Có giao hàng không?'],
};

vi.mock('../ChatListSidebar', () => ({
  default: ({ onSelectBot }) => (
    <button onClick={() => onSelectBot(globalThis.__studioBot)}>chon-bot</button>
  ),
}));
vi.mock('../RightPanel', () => ({ default: () => <div data-testid="right-panel">cot-trien-khai</div> }));
vi.mock('../WidgetSettingsModal', () => ({ default: () => null }));
vi.mock('../ChatbotConfigModal', () => ({
  default: ({ open, initialSection }) => (open ? <div data-testid="config-modal">{`config:${initialSection || 'none'}`}</div> : null),
}));
vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getChatbotStudioConversations: vi.fn(),
    getChatbotStudioMessages: vi.fn(),
    createChatbotStudioConversation: vi.fn(),
    addChatbotStudioMessage: vi.fn(),
    deleteChatbotStudioConversation: vi.fn(),
    sendCustomChat: vi.fn(),
  },
}));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({}) }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const conv = (i) => ({ id: i, title: `Phiên ${i}`, last_message: `Tin cuối ${i}` });

function setup({ bot = BOT, conversations = [], aiCreditLimit = null, wide = true, compact = false } = {}) {
  media.wide = wide;
  media.large = !compact;
  media.compact = compact;
  globalThis.__studioBot = bot;
  Element.prototype.scrollIntoView = vi.fn();
  useAuthStore.setState({
    user: { id: 1 },
    activeContext: { type: 'self' },
    aiCredits: { used: 0, limit: aiCreditLimit },
  });
  chatbotApi.getChatbotStudioConversations.mockResolvedValue({ data: { data: { items: conversations } } });
  const view = render(<ChatbotStudioPage />);
  fireEvent.click(screen.getByText('chon-bot'));
  return view;
}

describe('ChatbotStudioPage — chưa chọn bot (S-20)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hiện câu hướng dẫn, KHÔNG còn "Chào bạn, tôi có thể giúp gì?" và không có chip gợi ý chết', () => {
    media.wide = true; media.large = true; media.compact = false;
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' } });
    render(<ChatbotStudioPage />);

    expect(screen.getByText('Chọn một chatbot bên trái để chat thử, hoặc bấm Chatbot mới.')).toBeTruthy();
    expect(screen.queryByText(/tôi có thể giúp gì/)).toBeNull();
  });
});

describe('ChatbotStudioPage — khung chat trống (S-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hiện lời chào của bot trong bong bóng và các chip câu hỏi gợi ý; bấm chip điền vào ô nhập', async () => {
    setup();

    expect((await screen.findByTestId('welcome-bubble')).textContent).toBe('Chào bạn, mình là trợ lý của shop!');
    fireEvent.click(screen.getByText('Giá bao nhiêu?'));
    expect(screen.getByPlaceholderText('Nhập tin nhắn...').value).toBe('Giá bao nhiêu?');
  });

  it('bot không có lời chào riêng → lời chào mặc định', async () => {
    setup({ bot: { ...BOT, greeting_msg: '', welcome_message: '' } });
    expect((await screen.findByTestId('welcome-bubble')).textContent).toBe('Xin chào! Tôi có thể giúp gì cho bạn?');
  });

  it('0 tài liệu → dải "Chatbot chưa có tài liệu…" kèm nút "Thêm tài liệu" mở Cấu hình ở mục Kiến thức', async () => {
    setup();

    expect((await screen.findByTestId('no-documents-strip')).textContent).toContain('Chatbot chưa có tài liệu nên sẽ trả lời chung chung.');
    fireEvent.click(screen.getByText('Thêm tài liệu'));
    expect((await screen.findByTestId('config-modal')).textContent).toBe('config:knowledge');
  });

  it('có tài liệu → không hiện dải cảnh báo', async () => {
    setup({ bot: { ...BOT, document_count: 3 } });
    await screen.findByTestId('welcome-bubble');
    expect(screen.queryByTestId('no-documents-strip')).toBeNull();
  });

  it('vừa thêm tài liệu (studio:knowledge-changed) → dải tự biến mất, không cần F5', async () => {
    setup();
    await screen.findByTestId('no-documents-strip');

    document.dispatchEvent(new CustomEvent('studio:knowledge-changed', { detail: { chatbotId: 7, count: 1, errorCount: 0 } }));

    await waitFor(() => expect(screen.queryByTestId('no-documents-strip')).toBeNull());
  });
});

describe('ChatbotStudioPage — Cuộc trò chuyện mới (S-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sau khi đã nhắn vẫn có nút "Cuộc trò chuyện mới"; bấm → khung trống lại, KHÔNG tạo phiên rỗng trong DB', async () => {
    setup();
    chatbotApi.sendCustomChat.mockResolvedValue({ data: { content: 'Dạ vâng' } });
    chatbotApi.createChatbotStudioConversation.mockResolvedValue({ data: { data: { id: 900 } } });
    chatbotApi.addChatbotStudioMessage.mockResolvedValue({ data: {} });

    const box = await screen.findByPlaceholderText('Nhập tin nhắn...');
    fireEvent.change(box, { target: { value: 'Alo' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText('Dạ vâng')).toBeTruthy();
    // Đã có tin nhắn → lời chào/chip biến mất.
    expect(screen.queryByTestId('welcome-bubble')).toBeNull();
    chatbotApi.createChatbotStudioConversation.mockClear();

    fireEvent.click(screen.getByTitle('Bắt đầu một cuộc trò chuyện thử mới'));

    expect(await screen.findByTestId('welcome-bubble')).toBeTruthy();
    expect(screen.queryByText('Dạ vâng')).toBeNull();
    expect(chatbotApi.createChatbotStudioConversation).not.toHaveBeenCalled();
  });
});

describe('ChatbotStudioPage — ghi chú credit dưới ô nhập (C2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gói có hạn mức credit → "Chat thử dùng 1 credit mỗi câu trả lời và không áp dụng khung giờ hay giới hạn lượt."', async () => {
    setup({ aiCreditLimit: 3000 });
    expect((await screen.findByTestId('test-chat-note')).textContent)
      .toBe('Chat thử dùng 1 credit mỗi câu trả lời và không áp dụng khung giờ hay giới hạn lượt.');
  });

  it('gói không giới hạn / không tính credit (limit null) → KHÔNG hứa "1 credit", chỉ nói điều luôn đúng', async () => {
    setup({ aiCreditLimit: null });
    const note = (await screen.findByTestId('test-chat-note')).textContent;
    expect(note).toBe('Chat thử không áp dụng khung giờ hay giới hạn lượt.');
    expect(note).not.toMatch(/credit/);
  });

  it('nhân viên không chat thử được → không có ghi chú credit (không có ô nhập)', async () => {
    media.wide = true; media.large = true; media.compact = false;
    globalThis.__studioBot = BOT;
    useAuthStore.setState({
      user: { id: 8 },
      activeContext: { type: 'employee', ownerId: 42, permissions: { chatbots_manage: true } },
      aiCredits: { used: 0, limit: 3000 },
    });
    chatbotApi.getChatbotStudioConversations.mockResolvedValue({ data: { data: { items: [] } } });
    render(<ChatbotStudioPage />);
    fireEvent.click(screen.getByText('chon-bot'));

    await screen.findByText('Chỉ chủ tài khoản chat thử được. Bạn vẫn sửa được cấu hình và tài liệu.');
    expect(screen.queryByTestId('test-chat-note')).toBeNull();
  });
});

describe('ChatbotStudioPage — Cuộc trò chuyện gần đây (S-29)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('quá 5 phiên → chỉ hiện 5 + nút "Xem thêm N cuộc"; bấm → hiện đủ; "Thu gọn" → về 5', async () => {
    setup({ conversations: Array.from({ length: 8 }, (_, i) => conv(i + 1)) });

    await screen.findByText('Phiên 1');
    expect(screen.queryByText('Phiên 6')).toBeNull();
    fireEvent.click(screen.getByText('Xem thêm 3 cuộc'));
    expect(screen.getByText('Phiên 8')).toBeTruthy();
    fireEvent.click(screen.getByText('Thu gọn'));
    expect(screen.queryByText('Phiên 6')).toBeNull();
  });

  it('đúng 5 phiên → không có nút "Xem thêm"', async () => {
    setup({ conversations: Array.from({ length: 5 }, (_, i) => conv(i + 1)) });
    await screen.findByText('Phiên 5');
    expect(screen.queryByText(/Xem thêm/)).toBeNull();
  });
});

describe('ChatbotStudioPage — điện thoại / máy tính bảng (S-02)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('<1024px: panel chat có tên bot, trạng thái và nút "Cấu hình" mở hộp Cấu hình; tab thứ ba tên "Triển khai"', async () => {
    setup({ compact: true, wide: false });

    expect(await screen.findByText('Bot A')).toBeTruthy();
    expect(screen.getByTestId('bot-status-badge').textContent).toBe('Đang bật trả lời');
    fireEvent.click(screen.getByTitle('Mở cấu hình chatbot'));
    expect((await screen.findByTestId('config-modal')).textContent).toBe('config:none');

    // Thanh tab di động: Danh sách / Trò chuyện / Triển khai (không còn tab "Cấu hình" mở nhầm cột Triển khai).
    expect(screen.getByRole('button', { name: /Danh sách/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Trò chuyện/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Triển khai/ })).toBeTruthy();
    // Chữ "Cấu hình" chỉ còn ở nút trong đầu khung chat (1 chỗ), không còn ở thanh tab.
    expect(screen.getAllByText('Cấu hình')).toHaveLength(1);
  });
});

describe('ChatbotStudioPage — laptop nhỏ 1024–1279px (S-19)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('không vẽ cột Triển khai cố định; nút "Triển khai" mở ngăn kéo, bấm nền đóng lại', async () => {
    setup({ wide: false });

    await screen.findByTestId('welcome-bubble');
    expect(screen.queryByTestId('right-panel')).toBeNull();

    fireEvent.click(screen.getByTitle('Triển khai'));
    expect(within(screen.getByTestId('deploy-drawer')).getByTestId('right-panel')).toBeTruthy();

    fireEvent.click(screen.getByTestId('deploy-drawer-backdrop'));
    expect(screen.queryByTestId('deploy-drawer')).toBeNull();
  });

  it('từ 1280px: cột Triển khai cố định, không có nút ngăn kéo', async () => {
    setup({ wide: true });

    await screen.findByTestId('welcome-bubble');
    expect(screen.getByTestId('right-panel')).toBeTruthy();
    expect(screen.queryByTestId('deploy-drawer')).toBeNull();
    expect(screen.queryByTitle('Triển khai')).toBeNull();
  });
});
