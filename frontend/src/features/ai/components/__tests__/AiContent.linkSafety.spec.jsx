/**
 * Link markdown `[nhãn](url)` trong câu trả lời của trợ lý AI: chỉ thành thẻ <a> khi scheme an toàn
 * (http/https/mailto/tel hoặc đường dẫn nội bộ); scheme khác hiện nhãn dạng chữ.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiContent } from '../AiChatbotCards';

describe('AiContent — link do AI sinh', () => {
  it('giữ link https, link nội bộ và link hướng dẫn đã chuẩn hoá', () => {
    const { container } = render(
      <AiContent text="Xem [hướng dẫn](https://founder.ai/huong-dan/bat-dau), [chiến dịch](/app/campaigns) và [Google](https://www.google.com/)" />
    );
    expect(container.querySelector('a[href="/huong-dan/bat-dau"]')).not.toBeNull();
    expect(container.querySelector('a[href="/app/campaigns"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://www.google.com/"]')).not.toBeNull();
  });

  it('link javascript:/data: → không có thẻ <a>, nhãn vẫn hiện', () => {
    const { container } = render(
      <AiContent text="[Bấm nhận quà](javascript:alert%28document.domain%29) hoặc [mở](data:text/html,abc)" />
    );
    expect(screen.getByText('Bấm nhận quà').tagName).toBe('SPAN');
    expect(screen.getByText('mở').tagName).toBe('SPAN');
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.some((href) => /^\s*(javascript|data):/i.test(href || ''))).toBe(false);
  });
});
