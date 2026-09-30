/**
 * HTML email nháp trong thẻ của trợ lý AI (AI sinh hoặc lấy từ thư viện template) không được chèn
 * thẳng vào DOM của app — chỉ hiện trong iframe sandbox không có allow-scripts.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TemplateDraftCard } from '../AiChatbotCards';
import viDict from '../../../../i18n/vi';

const t = (key) => key.split('.').reduce((acc, part) => acc?.[part], viDict) ?? key;

const draft = {
  channel: 'email',
  templateName: 'Chào mừng',
  subject: 'Chào bạn',
  bodyHtml: '<h2 id="draft-heading">Xin chào</h2><img src="x" onerror="window.__xss = 1">',
  bodyText: 'Xin chào',
};

describe('TemplateDraftCard — xem trước HTML email trong iframe sandbox', () => {
  it('bodyHtml nằm trong srcDoc của iframe sandbox="allow-same-origin", không vào DOM của app', () => {
    const { container } = render(<TemplateDraftCard draft={draft} onSave={vi.fn()} onEdit={vi.fn()} t={t} />);

    expect(container.querySelector('#draft-heading')).toBeNull();
    expect(container.querySelector('img[onerror]')).toBeNull();

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin');
    const srcDoc = iframe.getAttribute('srcdoc');
    expect(srcDoc).toContain('draft-heading');
    expect(srcDoc).toContain("script-src 'none'");
  });

  it('tự co chiều cao theo nội dung, tối đa 160px', () => {
    const { container } = render(<TemplateDraftCard draft={draft} onSave={vi.fn()} onEdit={vi.fn()} t={t} />);
    const iframe = container.querySelector('iframe');

    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: { body: { scrollHeight: 72 } },
    });
    fireEvent.load(iframe);
    expect(iframe.style.height).toBe('72px');

    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: { body: { scrollHeight: 900 } },
    });
    fireEvent.load(iframe);
    expect(iframe.style.height).toBe('160px');

    // Trả lại getter thật để sự kiện load thật của jsdom (bất đồng bộ) không đo tài liệu giả.
    delete iframe.contentDocument;
  });

  it('kênh Zalo vẫn hiện bodyText dạng chữ, không có iframe', () => {
    const { container, getByText } = render(
      <TemplateDraftCard draft={{ ...draft, channel: 'zalo' }} onSave={vi.fn()} onEdit={vi.fn()} t={t} />
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(getByText('Xin chào')).toBeInTheDocument();
  });
});
