import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { generateFileToken } from '../fileDownloadToken.js';

process.env.JWT_SECRET = 'test-inbox-attach-secret';

const mockNormalize = jest.fn((input) => {
  if (!input) return '';
  let raw = input;
  if (typeof input === 'object' && input !== null) {
    raw = input.key || input.url || input.link || '';
  }
  const text = String(raw || '');
  const idx = text.indexOf('uploads/');
  if (idx < 0) return '';
  const key = text.slice(idx).split('?')[0];
  if (!key.startsWith('uploads/') || key.includes('..')) return '';
  return key;
});
const mockResolveAbs = jest.fn((key) => (key ? `/abs/${key}` : ''));

jest.unstable_mockModule('../../controllers/upload.controller.js', () => ({
  default: {
    normalizeStorageKey: mockNormalize,
    resolveAbsolutePathFromKey: mockResolveAbs,
  },
}));

const {
  sanitizeOwnedInboxAttachments,
  resolveInboxAttachmentStorageKey,
} = await import('../inboxOwnedAttachments.util.js');

describe('sanitizeOwnedInboxAttachments', () => {
  beforeEach(() => {
    mockNormalize.mockClear();
    mockResolveAbs.mockClear();
    mockResolveAbs.mockImplementation((key) => (key ? `/abs/${key}` : ''));
  });

  it('keeps owned chat keys from uploads/ urls', () => {
    const out = sanitizeOwnedInboxAttachments([
      {
        url: 'https://cdn.example/x/uploads/42/chat/a.pdf',
        name: 'report.pdf',
        size: 12,
        mime: 'application/pdf',
        type: 'file',
      },
    ], 42);

    expect(out).toEqual([{
      key: 'uploads/42/chat/a.pdf',
      displayName: 'report.pdf',
      size: 12,
      mime: 'application/pdf',
      type: 'file',
    }]);
  });

  it('resolves owned key from signed /file/<token> download url', () => {
    const key = 'uploads/42/chat/photo.png';
    const token = generateFileToken(key, null, null, null);
    const out = sanitizeOwnedInboxAttachments([
      {
        url: `https://api.example/file/${encodeURIComponent(token)}/download?preview=true`,
        name: 'photo.png',
        type: 'image',
        size: 9,
        mime: 'image/png',
      },
    ], 42);

    expect(out).toEqual([{
      key,
      displayName: 'photo.png',
      size: 9,
      mime: 'image/png',
      type: 'image',
    }]);
  });

  it('drops keys belonging to another user (IDOR via token)', () => {
    const token = generateFileToken('uploads/99/chat/secret.png', null, null, null);
    const out = sanitizeOwnedInboxAttachments([
      { url: `https://x/file/${encodeURIComponent(token)}` },
    ], 42);

    expect(out).toEqual([]);
  });

  it('drops raw cross-user key without token', () => {
    const out = sanitizeOwnedInboxAttachments([
      { key: 'uploads/99/chat/x.pdf', name: 'x.pdf' },
    ], 42);

    expect(out).toEqual([]);
  });

  it('drops path-traversal / invalid absolute paths', () => {
    mockResolveAbs.mockReturnValue('');
    const out = sanitizeOwnedInboxAttachments([
      { key: 'uploads/42/chat/a.pdf', url: 'uploads/42/chat/a.pdf' },
    ], 42);

    expect(out).toEqual([]);
  });

  it('returns empty for non-arrays', () => {
    expect(sanitizeOwnedInboxAttachments(null, 1)).toEqual([]);
    expect(sanitizeOwnedInboxAttachments({}, 1)).toEqual([]);
  });
});

describe('resolveInboxAttachmentStorageKey', () => {
  it('returns empty for garbage token urls', () => {
    expect(resolveInboxAttachmentStorageKey({ url: '/file/not-a-real-token' })).toBe('');
  });
});
