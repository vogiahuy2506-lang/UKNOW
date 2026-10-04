/**
 * Khung đọc: H-08 (ảnh/tệp không in URL), H-15 (không còn nút Trả lời), H-29 (nhãn người gửi, không dấu ✓✓ giả,
 * ô tìm ẩn mặc định), H-01 (nút Tải tin cũ hơn).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageThread from '../MessageThread';
import { I18nProvider } from '../../../i18n';

const photoUrl = 'https://photo-stal-3.zdn.vn/abc.jpg';
const fileUrl = 'https://file.zdn.vn/hop-dong.pdf';

const msg = (over = {}) => ({
  id: 1,
  role: 'visitor',
  content: 'xin chào',
  createdAt: '2026-10-04T08:00:00.000Z',
  ...over,
});

const renderThread = (messages, props = {}) => render(
  <I18nProvider>
    <MessageThread
      messages={messages}
      isLoading={false}
      conversation={{ channel: 'zalo_personal' }}
      {...props}
    />
  </I18nProvider>
);

describe('MessageThread — ảnh / tệp Zalo lưu dạng JSON (H-08)', () => {
  it('chat.photo → hiện ảnh, KHÔNG in URL thành chữ', () => {
    const { container } = renderThread([msg({
      content: JSON.stringify({ title: '', description: '', href: photoUrl }),
      metadata: { msg_type_raw: 'chat.photo' },
    })]);

    expect(container.querySelector(`img[src="${photoUrl}"]`)).not.toBeNull();
    expect(screen.queryByText(photoUrl)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('zdn.vn');
  });

  it('share.file → hiện tên tệp + "Tải xuống", KHÔNG in URL', () => {
    const { container } = renderThread([msg({
      content: JSON.stringify({ title: 'hop-dong.pdf', href: fileUrl }),
      metadata: { msg_type_raw: 'share.file' },
    })]);

    expect(screen.getByText('hop-dong.pdf')).toBeInTheDocument();
    const link = container.querySelector(`a[href="${fileUrl}"]`);
    expect(link).not.toBeNull();
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.textContent).not.toContain('file.zdn.vn');
  });

  it('chat.video.msg → "[Video]" kèm liên kết mở, không in URL', () => {
    const { container } = renderThread([msg({
      content: JSON.stringify({ title: '', href: 'https://video.zdn.vn/v.mp4' }),
      metadata: { msg_type_raw: 'chat.video.msg' },
    })]);

    expect(screen.getByText(/\[Video\]|Video/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('video.zdn.vn');
  });

  it('chat.photo có href KHÔNG an toàn (javascript:) → không dựng ảnh/liên kết nào', () => {
    const { container } = renderThread([msg({
      content: JSON.stringify({ href: 'javascript:alert(1)' }),
      metadata: { msg_type_raw: 'chat.photo' },
    })]);

    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.querySelector('img[src^="javascript"]')).toBeNull();
  });

  it('thẻ link thật (không có msg_type_raw là phương tiện) vẫn hiện liên kết như cũ', () => {
    const { container } = renderThread([msg({
      content: JSON.stringify({ title: 'Ưu đãi', href: 'https://example.com/uu-dai' }),
      metadata: { msg_type_raw: 'chat.recommended' },
    })]);

    expect(container.querySelector('a[href="https://example.com/uu-dai"]')).not.toBeNull();
  });
});

describe('MessageThread — chi tiết nhỏ (H-15, H-29)', () => {
  it('không còn nút Trả lời (trích dẫn) trên bong bóng tin khách', () => {
    const { container } = renderThread([msg()], { onReply: vi.fn() });

    expect(container.querySelector('button.group-hover\\:opacity-100')).toBeNull();
  });

  it('tin của bạn không còn dấu ✓/✓✓ (cờ is_read nội bộ không phải "khách đã đọc")', () => {
    const { container } = renderThread([
      msg({ id: 2, role: 'agent', isRead: true, metadata: { source: 'manual_inbox' } }),
      msg({ id: 3, role: 'agent', isRead: false, metadata: { source: 'manual_inbox' } }),
    ]);

    expect(container.querySelectorAll('svg').length).toBe(1); // chỉ nút kính lúp
  });

  it('nhãn người gửi: chính mình → "Bạn"; nhân viên khác (actor_user_id khác) → "Nhân viên"', () => {
    renderThread([
      msg({ id: 2, role: 'agent', content: 'mình gửi', metadata: { actor_user_id: 7 } }),
      msg({ id: 3, role: 'agent', content: 'nhân viên gửi', metadata: { actor_user_id: 31 } }),
    ], { currentUserId: 7 });

    expect(screen.getAllByText(/Bạn/)).toHaveLength(1);
    expect(screen.getAllByText(/Nhân viên/)).toHaveLength(1);
  });

  it('tin AI có nhãn Bot đi qua i18n', () => {
    renderThread([msg({ id: 4, role: 'bot', content: 'dạ vâng' })]);
    expect(screen.getByText(/Bot/)).toBeInTheDocument();
  });

  it('ô tìm tin nhắn ẩn mặc định; bấm kính lúp mới hiện, bấm lại thì ẩn', () => {
    renderThread([msg()]);

    expect(screen.queryByPlaceholderText(/Tìm/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tìm/ }));
    expect(screen.getByPlaceholderText(/Tìm/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tìm/ }));
    expect(screen.queryByPlaceholderText(/Tìm/)).not.toBeInTheDocument();
  });
});

describe('MessageThread — tải tin cũ hơn (H-01)', () => {
  it('hasMoreOlder → có nút; bấm gọi onLoadOlder; hết tin thì không có nút', () => {
    const onLoadOlder = vi.fn().mockResolvedValue(true);
    const { rerender } = renderThread([msg()], { hasMoreOlder: true, onLoadOlder });

    fireEvent.click(screen.getByRole('button', { name: 'Tải tin cũ hơn' }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider>
        <MessageThread messages={[msg()]} isLoading={false} conversation={{ channel: 'zalo_personal' }} hasMoreOlder={false} onLoadOlder={onLoadOlder} />
      </I18nProvider>
    );
    expect(screen.queryByRole('button', { name: 'Tải tin cũ hơn' })).not.toBeInTheDocument();
  });
});
