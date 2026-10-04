/**
 * H-02 (PLAN_WEBCHAT_NHAN_TIN_TRA_LOI_TAY_2026-10-04) — trang /chat/:chatbotId (iFrame + Public Link) nhận tin NHÂN VIÊN
 * TRẢ LỜI TAY: khách đã nhắn thì hỏi mỗi 8 giây, tin hiện như bong bóng bot kèm nhãn "Nhân viên", không hiện trùng.
 * sessionId phiên mới sinh bằng crypto. Hook usePublicAgentMessages có spec riêng (nhịp/lỗi/tab ẩn); ở đây chốt phần ghép vào trang.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicChatbotPage from '../PublicChatbotPage';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getPublicChatbot: vi.fn(),
    sendPublicChatbotMessage: vi.fn(),
    uploadPublicChatAttachment: vi.fn(),
    deletePublicChatAttachment: vi.fn(),
    getPublicAgentMessages: vi.fn(),
  },
}));

const bot = { id: 5, name: 'Bot Cong Khai', welcome_message: 'Chao ban', show_avatar: true, suggested_questions: [] };
const agent = (id, content, attachments = []) => ({
  id: String(id), role: 'agent', content, attachments, createdAt: '2026-10-04T03:00:00.000Z',
});
const pollOk = (messages = [], hasMore = false) => ({ data: { success: true, data: { messages, hasMore } } });

function renderPage() {
  chatbotApi.getPublicChatbot.mockResolvedValue({ data: { success: true, data: bot } });
  return render(
    <MemoryRouter initialEntries={['/chat/5']}>
      <Routes>
        <Route path="/chat/:chatbotId" element={<PublicChatbotPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const flush = (ms = 1) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function visitorSends(text) {
  const input = screen.getByPlaceholderText('Nhập tin nhắn...');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
  await flush(1);
}

const sessionOf = () => localStorage.getItem('uknow_session_5');

describe('PublicChatbotPage — tin nhân viên trả lời tay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    chatbotApi.sendPublicChatbotMessage.mockResolvedValue({
      data: { success: true, data: { role: 'assistant', content: 'Dạ em chào anh' } },
    });
    chatbotApi.getPublicAgentMessages.mockResolvedValue(pollOk());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('phiên MỚI: sess_ + 32 hex từ crypto (không còn Date.now + Math.random); phiên cũ trong storage giữ nguyên', async () => {
    const random = vi.spyOn(Math, 'random');
    renderPage();
    await screen.findByText('Chao ban');
    expect(sessionOf()).toMatch(/^sess_[0-9a-f]{32}$/);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('phiên cũ trong storage được dùng lại nguyên vẹn', async () => {
    localStorage.setItem('uknow_session_5', 'sess_1790000000000_k3j9x0q2a');
    renderPage();
    await screen.findByText('Chao ban');
    expect(sessionOf()).toBe('sess_1790000000000_k3j9x0q2a');
  });

  it('khách chưa nhắn tin nào: không hỏi tin mới (chưa có hội thoại)', async () => {
    renderPage();
    await screen.findByText('Chao ban');
    vi.useFakeTimers();
    await flush(60000);
    expect(chatbotApi.getPublicAgentMessages).not.toHaveBeenCalled();
  });

  it('khách nhắn tin → hỏi đúng chatbot + sessionId; tin nhân viên hiện kèm nhãn "Nhân viên", không đúp ở lượt sau', async () => {
    renderPage();
    await screen.findByText('Chao ban');
    vi.useFakeTimers();

    await visitorSends('Cho mình hỏi giá');
    expect(screen.getByText('Dạ em chào anh')).toBeInTheDocument();
    expect(chatbotApi.getPublicAgentMessages).toHaveBeenCalledTimes(1); // hỏi ngay khi hội thoại được tạo
    const [calledId, query] = chatbotApi.getPublicAgentMessages.mock.calls[0];
    expect(calledId).toBe('5');
    expect(query).toEqual({ sessionId: sessionOf(), afterId: '0' });

    chatbotApi.getPublicAgentMessages.mockResolvedValue(pollOk([agent(41, 'Em là nhân viên, em báo giá ưu đãi ạ')]));
    await flush(8100);
    expect(screen.getByText('Em là nhân viên, em báo giá ưu đãi ạ')).toBeInTheDocument();
    expect(screen.getAllByTestId('agent-label')).toHaveLength(1);
    expect(screen.getByTestId('agent-label')).toHaveTextContent('Nhân viên');

    // Lượt sau: server trả lại cùng tin 41 + tin mới 42 → chỉ thêm 42.
    chatbotApi.getPublicAgentMessages.mockResolvedValue(pollOk([
      agent(41, 'Em là nhân viên, em báo giá ưu đãi ạ'),
      agent(42, 'Anh để lại số em gọi nhé'),
    ]));
    await flush(8100);
    expect(chatbotApi.getPublicAgentMessages.mock.calls.at(-1)[1].afterId).toBe('41');
    expect(screen.getAllByText('Em là nhân viên, em báo giá ưu đãi ạ')).toHaveLength(1);
    expect(screen.getByText('Anh để lại số em gọi nhé')).toBeInTheDocument();
    expect(screen.getAllByTestId('agent-label')).toHaveLength(2);
  });

  it('khách quay lại (đã nhắn ở lần trước, cờ còn trong storage) → hỏi ngay khi trang tải xong', async () => {
    localStorage.setItem('uknow_session_5', 'sess_0123456789abcdef0123456789abcdef');
    localStorage.setItem('uknow_chatted_5_sess_0123456789abcdef0123456789abcdef', '1');
    chatbotApi.getPublicAgentMessages.mockResolvedValue(pollOk([agent(7, 'Chào anh, em đã xem tin nhắn của anh')]));

    renderPage();

    await waitFor(() => expect(screen.getByText('Chào anh, em đã xem tin nhắn của anh')).toBeInTheDocument());
    expect(screen.getByTestId('agent-label')).toBeInTheDocument();
    expect(chatbotApi.getPublicAgentMessages.mock.calls[0][1]).toEqual({
      sessionId: 'sess_0123456789abcdef0123456789abcdef', afterId: '0',
    });
  });

  it('lượt nhắn sau đó: câu của nhân viên gửi cho AI như lượt "assistant" (server chỉ nhận user/assistant)', async () => {
    renderPage();
    await screen.findByText('Chao ban');
    vi.useFakeTimers();

    await visitorSends('Cho mình hỏi giá');
    chatbotApi.getPublicAgentMessages.mockResolvedValue(pollOk([agent(41, 'Em báo giá 100k ạ')]));
    await flush(8100);
    expect(screen.getByText('Em báo giá 100k ạ')).toBeInTheDocument();

    await visitorSends('Ok chốt nhé');
    const payload = chatbotApi.sendPublicChatbotMessage.mock.calls.at(-1)[1];
    expect(payload.history.map((m) => m.role)).not.toContain('agent');
    expect(payload.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: 'Em báo giá 100k ạ' }),
    ]));
  });

  it('nội dung nhân viên KHÔNG bao giờ thành HTML (không dangerouslySetInnerHTML)', async () => {
    renderPage();
    await screen.findByText('Chao ban');
    vi.useFakeTimers();

    await visitorSends('Cho mình hỏi giá');
    chatbotApi.getPublicAgentMessages.mockResolvedValue(pollOk([
      agent(9, '<img src=x onerror="window.__pwned=1"> <b>đậm</b>'),
    ]));
    await flush(8100);

    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=/)).toBeInTheDocument();
    expect(window.__pwned).toBeUndefined();
  });
});
