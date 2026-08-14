import { describe, expect, it } from '@jest/globals';
import { generateFileToken } from '../fileDownloadToken.js';
import { collectStorageKeys, extractStorageKey, normalizeStorageKey } from '../storageKey.util.js';

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
