import { describe, expect, it } from '@jest/globals';
import { generateFileToken } from '../fileDownloadToken.js';
import {
  assertOwnedStorageKey,
  collectStorageKeys,
  extractStorageKey,
  normalizeStorageKey,
  resolveOwnedStorageKey,
} from '../storageKey.util.js';

// File token ký bằng JWT_SECRET (không còn chuỗi dự phòng) — đọc lúc ký/kiểm nên gán ở đây là đủ.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-storage-key-secret';

describe('storageKey.util', () => {
  it('extracts direct keys and signed /file URLs from nested JSON and HTML', () => {
    const signedKey = 'uploads/9/landing/image.png';
    const token = generateFileToken(signedKey, null, null, null);
    const signedUrl = `https://founderai.vn/file/${token}?preview=true`;

    expect(normalizeStorageKey('/uploads/7/chat/file.pdf')).toBe('uploads/7/chat/file.pdf');
    expect(extractStorageKey(signedUrl)).toBe(signedKey);

    const keys = collectStorageKeys({
      attachments: [{ key: 'uploads/7/chat/file.pdf' }],
      html: `<img src="${signedUrl}">`,
    });
    expect(keys).toEqual(new Set(['uploads/7/chat/file.pdf', signedKey]));
  });

  it('rejects traversal and external paths', () => {
    expect(normalizeStorageKey('../uploads/7/private.txt')).toBe('');
    expect(normalizeStorageKey('https://example.com/image.png')).toBe('');
  });
});

describe('storageKey.util — kiểm chủ khoá (resolveOwnedStorageKey / assertOwnedStorageKey)', () => {
  it('trả khoá đã chuẩn hoá khi nằm dưới uploads/<chủ>/ (kể cả URL, "/" đầu, id chủ dạng chuỗi)', () => {
    expect(resolveOwnedStorageKey('uploads/7/chat/a.pdf', 7)).toBe('uploads/7/chat/a.pdf');
    expect(resolveOwnedStorageKey('/uploads/7/chat/a.pdf', '7')).toBe('uploads/7/chat/a.pdf');
    expect(resolveOwnedStorageKey('https://founderai.biz/uploads/7/chat/a.pdf', 7)).toBe('uploads/7/chat/a.pdf');
    expect(resolveOwnedStorageKey({ key: 'uploads/7/chat/a.pdf' }, 7)).toBe('uploads/7/chat/a.pdf');
  });

  it('rỗng khi khoá thuộc workspace khác, trùng đầu số, hoặc đi vòng qua .. / %2e%2e', () => {
    expect(resolveOwnedStorageKey('uploads/8/chat/a.pdf', 7)).toBe('');
    expect(resolveOwnedStorageKey('uploads/70/chat/a.pdf', 7)).toBe('');
    expect(resolveOwnedStorageKey('uploads/07/chat/a.pdf', 7)).toBe('');
    expect(resolveOwnedStorageKey('uploads/7/../8/chat/a.pdf', 7)).toBe('');
    // %2e%2e được bộ chuẩn hoá giải ra thật → rơi vào workspace 8 → bị chặn với chủ 7.
    expect(resolveOwnedStorageKey('uploads/7/%2e%2e/8/chat/a.pdf', 7)).toBe('');
    expect(resolveOwnedStorageKey('https://founderai.biz/uploads/8/chat/a.pdf', 7)).toBe('');
  });

  it('rỗng khi thiếu/sai id chủ hoặc khoá không phải uploads/', () => {
    expect(resolveOwnedStorageKey('uploads/7/a.pdf', null)).toBe('');
    expect(resolveOwnedStorageKey('uploads/7/a.pdf', undefined)).toBe('');
    expect(resolveOwnedStorageKey('uploads/7/a.pdf', 0)).toBe('');
    expect(resolveOwnedStorageKey('uploads/7/a.pdf', 'abc')).toBe('');
    expect(resolveOwnedStorageKey('etc/passwd', 7)).toBe('');
    expect(resolveOwnedStorageKey('', 7)).toBe('');
  });

  it('assertOwnedStorageKey: trả khoá khi hợp lệ, ném 403 STORAGE_KEY_NOT_OWNED khi không', () => {
    expect(assertOwnedStorageKey('uploads/7/chat/a.pdf', 7)).toBe('uploads/7/chat/a.pdf');
    expect(() => assertOwnedStorageKey('uploads/8/chat/a.pdf', 7)).toThrow(
      expect.objectContaining({ status: 403, code: 'STORAGE_KEY_NOT_OWNED' }),
    );
    expect(() => assertOwnedStorageKey('uploads/7/chat/a.pdf', null)).toThrow(
      expect.objectContaining({ status: 403, code: 'STORAGE_KEY_NOT_OWNED' }),
    );
  });
});
