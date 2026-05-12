import { describe, it, expect } from '@jest/globals';
import { isValidPublicLandingRedirectUrl } from '../landingRedirectTarget.util.js';

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
