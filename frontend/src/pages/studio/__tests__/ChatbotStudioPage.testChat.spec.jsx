/**
 * 04/10/2026 — Chat thử trong Studio (S-28, S-15):
 *  - S-28: AI lỗi thì KHÔNG để lại gì trong DB (bản cũ lưu tin người dùng + tạo phiên TRƯỚC khi gọi AI: tin biến khỏi
 *          màn nhưng còn trong DB, phiên nằm lại rỗng — production có 11/84 phiên chat thử rỗng). Chỉ lưu SAU khi AI
 *          trả lời. AI lỗi → tin bị gỡ khỏi màn và chữ được trả lại ô nhập để gửi lại.
 *  - S-15: nhân viên không chat thử được (route requireSelfContext) → câu nói rõ "chỉ chủ tài khoản", không nhắc
 *          "chủ workspace chưa cấp quyền".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import ChatbotStudioPage from '../ChatbotStudioPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../ChatListSidebar', () => ({
  default: ({ onSelectBot }) => (
    <button onClick={() => onSelectBot({ id: 7, name: 'Bot A', replies_enabled: true })}>chon-bot</button>
  ),
}));
vi.mock('../PlaygroundHeader', () => ({ default: () => null }));
vi.mock('../RightPanel', () => ({ default: () => null }));
vi.mock('../WidgetSettingsModal', () => ({ default: () => null }));
vi.mock('../ChatbotConfigModal', () => ({ default: () => null }));
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
vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const inputBox = () => screen.getByPlaceholderText('Nhập tin nhắn...');

async function openChat() {
  render(<ChatbotStudioPage />);
  fireEvent.click(screen.getByText('chon-bot'));
  await waitFor(() => expect(chatbotApi.getChatbotStudioConversations).toHaveBeenCalled());
  return inputBox();
}

function send(text) {
  const box = inputBox();
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: false });
}

describe('ChatbotStudioPage — chat thử chỉ lưu sau khi AI trả lời (S-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' } });
    chatbotApi.getChatbotStudioConversations.mockResolvedValue({ data: { data: { items: [] } } });
    chatbotApi.createChatbotStudioConversation.mockResolvedValue({ data: { data: { id: 500, title: 'Mới' } } });
    chatbotApi.addChatbotStudioMessage.mockResolvedValue({ data: { success: true } });
    chatbotApi.deleteChatbotStudioConversation.mockResolvedValue({});
  });

  it('AI trả lời → gọi AI TRƯỚC, rồi mới tạo phiên và lưu tin người dùng rồi tin trả lời; câu trả lời hiện trên màn', async () => {
    chatbotApi.sendCustomChat.mockResolvedValue({ data: { content: 'Dạ giá là 500.000đ ạ' } });
    await openChat();

    send('Giá bao nhiêu?');

    expect(await screen.findByText('Dạ giá là 500.000đ ạ')).toBeTruthy();
    expect(screen.getByText('Giá bao nhiêu?')).toBeTruthy();

    const order = (fn) => fn.mock.invocationCallOrder[0];
    expect(order(chatbotApi.sendCustomChat)).toBeLessThan(order(chatbotApi.createChatbotStudioConversation));
    expect(order(chatbotApi.createChatbotStudioConversation)).toBeLessThan(order(chatbotApi.addChatbotStudioMessage));

    const saved = chatbotApi.addChatbotStudioMessage.mock.calls.map((c) => [c[0], c[1].role, c[1].content]);
    expect(saved).toEqual([
      [500, 'user', 'Giá bao nhiêu?'],
      [500, 'assistant', 'Dạ giá là 500.000đ ạ'],
    ]);
  });

  it('AI lỗi → KHÔNG tạo phiên, KHÔNG lưu tin nào; tin bị gỡ khỏi màn, chữ trả lại ô nhập để gửi lại', async () => {
    chatbotApi.sendCustomChat.mockRejectedValue({ response: { data: { message: 'AI đang quá tải' } } });
    await openChat();

    send('Cho mình xin bảng giá');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('AI đang quá tải'));
    expect(chatbotApi.createChatbotStudioConversation).not.toHaveBeenCalled();
    expect(chatbotApi.addChatbotStudioMessage).not.toHaveBeenCalled();
    expect(chatbotApi.deleteChatbotStudioConversation).not.toHaveBeenCalled();
    // Tin không còn trên màn (chỉ còn trong ô nhập).
    expect(screen.queryByText('Cho mình xin bảng giá', { selector: 'p, p *' })).toBeNull();
    await waitFor(() => expect(inputBox().value).toBe('Cho mình xin bảng giá'));
  });

  it('AI trả về không có nội dung (chỉ có message lỗi) → coi là lỗi: không lưu gì, báo đúng câu', async () => {
    chatbotApi.sendCustomChat.mockResolvedValue({ data: { message: 'Hết hạn mức AI' } });
    await openChat();

    send('Xin chào');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Hết hạn mức AI'));
    expect(chatbotApi.createChatbotStudioConversation).not.toHaveBeenCalled();
    expect(chatbotApi.addChatbotStudioMessage).not.toHaveBeenCalled();
  });

  it('AI trả lời nhưng lưu phiên lỗi → câu trả lời VẪN hiện (đã tính credit), chỉ báo chưa lưu được lịch sử', async () => {
    chatbotApi.sendCustomChat.mockResolvedValue({ data: { content: 'Dạ vâng ạ' } });
    chatbotApi.createChatbotStudioConversation.mockRejectedValue(new Error('db down'));
    await openChat();

    send('Alo');

    expect(await screen.findByText('Dạ vâng ạ')).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith('Chưa lưu được cuộc trò chuyện này vào lịch sử.');
  });
});

describe('ChatbotStudioPage — nhân viên không chat thử được (S-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    useAuthStore.setState({ user: { id: 8 }, activeContext: { type: 'employee', ownerId: 42, permissions: { chatbots_manage: true } } });
    chatbotApi.getChatbotStudioConversations.mockResolvedValue({ data: { data: { items: [] } } });
  });

  it('hiện câu "Chỉ chủ tài khoản chat thử được…" (không còn "Chủ workspace chưa cấp quyền"), không có ô nhập', async () => {
    render(<ChatbotStudioPage />);
    fireEvent.click(screen.getByText('chon-bot'));

    expect(await screen.findByText('Chỉ chủ tài khoản chat thử được. Bạn vẫn sửa được cấu hình và tài liệu.')).toBeTruthy();
    expect(screen.queryByText(/workspace/i)).toBeNull();
    expect(screen.queryByPlaceholderText('Nhập tin nhắn...')).toBeNull();
  });
});
