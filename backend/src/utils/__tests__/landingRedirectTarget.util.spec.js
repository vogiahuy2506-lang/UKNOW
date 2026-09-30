import { describe, it, expect } from '@jest/globals';
import {
  extractLandingLinkTargets,
  isAllowedLandingRedirectTarget,
  isValidPublicLandingRedirectUrl,
  normalizeRedirectTarget,
} from '../landingRedirectTarget.util.js';

describe('landingRedirectTarget.util — chỉ chuyển hướng tới link thuộc landing', () => {
  const html = `
    <a href="https://shop.example.com/sp?id=1&amp;ref=lp#mua">Mua</a>
    <a class="x" href='https://Docs.Example.com:443/a b'>Tài liệu</a>
    <area href=https://map.example.com/vn>
    <a href="https://api.founderai.biz/api/public/landing-track/go?slug=promo&amp;u=https%3A%2F%2Fold.example.com%2Fp%3Fq%3D1">Cũ</a>
    <a href="#top">Lên đầu</a><a href="mailto:a@b.c">Mail</a><a href="javascript:alert(1)">x</a>
    <a href="/relative/path">Rel</a>
  `;

  it('normalizeRedirectTarget: bỏ fragment, hạ chữ thường host, bỏ cổng mặc định; không phải http(s) → null', () => {
    expect(normalizeRedirectTarget('https://Docs.Example.com:443/a b#x')).toBe('https://docs.example.com/a%20b');
    expect(normalizeRedirectTarget('javascript:alert(1)')).toBeNull();
    expect(normalizeRedirectTarget('not a url')).toBeNull();
  });

  it('extractLandingLinkTargets: lấy href mọi dạng trích dẫn, giải mã &amp;, mở link tracking cũ', () => {
    const targets = extractLandingLinkTargets(html);
    expect(targets.has('https://shop.example.com/sp?id=1&ref=lp')).toBe(true);
    expect(targets.has('https://docs.example.com/a%20b')).toBe(true);
    expect(targets.has('https://map.example.com/vn')).toBe(true);
    expect(targets.has('https://old.example.com/p?q=1')).toBe(true);
    for (const key of targets) expect(key.startsWith('http')).toBe(true);
    expect([...targets].some((k) => k.includes('javascript'))).toBe(false);
  });

  it('isAllowedLandingRedirectTarget: đích có trong HTML → true; đích lạ → false', () => {
    expect(isAllowedLandingRedirectTarget('https://shop.example.com/sp?id=1&ref=lp', { html })).toBe(true);
    // Fragment khác vẫn là cùng một đích.
    expect(isAllowedLandingRedirectTarget('https://shop.example.com/sp?id=1&ref=lp#khac', { html })).toBe(true);
    expect(isAllowedLandingRedirectTarget('https://old.example.com/p?q=1', { html })).toBe(true);
    expect(isAllowedLandingRedirectTarget('https://evil.example.net/login', { html })).toBe(false);
    // Cùng host nhưng đường dẫn khác không có trong HTML → không.
    expect(isAllowedLandingRedirectTarget('https://shop.example.com/khac', { html })).toBe(false);
    // Giao thức lạ luôn bị từ chối, kể cả khi có trong HTML.
    expect(isAllowedLandingRedirectTarget('javascript:alert(1)', { html })).toBe(false);
  });

  it('isAllowedLandingRedirectTarget: host được phép → true dù không có trong HTML', () => {
    expect(isAllowedLandingRedirectTarget('https://promo.founderai.biz/cam-on', {
      html: '', allowedHosts: ['promo.founderai.biz'],
    })).toBe(true);
    expect(isAllowedLandingRedirectTarget('https://promo.founderai.biz.evil.net/', {
      html: '', allowedHosts: ['promo.founderai.biz'],
    })).toBe(false);
    expect(isAllowedLandingRedirectTarget('https://x.example.com/', { html: null, allowedHosts: [null, ''] })).toBe(false);
  });
});

describe('landingRedirectTarget.util', () => {
  describe('isValidPublicLandingRedirectUrl', () => {
    it('chấp nhận URL https hợp lệ', () => {
      expect(isValidPublicLandingRedirectUrl('https://example.com')).toBe(true);
      expect(isValidPublicLandingRedirectUrl('https://example.com/path?q=1')).toBe(true);
      expect(isValidPublicLandingRedirectUrl('https://sub.example.com:8443')).toBe(true);
    });

    it('chấp nhận URL http hợp lệ', () => {
      expect(isValidPublicLandingRedirectUrl('http://example.com')).toBe(true);
      expect(isValidPublicLandingRedirectUrl('http://localhost:3000/path')).toBe(true);
    });

    it('từ chối javascript: (chặn XSS)', () => {
      expect(isValidPublicLandingRedirectUrl('javascript:alert(1)')).toBe(false);
      expect(isValidPublicLandingRedirectUrl('JavaScript:alert(1)')).toBe(false);
    });

    it('từ chối data: URL', () => {
      expect(isValidPublicLandingRedirectUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('từ chối file: và ftp:', () => {
      expect(isValidPublicLandingRedirectUrl('file:///etc/passwd')).toBe(false);
      expect(isValidPublicLandingRedirectUrl('ftp://example.com')).toBe(false);
    });

    it('từ chối chuỗi không phải URL', () => {
      expect(isValidPublicLandingRedirectUrl('not-a-url')).toBe(false);
      expect(isValidPublicLandingRedirectUrl('example.com')).toBe(false); // không có protocol
    });

    it('từ chối input rỗng / null / undefined', () => {
      expect(isValidPublicLandingRedirectUrl('')).toBe(false);
      expect(isValidPublicLandingRedirectUrl('   ')).toBe(false);
      expect(isValidPublicLandingRedirectUrl(null)).toBe(false);
      expect(isValidPublicLandingRedirectUrl(undefined)).toBe(false);
    });

    it('trim khoảng trắng trước khi parse', () => {
      expect(isValidPublicLandingRedirectUrl('  https://example.com  ')).toBe(true);
    });

    it('từ chối URL không có hostname', () => {
      expect(isValidPublicLandingRedirectUrl('http://')).toBe(false);
    });

    it('chấp nhận URL có query/hash phức tạp', () => {
      const url = 'https://example.com/path?utm=fb&id=1#section';
      expect(isValidPublicLandingRedirectUrl(url)).toBe(true);
    });

    it('không throw với input lạ', () => {
      expect(() => isValidPublicLandingRedirectUrl(123)).not.toThrow();
      expect(() => isValidPublicLandingRedirectUrl({})).not.toThrow();
      expect(() => isValidPublicLandingRedirectUrl([])).not.toThrow();
    });
  });
});
