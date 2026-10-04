import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * B-17 — ingestLandingAttachments chuyển cờ `fromSession` (tệp gom từ tin nhắn TRƯỚC trong phiên chat) thành
 * `referenceOnly` trên asset để aiLandingPage.service.js không ép AI dùng ảnh tham khảo. Mock giống
 * landingAsset.service.spec.js; tách file để không đụng spec cũ.
 */

const mockPut = jest.fn();
const mockRegisterWrittenStorageObject = jest.fn();
const mockReadFileBufferByKey = jest.fn();

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer: jest.fn(async () => 'x'),
}));
jest.unstable_mockModule('heic-convert', () => ({ default: jest.fn() }));
jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => ({ put: mockPut, delete: jest.fn() }),
}));
jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  registerWrittenStorageObject: mockRegisterWrittenStorageObject,
  getPhysicalSize: jest.fn(),
  markDeletedAfterUnlink: jest.fn(),
}));
jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  activateLandingAssetStorageObjects: jest.fn(),
  findStorageObjectByKey: jest.fn(),
  markStorageObjectCleanupPending: jest.fn(),
  getEffectiveQuota: jest.fn().mockResolvedValue({ quotaLimitBytes: 1e9, quotaUsedBytes: 0, plan: 'pro' }),
  getWorkspaceUsage: jest.fn().mockResolvedValue({ usedBytes: 0, fileCount: 0 }),
}));
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: jest.fn(),
    readFileBufferByKey: mockReadFileBufferByKey,
    getPublicBaseUrlFromEnv: jest.fn(() => 'http://localhost:5001'),
    sanitizeFileBaseName: jest.fn((name) => String(name || 'file').replace(/[^a-zA-Z0-9-_]/g, '_')),
  },
}));

const { ingestLandingAttachments } = await import('../landingAsset.service.js');

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('B-17 — ingestLandingAttachments: ảnh gom từ phiên → referenceOnly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileBufferByKey.mockResolvedValue(png);
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 1 });
  });

  it('file.fromSession → asset.referenceOnly = true; file của lượt hiện tại → KHÔNG có khoá referenceOnly', async () => {
    const { assets } = await ingestLandingAttachments({
      files: [
        { storageKey: 'uploads/123/chat/current.png', originalName: 'current.png', contentType: 'image/png' },
        { storageKey: 'uploads/123/chat/old.png', originalName: 'old.png', contentType: 'image/png', fromSession: true },
      ],
      ownerUserId: 123,
    });
    expect(assets).toHaveLength(2);
    const byName = Object.fromEntries(assets.map((a) => [a.originalName, a]));
    expect(byName['old.png'].referenceOnly).toBe(true);
    expect(byName['current.png']).not.toHaveProperty('referenceOnly');
  });
});
