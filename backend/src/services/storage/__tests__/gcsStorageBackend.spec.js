import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GcsStorageBackend } from '../gcsStorageBackend.js';

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
});
