import { describe, it, expect } from 'vitest';
import {
  stripFounderLandingAutoBlocks,
  rewriteHttpAnchorsToTrack,
  injectLandingEnhancements,
  getLandingManualInsertSnippets,
  prepareLandingHtmlForPreview,
} from '../injectLandingEnhancements';

describe('stripFounderLandingAutoBlocks', () => {
  it('xóa section data-founder-lp-embed (cả nội dung)', () => {
    const html = '<p>Trước</p><section data-founder-lp-embed="1"><h1>X</h1></section><p>Sau</p>';
    expect(stripFounderLandingAutoBlocks(html)).toBe('<p>Trước</p><p>Sau</p>');
  });

  it('xóa div data-founder-lp-injected', () => {
    const html = '<div data-founder-lp-injected="1"></div>';
    expect(stripFounderLandingAutoBlocks(html)).toBe('');
  });

  it('xóa <script src="...lp-track.js"...> dạng đóng đầy đủ', () => {
    const html = '<script src="https://x/lp-track.js" defer></script>';
    expect(stripFounderLandingAutoBlocks(html)).toBe('');
  });

  it('xóa <script ... lp-track.js .../> self-closing', () => {
    const html = '<script src="https://x/lp-track.js" defer />';
    expect(stripFounderLandingAutoBlocks(html)).toBe('');
  });

  it('null/undefined → "" (string cast)', () => {
    expect(stripFounderLandingAutoBlocks(null)).toBe('');
    expect(stripFounderLandingAutoBlocks(undefined)).toBe('');
  });
});

describe('rewriteHttpAnchorsToTrack', () => {
  it("rewrite href http(s) → tracking URL + thêm target+rel khi chưa có", () => {
    const out = rewriteHttpAnchorsToTrack(
      '<a href="https://uknow.vn/khoa-hoc">A</a>',
      { slug: 'lp1', apiBase: 'http://localhost:5001/api' }
    );
    expect(out).toContain(
      'href="http://localhost:5001/api/public/landing-track/go?slug=lp1&u=https%3A%2F%2Fuknow.vn%2Fkhoa-hoc"'
    );
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("href đã chứa /public/landing-track/go → không rewrite, nhưng thêm target+rel", () => {
    const html = '<a href="/api/public/landing-track/go?slug=x&u=...">B</a>';
    const out = rewriteHttpAnchorsToTrack(html, { slug: 'lp1', apiBase: '/api' });
    expect(out).toContain('href="/api/public/landing-track/go?slug=x&u=..."');
    expect(out).toContain('target="_blank"');
  });

  it('giữ nguyên href tương đối không http(s)', () => {
    const html = '<a href="/contact">C</a>';
    const out = rewriteHttpAnchorsToTrack(html, { slug: 'lp1', apiBase: '/api' });
    expect(out).toBe(html);
  });

  it('slug rỗng / apiBase rỗng → trả html nguyên', () => {
    const html = '<a href="https://x.com">X</a>';
    expect(rewriteHttpAnchorsToTrack(html, { slug: '', apiBase: '/api' })).toBe(html);
    expect(rewriteHttpAnchorsToTrack(html, { slug: 'lp', apiBase: '' })).toBe(html);
  });

  it('rewrite cả single quote và double quote', () => {
    const out = rewriteHttpAnchorsToTrack(
      "<a href='https://uknow.vn/a'>S</a>",
      { slug: 'l', apiBase: '/api' }
    );
    expect(out).toContain('/api/public/landing-track/go?slug=l&u=');
  });
});

describe('injectLandingEnhancements', () => {
  const opts = { slug: 'lp1', frontendOrigin: 'https://app.uknow.vn', apiBase: '/api' };

  it('chèn script trước </body>', () => {
    const html = '<html><body><h1>X</h1></body></html>';
    const out = injectLandingEnhancements(html, opts);
    expect(out).toMatch(/data-founder-lp-injected="1"/);
    expect(out).toMatch(/lp-track\.js/);
    expect(out.indexOf('lp-track.js')).toBeLessThan(out.indexOf('</body>'));
  });

  it('không có </body> nhưng có </html> → chèn trước </html>', () => {
    const html = '<html><h1>X</h1></html>';
    const out = injectLandingEnhancements(html, opts);
    expect(out).toMatch(/lp-track\.js/);
    expect(out.indexOf('lp-track.js')).toBeLessThan(out.indexOf('</html>'));
  });

  it('không có body/html → append cuối', () => {
    const out = injectLandingEnhancements('<p>X</p>', opts);
    expect(out.startsWith('<p>X</p>')).toBe(true);
    expect(out).toMatch(/lp-track\.js/);
  });

  it('đã inject trước (data-founder-lp-injected="1") → no-op', () => {
    const html = '<div data-founder-lp-injected="1"></div><body></body>';
    expect(injectLandingEnhancements(html, opts)).toBe(html);
  });

  it('slug rỗng → no-op', () => {
    const html = '<body></body>';
    expect(injectLandingEnhancements(html, { ...opts, slug: '' })).toBe(html);
  });

  it('frontendOrigin / apiBase rỗng → no-op', () => {
    const html = '<body></body>';
    expect(injectLandingEnhancements(html, { ...opts, frontendOrigin: '' })).toBe(html);
    expect(injectLandingEnhancements(html, { ...opts, apiBase: '' })).toBe(html);
  });

  it('HTML đã có lp-track.js → bỏ qua script chèn nhưng giữ HTML', () => {
    const html = '<body><script src="x/lp-track.js"></script></body>';
    expect(injectLandingEnhancements(html, opts)).toBe(html);
  });
});

describe('getLandingManualInsertSnippets', () => {
  it('combined chứa iframe + script (đủ slug/origin/apiBase)', () => {
    const r = getLandingManualInsertSnippets({
      slug: 'lp1',
      frontendOrigin: 'https://app.uknow.vn/',
      apiBase: '/api',
    });
    expect(r.iframeBlock).toContain('embed/lead-form?slug=lp1');
    expect(r.scriptBlock).toContain('lp-track.js');
    expect(r.scriptBlock).toContain('data-slug="lp1"');
    expect(r.combined).toBe(`${r.iframeBlock}${r.scriptBlock}`);
  });

  it('thiếu slug/origin/apiBase → rỗng', () => {
    expect(
      getLandingManualInsertSnippets({ slug: '', frontendOrigin: 'x', apiBase: '/api' })
    ).toEqual({ iframeBlock: '', scriptBlock: '', combined: '' });
    expect(
      getLandingManualInsertSnippets({ slug: 's', frontendOrigin: '', apiBase: '/api' })
    ).toEqual({ iframeBlock: '', scriptBlock: '', combined: '' });
  });
});

describe('prepareLandingHtmlForPreview', () => {
  it('full pipeline — strip founder block, rewrite anchor, inject script', () => {
    const html = `
      <section data-founder-lp-embed="1">old iframe</section>
      <a href="https://uknow.vn">CTA</a>
      <body>
        <h1>X</h1>
      </body>
    `;
    const out = prepareLandingHtmlForPreview(html, {
      slug: 'lp1',
      frontendOrigin: 'https://app.uknow.vn',
      apiBase: '/api',
    });
    expect(out).not.toContain('data-founder-lp-embed');
    expect(out).toContain('/api/public/landing-track/go?slug=lp1');
    expect(out).toContain('lp-track.js');
  });

  it('slug rỗng → trả html nguyên (string cast)', () => {
    expect(prepareLandingHtmlForPreview('<p>X</p>', { slug: '', frontendOrigin: 'x', apiBase: '/api' })).toBe(
      '<p>X</p>'
    );
  });
});
