import { describe, expect, it } from '@jest/globals';
import { sanitizeHelpHtml, htmlToPlainText } from '../helpHtmlSanitize.util.js';
import { validateHelpImageFile } from '../helpImageUpload.util.js';

describe('sanitizeHelpHtml', () => {
  it('strips script tags', () => {
    expect(sanitizeHelpHtml('<p>ok</p><script>alert(1)</script>')).not.toContain('script');
    expect(sanitizeHelpHtml('<p>ok</p><script>alert(1)</script>')).toContain('ok');
  });

  it('strips onerror from img', () => {
    const out = sanitizeHelpHtml('<img src="x" onerror="alert(1)">');
    expect(out).toContain('<img');
    expect(out).toContain('src="x"');
    expect(out.toLowerCase()).not.toContain('onerror');
  });

  it('strips javascript: href', () => {
    const out = sanitizeHelpHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('strips svg+script', () => {
    const out = sanitizeHelpHtml('<svg><script>alert(1)</script></svg><p>keep</p>');
    expect(out.toLowerCase()).not.toContain('<svg');
    expect(out).toContain('keep');
  });

  it('strips iframe (video not enabled yet)', () => {
    const out = sanitizeHelpHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe><p>t</p>');
    expect(out.toLowerCase()).not.toContain('iframe');
    expect(out).toContain('t');
  });

  it('keeps safe formatting', () => {
    const out = sanitizeHelpHtml('<p><strong>x</strong></p>');
    expect(out).toBe('<p><strong>x</strong></p>');
  });

  it('allows http img src for local dev URLs', () => {
    const out = sanitizeHelpHtml(
      '<img src="http://localhost:5001/file/abc/download?preview=true" alt="a">'
    );
    expect(out).toContain('http://localhost:5001');
  });

  it('adds rel on external links', () => {
    const out = sanitizeHelpHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('noopener');
  });
});

describe('htmlToPlainText', () => {
  it('keeps paragraph boundaries', () => {
    expect(htmlToPlainText('<h2>A</h2><p>B</p>')).toBe('A\n\nB');
  });

  it('does not leave img URLs in text', () => {
    const out = htmlToPlainText('<p>Hi</p><img src="https://evil.example/a.png"><p>Bye</p>');
    expect(out).not.toContain('http');
    expect(out).not.toContain('evil');
    expect(out).toContain('Hi');
    expect(out).toContain('Bye');
  });

  it('decodes common named entities left by sanitize-html', () => {
    expect(htmlToPlainText('<p>A &amp; B &lt; C &gt; &quot;D&quot;</p>')).toBe('A & B < C > "D"');
  });
});

describe('validateHelpImageFile', () => {
  it('accepts images up to 50MB and rejects larger images', () => {
    const atLimit = validateHelpImageFile({
      mimetype: 'image/png',
      originalName: 'large.png',
      size: 50 * 1024 * 1024,
    });
    const overLimit = validateHelpImageFile({
      mimetype: 'image/png',
      originalName: 'too-large.png',
      size: (50 * 1024 * 1024) + 1,
    });

    expect(atLimit.ok).toBe(true);
    expect(overLimit).toEqual({ ok: false, message: 'Ảnh bài viết tối đa 50MB' });
  });

  it('rejects svg mime', () => {
    const r = validateHelpImageFile({
      mimetype: 'image/svg+xml',
      originalName: 'x.svg',
      size: 100,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects .svg extension even if mime claims png', () => {
    const r = validateHelpImageFile({
      mimetype: 'image/png',
      originalName: 'x.svg',
      size: 100,
    });
    expect(r.ok).toBe(false);
  });

  it('accepts png', () => {
    const r = validateHelpImageFile({
      mimetype: 'image/png',
      originalName: 'photo.png',
      size: 1024,
    });
    expect(r.ok).toBe(true);
  });
});
