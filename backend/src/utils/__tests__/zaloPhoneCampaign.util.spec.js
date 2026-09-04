import { describe, it, expect } from '@jest/globals';
import {
  normalizePhoneForZaloCampaign,
  isValidNormalizedPhoneLength,
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

describe('isValidNormalizedPhoneLength', () => {
  it('10 số (di động VN chuẩn) → hợp lệ', () => {
    expect(isValidNormalizedPhoneLength('0912345678')).toBe(true);
  });

  it('11 số (số bàn có mã vùng) → hợp lệ', () => {
    expect(isValidNormalizedPhoneLength('02412345678')).toBe(true);
  });

  it('9 số → KHÔNG hợp lệ (đây chính là ca Bẫy 2b bị bắt qua ngưỡng độ dài)', () => {
    expect(isValidNormalizedPhoneLength('812345678')).toBe(false);
  });

  it('12 số → KHÔNG hợp lệ', () => {
    expect(isValidNormalizedPhoneLength('091234567890')).toBe(false);
  });

  it('rỗng → KHÔNG hợp lệ', () => {
    expect(isValidNormalizedPhoneLength('')).toBe(false);
  });

  it('null/undefined → KHÔNG hợp lệ, không throw', () => {
    expect(isValidNormalizedPhoneLength(null)).toBe(false);
    expect(isValidNormalizedPhoneLength(undefined)).toBe(false);
  });
});

describe('normalizePhoneForZaloCampaign + isValidNormalizedPhoneLength (kết hợp — mô phỏng dòng chảy thật trong controller)', () => {
  it('"+84 912 345 678" đi qua cả hai bước → hợp lệ', () => {
    const normalized = normalizePhoneForZaloCampaign('+84 912 345 678');
    expect(isValidNormalizedPhoneLength(normalized)).toBe(true);
  });

  it('"abc" đi qua cả hai bước → không hợp lệ, không throw', () => {
    const normalized = normalizePhoneForZaloCampaign('abc');
    expect(isValidNormalizedPhoneLength(normalized)).toBe(false);
  });
});
