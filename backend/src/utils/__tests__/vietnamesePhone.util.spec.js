import { describe, it, expect } from '@jest/globals';
import {
  normalizeVietnamesePhone,
  isValidVietnamesePhone,
} from '../vietnamesePhone.util.js';

describe('vietnamesePhone.util', () => {
  describe('normalizeVietnamesePhone', () => {
    it('phục hồi số 0 cho số 9 chữ số bắt đầu bằng [35789]', () => {
      expect(normalizeVietnamesePhone('844790999')).toBe('0844790999');
      expect(normalizeVietnamesePhone('388180856')).toBe('0388180856');
      expect(normalizeVietnamesePhone('912345678')).toBe('0912345678');
      expect(normalizeVietnamesePhone('772345678')).toBe('0772345678');
      expect(normalizeVietnamesePhone('562345678')).toBe('0562345678');
    });

    it('chuẩn hoá +84 và 84 về đầu 0', () => {
      expect(normalizeVietnamesePhone('+84844790999')).toBe('0844790999');
      expect(normalizeVietnamesePhone('84912345678')).toBe('0912345678');
      expect(normalizeVietnamesePhone('+84388180856')).toBe('0388180856');
    });

    it('loại bỏ khoảng trắng, dấu gạch nối, dấu chấm, dấu ngoặc', () => {
      expect(normalizeVietnamesePhone('(084) 479-0999')).toBe('0844790999');
      expect(normalizeVietnamesePhone('091.234.5678')).toBe('0912345678');
      expect(normalizeVietnamesePhone(' 038 818 0856 ')).toBe('0388180856');
    });

    it('giữ nguyên số 0 chuẩn ban đầu', () => {
      expect(normalizeVietnamesePhone('0844790999')).toBe('0844790999');
      expect(normalizeVietnamesePhone('0912345678')).toBe('0912345678');
    });

    it('trả về chuỗi rỗng cho input null/undefined/rỗng', () => {
      expect(normalizeVietnamesePhone(null)).toBe('');
      expect(normalizeVietnamesePhone(undefined)).toBe('');
      expect(normalizeVietnamesePhone('')).toBe('');
    });
  });

  describe('isValidVietnamesePhone', () => {
    it('chấp nhận số điện thoại di động Việt Nam hợp lệ', () => {
      expect(isValidVietnamesePhone('0844790999')).toBe(true);
      expect(isValidVietnamesePhone('844790999')).toBe(true); // tự phục hồi số 0
      expect(isValidVietnamesePhone('+84844790999')).toBe(true);
      expect(isValidVietnamesePhone('0912345678')).toBe(true);
      expect(isValidVietnamesePhone('0388180856')).toBe(true);
      expect(isValidVietnamesePhone('0772345678')).toBe(true);
      expect(isValidVietnamesePhone('0562345678')).toBe(true);
    });

    it('từ chối số không phải đầu số di động chuẩn Việt Nam (01, 02, 04, 06, ...)', () => {
      expect(isValidVietnamesePhone('0123456789')).toBe(false); // đầu 01 không tồn tại
      expect(isValidVietnamesePhone('0241234567')).toBe(false); // cố định Hà Nội
      expect(isValidVietnamesePhone('0281234567')).toBe(false); // cố định TP.HCM
      expect(isValidVietnamesePhone('0412345678')).toBe(false);
      expect(isValidVietnamesePhone('0612345678')).toBe(false);
    });

    it('từ chối số quá ngắn hoặc quá dài hoặc có ký tự lạ', () => {
      expect(isValidVietnamesePhone('12345678')).toBe(false);
      expect(isValidVietnamesePhone('091234567899')).toBe(false);
      expect(isValidVietnamesePhone('not-a-phone')).toBe(false);
      expect(isValidVietnamesePhone('abc0912345678')).toBe(false);
    });
  });
});
