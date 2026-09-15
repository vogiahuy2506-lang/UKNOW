import { describe, it, expect } from 'vitest';
import { normalizeAccountPhone, isValidAccountPhone } from '../phoneValidation';

describe('normalizeAccountPhone', () => {
  it('84xxxxxxxxx (mã quốc gia) → 0xxxxxxxxx', () => {
    expect(normalizeAccountPhone('84912345678')).toBe('0912345678');
  });

  it('+84 912 345 678 (dấu + và khoảng trắng) → 0912345678', () => {
    expect(normalizeAccountPhone('+84 912 345 678')).toBe('0912345678');
  });

  it('0912-345-678 (gạch nối) → chỉ giữ số', () => {
    expect(normalizeAccountPhone('0912-345-678')).toBe('0912345678');
  });

  it('912345678 (9 số, thiếu 0, bắt đầu bằng 9) → khôi phục số 0', () => {
    expect(normalizeAccountPhone('912345678')).toBe('0912345678');
  });

  it('312345678 (9 số, thiếu 0, KHÔNG bắt đầu bằng 9) → giữ nguyên 9 số (không thêm 0)', () => {
    expect(normalizeAccountPhone('312345678')).toBe('312345678');
  });

  it('rỗng / null / undefined → chuỗi rỗng', () => {
    expect(normalizeAccountPhone('')).toBe('');
    expect(normalizeAccountPhone(null)).toBe('');
    expect(normalizeAccountPhone(undefined)).toBe('');
  });
});

describe('isValidAccountPhone — bảng ca mục 3 plan', () => {
  const validCases = [
    '0987654321',
    '0312345678',
    '0912-345-678',
    '+84 912 345 678',
    '84912345678',
    '912345678',
  ];

  validCases.forEach((input) => {
    it(`"${input}" → đạt`, () => {
      expect(isValidAccountPhone(input)).toBe(true);
    });
  });

  const invalidCases = [
    '1111111111',
    '0111111111',
    'abc1234567890',
    '02838123456',
    '09123456789',
    '091234567',
    '312345678',
    '',
    null,
  ];

  invalidCases.forEach((input) => {
    it(`"${input}" → trượt`, () => {
      expect(isValidAccountPhone(input)).toBe(false);
    });
  });
});
