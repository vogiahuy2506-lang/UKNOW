import { describe, expect, it } from '@jest/globals';
import { escapeLikePattern, friendlyFileName } from '../storageFileName.util.js';

describe('friendlyFileName', () => {
  it.each([
    ['uploads/1/chat/1779359034935_Campaign_4_-_Aff.png', 'Campaign_4_-_Aff.png'],
    ['uploads/42/landing/1779359034935_ab12cd34_hero.png', 'hero.png'],
    ['1779359034935_BaoCao.docx', 'BaoCao.docx'],
  ])('bỏ tiền tố sinh tự động: %s → %s', (key, expected) => {
    expect(friendlyFileName(key)).toBe(expected);
  });

  it.each([
    ['uploads/1/chat/20240101_BaoCao.pdf', '20240101_BaoCao.pdf'], // 8 chữ số: tên người dùng tự đặt, không cắt
    ['uploads/1/email/logo.png', 'logo.png'],
    ['bao-gia.pdf', 'bao-gia.pdf'],
  ])('giữ nguyên tên không có tiền tố tự sinh: %s', (key, expected) => {
    expect(friendlyFileName(key)).toBe(expected);
  });

  it('không bao giờ trả chuỗi rỗng: khoá chỉ có tiền tố thì giữ nguyên phần cuối', () => {
    expect(friendlyFileName('uploads/1/chat/1779359034935_')).toBe('1779359034935_');
    expect(friendlyFileName('')).toBe('');
    expect(friendlyFileName(null)).toBe('');
  });
});

describe('escapeLikePattern', () => {
  it('thoát \\ % _ để khớp nguyên văn', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c:\\x')).toBe('c:\\\\x');
  });

  it('chữ thường giữ nguyên; null/undefined → rỗng', () => {
    expect(escapeLikePattern('banner khai giảng')).toBe('banner khai giảng');
    expect(escapeLikePattern(null)).toBe('');
    expect(escapeLikePattern(undefined)).toBe('');
  });
});
