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
  countFormSlots,
  hasMalformedFormSlot,
  replaceFormSlotWithEmbed,
  buildFormEmbedSectionHtml,
} from '../landingHtmlInjection.util.js';
import { extractFormEmbedKeys } from '../landingEditGuard.util.js';

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

    it('trang CHỈ có iframe /embed/lead-form, không có <form nào khác → GIỮ iframe (Hệ quả 6, PLAN CẬP NHẬT 08/09 17:30)', () => {
      const html = '<p>before</p><iframe src="/embed/lead-form?slug=demo"></iframe><p>after</p>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).toBe(html);
      expect(out).toContain('/embed/lead-form');
    });

    it('trang có iframe /embed/lead-form VÀ đã có <form khác → strip iframe như cũ', () => {
      const html = '<form><input name="email"/></form><iframe src="/embed/lead-form?slug=demo"></iframe>';
      const out = stripFounderLandingAutoBlocks(html);
      expect(out).not.toContain('/embed/lead-form');
      expect(out).toContain('<form>');
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

    it('lp-track script idempotent: không chèn lần 2 nếu đã có sẵn', () => {
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
      // Không chèn thêm script
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

    it('chạy đủ pipeline: strip script cũ → rewrite link → inject scripts tracking', () => {
      const html =
        '<html><body>' +
        '<section data-founder-lp-embed="1">admin-thiết-kế-riêng</section>' +
        '<a href="https://target.com">click</a>' +
        '</body></html>';
      const out = prepareLandingHtmlOnSave(html, opts);
      // Link đã rewrite
      expect(out).toContain('landing-track/go');
      // Scripts được inject
      expect(out).toContain('lp-track.js');
      expect(out).toContain('founderai-capture.js');
      expect(out).toContain('data-slug="promo"');
      // Section admin thiết kế riêng được giữ nguyên (KHÔNG strip)
      expect(out).toContain('data-founder-lp-embed="1"');
      expect(out).toContain('admin-thiết-kế-riêng');
      // KHÔNG có iframe tự động chèn (v2.0 trở đi)
      expect(out).not.toContain('/embed/lead-form');
    });

    it('idempotent: gọi 2 lần kết quả không thay đổi', () => {
      const html = '<html><body><a href="https://target.com">L</a></body></html>';
      const once = prepareLandingHtmlOnSave(html, opts);
      const twice = prepareLandingHtmlOnSave(once, opts);
      expect(twice).toBe(once);
    });

    it('HTML CHỈ có iframe form cũ, không có <form khác → GIỮ NGUYÊN iframe khi lưu (PLAN CẬP NHẬT 08/09 17:30, Hệ quả 6)', () => {
      const html =
        '<html><body>' +
        '<iframe src="http://localhost:5174/embed/lead-form?slug=promo"></iframe>' +
        '</body></html>';
      const out = prepareLandingHtmlOnSave(html, opts);
      // Scripts vẫn được inject bình thường
      expect(out).toContain('lp-track.js');
      expect(out).toContain('founderai-capture.js');
      // Trang chưa có cách thu lead nào khác → GIỮ iframe, không strip trong im lặng
      expect(out).toContain('/embed/lead-form');
    });

    it('HTML có iframe form cũ VÀ đã có <form khác → strip iframe (đã có đường thu lead thay thế)', () => {
      const html =
        '<html><body>' +
        '<iframe src="http://localhost:5174/embed/lead-form?slug=promo"></iframe>' +
        '<form data-founderai-capture><input name="email"/></form>' +
        '</body></html>';
      const out = prepareLandingHtmlOnSave(html, opts);
      expect(out).toContain('lp-track.js');
      // Đã có <form khác → iframe cũ vẫn bị strip như trước
      expect(out).not.toContain('/embed/lead-form');
      expect(out).toContain('data-founderai-capture');
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

  describe('autoInjectLeadFormIfMissing (deprecated no-op)', () => {
    const opts = { slug: 'promo', frontendOrigin: 'http://localhost:5174' };

    it('trả nguyên HTML — không chèn iframe tự động nữa (v2.0)', () => {
      const html = '<html><body><p>x</p></body></html>';
      expect(autoInjectLeadFormIfMissing(html, opts)).toBe(html);
      expect(autoInjectLeadFormIfMissing(html, opts)).not.toContain('/embed/lead-form');
    });

    it('input null/undefined → trả chuỗi rỗng', () => {
      expect(autoInjectLeadFormIfMissing(null, opts)).toBe('');
      expect(autoInjectLeadFormIfMissing(undefined, opts)).toBe('');
    });

    it('HTML có iframe / form snippet — vẫn trả nguyên HTML (idempotent)', () => {
      const html = '<html><body><iframe src="http://x/embed/lead-form?slug=promo"></iframe></body></html>';
      expect(autoInjectLeadFormIfMissing(html, opts)).toBe(html);
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

  // PR-5b-2a — chỗ trống <div data-founderai-form-slot></div> AI đặt trong HTML, và khối nhúng
  // Biểu mẫu thay chỗ trống đó lúc lưu landing.
  describe('countFormSlots', () => {
    it('đếm 0 khi không có chỗ trống', () => {
      expect(countFormSlots('<section><p>x</p></section>')).toBe(0);
    });

    it('đếm đúng 1', () => {
      expect(countFormSlots('<section><div data-founderai-form-slot></div></section>')).toBe(1);
    });

    it('đếm đúng 2', () => {
      const html = '<div data-founderai-form-slot></div><div data-founderai-form-slot></div>';
      expect(countFormSlots(html)).toBe(2);
    });

    it('chấp nhận khoảng trắng bên trong div nhưng không khớp div có nội dung con thật', () => {
      expect(countFormSlots('<div data-founderai-form-slot>\n  </div>')).toBe(1);
      expect(countFormSlots('<div data-founderai-form-slot>text</div>')).toBe(0);
    });

    it('html rỗng/null → 0', () => {
      expect(countFormSlots('')).toBe(0);
      expect(countFormSlots(null)).toBe(0);
    });

    // Review PR-5b-2a nợ 1 (15/09) — bản đầu KHÔNG khớp khi có thêm thuộc tính khác hoặc
    // data-founderai-form-slot="" (cách viết HTML hợp lệ bình thường), hậu quả là lưu ÂM THẦM cả
    // div rỗng vào landing, không tạo form. Giờ phải khớp.
    describe('nợ 1 (review PR-5b-2a) — chấp nhận thêm thuộc tính/giá trị thuộc tính', () => {
      it('có thêm thuộc tính class trước/sau → đếm 1 (trước đây đếm 0)', () => {
        expect(countFormSlots('<div data-founderai-form-slot class="x"></div>')).toBe(1);
        expect(countFormSlots('<div class="my-8" data-founderai-form-slot></div>')).toBe(1);
      });

      it('data-founderai-form-slot="" (giá trị rỗng, nháy kép/nháy đơn) → đếm 1', () => {
        expect(countFormSlots('<div data-founderai-form-slot=""></div>')).toBe(1);
        expect(countFormSlots("<div data-founderai-form-slot=''></div>")).toBe(1);
      });

      it('kết hợp cả class lẫn ="" (ca đúng nguyên văn review nêu)', () => {
        expect(countFormSlots('<div class="my-8" data-founderai-form-slot=""></div>')).toBe(1);
      });
    });

    // PR-5b-2c (đính chính 16/09) — chú thích HTML bên trong chỗ trống giờ coi như khoảng
    // trắng: admin/AI để lại `<!-- TODO -->` không phải là "nội dung con thật".
    describe('PR-5b-2c — chú thích <!--…--> bên trong coi như khoảng trắng', () => {
      it('chỉ có chú thích bên trong → vẫn đếm là chỗ trống hợp lệ', () => {
        expect(countFormSlots('<div data-founderai-form-slot><!-- TODO --></div>')).toBe(1);
      });

      it('chú thích xen khoảng trắng/nhiều chú thích → vẫn hợp lệ', () => {
        expect(countFormSlots('<div data-founderai-form-slot>  <!-- a -->\n<!-- b -->  </div>')).toBe(1);
      });

      it('chú thích RỒI có nội dung con thật khác → vẫn KHÔNG hợp lệ (không lách được bằng chú thích)', () => {
        expect(countFormSlots('<div data-founderai-form-slot><!-- x --><p>thật</p></div>')).toBe(0);
      });
    });
  });

  describe('hasMalformedFormSlot (nợ 1, review PR-5b-2a)', () => {
    it('div hợp lệ (có/không thêm thuộc tính) → không hỏng dạng', () => {
      expect(hasMalformedFormSlot('<div data-founderai-form-slot></div>')).toBe(false);
      expect(hasMalformedFormSlot('<div class="my-8" data-founderai-form-slot=""></div>')).toBe(false);
    });

    it('có thuộc tính nhưng chứa nội dung con thật → hỏng dạng', () => {
      expect(hasMalformedFormSlot('<div data-founderai-form-slot><p>x</p></div>')).toBe(true);
    });

    it('không có chỗ trống nào → không hỏng dạng (khác 0 chỗ trống hợp lệ nhưng có mặt)', () => {
      expect(hasMalformedFormSlot('<section><p>không liên quan</p></section>')).toBe(false);
      expect(hasMalformedFormSlot('')).toBe(false);
    });

    it('1 chỗ trống hợp lệ + 1 chỗ trống hỏng dạng trong cùng trang → vẫn phát hiện hỏng dạng', () => {
      const html = '<div data-founderai-form-slot></div><div data-founderai-form-slot><span>x</span></div>';
      expect(hasMalformedFormSlot(html)).toBe(true);
    });

    /**
     * PR-5b-2c (review 16/09, probe với hàm thật) — 2 lỗ của FORM_SLOT_ATTR_MENTION_RE bản cũ:
     *   1. Thiếu cờ `i`: thuộc tính viết HOA lọt hẳn khỏi việc đếm "nhắc tên", nên div sai dạng
     *      (có nội dung con) mang thuộc tính HOA bị coi là "không liên quan gì" → lưu nguyên văn.
     *   2. Đếm cả ngoài thẻ: `[data-founderai-form-slot]` làm bộ chọn CSS trong `<style>` bị tính
     *      là một "nhắc tên" thừa, khiến trang có ĐÚNG 1 chỗ trống hợp lệ bị báo sai dạng oan.
     */
    describe('PR-5b-2c — sửa cờ hoa/thường + giới hạn đếm trong thẻ', () => {
      it('thuộc tính viết HOA + có nội dung con → PHẢI phát hiện hỏng dạng (trước đây lọt qua)', () => {
        expect(hasMalformedFormSlot('<div DATA-FOUNDERAI-FORM-SLOT><p>x</p></div>')).toBe(true);
      });

      it('thuộc tính viết HOA nhưng rỗng (hợp lệ) → không hỏng dạng', () => {
        expect(hasMalformedFormSlot('<div DATA-FOUNDERAI-FORM-SLOT></div>')).toBe(false);
        expect(countFormSlots('<div DATA-FOUNDERAI-FORM-SLOT></div>')).toBe(1);
      });

      it('bộ chọn CSS [data-founderai-form-slot] trong <style> + đúng 1 div hợp lệ → KHÔNG hỏng dạng oan', () => {
        const html = '<style>[data-founderai-form-slot]{min-height:1px}</style><div data-founderai-form-slot></div>';
        expect(hasMalformedFormSlot(html)).toBe(false);
        expect(countFormSlots(html)).toBe(1);
      });

      it('chú thích <!--…--> nhắc tên thuộc tính (không phải thẻ thật) → không tính là "nhắc tên"', () => {
        const html = '<!-- data-founderai-form-slot --><div data-founderai-form-slot></div>';
        expect(hasMalformedFormSlot(html)).toBe(false);
        expect(countFormSlots(html)).toBe(1);
      });
    });
  });

  /**
   * PR-5b-2c — bảng ca DÙNG CHUNG với bản frontend (`injectLandingEnhancements.spec.js`
   * `FORM_SLOT_RE`, hàm `injectFormSlotPreviewHint`). Hai regex phải khớp CÙNG nhau — lệch nghĩa
   * là xem trước báo được nhưng lưu lại hỏng, hoặc ngược lại. `validCount` ở đây tương ứng với số
   * chỗ trống mà `injectFormSlotPreviewHint` phải thay ở phía frontend cho cùng input.
   */
  describe('PR-5b-2c — bảng ca dùng chung với frontend (parity)', () => {
    const SHARED_SLOT_CASES = [
      { name: 'div rỗng chuẩn', html: '<div data-founderai-form-slot></div>', validCount: 1, malformed: false },
      { name: 'thêm class + =""', html: '<div class="my-8" data-founderai-form-slot=""></div>', validCount: 1, malformed: false },
      { name: 'chú thích HTML bên trong', html: '<div data-founderai-form-slot><!-- x --></div>', validCount: 1, malformed: false },
      {
        name: 'CSS chọn trong <style> + div hợp lệ',
        html: '<style>[data-founderai-form-slot]{min-height:1px}</style><div data-founderai-form-slot></div>',
        validCount: 1,
        malformed: false,
      },
      { name: 'thuộc tính viết HOA, rỗng', html: '<div DATA-FOUNDERAI-FORM-SLOT></div>', validCount: 1, malformed: false },
      { name: 'thuộc tính viết HOA + nội dung con', html: '<div DATA-FOUNDERAI-FORM-SLOT><p>x</p></div>', validCount: 0, malformed: true },
      { name: 'nội dung con thường', html: '<div data-founderai-form-slot><p>x</p></div>', validCount: 0, malformed: true },
    ];

    it.each(SHARED_SLOT_CASES)('$name → validCount=$validCount, malformed=$malformed', ({ html, validCount, malformed }) => {
      expect(countFormSlots(html)).toBe(validCount);
      expect(hasMalformedFormSlot(html)).toBe(malformed);
    });
  });

  describe('replaceFormSlotWithEmbed', () => {
    it('thay đúng chỗ trống bằng HTML khác, giữ nguyên phần còn lại', () => {
      const html = '<section><div data-founderai-form-slot></div></section>';
      const out = replaceFormSlotWithEmbed(html, '<p>EMBED</p>');
      expect(out).toBe('<section><p>EMBED</p></section>');
    });
  });

  describe('buildFormEmbedSectionHtml', () => {
    it('đúng hợp đồng cố định (khớp ShareModal.jsx): section/div/noscript/script, origin không có trailing slash', () => {
      const html = buildFormEmbedSectionHtml({ publicKey: 'abc123', origin: 'https://example.com/', fallbackText: 'Mở biểu mẫu' });
      expect(html).toBe(
        `<section data-founderai-form-section>
  <div data-founderai-form="abc123"></div>
  <noscript><a href="https://example.com/f/abc123">Mở biểu mẫu</a></noscript>
  <script src="https://example.com/form-embed.js" defer></script>
</section>`
      );
    });

    it('kết quả được extractFormEmbedKeys (landingEditGuard.util.js) nhận ra đúng key', () => {
      const html = buildFormEmbedSectionHtml({ publicKey: 'xyz789', origin: 'https://founderai.biz' });
      const keys = extractFormEmbedKeys(html);
      expect(keys.has('xyz789')).toBe(true);
      expect(keys.size).toBe(1);
    });

    it('thay chỗ trống bằng khối nhúng rồi countFormSlots → 0 (không còn chỗ trống)', () => {
      const withSlot = '<section><div data-founderai-form-slot></div></section>';
      const embed = buildFormEmbedSectionHtml({ publicKey: 'k1', origin: 'https://example.com' });
      const out = replaceFormSlotWithEmbed(withSlot, embed);
      expect(countFormSlots(out)).toBe(0);
      expect(extractFormEmbedKeys(out).has('k1')).toBe(true);
    });
  });
});
