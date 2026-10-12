/**
 * PR-4b — phần GcsStorageBackend phục vụ tải tệp biểu mẫu: URL ký V4 để trình duyệt PUT thẳng, đọc đầu tệp, sao chép, thông tin object.
 *
 * Mock đúng HÌNH DẠNG THẬT của @google-cloud/storage v7 (đã đối chiếu build/cjs/src/file.d.ts):
 *  - `file.getSignedUrl(cfg)` → Promise<[url]>, cfg gồm { version, action: 'write', expires, contentType, extensionHeaders };
 *  - `file.getMetadata()` → Promise<[metadata]> (metadata.size là CHUỖI);
 *  - `file.download({ start, end })` → Promise<[Buffer]>;
 *  - `file.copy(destination: File)` → Promise<[File, ApiResponse]>;
 *  - lỗi là ApiError có `code` SỐ (404/403).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GcsStorageBackend } from '../gcsStorageBackend.js';
import { StorageNotFoundError, StorageUnavailableError } from '../storageErrors.js';

function apiError(code, message = 'gcs error') {
  const err = new Error(message);
  err.code = code;
  return err;
}

describe('GcsStorageBackend — tải tệp biểu mẫu', () => {
  let files;
  let mockBucket;
  let backend;

  const fileFor = (name) => {
    if (!files.has(name)) {
      files.set(name, {
        name,
        getSignedUrl: jest.fn().mockResolvedValue([`https://storage.googleapis.com/test-bucket/${name}?X-Goog-Signature=abc`]),
        getMetadata: jest.fn().mockResolvedValue([{ size: '2048', contentType: 'application/pdf' }]),
        download: jest.fn().mockResolvedValue([Buffer.from('%PDF-1.7')]),
        copy: jest.fn().mockResolvedValue([{ name: 'dest' }, {}]),
        delete: jest.fn().mockResolvedValue(undefined),
      });
    }
    return files.get(name);
  };

  beforeEach(() => {
    // logGcsError ghi lỗi gốc ra console.error (cố ý, để ops thấy) — im đi cho đầu ra test sạch.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    files = new Map();
    mockBucket = { file: jest.fn((name) => fileFor(name)) };
    backend = new GcsStorageBackend({
      bucketName: 'test-bucket',
      storageClient: { bucket: jest.fn(() => mockBucket) },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createUploadTarget', () => {
    const key = 'uploads/7/forms/3/tmp/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf';

    it('ký V4 action=write, ràng Content-Type và x-goog-content-length-range 1..maxBytes', async () => {
      const before = Date.now();
      const target = await backend.createUploadTarget({
        key,
        contentType: 'application/pdf',
        maxBytes: 10 * 1024 * 1024,
        ttlMs: 15 * 60 * 1000,
      });
      const file = files.get(key);
      expect(file.getSignedUrl).toHaveBeenCalledTimes(1);
      const cfg = file.getSignedUrl.mock.calls[0][0];
      expect(cfg).toMatchObject({
        version: 'v4',
        action: 'write',
        contentType: 'application/pdf',
        extensionHeaders: { 'x-goog-content-length-range': '1,10485760' },
      });
      expect(cfg.expires).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
      expect(cfg.expires).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);

      // Hợp đồng chung hai backend: { uploadUrl, method, headers, expiresAt }; headers khách PHẢI gửi đúng như đã ký.
      expect(target).toEqual({
        uploadUrl: `https://storage.googleapis.com/test-bucket/${key}?X-Goog-Signature=abc`,
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'x-goog-content-length-range': '1,10485760' },
        expiresAt: new Date(cfg.expires).toISOString(),
      });
    });

    it('trần 1 GB đi thẳng vào header range', async () => {
      const target = await backend.createUploadTarget({
        key, contentType: 'video/mp4', maxBytes: 1024 * 1024 * 1024, ttlMs: 60000,
      });
      expect(target.headers['x-goog-content-length-range']).toBe('1,1073741824');
    });

    it('khoá ngoài uploads/ hoặc có ".." bị từ chối, không ký', async () => {
      await expect(backend.createUploadTarget({ key: 'secret/a.pdf', contentType: 'application/pdf', maxBytes: 1, ttlMs: 1 }))
        .rejects.toThrow(/Invalid storage key/);
      await expect(backend.createUploadTarget({ key: 'uploads/../a.pdf', contentType: 'application/pdf', maxBytes: 1, ttlMs: 1 }))
        .rejects.toThrow(/Invalid storage key/);
    });

    it('lỗi ký (thiếu quyền, hỏng khoá) → StorageUnavailableError, không lộ lỗi gốc', async () => {
      fileFor(key).getSignedUrl.mockRejectedValue(apiError(403, 'iam.serviceAccounts.signBlob denied for sa@proj'));
      const err = await backend.createUploadTarget({ key, contentType: 'application/pdf', maxBytes: 1, ttlMs: 1 }).catch((e) => e);
      expect(err).toBeInstanceOf(StorageUnavailableError);
      expect(err.message).not.toMatch(/signBlob|sa@proj/);
    });
  });

  describe('getObjectInfo', () => {
    it('đổi metadata.size (chuỗi) thành số + contentType', async () => {
      await expect(backend.getObjectInfo('uploads/7/forms/3/tmp/a.pdf')).resolves.toEqual({
        size: 2048,
        contentType: 'application/pdf',
      });
    });

    it('404 → null (chưa tải lên); 403 → StorageUnavailableError (khác "không có")', async () => {
      fileFor('uploads/7/forms/3/tmp/none.pdf').getMetadata.mockRejectedValue(apiError(404));
      await expect(backend.getObjectInfo('uploads/7/forms/3/tmp/none.pdf')).resolves.toBeNull();
      fileFor('uploads/7/forms/3/tmp/denied.pdf').getMetadata.mockRejectedValue(apiError(403));
      await expect(backend.getObjectInfo('uploads/7/forms/3/tmp/denied.pdf')).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('khoá không hợp lệ → null', async () => {
      await expect(backend.getObjectInfo('khong-hop-le')).resolves.toBeNull();
    });
  });

  describe('readHead', () => {
    it('đọc bằng Range (start 0, end length-1), KHÔNG tải cả tệp', async () => {
      const buf = await backend.readHead('uploads/7/forms/3/tmp/a.pdf', 1024);
      expect(files.get('uploads/7/forms/3/tmp/a.pdf').download).toHaveBeenCalledWith({ start: 0, end: 1023 });
      expect(buf.toString()).toBe('%PDF-1.7');
    });

    it('404 → StorageNotFoundError; 500 → StorageUnavailableError', async () => {
      fileFor('uploads/7/forms/3/tmp/x.pdf').download.mockRejectedValue(apiError(404));
      await expect(backend.readHead('uploads/7/forms/3/tmp/x.pdf', 16)).rejects.toBeInstanceOf(StorageNotFoundError);
      fileFor('uploads/7/forms/3/tmp/y.pdf').download.mockRejectedValue(apiError(500));
      await expect(backend.readHead('uploads/7/forms/3/tmp/y.pdf', 16)).rejects.toBeInstanceOf(StorageUnavailableError);
    });
  });

  describe('copy', () => {
    it('sao chép phía GCS sang đối tượng File đích, giữ bản gốc (không xoá)', async () => {
      const src = 'uploads/7/forms/3/tmp/a.pdf';
      const dest = 'uploads/7/forms/3/submissions/9/b.pdf';
      await backend.copy(src, dest);
      expect(files.get(src).copy).toHaveBeenCalledTimes(1);
      expect(files.get(src).copy.mock.calls[0][0]).toBe(files.get(dest));
      expect(files.get(src).delete).not.toHaveBeenCalled();
    });

    it('nguồn 404 → StorageNotFoundError; khoá lạ → lỗi khoá', async () => {
      fileFor('uploads/7/forms/3/tmp/z.pdf').copy.mockRejectedValue(apiError(404));
      await expect(backend.copy('uploads/7/forms/3/tmp/z.pdf', 'uploads/7/forms/3/submissions/9/z.pdf'))
        .rejects.toBeInstanceOf(StorageNotFoundError);
      await expect(backend.copy('uploads/7/a.pdf', 'ngoai/b.pdf')).rejects.toThrow(/Invalid storage key/);
    });
  });
});
