/**
 * Thẻ link trong khung hội thoại: href/ảnh lấy từ payload tin nhắn đến (bên thứ ba). Chỉ dựng
 * <a>/<img> khi scheme an toàn; scheme khác hiện chữ thường, không bấm được.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageThread from '../MessageThread';
import { I18nProvider } from '../../../i18n';

const renderThread = (content) =>
  render(
    <I18nProvider>
      <MessageThread
        messages={[
          {
            id: 1,
            role: 'visitor',
            content,
            createdAt: '2026-09-30T08:00:00.000Z',
          },
        ]}
        isLoading={false}
        conversation={{ channel: 'zalo_oa' }}
        onReply={() => {}}
      />
    </I18nProvider>
  );

describe('MessageThread — thẻ link từ tin nhắn đến', () => {
  it('href https → hiện link mở tab mới', () => {
    const { container } = renderThread(
      JSON.stringify({ title: 'Ưu đãi', href: 'https://example.com/uu-dai', thumb: 'https://cdn.example.com/a.jpg' })
    );
    const link = container.querySelector('a[href="https://example.com/uu-dai"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelector('img[src="https://cdn.example.com/a.jpg"]')).not.toBeNull();
  });

  it('href javascript: → không có thẻ <a> nào mang scheme đó, tiêu đề hiện dạng chữ', () => {
    const { container } = renderThread(
      JSON.stringify({ title: 'Bấm nhận quà', href: 'javascript:alert(document.domain)', thumb: 'javascript:alert(1)' })
    );
    expect(screen.getByText('Bấm nhận quà')).toBeInTheDocument();
    const anchors = Array.from(container.querySelectorAll('a'));
    expect(anchors.some((a) => /^\s*javascript:/i.test(a.getAttribute('href') || ''))).toBe(false);
    const images = Array.from(container.querySelectorAll('img'));
    expect(images.some((img) => /^\s*javascript:/i.test(img.getAttribute('src') || ''))).toBe(false);
  });

  it('chỉ có href không an toàn → chuỗi hiện nguyên văn, không thành link', () => {
    const { container } = renderThread(JSON.stringify({ href: 'vbscript:msgbox(1)' }));
    expect(screen.getByText('vbscript:msgbox(1)')).toBeInTheDocument();
    expect(container.querySelector('a[href^="vbscript"]')).toBeNull();
  });
});
