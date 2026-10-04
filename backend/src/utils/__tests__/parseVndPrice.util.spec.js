import { describe, expect, it } from '@jest/globals';
import { parseVndPrice } from '../parseVndPrice.util.js';

describe('parseVndPrice', () => {
  it.each([
    ['500k', 500000],
    ['500K', 500000],
    ['1tr', 1000000],
    ['1,5tr', 1500000],
    ['1.5 triệu', 1500000],
    ['2 triệu', 2000000],
    ['1.200.000', 1200000],
    ['1.200.000đ', 1200000],
    ['1,200,000', 1200000],
    ['990.000 VNĐ', 990000],
    ['990.000 vnd', 990000],
    ['990000', 990000],
    ['990.000₫', 990000],
    ['1.500.000 đồng', 1500000],
    ['  500k  ', 500000],
    ['1,5k', 1500],
    ['2.25tr', 2250000],
    ['Miễn phí', 0],
    ['MIỄN PHÍ', 0],
    ['mien phi', 0],
    ['free', 0],
    ['Free', 0],
    ['0', 0],
    ['0đ', 0],
  ])('đọc "%s" -> %s', (text, expected) => {
    expect(parseVndPrice(text)).toBe(expected);
  });

  it.each([
    'liên hệ',
    'Liên hệ',
    'từ 500k',
    'Từ 500.000đ',
    'khoảng 1tr',
    '500k-1tr',
    '500k - 1tr',
    '500k đến 1tr',
    '1.5', // không đơn vị: 1,5 đồng hay 1,5 triệu?
    '500', // 500đ hay 500k?
    'thoả thuận',
    '2 tỷ', // chưa hỗ trợ -> không đoán
    'abc',
    '',
    '   ',
    '12.34',
    '1.200.00',
    '1.500k', // 1.500.000đ (dấu chấm ngăn nghìn) hay 1,5k? -> không đoán
    '2,500k',
    '1.200tr',
  ])('KHÔNG đoán: "%s" -> null', (text) => {
    expect(parseVndPrice(text)).toBeNull();
  });

  it('null/undefined/số không phải chuỗi', () => {
    expect(parseVndPrice(null)).toBeNull();
    expect(parseVndPrice(undefined)).toBeNull();
    expect(parseVndPrice(990000)).toBe(990000);
  });
});
