import { describe, it, expect } from '@jest/globals';
import {
  normalizeMentionText,
  isMatchableName,
  isMatchableCode,
  findMentionedProductIds,
} from '../productMentionMatch.util.js';

const products = [
  { id: 1, product_name: 'Khóa học AI thực chiến', product_code: 'AIX-01' },
  { id: 2, product_name: 'Combo Marketing', product_code: null },
  { id: 3, product_name: 'AI', product_code: null },
  { id: 4, product_name: 'Khoá', product_code: 'KH' },
];

describe('normalizeMentionText', () => {
  it('bỏ dấu, đ thành d, chữ thường, ký tự lạ thành khoảng trắng', () => {
    expect(normalizeMentionText('  Đăng-ký,  KHÓA học!! ')).toBe('dang ky khoa hoc');
    expect(normalizeMentionText(null)).toBe('');
  });
});

describe('isMatchableName', () => {
  it('cần >= 2 từ hoặc >= 6 ký tự', () => {
    expect(isMatchableName('ai')).toBe(false);
    expect(isMatchableName('khoa')).toBe(false);
    expect(isMatchableName('ai pro')).toBe(true);
    expect(isMatchableName('marketing')).toBe(true);
    expect(isMatchableName('')).toBe(false);
  });
});

describe('isMatchableCode', () => {
  it('cần >= 3 ký tự và có cả chữ lẫn số', () => {
    expect(isMatchableCode('aix 01')).toBe(true);
    expect(isMatchableCode('sp001')).toBe(true);
    expect(isMatchableCode('001')).toBe(false);
    expect(isMatchableCode('meo')).toBe(false);
    expect(isMatchableCode('a1')).toBe(false);
    expect(isMatchableCode('')).toBe(false);
  });
});

describe('findMentionedProductIds', () => {
  it('khóa/khoá, có/không dấu, hoa/thường đều khớp', () => {
    expect(findMentionedProductIds('khoá học ai thực chiến giá bao nhiêu', products)).toEqual([1]);
    expect(findMentionedProductIds('KHOA HOC AI THUC CHIEN', products)).toEqual([1]);
    expect(findMentionedProductIds('Khóa học AI thực chiến', products)).toEqual([1]);
  });

  it('tên nằm giữa câu vẫn khớp', () => {
    expect(findMentionedProductIds('Cho mình hỏi về combo marketing nhé shop', products)).toEqual([2]);
  });

  it('mã sản phẩm đứng riêng một từ thì khớp, dính vào từ khác thì không', () => {
    expect(findMentionedProductIds('cho mình mã aix-01 nhé', products)).toEqual([1]);
    expect(findMentionedProductIds('xaix01y là gì', products)).toEqual([]);
  });

  it('tên quá ngắn không khớp (AI, khoá) và mã dưới 3 ký tự không khớp', () => {
    expect(findMentionedProductIds('AI là gì? khoá nào hay? KH', products)).toEqual([]);
  });

  it('mã toàn số hoặc toàn chữ không khớp — dễ trùng tin thường (production 04/10 có mã "001", "meo")', () => {
    const generic = [
      { id: 6, product_name: 'Mèo', product_code: 'meo' },
      { id: 8, product_name: 'Trà Thanh Nhiệt Vương Lão Cát', product_code: '001' },
    ];
    expect(findMentionedProductIds('con mèo nhà mình', generic)).toEqual([]);
    expect(findMentionedProductIds('đơn số 001 của mình đâu', generic)).toEqual([]);
    expect(findMentionedProductIds('trà thanh nhiệt vương lão cát còn hàng không', generic)).toEqual([8]);
  });

  it('tên chỉ khớp trọn cụm, không khớp một phần từ', () => {
    expect(findMentionedProductIds('combo marketingg', products)).toEqual([]);
  });

  it('hai sản phẩm trong một tin trả về cả hai', () => {
    expect(
      findMentionedProductIds('so sánh combo marketing với khóa học ai thực chiến', products).sort()
    ).toEqual([1, 2]);
  });

  it('đầu vào rỗng hoặc không có sản phẩm trả mảng rỗng', () => {
    expect(findMentionedProductIds('', products)).toEqual([]);
    expect(findMentionedProductIds('combo marketing', [])).toEqual([]);
    expect(findMentionedProductIds('combo marketing', null)).toEqual([]);
  });
});
