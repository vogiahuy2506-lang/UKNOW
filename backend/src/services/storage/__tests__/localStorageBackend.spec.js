import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import { promises as fs } from 'fs';
import { LocalStorageBackend } from '../localStorageBackend.js';

const TEST_UPLOADS = path.resolve(process.cwd(), 'temp_test_uploads');

describe('LocalStorageBackend', () => {
  let backend;

  beforeEach(async () => {
    backend = new LocalStorageBackend({ uploadsRootDir: TEST_UPLOADS });
    await fs.mkdir(TEST_UPLOADS, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_UPLOADS, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('resolveAbsolutePathFromKey resolves clean paths under uploads/', () => {
    const abs = backend.resolveAbsolutePathFromKey('uploads/42/test.txt');
    expect(abs).toBe(path.resolve(TEST_UPLOADS, '42/test.txt'));
  });

  it('resolveAbsolutePathFromKey blocks directory traversal', () => {
    expect(backend.resolveAbsolutePathFromKey('uploads/../../etc/passwd')).toBe('');
    expect(backend.resolveAbsolutePathFromKey('something_else/test.txt')).toBe('');
  });

  it('put and getBuffer store and retrieve content correctly', async () => {
    const key = 'uploads/user1/doc.txt';
    const content = Buffer.from('hello world', 'utf8');

    await backend.put(key, content);
    expect(await backend.exists(key)).toBe(true);

    const retrieved = await backend.getBuffer(key);
    expect(retrieved.toString('utf8')).toBe('hello world');
  });

  it('delete removes key and sidecar files safely', async () => {
    const key = 'uploads/user1/image.png';
    const sidecarKey = 'uploads/user1/image.png.txt';

    await backend.put(key, Buffer.from('image bytes'));
    await backend.put(sidecarKey, Buffer.from('extracted text'));

    expect(await backend.exists(key)).toBe(true);
    expect(await backend.exists(sidecarKey)).toBe(true);

    await backend.delete([key, sidecarKey]);

    expect(await backend.exists(key)).toBe(false);
    expect(await backend.exists(sidecarKey)).toBe(false);
  });

  it('stream sends file with proper headers', async () => {
    const key = 'uploads/user1/test.pdf';
    await backend.put(key, Buffer.from('pdf bytes'));

    const headers = {};
    const res = {
      setHeader: (name, val) => { headers[name] = val; },
      sendFile: (filePath) => { res.sentFile = filePath; },
    };

    const success = await backend.stream(key, res, {
      fileName: 'custom.pdf',
      mimeType: 'application/pdf',
      preview: true,
    });

    expect(success).toBe(true);
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toBe('inline');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect(res.sentFile).toBe(backend.resolveAbsolutePathFromKey(key));
  });

  it('healthcheck writes, verifies and cleans test file', async () => {
    const result = await backend.healthcheck();
    expect(result).toBe(true);
  });
});
