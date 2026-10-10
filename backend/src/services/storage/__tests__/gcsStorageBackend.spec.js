import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GcsStorageBackend } from '../gcsStorageBackend.js';
import { StorageUnavailableError } from '../storageErrors.js';

describe('GcsStorageBackend', () => {
  let mockFile;
  let mockBucket;
  let mockStorageClient;
  let backend;

  beforeEach(() => {
    mockFile = {
      save: jest.fn().mockResolvedValue(undefined),
      download: jest.fn().mockResolvedValue([Buffer.from('gcs content')]),
      exists: jest.fn().mockResolvedValue([true]),
      delete: jest.fn().mockResolvedValue(undefined),
      getMetadata: jest.fn().mockResolvedValue([{ size: '12' }]),
      getSignedUrl: jest.fn().mockResolvedValue(['https://storage.googleapis.com/signed-url']),
    };

    mockBucket = {
      file: jest.fn(() => mockFile),
    };

    mockStorageClient = {
      bucket: jest.fn(() => mockBucket),
    };

    backend = new GcsStorageBackend({
      bucketName: 'test-bucket',
      storageClient: mockStorageClient,
    });
  });

  it('normalizeKey sanitizes storage keys', () => {
    expect(backend.normalizeKey('/uploads/1/test.pdf')).toBe('uploads/1/test.pdf');
    expect(backend.normalizeKey('uploads/../secret.txt')).toBe('');
    expect(backend.normalizeKey('other/path.txt')).toBe('');
  });

  it('put saves file to GCS with correct options', async () => {
    const key = 'uploads/1/doc.pdf';
    const buffer = Buffer.from('pdf data');

    await backend.put(key, buffer, { contentType: 'application/pdf' });

    expect(mockBucket.file).toHaveBeenCalledWith('uploads/1/doc.pdf');
    expect(mockFile.save).toHaveBeenCalledWith(buffer, {
      contentType: 'application/pdf',
      resumable: false,
    });
  });

  it('getBuffer downloads content from GCS', async () => {
    const key = 'uploads/1/doc.pdf';
    const result = await backend.getBuffer(key);

    expect(mockBucket.file).toHaveBeenCalledWith('uploads/1/doc.pdf');
    expect(mockFile.download).toHaveBeenCalled();
    expect(result.toString('utf8')).toBe('gcs content');
  });

  it('exists checks object existence on GCS', async () => {
    const exists = await backend.exists('uploads/1/doc.pdf');
    expect(exists).toBe(true);
    expect(mockFile.exists).toHaveBeenCalled();
  });

  it('delete removes objects with ignoreNotFound', async () => {
    await backend.delete(['uploads/1/a.txt', 'uploads/1/a.txt.txt']);

    expect(mockBucket.file).toHaveBeenCalledWith('uploads/1/a.txt');
    expect(mockBucket.file).toHaveBeenCalledWith('uploads/1/a.txt.txt');
    expect(mockFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('stream redirects 302 to signed URL without proxying data', async () => {
    const headers = {};
    const res = {
      setHeader: (name, val) => { headers[name] = val; },
      redirect: jest.fn(),
    };

    const success = await backend.stream('uploads/1/photo.jpg', res, {
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      preview: true,
    });

    expect(success).toBe(true);
    expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 'v4',
        action: 'read',
        responseDisposition: 'inline',
        responseType: 'image/jpeg',
      })
    );
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://storage.googleapis.com/signed-url');
  });

  it('stream preview SVG → signed URL ép attachment (không inline)', async () => {
    const res = { setHeader: jest.fn(), redirect: jest.fn() };

    const success = await backend.stream('uploads/1/logo.svg', res, {
      fileName: 'logo.svg',
      mimeType: 'image/svg+xml',
      preview: true,
    });

    expect(success).toBe(true);
    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        responseDisposition: 'attachment; filename="logo.svg"',
        responseType: 'image/svg+xml',
      })
    );
  });

  it('stream preview HTML không khai MIME → attachment, không ép responseType', async () => {
    const res = { setHeader: jest.fn(), redirect: jest.fn() };

    await backend.stream('uploads/1/page.html', res, { fileName: 'page.html', preview: true });

    const signOptions = mockFile.getSignedUrl.mock.calls[0][0];
    expect(signOptions.responseDisposition).toBe('attachment; filename="page.html"');
    expect(signOptions).not.toHaveProperty('responseType');
  });

  it('stream preview ảnh PNG không khai MIME → inline, responseType ép image/png (bỏ metadata đã lưu)', async () => {
    const res = { setHeader: jest.fn(), redirect: jest.fn() };

    await backend.stream('uploads/1/photo.png', res, { fileName: 'photo.png', preview: true });

    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ responseDisposition: 'inline', responseType: 'image/png' })
    );
  });

  it('stream returns false if object does not exist', async () => {
    mockFile.exists.mockResolvedValueOnce([false]);
    const res = { redirect: jest.fn() };

    const success = await backend.stream('uploads/1/missing.jpg', res);
    expect(success).toBe(false);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('healthcheck exercises put, get, delete', async () => {
    mockFile.download.mockResolvedValueOnce([Buffer.from('uknow gcs healthcheck')]);
    const result = await backend.healthcheck();
    expect(result).toBe(true);
    expect(mockFile.save).toHaveBeenCalled();
    expect(mockFile.download).toHaveBeenCalled();
    expect(mockFile.delete).toHaveBeenCalled();
  });
  // ── Lỗi quyền/mạng KHÁC "tệp không có" (sự cố mất role IAM 05–08/10/2026) ──
  // Hình dạng thật của @google-cloud/storage: file.exists() trả [boolean]; lỗi là ApiError có `.code` là SỐ HTTP
  // và `.message` chứa tên service account + đường dẫn bucket.
  const gcsError = (code) => Object.assign(
    new Error('founderai-storage@x.iam.gserviceaccount.com does not have storage.objects.get access to the Google Cloud Storage object. https://storage.googleapis.com/b/founderai-storage/o/uploads%2F1%2Fdoc.pdf'),
    { code }
  );

  describe('phân biệt 404 với lỗi quyền', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('exists(): file.exists ném 403 -> throw StorageUnavailableError, KHÔNG trả false', async () => {
      mockFile.exists.mockRejectedValueOnce(gcsError(403));
      await expect(backend.exists('uploads/1/doc.pdf')).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('exists(): file.exists ném 404 -> false; trả [false] -> false', async () => {
      mockFile.exists.mockRejectedValueOnce(gcsError(404));
      expect(await backend.exists('uploads/1/doc.pdf')).toBe(false);
      mockFile.exists.mockResolvedValueOnce([false]);
      expect(await backend.exists('uploads/1/doc.pdf')).toBe(false);
    });

    it('exists(): lỗi mạng không có code -> throw (không coi là mất tệp)', async () => {
      mockFile.exists.mockRejectedValueOnce(new Error('socket hang up'));
      await expect(backend.exists('uploads/1/doc.pdf')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    });

    it('getMetadata(): 403 -> throw; 404 -> null', async () => {
      mockFile.getMetadata.mockRejectedValueOnce(gcsError(403));
      await expect(backend.getMetadata('uploads/1/doc.pdf')).rejects.toBeInstanceOf(StorageUnavailableError);
      mockFile.getMetadata.mockRejectedValueOnce(gcsError(404));
      expect(await backend.getMetadata('uploads/1/doc.pdf')).toBeNull();
    });

    it('getBuffer(): 403 -> thông điệp tiếng Việt, không lộ tên service account/bucket, lỗi gốc nằm ở cause', async () => {
      const original = gcsError(403);
      mockFile.download.mockRejectedValueOnce(original);
      const err = await backend.getBuffer('uploads/1/doc.pdf').catch((e) => e);
      expect(err).toBeInstanceOf(StorageUnavailableError);
      expect(err.message).toBe('Kho lưu trữ tệp tạm thời không truy cập được. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.');
      expect(err.message).not.toContain('iam.gserviceaccount.com');
      expect(err.message).not.toContain('storage.googleapis.com');
      expect(err.cause).toBe(original);
    });

    it('getBuffer(): 404 -> STORAGE_NOT_FOUND với câu tiếng Việt', async () => {
      mockFile.download.mockRejectedValueOnce(gcsError(404));
      await expect(backend.getBuffer('uploads/1/doc.pdf')).rejects.toMatchObject({
        code: 'STORAGE_NOT_FOUND',
        message: 'Tệp đính kèm không còn trong kho lưu trữ.',
      });
    });

    it('put(): lỗi ghi -> StorageUnavailableError', async () => {
      mockFile.save.mockRejectedValueOnce(gcsError(403));
      await expect(backend.put('uploads/1/doc.pdf', Buffer.from('x'))).rejects.toBeInstanceOf(StorageUnavailableError);
    });

    it('stream(): 403 -> trả 503 chung chung, không redirect, không lộ message gốc', async () => {
      mockFile.exists.mockRejectedValueOnce(gcsError(403));
      const json = jest.fn();
      const res = { headersSent: false, redirect: jest.fn(), status: jest.fn(() => ({ json })) };

      const handled = await backend.stream('uploads/1/photo.jpg', res);

      expect(handled).toBe(true);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'STORAGE_UNAVAILABLE' }));
      expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('iam.gserviceaccount.com');
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('stream(): 404 -> false như cũ (caller tự trả 404)', async () => {
      mockFile.exists.mockRejectedValueOnce(gcsError(404));
      const res = { redirect: jest.fn(), status: jest.fn() };
      expect(await backend.stream('uploads/1/photo.jpg', res)).toBe(false);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
