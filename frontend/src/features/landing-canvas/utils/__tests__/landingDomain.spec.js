import { describe, it, expect } from 'vitest';
import { getCustomHostname, isFreeLinkPending, isSystemHostname } from '../landingDomain.js';

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

  describe('isFreeLinkPending', () => {
    it('link miễn phí còn pending_verification → chưa chạy, thử lại được', () => {
      expect(isFreeLinkPending({ kind: 'free', status: 'pending_verification' })).toBe(true);
    });

    it('backend báo canRetryAutoProvision → chưa chạy dù status lạ', () => {
      expect(isFreeLinkPending({ kind: 'free', status: null, canRetryAutoProvision: true })).toBe(true);
    });

    it('link miễn phí đang chạy (active) → không phải pending', () => {
      expect(isFreeLinkPending({ kind: 'free', status: 'active', canRetryAutoProvision: false })).toBe(false);
    });

    it('tên miền riêng chờ xác minh / không có hàng nào / thiếu dữ liệu → KHÔNG phải link miễn phí pending', () => {
      expect(isFreeLinkPending({ kind: 'custom-pending', status: 'pending_verification' })).toBe(false);
      expect(isFreeLinkPending({ kind: 'custom-active', status: 'active' })).toBe(false);
      expect(isFreeLinkPending({ kind: 'none', status: null })).toBe(false);
      expect(isFreeLinkPending(null)).toBe(false);
      expect(isFreeLinkPending(undefined)).toBe(false);
    });
  });
});
