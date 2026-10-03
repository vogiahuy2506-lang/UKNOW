import { describe, it, expect } from '@jest/globals';
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  RECOVERY_ALPHABET,
} from '../recoveryCodes.util.js';

describe('recoveryCodes.util', () => {
  it('sinh 8 mã khác nhau dạng XXXXX-XXXXX từ bảng không có 0/O/1/I', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(c).not.toMatch(/[01OI]/);
      expect(looksLikeRecoveryCode(c)).toBe(true);
    }
  });

  it('normalize: upper + bỏ ký tự ngoài bảng; hash ổn định theo dạng chuẩn hoá', () => {
    expect(normalizeRecoveryCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeRecoveryCode(' ab cde fgh jk ')).toBe('ABCDEFGHJK');
    expect(hashRecoveryCode('abcde-fghjk')).toBe(hashRecoveryCode('ABCDEFGHJK'));
    expect(hashRecoveryCode('ABCDE-FGHJK')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('ABCDE-FGHJK')).not.toBe(hashRecoveryCode('ABCDE-FGHJL'));
  });

  it('looksLikeRecoveryCode: nhận 10 ký tự bảng, từ chối mã TOTP 6 số và chuỗi lạ', () => {
    expect(looksLikeRecoveryCode('ABCDEFGHJK')).toBe(true);
    expect(looksLikeRecoveryCode('abcde-fghjk')).toBe(true);
    expect(looksLikeRecoveryCode('123456')).toBe(false);
    expect(looksLikeRecoveryCode('ABCDE-FGHJ')).toBe(false);
    expect(looksLikeRecoveryCode('ABCDE FGHJK')).toBe(false);
    expect(RECOVERY_ALPHABET).toHaveLength(32);
  });
});
