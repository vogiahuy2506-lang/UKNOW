/**
 * H-17 — bảng "Chi tiết" đọc đúng trường camelCase của API; không còn Thẻ / Ghi chú giả.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversationDetails from '../ConversationDetails';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: 'vi' }),
}));

const conversation = {
  id: 7,
  type: 'zalo_personal',
  channel: 'zalo_personal',
  visitorName: 'Đức Hải',
  visitorInfo: { phone: '0901234567', email: 'hai@example.com', is_group: false },
  startedAt: '2026-09-27T10:33:00.000Z',
  lastMessageAt: '2026-10-04T02:42:00.000Z',
  unreadCount: 3,
  isGroup: false,
};

describe('ConversationDetails (H-17)', () => {
  it('hiện tên khách, SĐT, email từ visitorName/visitorInfo (không còn "Khách hàng ẩn danh")', () => {
    render(<ConversationDetails conversation={conversation} onClose={vi.fn()} />);

    expect(screen.getByText('Đức Hải')).toBeInTheDocument();
    expect(screen.getByText('0901234567')).toBeInTheDocument();
    expect(screen.getByText('hai@example.com')).toBeInTheDocument();
    expect(screen.queryByText('inbox.anonymousCustomer')).not.toBeInTheDocument();
  });

  it('thời gian đọc từ startedAt / lastMessageAt (không còn "-")', () => {
    render(<ConversationDetails conversation={conversation} onClose={vi.fn()} />);

    const dashes = screen.queryAllByText('-');
    expect(dashes).toHaveLength(0);
    expect(screen.getByText(/27\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/04\/10\/2026/)).toBeInTheDocument();
  });

  it('nhóm: khối "Thông tin nhóm" hiện với tên nhóm', () => {
    render(
      <ConversationDetails
        conversation={{ ...conversation, isGroup: true, groupName: 'PHÒNG RD 2', visitorInfo: { is_group: true, sender_name: 'Hải' } }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('inbox.groupInfo', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('PHÒNG RD 2')).toBeInTheDocument();
    expect(screen.getByText('Hải')).toBeInTheDocument();
  });

  it('không còn ô Thẻ, tab Ghi chú, dòng Trạng thái', () => {
    const { container } = render(<ConversationDetails conversation={conversation} onClose={vi.fn()} />);

    expect(screen.queryByText('inbox.notes')).not.toBeInTheDocument();
    expect(screen.queryByText('inbox.tags')).not.toBeInTheDocument();
    expect(screen.queryByText('inbox.status')).not.toBeInTheDocument();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('vẫn đọc được dạng snake_case cũ (không vỡ nếu nơi khác truyền hàng thô từ DB)', () => {
    render(
      <ConversationDetails
        conversation={{ visitor_name: 'Khách cũ', visitor_info: JSON.stringify({ phone: '0911222333' }), channel: 'web' }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Khách cũ')).toBeInTheDocument();
    expect(screen.getByText('0911222333')).toBeInTheDocument();
  });
});
