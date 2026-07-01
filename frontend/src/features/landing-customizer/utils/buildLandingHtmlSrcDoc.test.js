import { describe, expect, it } from 'vitest';
import { buildLandingHtmlSrcDoc } from './buildLandingHtmlSrcDoc.js';

describe('buildLandingHtmlSrcDoc', () => {
  it('wraps HTML fragments with tailwind and optional css', () => {
    const doc = buildLandingHtmlSrcDoc('<div class="p-4">Hello</div>', 'body { margin: 0; }');
    expect(doc).toContain('cdn.tailwindcss.com');
    expect(doc).toContain('<div class="p-4">Hello</div>');
    expect(doc).toContain('body { margin: 0; }');
  });

  it('returns full documents unchanged when doctype is present', () => {
    const full = '<!DOCTYPE html><html><head></head><body>OK</body></html>';
    expect(buildLandingHtmlSrcDoc(full)).toBe(full);
  });
});
