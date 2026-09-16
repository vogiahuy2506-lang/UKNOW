import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindStorageObjectByKey = jest.fn();
const mockStream = jest.fn();

jest.unstable_mockModule('../../repositories/storage.repository.js', () => ({
  findStorageObjectByKey: mockFindStorageObjectByKey,
}));

jest.unstable_mockModule('../../services/storage/storageBackend.js', () => ({
  getStorageBackend: () => ({
    stream: mockStream,
  }),
}));

const { default: landingAssetController } = await import('../landingAsset.controller.js');

describe('landingAsset.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockRes() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      headersSent: false,
      setHeader: jest.fn((k, v) => {
        res.headers[k.toLowerCase()] = v;
      }),
      status: jest.fn((code) => {
        res.statusCode = code;
        return res;
      }),
      json: jest.fn((data) => {
        res.body = data;
        res.headersSent = true;
        return res;
      }),
    };
    return res;
  }

  it('key chứa traversal ".." → 404', async () => {
    const req = { params: { key: 'uploads/1/landing/../../etc/passwd' } };
    const res = createMockRes();

    await landingAssetController.serveAsset(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(mockFindStorageObjectByKey).not.toHaveBeenCalled();
  });

  it('key sai định dạng regex → 404', async () => {
    const req = { params: { key: 'uploads/1/chat/image.png' } }; // không phải landing
    const res = createMockRes();

    await landingAssetController.serveAsset(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('không tìm thấy record hoặc category không phải landing_asset → 404', async () => {
    const req = { params: { key: 'uploads/1/landing/test.png' } };
    const res = createMockRes();
    mockFindStorageObjectByKey.mockResolvedValue({
      category: 'chat_attachment',
      state: 'active',
    });

    await landingAssetController.serveAsset(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('record hợp lệ → đặt Cache-Control và stream 24h', async () => {
    const req = { params: { key: 'uploads/1/landing/logo.png' } };
    const res = createMockRes();
    mockFindStorageObjectByKey.mockResolvedValue({
      category: 'landing_asset',
      state: 'active',
    });
    mockStream.mockResolvedValue(true);

    await landingAssetController.serveAsset(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
    expect(res.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
    expect(mockStream).toHaveBeenCalledWith(
      'uploads/1/landing/logo.png',
      res,
      expect.objectContaining({
        preview: true,
        mimeType: 'image/png',
        signedUrlTtlMs: 24 * 3600 * 1000,
      })
    );
  });

  // PLAN_TEP_DINH_KEM_LANDING_MOI_DINH_DANG_2026-09-15.md ca 15: mở GIF ở chốt nhận tệp mà quên
  // route này thì ảnh lưu được nhưng trang hiện ảnh vỡ (404), test backend vẫn xanh.
  it('ảnh .gif → stream với Content-Type image/gif', async () => {
    const req = { params: { key: 'uploads/39/landing/banner.gif' } };
    const res = createMockRes();
    mockFindStorageObjectByKey.mockResolvedValue({ category: 'landing_asset', state: 'active' });
    mockStream.mockResolvedValue(true);

    await landingAssetController.serveAsset(req, res);

    expect(mockStream).toHaveBeenCalledWith(
      'uploads/39/landing/banner.gif',
      res,
      expect.objectContaining({ mimeType: 'image/gif' })
    );
  });

  it('ảnh .heic → 404 (HEIC đã được chuyển sang .jpg lúc nhận, không phục vụ trực tiếp)', async () => {
    const req = { params: { key: 'uploads/39/landing/anh.heic' } };
    const res = createMockRes();

    await landingAssetController.serveAsset(req, res);

    expect(res.statusCode).toBe(404);
    expect(mockStream).not.toHaveBeenCalled();
  });
});
