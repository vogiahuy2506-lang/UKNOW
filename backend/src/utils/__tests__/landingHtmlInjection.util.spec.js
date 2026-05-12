import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  stripFounderLandingAutoBlocks,
  rewriteHttpAnchorsToTrack,
  normalizeLandingLpTrackApiBase,
  prepareLandingHtmlOnSave,
  injectLandingEnhancements,
  resolveFrontendOriginFromEnv,
  resolvePublicApiBaseFromEnv,
} from '../landingHtmlInjection.util.js';

describe('landingHtmlInjection.util', () => {
  describe('stripFounderLandingAutoBlocks', () => {
    it('xóa <section data-founder-lp-embed>', () => {
      const html = '<p>before</p><section data-founder-lp-embed="1"><iframe></iframe></section><p>after</p>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).not.toContain('data-founder-lp-embed');
      expect(out).toContain('<p>before</p>');
      expect(out).toContain('<p>after</p>');
    });

    it('xóa <div data-founder-lp-injected>', () => {
      const html = '<div data-founder-lp-injected="1" style="display:none"></div><p>x</p>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).not.toContain('data-founder-lp-injected');
      expect(out).toContain('<p>x</p>');
    });

    it('xóa <script ...lp-track.js...>', () => {
      const html = '<script src="https://host/lp-track.js" defer></script><p>ok</p>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).not.toContain('lp-track.js');
      expect(out).toContain('<p>ok</p>');
    });

    it('idempotent: chạy 2 lần ra cùng kết quả', () => {
      const html = '<section data-founder-lp-embed="1">x</section><script src="lp-track.js"></script><div data-founder-lp-injected="1"></div>';
      const once = stripFounderLandingAutoBlocks(html);
      const twice = stripFounderLandingAutoBlocks(once);
      expect(twice).toBe(once);
    });

    it('giữ HTML không khớp pattern', () => {
      const html = '<section>regular section</section><script src="other.js"></script>';
      expect(stripFounderLandingAutoBlocks(html)).toBe(html);
    });

    it('input null/undefined → trả chuỗi rỗng', () => {
      expect(stripFounderLandingAutoBlocks(null)).toBe('');
      expect(stripFounderLandingAutoBlocks(undefined)).toBe('');
    });
  });

  describe('normalizeLandingLpTrackApiBase', () => {
    it('cắt trailing slash', () => {
      expect(normalizeLandingLpTrackApiBase('https://api.example.com/')).toBe('https://api.example.com');
      expect(normalizeLandingLpTrackApiBase('https://api.example.com///')).toBe('https://api.example.com');
    });

    it('gộp /api/api thành /api', () => {
      expect(normalizeLandingLpTrackApiBase('https://api.example.com/api/api')).toBe('https://api.example.com/api');
      expect(normalizeLandingLpTrackApiBase('https://api.example.com/api/api/api')).toBe('https://api.example.com/api');
    });

    it('giữ /api duy nhất', () => {
      expect(normalizeLandingLpTrackApiBase('https://api.example.com/api')).toBe('https://api.example.com/api');
    });

    it('xử lý input rỗng/null', () => {
      expect(normalizeLandingLpTrackApiBase('')).toBe('');
      expect(normalizeLandingLpTrackApiBase(null)).toBe('');
      expect(normalizeLandingLpTrackApiBase(undefined)).toBe('');
    });

    it('trim khoảng trắng', () => {
      expect(normalizeLandingLpTrackApiBase('  https://x.com/api  ')).toBe('https://x.com/api');
    });
  });

  describe('rewriteHttpAnchorsToTrack', () => {
    const opts = { slug: 'promo', apiBase: 'http://api.test/api' };

    it('rewrite href http(s) sang URL tracking', () => {
      const html = '<a href="https://example.com/page">Link</a>';
      const out = rewriteHttpAnchorsToTrack(html, opts);
      expect(out).toContain('href="http://api.test/api/public/landing-track/go?slug=promo&u=');
      expect(out).toContain(encodeURIComponent('https://example.com/page'));
    });

    it('thêm target="_blank" và rel khi chưa có', () => {
      const html = '<a href="https://example.com">Link</a>';
      const out = rewriteHttpAnchorsToTrack(html, opts);
      expect(out).toContain('target="_blank"');
      expect(out).toContain('rel="noopener noreferrer"');
    });

    it('không thêm target/rel nếu đã có sẵn', () => {
      const html = '<a href="https://example.com" target="_self" rel="custom">Link</a>';
      const out = rewriteHttpAnchorsToTrack(html, opts);
      // chỉ 1 target, 1 rel
      expect((out.match(/target=/g) || []).length).toBe(1);
      expect((out.match(/rel=/g) || []).length).toBe(1);
      expect(out).toContain('target="_self"');
    });

    it('bỏ qua URL đã là tracking endpoint', () => {
      const html = '<a href="http://api.test/api/public/landing-track/go?slug=x&u=y">L</a>';
      const out = rewriteHttpAnchorsToTrack(html, opts);
      // không double-encode
      expect(out).toContain('http://api.test/api/public/landing-track/go?slug=x&u=y');
      // không nên có /go?slug=promo bên ngoài URL gốc
      expect(out.split('?slug=').length - 1).toBe(1);
    });

    it('giữ nguyên href mailto/tel/javascript', () => {
      const html = '<a href="mailto:a@b.com">Mail</a><a href="tel:0900">Tel</a><a href="javascript:void(0)">JS</a>';
      const out = rewriteHttpAnchorsToTrack(html, opts);
      expect(out).toContain('href="mailto:a@b.com"');
      expect(out).toContain('href="tel:0900"');
      expect(out).toContain('href="javascript:void(0)"');
      expect(out).not.toContain('landing-track/go');
    });

    it('hỗ trợ href bằng single quote', () => {
      const html = "<a href='https://example.com'>Link</a>";
      const out = rewriteHttpAnchorsToTrack(html, opts);
      expect(out).toContain("landing-track/go?slug=promo&u=");
    });

    it('slug rỗng → trả về nguyên HTML', () => {
      const html = '<a href="https://example.com">L</a>';
      expect(rewriteHttpAnchorsToTrack(html, { slug: '', apiBase: 'http://x/api' })).toBe(html);
    });

    it('apiBase rỗng → trả về nguyên HTML', () => {
      const html = '<a href="https://example.com">L</a>';
      expect(rewriteHttpAnchorsToTrack(html, { slug: 'promo', apiBase: '' })).toBe(html);
    });

    it('input null/undefined → trả chuỗi rỗng (không throw)', () => {
      expect(rewriteHttpAnchorsToTrack(null, opts)).toBe('');
      expect(rewriteHttpAnchorsToTrack(undefined, opts)).toBe('');
    });

    it('xử lý nhiều thẻ <a> trong cùng HTML', () => {
      const html = '<a href="https://a.com">A</a><p>x</p><a href="https://b.com">B</a>';
      const out = rewriteHttpAnchorsToTrack(html, opts);
      expect(out).toContain(encodeURIComponent('https://a.com'));
      expect(out).toContain(encodeURIComponent('https://b.com'));
    });

    it('encode URL gốc vào query param', () => {
      const html = '<a href="https://example.com/path?a=1&b=2">L</a>';
      const out = rewriteHttpAnchorsToTrack(html, opts);
      expect(out).toContain(encodeURIComponent('https://example.com/path?a=1&b=2'));
    });

    it('slug được lowercase + trim', () => {
      const html = '<a href="https://example.com">L</a>';
      const out = rewriteHttpAnchorsToTrack(html, { slug: '  PROMO  ', apiBase: 'http://api.test/api' });
      expect(out).toContain('?slug=promo&u=');
    });
  });

  describe('injectLandingEnhancements', () => {
    const opts = {
      slug: 'promo',
      frontendOrigin: 'http://localhost:5174',
      apiBase: 'http://localhost:5001/api',
    };

    it('chèn marker + script trước </body>', () => {
      const html = '<html><body><p>hello</p></body></html>';
      const out = injectLandingEnhancements(html, opts);
      expect(out).toContain('data-founder-lp-injected="1"');
      expect(out).toContain('<script src="http://localhost:5174/lp-track.js"');
      expect(out).toContain('data-slug="promo"');
      expect(out).toContain('data-api-base="http://localhost:5001/api"');
      expect(out.indexOf('lp-track.js')).toBeLessThan(out.indexOf('</body>'));
    });

    it('bỏ qua nếu marker đã tồn tại (idempotent)', () => {
      const html = '<html><body><div data-founder-lp-injected="1"></div></body></html>';
      const out = injectLandingEnhancements(html, opts);
      expect(out).toBe(html);
    });

    it('không thêm script nếu đã có lp-track.js (nhưng vẫn return HTML)', () => {
      const html = '<html><body><script src="lp-track.js"></script></body></html>';
      const out = injectLandingEnhancements(html, opts);
      // không tăng số lần lp-track.js
      expect((out.match(/lp-track\.js/g) || []).length).toBe(1);
    });

    it('chèn trước </html> nếu không có </body>', () => {
      const html = '<html><p>x</p></html>';
      const out = injectLandingEnhancements(html, opts);
      expect(out).toContain('lp-track.js');
      expect(out.indexOf('lp-track.js')).toBeLessThan(out.indexOf('</html>'));
    });

    it('append cuối nếu không có </body> và </html>', () => {
      const html = '<p>just a fragment</p>';
      const out = injectLandingEnhancements(html, opts);
      expect(out.startsWith('<p>just a fragment</p>')).toBe(true);
      expect(out).toContain('lp-track.js');
    });

    it('slug rỗng → trả HTML không đổi', () => {
      const html = '<html><body></body></html>';
      expect(injectLandingEnhancements(html, { ...opts, slug: '' })).toBe(html);
    });

    it('frontendOrigin rỗng → trả HTML không đổi', () => {
      const html = '<html><body></body></html>';
      expect(injectLandingEnhancements(html, { ...opts, frontendOrigin: '' })).toBe(html);
    });

    it('apiBase rỗng → trả HTML không đổi', () => {
      const html = '<html><body></body></html>';
      expect(injectLandingEnhancements(html, { ...opts, apiBase: '' })).toBe(html);
    });

    it('normalize /api/api trong apiBase', () => {
      const html = '<html><body></body></html>';
      const out = injectLandingEnhancements(html, {
        ...opts,
        apiBase: 'http://localhost:5001/api/api',
      });
      expect(out).toContain('data-api-base="http://localhost:5001/api"');
    });

    it('strip trailing slash từ frontendOrigin', () => {
      const html = '<html><body></body></html>';
      const out = injectLandingEnhancements(html, {
        ...opts,
        frontendOrigin: 'http://localhost:5174///',
      });
      expect(out).toContain('src="http://localhost:5174/lp-track.js"');
    });
  });

  describe('prepareLandingHtmlOnSave', () => {
    const opts = {
      slug: 'promo',
      frontendOrigin: 'http://localhost:5174',
      apiBase: 'http://localhost:5001/api',
    };

    it('chạy đủ pipeline: strip → rewrite link → inject script', () => {
      const html =
        '<html><body>' +
        '<section data-founder-lp-embed="1">old</section>' +
        '<a href="https://target.com">click</a>' +
        '</body></html>';
      const out = prepareLandingHtmlOnSave(html, opts);
      expect(out).not.toContain('data-founder-lp-embed');
      expect(out).toContain('landing-track/go');
      expect(out).toContain('lp-track.js');
      expect(out).toContain('data-slug="promo"');
    });

    it('idempotent: gọi 2 lần kết quả không thay đổi', () => {
      const html = '<html><body><a href="https://target.com">L</a></body></html>';
      const once = prepareLandingHtmlOnSave(html, opts);
      const twice = prepareLandingHtmlOnSave(once, opts);
      // Sau lần 2: script đã có, marker đã có → injectLandingEnhancements skip;
      //            khối auto đã bị strip → giữ nguyên;
      //            link đã được rewrite → rewrite nội bộ skip vì URL chứa /go.
      expect(twice).toBe(once);
    });

    it('slug rỗng → trả nguyên HTML không xử lý', () => {
      const html = '<html><body><a href="https://x.com">L</a></body></html>';
      expect(prepareLandingHtmlOnSave(html, { ...opts, slug: '' })).toBe(html);
    });

    it('input null vẫn xử lý được (không throw), chèn script tracking dù không có body', () => {
      const out = prepareLandingHtmlOnSave(null, opts);
      expect(typeof out).toBe('string');
      expect(out).toContain('lp-track.js');
      expect(out).toContain('data-slug="promo"');
    });
  });

  describe('resolveFrontendOriginFromEnv', () => {
    let prevPrimary;
    let prevList;

    beforeEach(() => {
      prevPrimary = process.env.FRONTEND_URL;
      prevList = process.env.FRONTEND_URLS;
      delete process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URLS;
    });

    afterEach(() => {
      if (prevPrimary === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = prevPrimary;
      if (prevList === undefined) delete process.env.FRONTEND_URLS;
      else process.env.FRONTEND_URLS = prevList;
    });

    it('ưu tiên FRONTEND_URL', () => {
      process.env.FRONTEND_URL = 'http://primary.test';
      process.env.FRONTEND_URLS = 'http://fallback.test';
      expect(resolveFrontendOriginFromEnv()).toBe('http://primary.test');
    });

    it('strip trailing slash của FRONTEND_URL', () => {
      process.env.FRONTEND_URL = 'http://primary.test///';
      expect(resolveFrontendOriginFromEnv()).toBe('http://primary.test');
    });

    it('fallback sang phần tử đầu của FRONTEND_URLS', () => {
      process.env.FRONTEND_URLS = 'http://first.test, http://second.test';
      expect(resolveFrontendOriginFromEnv()).toBe('http://first.test');
    });

    it('bỏ qua phần tử rỗng trong FRONTEND_URLS', () => {
      process.env.FRONTEND_URLS = ' , , http://only.test';
      expect(resolveFrontendOriginFromEnv()).toBe('http://only.test');
    });

    it('mặc định localhost:5174 nếu không có env', () => {
      expect(resolveFrontendOriginFromEnv()).toBe('http://localhost:5174');
    });
  });

  describe('resolvePublicApiBaseFromEnv', () => {
    let prev;

    beforeEach(() => {
      prev = process.env.BACKEND_PUBLIC_URL;
      delete process.env.BACKEND_PUBLIC_URL;
    });

    afterEach(() => {
      if (prev === undefined) delete process.env.BACKEND_PUBLIC_URL;
      else process.env.BACKEND_PUBLIC_URL = prev;
    });

    it('mặc định localhost:5001/api nếu không có env', () => {
      expect(resolvePublicApiBaseFromEnv()).toBe('http://localhost:5001/api');
    });

    it('thêm /api nếu BACKEND_PUBLIC_URL chưa có', () => {
      process.env.BACKEND_PUBLIC_URL = 'https://api.example.com';
      expect(resolvePublicApiBaseFromEnv()).toBe('https://api.example.com/api');
    });

    it('không nhân đôi /api nếu đã có sẵn', () => {
      process.env.BACKEND_PUBLIC_URL = 'https://api.example.com/api';
      expect(resolvePublicApiBaseFromEnv()).toBe('https://api.example.com/api');
    });

    it('xử lý trailing slash của BACKEND_PUBLIC_URL', () => {
      process.env.BACKEND_PUBLIC_URL = 'https://api.example.com/';
      expect(resolvePublicApiBaseFromEnv()).toBe('https://api.example.com/api');
    });
  });
});
