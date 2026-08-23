import { jest } from '@jest/globals';

const { stripMarkdown, appendPlainTextResponseRules } = await import(
  '../aiResponseFormatter.util.js'
);

describe('stripMarkdown — link formatting for Zalo / Facebook / plain text', () => {
  it('rewrites a markdown link into "Label: URL"', () => {
    const out = stripMarkdown('Xem chi tiết tại [Trang chủ](https://example.com) nhé');
    expect(out).toBe('Xem chi tiết tại Trang chủ: https://example.com nhé');
  });

  it('removes the duplicated URL when AI writes "[Label](url) url"', () => {
    // Common Gemini habit: emit the URL once as markdown link, once as plain text.
    // Without dedup the user sees "Label: url url" — looks broken on Zalo.
    const out = stripMarkdown('Mở [Trang chủ](https://example.com) https://example.com đi bạn');
    expect(out).toBe('Mở Trang chủ: https://example.com đi bạn');
  });

  it('strips bold and italic markers but keeps the inner text', () => {
    expect(stripMarkdown('**Hello** _world_')).toBe('Hello world');
  });

  it('collapses triple+ newlines into double newlines', () => {
    expect(stripMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('strips markdown image syntax entirely', () => {
    expect(stripMarkdown('![logo](https://x.com/a.png) text')).toBe('text');
  });

  it('returns empty string when input is null/undefined', () => {
    expect(stripMarkdown(null)).toBe('');
    expect(stripMarkdown(undefined)).toBe('');
    expect(stripMarkdown('')).toBe('');
  });
});

describe('appendPlainTextResponseRules', () => {
  it('appends a plain-text-only formatting rule block', () => {
    const out = appendPlainTextResponseRules('Base prompt');
    expect(out.startsWith('Base prompt\n\n')).toBe(true);
    expect(out).toMatch(/VAN BAN THUAN/);
    expect(out).toMatch(/khong dung markdown/i);
  });
});