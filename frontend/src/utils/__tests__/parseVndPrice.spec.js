import { describe, it, expect } from 'vitest';
import { parseVndPrice } from '../parseVndPrice';

// Bản sao của backend/src/utils/parseVndPrice.util.js — giữ hai bản cùng kết quả.
describe('parseVndPrice (FE)', () => {
  it.each([
    ['500k', 500000],
    ['1,5tr', 1500000],
    ['1.5 triệu', 1500000],
    ['1.200.000đ', 1200000],
    ['990.000 VNĐ', 990000],
    ['990000', 990000],
    ['Miễn phí', 0],
    ['free', 0],
    ['0', 0],
  ])('đọc "%s" -> %s', (text, expected) => {
    expect(parseVndPrice(text)).toBe(expected);
  });

  it.each(['liên hệ', 'từ 500k', '500k-1tr', '1.5', '500', '', 'abc'])('không đoán "%s" -> null', (text) => {
    expect(parseVndPrice(text)).toBeNull();
  });
});
