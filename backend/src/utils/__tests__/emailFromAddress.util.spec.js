import { describe, it, expect } from '@jest/globals';
import {
  sanitizeDisplayName,
  resolveFromAddress,
  extractBrandDomain,
} from '../emailFromAddress.util.js';

describe('emailFromAddress.util', () => {
  describe('sanitizeDisplayName', () => {
    it('strips CRLF and header-breaking characters', () => {
      expect(sanitizeDisplayName('Acme\r\nBcc: evil@x.com')).toBe('AcmeBcc: evil@x.com');
      expect(sanitizeDisplayName('Brand "Name"')).toBe('Brand Name');
      expect(sanitizeDisplayName('<script>')).toBe('script');
    });
  });

  describe('resolveFromAddress', () => {
    it('formats name + email like legacy SMTP header', () => {
      expect(resolveFromAddress({ name: 'Founder AI', email: 'hello@founderai.biz' }))
        .toBe('"Founder AI" <hello@founderai.biz>');
    });

    it('returns bare email when name is empty', () => {
      expect(resolveFromAddress({ name: '   ', email: 'hello@founderai.biz' }))
        .toBe('hello@founderai.biz');
    });

    it('sanitizes user-controlled display name', () => {
      expect(resolveFromAddress({ name: 'Evil\r\nBcc: x', email: 'a@b.com' }))
        .toBe('"EvilBcc: x" <a@b.com>');
    });
  });

  describe('extractBrandDomain', () => {
    it('returns lowercase domain after @', () => {
      expect(extractBrandDomain('Hello@Example.COM')).toBe('example.com');
    });

    it('returns null for invalid input', () => {
      expect(extractBrandDomain('not-an-email')).toBeNull();
      expect(extractBrandDomain('')).toBeNull();
    });
  });
});
