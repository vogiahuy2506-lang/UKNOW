import { describe, expect, it } from '@jest/globals';
import {
  EXTRA_CONTEXT_TOO_LONG_CODE,
  MAX_EXTRA_CONTEXT_CHARS,
  buildExtraContextTooLongMessage,
  clipExtraContextForPrompt,
  createExtraContextTooLongError,
  isExtraContextTooLong,
} from '../businessProfileLimits.util.js';

describe('businessProfileLimits (D-13) — trần "Thông tin bổ sung" của hồ sơ doanh nghiệp', () => {
  it('trần là 20.000 ký tự', () => {
    expect(MAX_EXTRA_CONTEXT_CHARS).toBe(20000);
  });

  it('isExtraContextTooLong: đúng 20.000 ký tự vẫn được, 20.001 thì bị chặn; null/undefined/rỗng không bị chặn', () => {
    expect(isExtraContextTooLong('a'.repeat(20000))).toBe(false);
    expect(isExtraContextTooLong('a'.repeat(20001))).toBe(true);
    expect(isExtraContextTooLong('')).toBe(false);
    expect(isExtraContextTooLong(null)).toBe(false);
    expect(isExtraContextTooLong(undefined)).toBe(false);
  });

  it('câu báo tiếng Việt nêu độ dài hiện tại + trần và bảo người dùng rút gọn', () => {
    const message = buildExtraContextTooLongMessage(25000);
    expect(message).toContain('Thông tin bổ sung');
    expect(message).toContain('25.000');
    expect(message).toContain('20.000');
    expect(message).toMatch(/rút gọn/);
  });

  it('createExtraContextTooLongError: lỗi 400 có mã EXTRA_CONTEXT_TOO_LONG', () => {
    const err = createExtraContextTooLongError(30000);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.code).toBe(EXTRA_CONTEXT_TOO_LONG_CODE);
    expect(err.message).toContain('30.000');
  });

  it('clipExtraContextForPrompt: ngắn hơn trần → nguyên văn; dài hơn → ≤ 20.000 ký tự kèm "…", là TIỀN TỐ của bản gốc (cắt ở khoảng trắng)', () => {
    expect(clipExtraContextForPrompt('Giờ mở cửa 8h-21h')).toBe('Giờ mở cửa 8h-21h');
    const long = Array.from({ length: 30000 }, (_, i) => `tu${i}`).join(' ');
    const clipped = clipExtraContextForPrompt(long);
    expect(clipped.length).toBeLessThanOrEqual(MAX_EXTRA_CONTEXT_CHARS);
    expect(clipped.endsWith('…')).toBe(true);
    expect(long.startsWith(clipped.slice(0, -1))).toBe(true);
    expect(clipped.slice(0, -1).split(' ').pop()).toMatch(/^tu\d+$/);
  });
});
