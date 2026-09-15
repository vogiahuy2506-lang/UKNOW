import { describe, it, expect } from '@jest/globals';
import {
  normalizeAccountPhone,
  isValidAccountPhone,
  isVietnamMobilePhone,
  INVALID_ACCOUNT_PHONE_MESSAGE,
  OTP_MOBILE_ONLY_MESSAGE,
} from '../accountPhone.util.js';

describe('normalizeAccountPhone và isValidAccountPhone theo bảng mục 2 plan', () => {
  const validTable = [
    // [nhập, chuỗi_lưu_kỳ_vọng]
    ['0987654321', '0987654321'],
    ['912345678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
    ['+84 0912 345 678', '0912345678'],
    ['0084912345678', '0912345678'],
    ['84912345678', '0912345678'],
    ['02838123456', '02838123456'],
    ['028 3812 3456', '02838123456'],
    ['+84 28 3812 3456', '02838123456'],
    ['+1 415 555 2671', '+14155552671'],
    ['001 415 555 2671', '+14155552671'],
    ['+65 6123 4567', '+6561234567'],
  ];

  validTable.forEach(([input, expectedNormalized]) => {
    it(`"${input}" → lưu "${expectedNormalized}", kết quả: đạt`, () => {
      const normalized = normalizeAccountPhone(input);
      expect(normalized).toBe(expectedNormalized);
      expect(isValidAccountPhone(normalized)).toBe(true);
    });
  });

  const invalidCases = [
    '1111111111',
    '0111111111',
    '14155552671', // thiếu +
    'abc1234567890',
    '0211234567', // 02 nhưng 10 số
    '09123456789', // 11 số đầu 09
    '+1234567', // 7 số
    '+1234567890123456', // 16 số
    '+0123456789', // mã bắt đầu bằng 0
    '+84 1111111111',
    '312345678',
    '',
    null,
  ];

  invalidCases.forEach((input) => {
    it(`"${input}" → kết quả: trượt`, () => {
      const normalized = normalizeAccountPhone(input);
      expect(isValidAccountPhone(normalized)).toBe(false);
    });
  });
});

describe('isVietnamMobilePhone', () => {
  it('số di động VN 10 số đầu 03/05/07/08/09 → true', () => {
    expect(isVietnamMobilePhone('0912345678')).toBe(true);
    expect(isVietnamMobilePhone('0312345678')).toBe(true);
    expect(isVietnamMobilePhone('0512345678')).toBe(true);
    expect(isVietnamMobilePhone('0712345678')).toBe(true);
    expect(isVietnamMobilePhone('0812345678')).toBe(true);
  });

  it('số bàn VN hoặc số nước ngoài → false', () => {
    expect(isVietnamMobilePhone('02838123456')).toBe(false);
    expect(isVietnamMobilePhone('+14155552671')).toBe(false);
    expect(isVietnamMobilePhone('+6561234567')).toBe(false);
    expect(isVietnamMobilePhone('')).toBe(false);
  });
});

describe('Hằng thông báo', () => {
  it('INVALID_ACCOUNT_PHONE_MESSAGE đúng nội dung', () => {
    expect(INVALID_ACCOUNT_PHONE_MESSAGE).toBe(
      'Số điện thoại không hợp lệ. Nhập số di động hoặc số bàn Việt Nam (vd 0912345678, 02838123456); số nước ngoài ghi kèm mã quốc gia (vd +1 415 555 2671)'
    );
  });

  it('OTP_MOBILE_ONLY_MESSAGE đúng nội dung', () => {
    expect(OTP_MOBILE_ONLY_MESSAGE).toBe(
      'Xác thực bằng mã SMS chỉ hỗ trợ số di động Việt Nam'
    );
  });
});
