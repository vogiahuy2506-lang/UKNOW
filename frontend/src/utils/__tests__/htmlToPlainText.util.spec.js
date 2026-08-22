import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '../htmlToPlainText.util';

describe('htmlToPlainText', () => {
  it('returns empty string for null/undefined', () => {
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
  });

  it('converts <p> and <div> to double newlines (paragraph spacing)', () => {
    expect(htmlToPlainText('<p>Xin chào</p>')).toBe('Xin chào');
    expect(htmlToPlainText('<p>Para 1</p><p>Para 2</p>')).toBe('Para 1\n\nPara 2');
    expect(htmlToPlainText('<div>Block 1</div><div>Block 2</div>')).toBe('Block 1\n\nBlock 2');
  });

  it('returns plain text unchanged when no HTML tags', () => {
    expect(htmlToPlainText('Chúng tôi rất vui được giới thiệu sản phẩm mới.')).toBe(
      'Chúng tôi rất vui được giới thiệu sản phẩm mới.',
    );
  });

  it('returns empty when input is HTML chrome only', () => {
    // Mirrors the bug we just hit: a template body was just `<div><br/></div>`
    // — the user picked a template, but the resolved plain text came back as
    // "" and the "no template" toast fired.
    expect(htmlToPlainText('<div><br/></div>')).toBe('');
    expect(htmlToPlainText('<table></table>')).toBe('');
  });

  it('collapses whitespace and decodes common entities', () => {
    expect(htmlToPlainText('<p>  Hello&nbsp;&amp;World  </p>')).toBe('Hello &World');
  });
});