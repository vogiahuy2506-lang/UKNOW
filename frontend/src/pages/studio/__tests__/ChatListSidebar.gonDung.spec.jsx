/**
 * 04/10/2026 — Cột trái Studio gọn (phần b báo cáo rà soát):
 *  - S-10: bỏ 3 tab "Tự tạo / Mua / Chia sẻ" (0 bot đã mua, 2 bot được chia sẻ trên toàn hệ thống; chữ "Chia sẻ" rớt 2 dòng):
 *          MỘT danh sách, bot nhận bản sao / đã mua có nhãn "Bản sao" / "Đã mua" thay huy hiệu "MP".
 *  - S-07: bỏ "Mẫu nhanh" chỉ điền tên (23/63 bot mang đúng tên mẫu, 6 bot tên "Tùy chỉnh", bot vẫn rỗng).
 *  - S-05: chấm theo công tắc trả lời có chú thích khi rê chuột; bot bị khoá hiện chấm hổ phách "Tạm khoá (vượt gói)".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatListSidebar from '../ChatListSidebar';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { listChatbots: vi.fn(), createChatbot: vi.fn(), deleteChatbot: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const BOTS = [
  { id: 1, name: 'Bot tự tạo', origin: 'self_created', replies_enabled: true, document_count: 2 },
  { id: 2, name: 'Bot được gửi', origin: 'shared', replies_enabled: true, document_count: 0 },
  { id: 3, name: 'Bot đã mua', origin: 'marketplace_purchased', replies_enabled: false, document_count: 1 },
  { id: 4, name: 'Bot bị khoá', origin: 'self_created', replies_enabled: true, is_locked: true, document_count: 1 },
];

async function loadSidebar() {
  render(<ChatListSidebar selectedBot={null} onSelectBot={() => {}} />);
  await screen.findByText('Bot tự tạo');
}

describe('ChatListSidebar — một danh sách có nhãn nguồn (S-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: { id: 5 }, activeContext: { type: 'self' } });
    chatbotApi.listChatbots.mockResolvedValue({ success: true, data: BOTS });
  });

  it('gọi API danh sách MỘT lần, không lọc origin (một danh sách cho mọi nguồn)', async () => {
    await loadSidebar();
    expect(chatbotApi.listChatbots).toHaveBeenCalledTimes(1);
    expect(chatbotApi.listChatbots.mock.calls[0]).toEqual([]);
  });

  it('không còn 3 tab Tự tạo / Mua / Chia sẻ; cả 4 bot nằm chung một danh sách', async () => {
    await loadSidebar();

    for (const tab of ['Tự tạo', 'Mua', 'Chia sẻ']) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${tab}$`) })).toBeNull();
    }
    for (const name of BOTS.map((b) => b.name)) expect(screen.getByText(name)).toBeTruthy();
  });

  it('nhãn "Bản sao" cho bot nhận qua Gửi bản sao, "Đã mua" cho bot mua Marketplace; bot tự tạo không nhãn; không còn "MP"', async () => {
    await loadSidebar();

    const row = (name) => screen.getByText(name).closest('.group');
    expect(row('Bot được gửi').textContent).toContain('Bản sao');
    expect(row('Bot đã mua').textContent).toContain('Đã mua');
    expect(row('Bot tự tạo').textContent).not.toMatch(/Bản sao|Đã mua/);
    expect(screen.queryByText('MP')).toBeNull();
  });

  it('nút "Chatbot mới" luôn hiện (không phụ thuộc tab)', async () => {
    await loadSidebar();
    expect(screen.getByRole('button', { name: /Chatbot mới/ })).toBeTruthy();
    expect(screen.queryByText(/không thể tạo mới tại đây/)).toBeNull();
  });
});

describe('ChatListSidebar — hộp tạo không còn "Mẫu nhanh" (S-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: { id: 5 }, activeContext: { type: 'self' } });
    chatbotApi.listChatbots.mockResolvedValue({ success: true, data: BOTS });
  });

  it('tiêu đề "Tạo chatbot", dòng phụ mới, chỉ một ô tên; không có Mẫu nhanh / Tùy chỉnh / Giáo dục', async () => {
    await loadSidebar();
    fireEvent.click(screen.getByRole('button', { name: /Chatbot mới/ }));

    expect(screen.getByText('Tạo chatbot', { selector: 'h3' })).toBeTruthy();
    expect(screen.getByText('Đặt tên trước, rồi thêm tài liệu để chatbot trả lời đúng')).toBeTruthy();
    for (const gone of ['Mẫu nhanh', 'Tùy chỉnh', 'Giáo dục', 'Tư vấn bán hàng']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.getAllByRole('textbox').filter((el) => el.placeholder?.startsWith('VD:'))).toHaveLength(1);
  });
});

describe('ChatListSidebar — chấm trạng thái có chú thích (S-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: { id: 5 }, activeContext: { type: 'self' } });
    chatbotApi.listChatbots.mockResolvedValue({ success: true, data: BOTS });
  });

  it('chấm có title "Đang bật trả lời" / "Đã tắt trả lời" / "Tạm khoá (vượt gói)" và màu tương ứng', async () => {
    await loadSidebar();
    const dot = (name) => screen.getByText(name).closest('.group').querySelector('span[title]');

    expect(dot('Bot tự tạo').getAttribute('title')).toBe('Đang bật trả lời');
    expect(dot('Bot tự tạo').className).toContain('bg-emerald-500');
    expect(dot('Bot đã mua').getAttribute('title')).toBe('Đã tắt trả lời');
    expect(dot('Bot đã mua').className).toContain('bg-slate-300');
    expect(dot('Bot bị khoá').getAttribute('title')).toBe('Tạm khoá (vượt gói)');
    expect(dot('Bot bị khoá').className).toContain('bg-amber-500');
  });
});
