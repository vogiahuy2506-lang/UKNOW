import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockRegisterWrittenStorageObject = jest.fn();
const mockActivateLandingAssetStorageObjects = jest.fn();
const mockReadTempFileBuffer = jest.fn();
const mockReadFileBufferByKey = jest.fn();
const mockGetPublicBaseUrlFromEnv = jest.fn(() => 'http://localhost:5001');
const mockSanitizeFileBaseName = jest.fn((name) => String(name || 'file').replace(/[^a-zA-Z0-9-_]/g, '_'));

jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => ({
    put: mockPut,
    delete: mockDelete,
  }),
}));

jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  registerWrittenStorageObject: mockRegisterWrittenStorageObject,
  getPhysicalSize: jest.fn(),
  markDeletedAfterUnlink: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  activateLandingAssetStorageObjects: mockActivateLandingAssetStorageObjects,
  findStorageObjectByKey: jest.fn(),
  markStorageObjectCleanupPending: jest.fn(),
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: mockReadTempFileBuffer,
    readFileBufferByKey: mockReadFileBufferByKey,
    getPublicBaseUrlFromEnv: mockGetPublicBaseUrlFromEnv,
    sanitizeFileBaseName: mockSanitizeFileBaseName,
  },
}));

const {
  ingestLandingAttachments,
  linkAssetsToLandingPage,
  buildLandingAssetUrl,
} = await import('../landingAsset.service.js');

// 1x1 PNG hợp lệ có magic bytes
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('landingAsset.service (Việc 1.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildLandingAssetUrl tạo đúng URL', () => {
    const url = buildLandingAssetUrl('uploads/1/landing/test.png');
    expect(url).toBe('http://localhost:5001/lp-assets/uploads/1/landing/test.png');
  });

  it('(i) khoá của owner khác → ném lỗi 403', async () => {
    const maliciousFile = {
      storageKey: 'uploads/999/chat/secret.png',
      originalName: 'secret.png',
      contentType: 'image/png',
    };

    await expect(
      ingestLandingAttachments({
        files: [maliciousFile],
        ownerUserId: 123,
      })
    ).rejects.toMatchObject({
      status: 403,
      message: 'Không có quyền truy cập file lưu trữ này',
    });

    expect(mockReadFileBufferByKey).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('(ii) GIF → từ chối (400)', async () => {
    // Magic bytes của GIF89a: 0x47, 0x49, 0x46, 0x38, 0x39, 0x61
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
    mockReadTempFileBuffer.mockResolvedValue(gifBuffer);

    const file = {
      tempId: 'temp_1',
      originalName: 'anim.gif',
      contentType: 'image/gif',
    };

    await expect(
      ingestLandingAttachments({
        files: [file],
        ownerUserId: 123,
      })
    ).rejects.toMatchObject({
      status: 400,
    });

    expect(mockPut).not.toHaveBeenCalled();
  });

  it('(iii) ảnh 5 MB → lưu nhưng inlineForModel = false', async () => {
    // Tạo buffer 5 MB có header của PNG hợp lệ
    const fiveMbBuffer = Buffer.alloc(5 * 1024 * 1024);
    validPngBuffer.copy(fiveMbBuffer, 0, 0, validPngBuffer.length);

    mockReadTempFileBuffer.mockResolvedValue(fiveMbBuffer);
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 10 });

    const file = {
      tempId: 'temp_large_img',
      originalName: 'banner-5mb.png',
      contentType: 'image/png',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(res.assets).toHaveLength(1);
    const asset = res.assets[0];
    expect(asset.inlineForModel).toBe(false);
    expect(asset.base64).toBeNull();
    expect(asset.sizeBytes).toBe(fiveMbBuffer.length);
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockRegisterWrittenStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 123,
        category: 'landing_asset',
        state: 'temp',
        sizeBytes: fiveMbBuffer.length,
      })
    );
  });

  it('(iv) linkAssetsToLandingPage chỉ UPDATE khoá đúng owner', async () => {
    mockActivateLandingAssetStorageObjects.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const ownerUserId = 39;
    const landingPageId = 100;
    const html = `
      <div>
        <img src="https://example.com/lp-assets/uploads/39/landing/logo-ok.png" />
        <img src="https://example.com/lp-assets/uploads/999/landing/other-owner.png" />
        <img src="https://example.com/lp-assets/uploads/39/landing/banner-ok.png" />
      </div>
    `;

    const result = await linkAssetsToLandingPage({
      html,
      ownerUserId,
      landingPageId,
    });

    expect(mockActivateLandingAssetStorageObjects).toHaveBeenCalledTimes(1);
    const callArgs = mockActivateLandingAssetStorageObjects.mock.calls[0][0];
    expect(callArgs.ownerUserId).toBe(39);
    expect(callArgs.landingPageId).toBe(100);
    // Chỉ các khoá uploads/39/landing/... được chọn
    expect(callArgs.storageKeys).toEqual(
      expect.arrayContaining([
        'uploads/39/landing/logo-ok.png',
        'uploads/39/landing/banner-ok.png',
      ])
    );
    expect(callArgs.storageKeys).not.toContain('uploads/999/landing/other-owner.png');
    expect(result).toHaveLength(2);
  });
});
