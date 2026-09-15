import { describe, it, expect } from '@jest/globals';
import { normalizePhoneForZaloCampaign } from '../zaloPhoneCampaign.util.js';

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
