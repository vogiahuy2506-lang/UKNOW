import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LandingPagePreview from '../LandingPagePreview';

/**
 * HTML trong món landing là do NGƯỜI BÁN viết. Trước PR-1 (plan vá luồng tiền 26/09/2026) nó được chèn thẳng vào trang
 * bằng dangerouslySetInnerHTML — script người bán chạy trên máy người xem, cùng origin với phiên đăng nhập. Chỉ được
 * hiển thị trong iframe sandbox KHÔNG có allow-scripts.
 */
describe('LandingPagePreview — HTML người bán chỉ hiện trong iframe sandbox', () => {
  const snapshot = {
    title: 'Mẫu landing',
    slug: 'mau',
    htmlContent: '<h2 id="seller-heading">Tiêu đề người bán</h2><p>Nội dung</p>',
  };

  it('dùng iframe sandbox không cho chạy script', () => {
    const { container } = render(<LandingPagePreview snapshot={snapshot} />);
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame.hasAttribute('sandbox')).toBe(true);
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-scripts/);
    expect(frame.getAttribute('srcdoc')).toContain('seller-heading');
  });

  it('không chèn HTML người bán vào DOM của trang', () => {
    const { container } = render(<LandingPagePreview snapshot={snapshot} />);
    expect(container.querySelector('#seller-heading')).toBeNull();
  });
});
