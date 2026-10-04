import { describe, expect, it } from '@jest/globals';
import { MAX_SCRAPED_TEXT_CHARS, clipScrapedText } from '../scrapeLimits.util.js';

describe('clipScrapedText (D-18)', () => {
  it('trần mặc định 200.000 ký tự', () => {
    expect(MAX_SCRAPED_TEXT_CHARS).toBe(200000);
  });

  it('chữ ngắn hơn trần → giữ nguyên; null/undefined → chuỗi rỗng', () => {
    expect(clipScrapedText('Xin chào')).toBe('Xin chào');
    expect(clipScrapedText(null)).toBe('');
    expect(clipScrapedText(undefined)).toBe('');
  });

  it('đúng bằng trần → giữ nguyên; dài hơn → cắt đúng trần, KHÔNG thêm dấu "…"', () => {
    expect(clipScrapedText('a'.repeat(10), 10)).toBe('a'.repeat(10));
    const clipped = clipScrapedText('a'.repeat(11), 10);
    expect(clipped).toBe('a'.repeat(10));
    expect(clipped).not.toContain('…');
  });

  it('không bỏ lại nửa cặp surrogate ở cuối (emoji bị cắt đôi → lùi 1 đơn vị)', () => {
    const text = `${'a'.repeat(9)}😀bbb`;
    const clipped = clipScrapedText(text, 10);
    expect(clipped).toBe('a'.repeat(9));
    expect(clipScrapedText(`${'a'.repeat(8)}😀bbb`, 10)).toBe(`${'a'.repeat(8)}😀`);
  });
});
