import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  stripFounderLandingAutoBlocks,
  rewriteHttpAnchorsToTrack,
  normalizeLandingLpTrackApiBase,
  prepareLandingHtmlOnSave,
  injectLandingEnhancements,
  autoInjectLeadFormIfMissing,
  resolveFrontendOriginFromEnv,
  resolvePublicApiBaseFromEnv,
} from '../landingHtmlInjection.util.js';

describe('landingHtmlInjection.util', () => {
  describe('stripFounderLandingAutoBlocks', () => {
    it('giữ HTML không có block auto', () => {
      const html = '<p>before</p><section>regular section</section><p>after</p>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).toBe(html);
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

    it('xóa <script ...founderai-capture.js...>', () => {
      const html = '<script src="https://host/founderai-capture.js" defer></script><p>ok</p>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).not.toContain('founderai-capture.js');
      expect(out).toContain('<p>ok</p>');
    });

    it('idempotent: chạy 2 lần ra cùng kết quả', () => {
      const html = '<script src="lp-track.js"></script><script src="founderai-capture.js"></script><div data-founder-lp-injected="1"></div>';
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

    it('KHÔNG xóa form snippet tự chứa (data-uknow-lead-form) — không khớp pattern data-founder-lp-embed/injected/lp-track.js', () => {
      const html =
        '<p>before</p>' +
        '<form data-uknow-lead-form data-slug="demo" data-api-base="https://api.test/api" style="max-width:430px">' +
        '<input name="email"/><button type="submit">Gửi</button>' +
        '<script>(function(){var f=document.currentScript.previousElementSibling;})();</script>' +
        '</form>' +
        '<p>after</p>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).toBe(html);
      expect(out).toContain('data-uknow-lead-form');
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

    it('chèn marker + lp-track + founderai-capture trước </body>', () => {
      const html = '<html><body><p>hello</p></body></html>';
      const out = injectLandingEnhancements(html, opts);
      expect(out).toContain('data-founder-lp-injected="1"');
      expect(out).toContain('<script src="http://localhost:5174/lp-track.js"');
      expect(out).toContain('<script src="http://localhost:5174/founderai-capture.js"');
      expect(out).toContain('data-slug="promo"');
      expect(out).toContain('data-api-base="http://localhost:5001/api"');
      expect(out.indexOf('lp-track.js')).toBeLessThan(out.indexOf('</body>'));
      expect(out.indexOf('founderai-capture.js')).toBeLessThan(out.indexOf('</body>'));
    });

    it('capture script được inject kể cả khi HTML đã có lp-track.js (idempotent cho track, luôn inject capture)', () => {
      const html = '<html><body><script src="lp-track.js"></script></body></html>';
      const out = injectLandingEnhancements(html, opts);
      // Không tăng số lần lp-track.js
      expect((out.match(/lp-track\.js/g) || []).length).toBe(1);
      // Nhưng founderai-capture.js được inject mới
      expect(out).toContain('founderai-capture.js');
    });

    it('capture script cũng idempotent: không chèn lần 2 nếu đã có sẵn', () => {
      const html = '<html><body><script src="lp-track.js"></script><script src="founderai-capture.js"></script></body></html>';
      const out = injectLandingEnhancements(html, opts);
      expect((out.match(/founderai-capture\.js/g) || []).length).toBe(1);
      expect((out.match(/lp-track\.js/g) || []).length).toBe(1);
      // Không chèn thẻ <script> thứ 3
      expect((out.match(/<script/g) || []).length).toBe(2);
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
      // Khối auto-injected section cũ đã strip, không tự chèn form — chỉ inject script.
      expect(out).not.toContain('data-founder-lp-embed="1"');
      expect(out).not.toContain('/embed/lead-form');
      expect(out).toContain('landing-track/go');
      expect(out).toContain('lp-track.js');
      expect(out).toContain('founderai-capture.js');
      expect(out).toContain('data-slug="promo"');
    });

    it('idempotent: gọi 2 lần kết quả không thay đổi', () => {
      const html = '<html><body><a href="https://target.com">L</a></body></html>';
      const once = prepareLandingHtmlOnSave(html, opts);
      const twice = prepareLandingHtmlOnSave(once, opts);
      // Sau lần 1: đã có iframe + marker → auto-inject skip;
      //           đã có script → injectLandingEnhancements skip;
      //           link đã rewrite → rewrite nội bộ skip vì URL chứa /go.
      expect(twice).toBe(once);
    });

    it('HTML có iframe form cũ → iframe bị strip nhưng script vẫn inject', () => {
      const html =
        '<html><body>' +
        '<iframe src="http://localhost:5174/embed/lead-form?slug=promo"></iframe>' +
        '</body></html>';
      const out = prepareLandingHtmlOnSave(html, opts);
      expect(out).not.toContain('/embed/lead-form');
      expect(out).toContain('lp-track.js');
      expect(out).toContain('founderai-capture.js');
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

  describe('autoInjectLeadFormIfMissing', () => {
    const opts = { slug: 'promo', frontendOrigin: 'http://localhost:5174' };

    it('HTML đã có iframe thật (/embed/lead-form) → không chèn thêm, trả nguyên HTML', () => {
      const html = '<html><body><iframe src="http://x/embed/lead-form?slug=promo"></iframe></body></html>';
      expect(autoInjectLeadFormIfMissing(html, opts)).toBe(html);
    });

    it('HTML đã có form snippet tự chứa (data-uknow-lead-form) → không chèn iframe, trả nguyên HTML', () => {
      const html =
        '<html><body>' +
        '<form data-uknow-lead-form data-slug="promo" data-api-base="http://api.test/api"><input name="email"/></form>' +
        '</body></html>';
      const out = autoInjectLeadFormIfMissing(html, opts);
      expect(out).toBe(html);
      expect(out).not.toContain('/embed/lead-form');
    });

    it('HTML không có form nào → chèn iframe (đường dự phòng còn nguyên)', () => {
      const html = '<html><body><p>x</p></body></html>';
      const out = autoInjectLeadFormIfMissing(html, opts);
      expect(out).toContain('/embed/lead-form?slug=promo');
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
