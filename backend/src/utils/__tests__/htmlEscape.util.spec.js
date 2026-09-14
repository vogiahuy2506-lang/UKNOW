import { describe, it, expect } from '@jest/globals';
import { escapeHtml } from '../htmlEscape.util.js';

describe('htmlEscape.util', () => {
  it('thoát đúng các ký tự &, <, >, ", \'', () => {
    const input = '<a href="https://evil.example?x=1&y=2">\'Click here\'</a>';
    const escaped = escapeHtml(input);
    expect(escaped).toBe(
      '&lt;a href=&quot;https://evil.example?x=1&amp;y=2&quot;&gt;&#39;Click here&#39;&lt;/a&gt;'
    );
    expect(escaped).not.toContain('<a href=');
  });

  it('xử lý an toàn khi input là null, undefined, hoặc số', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(123)).toBe('123');
  });
});
