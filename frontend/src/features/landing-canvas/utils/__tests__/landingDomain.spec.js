import { describe, it, expect } from 'vitest';
import { getCustomHostname, isSystemHostname } from '../landingDomain.js';

describe('landingDomain', () => {
  describe('isSystemHostname', () => {
    it.each([
      'abc.founderai.biz',
      'ABC.FounderAI.biz',
      'abc.founderai.biz.',
      'founderai.biz',
      'www.founderai.biz',
    ])('%s là tên miền hệ thống', (h) => {
      expect(isSystemHostname(h)).toBe(true);
    });

    it.each(['lp.example.com', 'example.com', 'founderai.biz.evil.com', 'notfounderai.biz', '', null, undefined])(
      '%s KHÔNG phải tên miền hệ thống',
      (h) => {
        expect(isSystemHostname(h)).toBe(false);
      }
    );
  });

  describe('getCustomHostname', () => {
    it('hostname tên miền riêng → trả về (chữ thường)', () => {
      expect(getCustomHostname({ customDomainHostname: 'LP.Example.com' })).toBe('lp.example.com');
    });

    it('hostname tên miền miễn phí → rỗng', () => {
      expect(getCustomHostname({ customDomainHostname: 'abc.founderai.biz' })).toBe('');
    });

    it('thiếu form / thiếu hostname → rỗng', () => {
      expect(getCustomHostname(null)).toBe('');
      expect(getCustomHostname({})).toBe('');
      expect(getCustomHostname({ customDomainHostname: null })).toBe('');
    });
  });
});
