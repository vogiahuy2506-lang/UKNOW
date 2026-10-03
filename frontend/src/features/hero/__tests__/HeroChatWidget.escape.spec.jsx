/**
 * Widget tư vấn ở trang công khai hiển thị chữ người dùng gõ và câu trả lời AI. formatMarkdown chỉ
 * được dựng <strong>/<br/> từ cú pháp của nó; mọi HTML có sẵn trong nội dung phải hiện như chữ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HeroChatWidget from '../components/HeroChatWidget';
import { I18nProvider } from '../../../i18n';

const AI_REPLY = '<b id="ai-injected">x</b> **Gợi ý** cho bạn\ndòng hai';
const USER_TEXT = '<img src="x" onerror="window.__heroXss = 1"> xin tư vấn';

let originalScrollIntoView;

beforeEach(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, reply: AI_REPLY }) })
  );
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.unstubAllGlobals();
});

describe('HeroChatWidget — nội dung tin nhắn được escape trước khi định dạng', () => {
  it('HTML trong tin người dùng và câu trả lời AI hiện dạng chữ; **đậm** và xuống dòng vẫn định dạng', async () => {
    const { container } = render(
      <I18nProvider>
        <HeroChatWidget />
      </I18nProvider>
    );

    fireEvent.click(screen.getByLabelText('Open chat'));
    const form = container.querySelector('#hero-chat-form');
    fireEvent.change(form.querySelector('input'), { target: { value: USER_TEXT } });
    fireEvent.submit(form);

    const reply = await screen.findByText('Gợi ý');
    expect(reply.tagName).toBe('STRONG');
    expect(reply.parentElement.querySelector('br')).not.toBeNull();

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('#ai-injected')).toBeNull();
    expect(container.textContent).toContain(USER_TEXT);
    expect(container.textContent).toContain('<b id="ai-injected">x</b>');
    await waitFor(() => expect(window.__heroXss).toBeUndefined());
  });
});
