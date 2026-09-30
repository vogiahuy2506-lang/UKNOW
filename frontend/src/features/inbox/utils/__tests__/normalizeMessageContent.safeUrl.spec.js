/**
 * Thẻ link trong hộp thư lấy href/ảnh thẳng từ payload tin nhắn của nền tảng bên ngoài.
 * Chỉ scheme an toàn mới thành link bấm được; phần còn lại rơi về chữ thường.
 */
import { describe, it, expect } from 'vitest';
import {
  getMessagePreviewText,
  normalizeMessageContent,
} from '../normalizeMessageContent';

describe('normalizeMessageContent — lọc scheme của href/ảnh', () => {
  it('href https hợp lệ → type link, giữ nguyên href và ảnh https', () => {
    const result = normalizeMessageContent({
      title: 'Bài viết',
      href: 'https://example.com/bai-viet',
      thumb: 'https://cdn.example.com/t.jpg',
    });
    expect(result.type).toBe('link');
    expect(result.href).toBe('https://example.com/bai-viet');
    expect(result.thumbUrl).toBe('https://cdn.example.com/t.jpg');
  });

  it('mailto/tel vẫn là link', () => {
    expect(normalizeMessageContent({ url: 'mailto:a@example.com' }).href).toBe('mailto:a@example.com');
    expect(normalizeMessageContent({ link: 'tel:+84901234567' }).href).toBe('tel:+84901234567');
  });

  it('href javascript: (kể cả trong chuỗi JSON, viết hoa, chèn tab) → type text, không có href', () => {
    const payloads = [
      { title: 'Nhận quà', href: 'javascript:alert(1)' },
      { title: 'Nhận quà', action: { url: 'JAVASCRIPT:alert(1)' } },
      JSON.stringify({ title: 'Nhận quà', data: { link: 'java\tscript:alert(1)' } }),
    ];
    for (const payload of payloads) {
      const result = normalizeMessageContent(payload);
      expect(result.type).toBe('text');
      expect(result.href).toBe('');
      expect(result.text).toBe('Nhận quà');
    }
  });

  it('chỉ có href không an toàn → hiện nguyên chuỗi dưới dạng chữ', () => {
    const result = normalizeMessageContent({ href: 'data:text/html,<script>alert(1)</script>' });
    expect(result.type).toBe('text');
    expect(result.href).toBe('');
    expect(result.text).toBe('data:text/html,<script>alert(1)</script>');
    expect(getMessagePreviewText({ href: 'javascript:void(0)' })).toBe('javascript:void(0)');
  });

  it('ảnh thumbnail chỉ nhận http/https/data:image', () => {
    const base = { title: 'x', href: 'https://example.com' };
    expect(normalizeMessageContent({ ...base, thumb: 'javascript:alert(1)' }).thumbUrl).toBe('');
    expect(normalizeMessageContent({ ...base, thumbUrl: 'data:text/html,abc' }).thumbUrl).toBe('');
    expect(normalizeMessageContent({ ...base, image: 'data:image/png;base64,AAAA' }).thumbUrl).toBe(
      'data:image/png;base64,AAAA'
    );
  });
});
