import { describe, it, expect } from '@jest/globals';
import {
  REFERRAL_CODE_ALPHABET,
  generateReferralCode,
  normalizeReferralCode,
  isValidReferralCodeFormat,
} from '../affiliateReferral.util.js';

describe('affiliateReferral.util', () => {
  describe('REFERRAL_CODE_ALPHABET', () => {
    it('đủ 32 ký tự, không chứa O, 0, I, 1', () => {
      expect(REFERRAL_CODE_ALPHABET).toHaveLength(32);
      expect(REFERRAL_CODE_ALPHABET).not.toContain('O');
      expect(REFERRAL_CODE_ALPHABET).not.toContain('0');
      expect(REFERRAL_CODE_ALPHABET).not.toContain('I');
      expect(REFERRAL_CODE_ALPHABET).not.toContain('1');
    });
  });

  describe('generateReferralCode', () => {
    it('mặc định sinh chuỗi 8 ký tự', () => {
      const code = generateReferralCode();
      expect(code).toHaveLength(8);
      expect(isValidReferralCodeFormat(code)).toBe(true);
    });

    it('cho phép độ dài tùy chỉnh', () => {
      const code10 = generateReferralCode(10);
      expect(code10).toHaveLength(10);
      expect(isValidReferralCodeFormat(code10)).toBe(true);
    });

    it('hai lần sinh liên tiếp không bị trùng', () => {
      const c1 = generateReferralCode();
      const c2 = generateReferralCode();
      expect(c1).not.toBe(c2);
    });
  });

  describe('normalizeReferralCode', () => {
    it('chuyển chữ thường thành chữ hoa và trim khoảng trắng', () => {
      expect(normalizeReferralCode('  k9x2mn7p  ')).toBe('K9X2MN7P');
    });

    it('trả về chuỗi rỗng khi null / undefined / kiểu dữ liệu khác', () => {
      expect(normalizeReferralCode(null)).toBe('');
      expect(normalizeReferralCode(undefined)).toBe('');
      expect(normalizeReferralCode(123)).toBe('');
    });
  });

  describe('isValidReferralCodeFormat', () => {
    it('chấp nhận mã 8 ký tự hợp lệ', () => {
      expect(isValidReferralCodeFormat('K9X2MN7P')).toBe(true);
      expect(isValidReferralCodeFormat('k9x2mn7p')).toBe(true);
    });

    it('từ chối khi chứa ký tự ngoài bảng (0, O, 1, I, ký tự đặc biệt)', () => {
      expect(isValidReferralCodeFormat('K9X2MN70')).toBe(false);
      expect(isValidReferralCodeFormat('K9X2MN7O')).toBe(false);
      expect(isValidReferralCodeFormat('K9X2MN71')).toBe(false);
      expect(isValidReferralCodeFormat('K9X2MN7I')).toBe(false);
      expect(isValidReferralCodeFormat('K9X2-N7P')).toBe(false);
      expect(isValidReferralCodeFormat('K9X2 MN7P')).toBe(false);
    });

    it('từ chối khi độ dài < 4 hoặc > 16', () => {
      expect(isValidReferralCodeFormat('ABC')).toBe(false);
      expect(isValidReferralCodeFormat('ABCDEFGHJKLMNPQR2')).toBe(false); // 17 chars
      expect(isValidReferralCodeFormat('')).toBe(false);
    });
  });
});
