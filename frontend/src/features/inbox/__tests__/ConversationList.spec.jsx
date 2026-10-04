/**
 * Danh sách hội thoại: H-22 (thời gian có dấu cách), H-08 (xem trước không in URL), H-09 (huy hiệu AI đúng nghĩa),
 * H-24 (không còn huy hiệu "Đóng"), H-28 (không hiện nút xoá khi không có quyền), H-10 (chữ trạng thái rỗng),
 * H-13 (không sắp lại phía FE).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversationList from '../ConversationList';

const DICT = {
  'inbox.justNow': 'Vừa xong',
  'inbox.timeMinutes': '{n} phút',
  'inbox.timeHours': '{n} giờ',
  'inbox.timeDays': '{n} ngày',
  'inbox.badgeAiOff': 'AI tắt',
  'inbox.badgeYouReplying': 'Bạn đang trả lời',
  'inbox.previewImage': '[Hình ảnh]',
  'inbox.previewFile': '[Tệp]',
  'inbox.emptyListTitle': 'Chưa có cuộc trò chuyện nào',
  'inbox.emptyListHint': 'Khi khách nhắn qua Zalo hoặc Web chat, cuộc trò chuyện sẽ hiện ở đây.',
  'inbox.emptyFilteredTitle': 'Không có cuộc trò chuyện nào khớp',
  'inbox.confirmDeleteTitle': 'Xoá cuộc trò chuyện',
  'inbox.confirmDelete': 'Xoá cuộc trò chuyện khỏi Founder AI? Tin trên Zalo không bị xoá. Không khôi phục được.',
  'inbox.customer': 'Khách hàng',
  'inbox.group': 'Nhóm',
  'common.delete': 'Xoá',
  'common.cancel': 'Huỷ',
};

vi.mock('../../../i18n', () => {
  const t = (key, params = {}) => {
    const value = DICT[key] ?? key;
    return value.replace(/\{(\w+)\}/g, (_, p) => params[p] ?? `{${p}}`);
  };
  return { useI18n: () => ({ t, locale: 'vi' }) };
});

const NOW = new Date('2026-10-04T10:00:00.000Z').getTime();
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();

const baseConv = (over = {}) => ({
  id: 1,
  type: 'zalo_personal',
  channel: 'zalo_personal',
  visitorName: 'Hải',
  visitorInfo: {},
  lastMessage: 'xin chào',
  lastMessageAt: minutesAgo(5),
  unreadCount: 0,
  chatbotEnabled: true,
  ...over,
});

const renderList = (conversations, props = {}) => render(
  <ConversationList
    conversations={conversations}
    isLoading={false}
    selectedId={null}
    onSelect={vi.fn()}
    onLoadMore={vi.fn()}
    hasMore={false}
    {...props}
  />
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('thời gian (H-22)', () => {
  it.each([
    [0.2, 'Vừa xong'],
    [45, '45 phút'],
    [6 * 60, '6 giờ'],
    [3 * 24 * 60, '3 ngày'],
  ])('%s phút trước → "%s" (có dấu cách giữa số và đơn vị)', (minutes, expected) => {
    renderList([baseConv({ lastMessageAt: minutesAgo(minutes) })]);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('xem trước (H-08)', () => {
  it('ảnh Zalo lưu dạng JSON → "[Hình ảnh]", không in URL', () => {
    const lastMessage = JSON.stringify({ title: '', description: '', href: 'https://photo-stal-3.zdn.vn/abc.jpg' });
    renderList([baseConv({ lastMessage, lastMessageRawType: 'chat.photo' })]);

    expect(screen.getByText('[Hình ảnh]')).toBeInTheDocument();
    expect(screen.queryByText(/zdn\.vn/)).not.toBeInTheDocument();
  });

  it('nhóm: thêm tên người gửi ở đầu dòng', () => {
    renderList([baseConv({
      visitorInfo: { is_group: true, group_name: 'PHÒNG RD 2' }, lastMessage: 'Dạ chạy được',
      lastMessageSender: 'Hải', lastMessageRole: 'visitor',
    })]);

    expect(screen.getByText('Hải: Dạ chạy được')).toBeInTheDocument();
  });

  it('tin chỉ có đính kèm, nội dung rỗng → nhãn theo loại đính kèm', () => {
    renderList([baseConv({ lastMessage: '', lastMessageAttachmentType: 'image' })]);
    expect(screen.getByText('[Hình ảnh]')).toBeInTheDocument();
  });
});

describe('huy hiệu AI (H-09)', () => {
  const pausedAt = minutesAgo(1);
  const future = new Date(NOW + 4 * 60_000).toISOString();
  const past = new Date(NOW - 60_000).toISOString();

  it('bạn vừa trả lời, còn trong thời gian chờ → "Bạn đang trả lời"', () => {
    renderList([baseConv({ aiPaused: true, aiPausedAt: pausedAt, aiResumeAt: future })]);
    expect(screen.getByText('Bạn đang trả lời')).toBeInTheDocument();
  });

  it('tắt tay (không có mốc tự bật lại) → "AI tắt"', () => {
    renderList([baseConv({ aiPaused: true, aiPausedAt: null })]);
    expect(screen.getByText('AI tắt')).toBeInTheDocument();
  });

  it('đã QUÁ mốc tự bật lại → không hiện gì (AI sẽ tự trả lời ở tin khách kế tiếp)', () => {
    renderList([baseConv({ aiPaused: true, aiPausedAt: minutesAgo(60), aiResumeAt: past })]);
    expect(screen.queryByText('Bạn đang trả lời')).not.toBeInTheDocument();
    expect(screen.queryByText('AI tắt')).not.toBeInTheDocument();
  });

  it('chatbot chưa bật cho tài khoản (chatbotEnabled=false) → không hiện, dù cờ tạm dừng còn trong DB', () => {
    renderList([baseConv({ aiPaused: true, aiPausedAt: pausedAt, aiResumeAt: future, chatbotEnabled: false })]);
    expect(screen.queryByText('Bạn đang trả lời')).not.toBeInTheDocument();
  });

  it('nhóm Zalo → không hiện (AI không bao giờ trả lời nhóm)', () => {
    renderList([baseConv({
      visitorInfo: { is_group: true }, aiPaused: true, aiPausedAt: pausedAt, aiResumeAt: future,
    })]);
    expect(screen.queryByText('Bạn đang trả lời')).not.toBeInTheDocument();
  });

  it('tự bật lại đang tắt (aiResumeAt = null) mà là tạm dừng do bạn trả lời → "Bạn đang trả lời"', () => {
    renderList([baseConv({ aiPaused: true, aiPausedAt: pausedAt, aiResumeAt: null })]);
    expect(screen.getByText('Bạn đang trả lời')).toBeInTheDocument();
  });
});

describe('huy hiệu "Đóng" và sắp xếp (H-24, H-13)', () => {
  it('hội thoại không có status (mới đến qua SSE) KHÔNG mang huy hiệu "Đóng"', () => {
    renderList([baseConv({ status: undefined })]);
    expect(screen.queryByText('Đóng')).not.toBeInTheDocument();
  });

  it('giữ nguyên thứ tự server trả về, không sắp lại theo thời gian/tên phía FE', () => {
    renderList([
      baseConv({ id: 1, visitorName: 'Zed', lastMessageAt: minutesAgo(500) }),
      baseConv({ id: 2, visitorName: 'Abe', lastMessageAt: minutesAgo(5) }),
    ]);

    const names = screen.getAllByText(/^(Zed|Abe)$/).map((el) => el.textContent);
    expect(names).toEqual(['Zed', 'Abe']);
  });
});

describe('nút xoá (H-28) và chữ xác nhận', () => {
  it('không có onDelete (nhân viên không quyền quản lý) → KHÔNG có nút xoá', () => {
    renderList([baseConv()], { onDelete: undefined });
    expect(screen.queryByLabelText('Xoá cuộc trò chuyện')).not.toBeInTheDocument();
  });

  it('có onDelete → bấm xoá hiện xác nhận nói rõ tin Zalo không bị xoá; xác nhận mới gọi onDelete', () => {
    const onDelete = vi.fn();
    renderList([baseConv()], { onDelete });

    fireEvent.click(screen.getByLabelText('Xoá cuộc trò chuyện'));
    expect(screen.getByText(/Tin trên Zalo không bị xoá/)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('trạng thái rỗng (H-10)', () => {
  it('danh sách rỗng, không lọc → nói chưa có cuộc trò chuyện, KHÔNG bảo "chọn một cuộc trò chuyện"', () => {
    renderList([]);

    expect(screen.getByText('Chưa có cuộc trò chuyện nào')).toBeInTheDocument();
    expect(screen.getByText(/Khi khách nhắn qua Zalo hoặc Web chat/)).toBeInTheDocument();
    expect(screen.queryByText(/Chọn một cuộc trò chuyện/)).not.toBeInTheDocument();
  });

  it('danh sách rỗng vì đang lọc → nói "không khớp", không nói "chưa có"', () => {
    renderList([], { hasActiveFilters: true });

    expect(screen.getByText('Không có cuộc trò chuyện nào khớp')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có cuộc trò chuyện nào')).not.toBeInTheDocument();
  });
});
