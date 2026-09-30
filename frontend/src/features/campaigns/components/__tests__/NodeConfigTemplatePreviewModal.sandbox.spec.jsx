/**
 * Xem trước template trong cấu hình node chiến dịch: HTML do tenant soạn chỉ được hiện trong
 * iframe sandbox không có allow-scripts (trước đây srcDoc không sandbox → chạy trong origin app).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import NodeConfigTemplatePreviewModal from '../NodeConfigTemplatePreviewModal';
import { I18nProvider } from '../../../../i18n';

const renderModal = (template) =>
  render(
    <I18nProvider>
      <NodeConfigTemplatePreviewModal isOpen onClose={vi.fn()} template={template} />
    </I18nProvider>
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NodeConfigTemplatePreviewModal — iframe sandbox', () => {
  it('bodyHtml hiện trong iframe sandbox không cho chạy script, có CSP chặn script', () => {
    renderModal({
      templateName: 'Mẫu',
      subject: 'Tiêu đề',
      bodyHtml: '<h2 id="tenant-heading">Xin chào</h2><img src="x" onerror="window.__xss = 1">',
    });
    const iframe = document.body.querySelector('iframe[title="Template preview"]');
    expect(iframe).not.toBeNull();
    const tokens = (iframe.getAttribute('sandbox') ?? '').split(/\s+/);
    expect(iframe.hasAttribute('sandbox')).toBe(true);
    expect(tokens).not.toContain('allow-scripts');
    expect(tokens).toContain('allow-same-origin');
    const srcDoc = iframe.getAttribute('srcdoc');
    expect(srcDoc).toContain('tenant-heading');
    expect(srcDoc).toContain("script-src 'none'");
    expect(document.getElementById('tenant-heading')).toBeNull();
  });

  it('không có onOpenAttachment: chỉ mở URL đính kèm có scheme an toàn', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderModal({
      templateName: 'Mẫu',
      bodyText: 'Nội dung',
      attachments: [
        { name: 'hop-le.pdf', url: 'https://cdn.example.com/hop-le.pdf' },
        { name: 'doc-hai.pdf', url: 'javascript:alert(1)' },
      ],
    });
    fireEvent.click(screen.getByText('hop-le.pdf'));
    fireEvent.click(screen.getByText('doc-hai.pdf'));
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://cdn.example.com/hop-le.pdf', '_blank', 'noopener,noreferrer');
  });
});
