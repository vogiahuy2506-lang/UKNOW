import { describe, it, expect } from 'vitest';
import {
  foldDiacritics,
  isEmailHeader,
  isPhoneHeader,
  isNameHeader,
  findBestMatchingKey,
} from '../columnHeaderMatch.js';

describe('columnHeaderMatch — Khớp tiêu đề cột theo ngữ nghĩa (Frontend)', () => {
  const testHeaders14 = [
    { header: 'Email', expected: 'email' },
    { header: 'EMAIL', expected: 'email' },
    { header: 'e-mail', expected: 'email' },
    { header: 'Thư điện tử', expected: 'email' },
    { header: 'SĐT', expected: 'phone' },
    { header: 'Số điện thoại', expected: 'phone' },
    { header: 'So dien thoai', expected: 'phone' },
    { header: 'Điện thoại', expected: 'phone' },
    { header: 'Phone', expected: 'phone' },
    { header: 'phone number', expected: 'phone' },
    { header: 'Mobile', expected: 'phone' },
    { header: 'Họ Tên', expected: 'name' },
    { header: 'Tên khách hàng', expected: 'name' },
    { header: 'Ghi chú', expected: null },
  ];

  it('khớp chính xác 14 tiêu đề mẫu chuẩn đồng bộ với backend', () => {
    testHeaders14.forEach(({ header, expected }) => {
      const isEmail = isEmailHeader(header);
      const isPhone = isPhoneHeader(header);
      const isName = isNameHeader(header);

      if (expected === 'email') {
        expect({ header, isEmail, isPhone, isName }).toEqual({ header, isEmail: true, isPhone: false, isName: false });
      } else if (expected === 'phone') {
        expect({ header, isEmail, isPhone, isName }).toEqual({ header, isEmail: false, isPhone: true, isName: false });
      } else if (expected === 'name') {
        expect({ header, isEmail, isPhone, isName }).toEqual({ header, isEmail: false, isPhone: false, isName: true });
      } else {
        expect({ header, isEmail, isPhone, isName }).toEqual({ header, isEmail: false, isPhone: false, isName: false });
      }
    });
  });

  describe('findBestMatchingKey', () => {
    it('ưu tiên cột khớp chính xác nhất khi có nhiều cột (Email vs Email phụ)', () => {
      const keys = ['Ghi chú', 'Email phụ', 'Email', 'SĐT'];
      expect(findBestMatchingKey(keys, 'email')).toBe('Email');
    });

    it('tìm đúng cột SĐT cho target phone', () => {
      const keys = ['Họ Tên', 'SĐT', 'Ghi chú'];
      expect(findBestMatchingKey(keys, 'phone')).toBe('SĐT');
    });

    it('tìm đúng cột Thư điện tử cho target email', () => {
      const keys = ['Họ Tên', 'Thư điện tử', 'Ghi chú'];
      expect(findBestMatchingKey(keys, 'email')).toBe('Thư điện tử');
    });

    it('trả về null khi không có cột nào khớp', () => {
      const keys = ['Ghi chú', 'Địa chỉ', 'Ngày sinh'];
      expect(findBestMatchingKey(keys, 'email')).toBeNull();
      expect(findBestMatchingKey(keys, 'phone')).toBeNull();
      expect(findBestMatchingKey(keys, 'name')).toBeNull();
    });
  });
});
