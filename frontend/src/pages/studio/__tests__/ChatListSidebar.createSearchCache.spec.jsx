/**
 * 04/10/2026 — Rà soát Studio (nhóm 1, lỗi chức năng):
 *  - S-01: tạo chatbot thất bại KHÔNG được dựng bot giả + báo "Đã tạo chatbot" (bản cũ: catch tự dựng bot
 *          id=Date.now() khi API 403 chạm trần gói).
 *  - S-08: ô "Tìm chatbot..." phải lọc (trước đây ghi vào internalSearch nhưng phần lọc đọc prop searchQuery).
 *  - S-14: bộ nhớ đệm gắn id user + id chủ không gian, không lưu system_instruction, không cho bot "lạ" của user khác.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import ChatListSidebar from '../ChatListSidebar';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { listChatbots: vi.fn(), createChatbot: vi.fn(), deleteChatbot: vi.fn() },
}));
vi.mock('../../../services/marketplace.service', () => ({ default: {} }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const BOTS = [
  { id: 1, name: 'Bot Tư vấn', description: 'Bán hàng', is_active: true, document_count: 2, system_instruction: 'BÍ MẬT: giảm 30%' },
  { id: 2, name: 'Bot Hỗ trợ', description: 'Chăm sóc', is_active: true, document_count: 0, system_instruction: 'Nội bộ' },
];

function openCreateModal() {
  fireEvent.click(screen.getByRole('button', { name: /Chatbot mới/ }));
  return screen.getByPlaceholderText(/Hỗ trợ khách hàng/);
}

async function loadSidebar(props = {}) {
  const onSelectBot = vi.fn();
  render(<ChatListSidebar selectedBot={null} onSelectBot={onSelectBot} {...props} />);
  await screen.findByText('Bot Tư vấn');
  onSelectBot.mockClear();
  return { onSelectBot };
}

describe('ChatListSidebar — tạo chatbot thất bại (S-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: { id: 5 }, activeContext: { type: 'self' } });
    chatbotApi.listChatbots.mockResolvedValue({ success: true, data: BOTS });
  });

  it('API 500 → không dựng bot giả, không báo "Đã tạo", giữ hộp tạo mở, toast đúng câu của máy chủ', async () => {
    const { onSelectBot } = await loadSidebar();
    chatbotApi.createChatbot.mockRejectedValue({
      message: 'Request failed with status code 500',
      response: { status: 500, data: { message: 'Lỗi máy chủ, thử lại sau' } },
    });

    const input = openCreateModal();
    fireEvent.change(input, { target: { value: 'Bot không tạo được' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo ngay' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Lỗi máy chủ, thử lại sau'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(onSelectBot).not.toHaveBeenCalled();
    // Hộp tạo vẫn mở, tên vẫn còn để sửa/thử lại.
    expect(screen.getByPlaceholderText(/Hỗ trợ khách hàng/).value).toBe('Bot không tạo được');
    // Không có bot ma trong danh sách.
    expect(screen.queryByText('Bot không tạo được', { selector: 'p' })).toBeNull();
    // Và không lưu bot ma vào bộ nhớ đệm.
    const cached = JSON.parse(localStorage.getItem('uknow_chatbots:u5:o5') || '[]');
    expect(cached.map((b) => b.name)).toEqual(['Bot Tư vấn', 'Bot Hỗ trợ']);
  });

  it('API 403 chạm trần gói → KHÔNG hiện thêm toast (toast nâng gói của api.js đã nói), không bot giả, không "Đã tạo"', async () => {
    const { onSelectBot } = await loadSidebar();
    chatbotApi.createChatbot.mockRejectedValue({
      response: {
        status: 403,
        data: { success: false, code: 'CHATBOT_LIMIT_EXCEEDED', upgradeRequired: true, message: 'Đã đạt giới hạn chatbot của gói' },
      },
    });

    const input = openCreateModal();
    fireEvent.change(input, { target: { value: 'Bot thứ hai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo ngay' }));

    await waitFor(() => expect(chatbotApi.createChatbot).toHaveBeenCalled());
    // Chờ vòng cập nhật state sau lỗi.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo ngay' })).not.toBeDisabled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(onSelectBot).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/Hỗ trợ khách hàng/)).toBeTruthy();
  });

  it('API thành công → chọn bot mới, báo thành công, đóng hộp tạo', async () => {
    const { onSelectBot } = await loadSidebar();
    chatbotApi.createChatbot.mockResolvedValue({ success: true, data: { id: 99, name: 'Bot mới tạo', is_active: true } });

    const input = openCreateModal();
    fireEvent.change(input, { target: { value: 'Bot mới tạo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo ngay' }));

    await waitFor(() => expect(onSelectBot).toHaveBeenCalledWith(expect.objectContaining({ id: 99 })));
    expect(toast.success).toHaveBeenCalledWith('Đã tạo chatbot');
    expect(screen.queryByPlaceholderText(/Hỗ trợ khách hàng/)).toBeNull();
    expect(screen.getByText('Bot mới tạo')).toBeTruthy();
  });
});

describe('ChatListSidebar — ô tìm chatbot (S-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: { id: 5 }, activeContext: { type: 'self' } });
    chatbotApi.listChatbots.mockResolvedValue({ success: true, data: BOTS });
  });

  it('gõ vào ô tìm → danh sách chỉ còn bot khớp tên hoặc mô tả', async () => {
    await loadSidebar();
    const search = screen.getByPlaceholderText('Tìm chatbot...');

    fireEvent.change(search, { target: { value: 'tư vấn' } });
    expect(screen.getByText('Bot Tư vấn')).toBeTruthy();
    expect(screen.queryByText('Bot Hỗ trợ')).toBeNull();

    // Khớp theo mô tả, không phân biệt hoa thường.
    fireEvent.change(search, { target: { value: 'CHĂM SÓC' } });
    expect(screen.getByText('Bot Hỗ trợ')).toBeTruthy();
    expect(screen.queryByText('Bot Tư vấn')).toBeNull();

    // Xoá từ khoá → đủ cả hai.
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('Bot Tư vấn')).toBeTruthy();
    expect(screen.getByText('Bot Hỗ trợ')).toBeTruthy();
  });

  it('không khớp bot nào → báo "Không tìm thấy", không mời tạo chatbot', async () => {
    await loadSidebar();
    fireEvent.change(screen.getByPlaceholderText('Tìm chatbot...'), { target: { value: 'zzz không có' } });

    expect(screen.getByText('Không tìm thấy')).toBeTruthy();
    expect(screen.queryByText('Chưa có chatbot')).toBeNull();
  });
});

describe('ChatListSidebar — bộ nhớ đệm danh sách (S-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    chatbotApi.listChatbots.mockResolvedValue({ success: true, data: BOTS });
  });

  it('khoá đệm gắn id user + chủ không gian; KHÔNG lưu system_instruction; không ghi khoá chung cũ', async () => {
    useAuthStore.setState({ user: { id: 5 }, activeContext: { type: 'self' } });
    await loadSidebar();

    const raw = localStorage.getItem('uknow_chatbots:u5:o5');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('system_instruction');
    expect(raw).not.toContain('BÍ MẬT');
    expect(JSON.parse(raw).map((b) => b.name)).toEqual(['Bot Tư vấn', 'Bot Hỗ trợ']);
    expect(localStorage.getItem('uknow_chatbots')).toBeNull();
  });

  it('nhân viên: khoá theo id chủ không gian (đổi công ty → khoá khác)', async () => {
    useAuthStore.setState({ user: { id: 8 }, activeContext: { type: 'employee', ownerId: 42 } });
    await loadSidebar();

    expect(localStorage.getItem('uknow_chatbots:u8:o42')).toBeTruthy();
    expect(localStorage.getItem('uknow_chatbots:u8:o8')).toBeNull();
  });

  it('API danh sách lỗi → dùng bản đệm CỦA CHÍNH user này, gắn _offlineCache (thiếu system_instruction)', async () => {
    useAuthStore.setState({ user: { id: 5 }, activeContext: { type: 'self' } });
    localStorage.setItem('uknow_chatbots:u5:o5', JSON.stringify([{ id: 1, name: 'Bot đệm' }]));
    chatbotApi.listChatbots.mockRejectedValue(new Error('Network Error'));
    const onSelectBot = vi.fn();

    render(<ChatListSidebar selectedBot={null} onSelectBot={onSelectBot} />);

    expect(await screen.findByText('Bot đệm')).toBeTruthy();
    expect(onSelectBot).toHaveBeenCalledWith(expect.objectContaining({ id: 1, _offlineCache: true }));
  });

  it('API lỗi + bản đệm của user KHÁC (hoặc khoá cũ chung) → KHÔNG hiện bot của người khác', async () => {
    useAuthStore.setState({ user: { id: 6 }, activeContext: { type: 'self' } });
    localStorage.setItem('uknow_chatbots:u5:o5', JSON.stringify([{ id: 1, name: 'Bot của người khác' }]));
    localStorage.setItem('uknow_chatbots', JSON.stringify([{ id: 2, name: 'Bot khoá cũ chung' }]));
    chatbotApi.listChatbots.mockRejectedValue(new Error('Network Error'));
    const onSelectBot = vi.fn();

    render(<ChatListSidebar selectedBot={null} onSelectBot={onSelectBot} />);

    await waitFor(() => expect(onSelectBot).toHaveBeenCalledWith(null));
    expect(screen.queryByText('Bot của người khác')).toBeNull();
    expect(screen.queryByText('Bot khoá cũ chung')).toBeNull();
  });
});
