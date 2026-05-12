import { describe, it, expect } from 'vitest';
import { normalizePublicFileUrlForEmbed } from '../publicFileUrl';

describe('normalizePublicFileUrlForEmbed', () => {
  it('null/undefined → pass through nguyên giá trị', () => {
    expect(normalizePublicFileUrlForEmbed(null)).toBeNull();
    expect(normalizePublicFileUrlForEmbed(undefined)).toBeUndefined();
  });

  it('empty/whitespace → pass through nguyên', () => {
    expect(normalizePublicFileUrlForEmbed('')).toBe('');
    expect(normalizePublicFileUrlForEmbed('   ')).toBe('   ');
  });

  it('/file/:token bare → thêm /download?preview=true', () => {
    const out = normalizePublicFileUrlForEmbed('https://x.com/file/abc123');
    expect(out).toBe('https://x.com/file/abc123/download?preview=true');
  });

  it('/file/:token/download không có preview → thêm preview=true', () => {
    const out = normalizePublicFileUrlForEmbed('https://x.com/file/abc/download');
    expect(out).toBe('https://x.com/file/abc/download?preview=true');
  });

  it('/file/:token/download?preview=true → idempotent (giữ nguyên)', () => {
    const out = normalizePublicFileUrlForEmbed('https://x.com/file/abc/download?preview=true');
    expect(out).toBe('https://x.com/file/abc/download?preview=true');
  });

  it('URL khác /file/* → trả nguyên', () => {
    const url = 'https://x.com/api/users';
    expect(normalizePublicFileUrlForEmbed(url)).toBe(url);
  });

  it('URL không hợp lệ → trả về chuỗi gốc (catch parse error)', () => {
    expect(normalizePublicFileUrlForEmbed('not-a-url')).toBe('not-a-url');
  });

  it('/file/:token có ký tự đặc biệt → encode đúng trong path mới', () => {
    const out = normalizePublicFileUrlForEmbed('https://x.com/file/abc-xyz_123');
    expect(out).toBe('https://x.com/file/abc-xyz_123/download?preview=true');
  });
});
