import { describe, it, expect } from '@jest/globals';
import {
  canonicalLandingPageSlug,
  expandLandingSlugsForSqlFilter,
} from '../landingPageSlugCanonical.util.js';

describe('landingPageSlugCanonical.util', () => {
  describe('canonicalLandingPageSlug', () => {
    it('trả slug đã trim + lowercase', () => {
      expect(canonicalLandingPageSlug('  Promo2025  ')).toBe('promo2025');
      expect(canonicalLandingPageSlug('LANDING')).toBe('landing');
    });

    it('strip dấu / đầu/cuối', () => {
      expect(canonicalLandingPageSlug('/promo')).toBe('promo');
      expect(canonicalLandingPageSlug('promo/')).toBe('promo');
      expect(canonicalLandingPageSlug('/promo/')).toBe('promo');
      expect(canonicalLandingPageSlug('///promo///')).toBe('promo');
    });

    it('trả null khi input rỗng / chỉ là dấu /', () => {
      expect(canonicalLandingPageSlug('')).toBeNull();
      expect(canonicalLandingPageSlug('  ')).toBeNull();
      expect(canonicalLandingPageSlug('/')).toBeNull();
      expect(canonicalLandingPageSlug('////')).toBeNull();
      expect(canonicalLandingPageSlug(null)).toBeNull();
      expect(canonicalLandingPageSlug(undefined)).toBeNull();
    });

    it('cắt slug dài quá 100 ký tự', () => {
      const longSlug = 'a'.repeat(150);
      const result = canonicalLandingPageSlug(longSlug);
      expect(result).toHaveLength(100);
      expect(result).toBe('a'.repeat(100));
    });

    it('cắt 100 ký tự sau khi đã strip slash', () => {
      const slug = `/${'b'.repeat(150)}/`;
      expect(canonicalLandingPageSlug(slug)).toHaveLength(100);
    });

    it('giữ ký tự gạch ngang/underscore bên trong', () => {
      expect(canonicalLandingPageSlug('my-page_v2')).toBe('my-page_v2');
    });

    it('xử lý input không phải string', () => {
      expect(canonicalLandingPageSlug(123)).toBe('123');
      expect(canonicalLandingPageSlug(true)).toBe('true');
    });
  });

  describe('expandLandingSlugsForSqlFilter', () => {
    it('mỗi slug sinh cả bản có / và không có /', () => {
      const result = expandLandingSlugsForSqlFilter(['promo']);
      expect(result).toEqual(expect.arrayContaining(['promo', '/promo']));
      expect(result).toHaveLength(2);
    });

    it('slug đã có / đầu cũng được expand sang bản không slash', () => {
      const result = expandLandingSlugsForSqlFilter(['/promo']);
      expect(result).toEqual(expect.arrayContaining(['/promo', 'promo']));
    });

    it('slug "l" được expand thêm "/l" và "/" cho dữ liệu legacy', () => {
      const result = expandLandingSlugsForSqlFilter(['l']);
      expect(result).toEqual(expect.arrayContaining(['l', '/l', '/']));
    });

    it('không duplicate khi merge nhiều slug', () => {
      const result = expandLandingSlugsForSqlFilter(['promo', 'promo']);
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });

    it('bỏ qua slug rỗng/null/undefined', () => {
      const result = expandLandingSlugsForSqlFilter(['', null, undefined, 'promo']);
      expect(result).toEqual(expect.arrayContaining(['promo', '/promo']));
      expect(result).not.toContain('');
      expect(result).not.toContain(null);
    });

    it('lowercase + trim mọi input', () => {
      const result = expandLandingSlugsForSqlFilter(['  Promo  ']);
      expect(result).toEqual(expect.arrayContaining(['promo', '/promo']));
    });

    it('mảng rỗng → kết quả rỗng', () => {
      expect(expandLandingSlugsForSqlFilter([])).toEqual([]);
    });

    it('nhiều slug khác nhau đều được expand', () => {
      const result = expandLandingSlugsForSqlFilter(['a', 'b']);
      expect(result).toEqual(expect.arrayContaining(['a', '/a', 'b', '/b']));
    });
  });
});
