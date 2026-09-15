import { describe, it, expect } from '@jest/globals';
import {
  normalizePhoneForZaloCampaign,
  isValidAccountPhone,
  INVALID_ACCOUNT_PHONE_MESSAGE,
} from '../zaloPhoneCampaign.util.js';

describe('normalizePhoneForZaloCampaign', () => {
  it('84xxxxxxxxx (mã quốc gia) → 0xxxxxxxxx', () => {
    expect(normalizePhoneForZaloCampaign('84912345678')).toBe('0912345678');
  });

  it('+84 912 345 678 (dấu + và khoảng trắng) → 0912345678', () => {
    expect(normalizePhoneForZaloCampaign('+84 912 345 678')).toBe('0912345678');
  });

  it('0912-345-678 (gạch nối) → giữ nguyên số, chỉ bỏ ký tự không phải số', () => {
    expect(normalizePhoneForZaloCampaign('0912-345-678')).toBe('0912345678');
  });

  it('0912345678 (đã đúng dạng) → giữ nguyên', () => {
    expect(normalizePhoneForZaloCampaign('0912345678')).toBe('0912345678');
  });

  it('912345678 (9 số, thiếu 0, bắt đầu bằng 9) → khôi phục số 0', () => {
    expect(normalizePhoneForZaloCampaign('912345678')).toBe('0912345678');
  });

  it('812345678 (9 số, thiếu 0, KHÔNG bắt đầu bằng 9) → giữ nguyên 9 số (Bẫy 2b, chưa vá gốc)', () => {
    expect(normalizePhoneForZaloCampaign('812345678')).toBe('812345678');
  });

  it('rỗng/null/undefined → chuỗi rỗng', () => {
    expect(normalizePhoneForZaloCampaign('')).toBe('');
    expect(normalizePhoneForZaloCampaign(null)).toBe('');
    expect(normalizePhoneForZaloCampaign(undefined)).toBe('');
  });

  it('rác chữ cái xen số ("abc123def") → chỉ giữ số', () => {
    expect(normalizePhoneForZaloCampaign('abc123def')).toBe('123');
  });
});

describe('isValidAccountPhone', () => {
  it('10 số di động Việt Nam các đầu số 03, 05, 07, 08, 09 → hợp lệ', () => {
    expect(isValidAccountPhone('0312345678')).toBe(true);
    expect(isValidAccountPhone('0512345678')).toBe(true);
    expect(isValidAccountPhone('0712345678')).toBe(true);
    expect(isValidAccountPhone('0812345678')).toBe(true);
    expect(isValidAccountPhone('0912345678')).toBe(true);
  });

  it('số không bắt đầu bằng đầu số di động VN hợp lệ → không hợp lệ', () => {
    expect(isValidAccountPhone('1111111111')).toBe(false);
    expect(isValidAccountPhone('0111111111')).toBe(false);
    expect(isValidAccountPhone('02838123456')).toBe(false); // số bàn 11 số
    expect(isValidAccountPhone('0412345678')).toBe(false);
    expect(isValidAccountPhone('0612345678')).toBe(false);
  });

  it('độ dài khác 10 chữ số → không hợp lệ', () => {
    expect(isValidAccountPhone('091234567')).toBe(false); // 9 số
    expect(isValidAccountPhone('09123456789')).toBe(false); // 11 số
    expect(isValidAccountPhone('091234567890')).toBe(false); // 12 số
  });

  it('chuỗi rỗng / null / undefined / chữ cái → không hợp lệ', () => {
    expect(isValidAccountPhone('')).toBe(false);
    expect(isValidAccountPhone(null)).toBe(false);
    expect(isValidAccountPhone(undefined)).toBe(false);
    expect(isValidAccountPhone('abc1234567890')).toBe(false);
  });

  it('INVALID_ACCOUNT_PHONE_MESSAGE đúng nội dung thông báo', () => {
    expect(INVALID_ACCOUNT_PHONE_MESSAGE).toBe(
      'Số điện thoại phải là số di động Việt Nam gồm 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09'
    );
  });
});

describe('Bảng ca kiểm tra kết hợp normalizePhoneForZaloCampaign + isValidAccountPhone (mục 3 plan)', () => {
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
      const normalized = normalizePhoneForZaloCampaign(input);
      expect(isValidAccountPhone(normalized)).toBe(true);
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
      const normalized = normalizePhoneForZaloCampaign(input);
      expect(isValidAccountPhone(normalized)).toBe(false);
    });
  });
});
