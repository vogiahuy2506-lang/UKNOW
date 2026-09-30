import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import { promises as fs } from 'fs';
import { validateHeaderValue } from 'http';
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

  it('resolveAbsolutePathFromKey không nhận thư mục anh em có cùng tiền tố chuỗi với root', () => {
    const narrowRoot = path.join(TEST_UPLOADS, 'root');
    const narrow = new LocalStorageBackend({ uploadsRootDir: narrowRoot });
    // Đường dẫn phân giải ra phải nằm TRONG root (khớp kèm dấu phân cách), không chỉ cùng tiền tố chuỗi.
    expect(narrow.resolveAbsolutePathFromKey(`uploads/${narrowRoot}-other/secret.txt`)).toBe('');
    expect(narrow.resolveAbsolutePathFromKey(`uploads/${narrowRoot}/7/ok.txt`)).toBe(path.join(narrowRoot, '7', 'ok.txt'));
    expect(narrow.resolveAbsolutePathFromKey('uploads/7/ok.txt')).toBe(path.join(narrowRoot, '7', 'ok.txt'));
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
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    // Trình xem PDF của trình duyệt vỡ khi bị sandbox → PDF không kèm CSP.
    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(res.sentFile).toBe(backend.resolveAbsolutePathFromKey(key));
  });

  describe('stream — chỉ inline loại tệp an toàn', () => {
    function buildRes() {
      const headers = {};
      const res = {
        headers,
        // Kiểm header như Node thật: ký tự ngoài Latin-1 hay CR/LF sẽ ném lỗi.
        setHeader: (name, val) => { validateHeaderValue(name, val); headers[name] = val; },
        sendFile: (filePath) => { res.sentFile = filePath; },
      };
      return res;
    }

    it.each([
      ['uploads/u1/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
      ['uploads/u1/page.html', '<script>alert(1)</script>'],
      ['uploads/u1/page.xhtml', '<html/>'],
      ['uploads/u1/data.xml', '<x/>'],
      ['uploads/u1/app.js', 'alert(1)'],
      ['uploads/u1/blob.bin', 'x'],
    ])('preview %s → attachment + nosniff + CSP sandbox', async (key, body) => {
      await backend.put(key, Buffer.from(body));
      const res = buildRes();

      const ok = await backend.stream(key, res, { fileName: path.basename(key), preview: true });

      expect(ok).toBe(true);
      expect(res.headers['Content-Disposition']).toBe(`attachment; filename="${path.basename(key)}"`);
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(res.headers['Content-Security-Policy']).toMatch(/^sandbox; default-src 'none'/);
      // Ảnh SVG nhúng qua <img> từ trang khác vẫn cần CORP.
      expect(res.headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    });

    it('MIME khai báo image/svg+xml → attachment dù preview', async () => {
      const key = 'uploads/u1/icon.svg';
      await backend.put(key, Buffer.from('<svg/>'));
      const res = buildRes();

      await backend.stream(key, res, { fileName: 'icon.svg', mimeType: 'image/svg+xml', preview: true });

      expect(res.headers['Content-Type']).toBe('image/svg+xml');
      expect(res.headers['Content-Disposition']).toMatch(/^attachment;/);
    });

    it('MIME khai báo text/html cho tệp .png → attachment, không inline', async () => {
      const key = 'uploads/u1/fake.png';
      await backend.put(key, Buffer.from('<script>alert(1)</script>'));
      const res = buildRes();

      await backend.stream(key, res, { fileName: 'fake.png', mimeType: 'text/html', preview: true });

      expect(res.headers['Content-Disposition']).toMatch(/^attachment;/);
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('preview ảnh PNG không khai MIME → inline, Content-Type image/png, có CSP sandbox', async () => {
      const key = 'uploads/u1/photo.png';
      await backend.put(key, Buffer.from('png'));
      const res = buildRes();

      await backend.stream(key, res, { fileName: 'photo.png', preview: true });

      expect(res.headers['Content-Type']).toBe('image/png');
      expect(res.headers['Content-Disposition']).toBe('inline');
      expect(res.headers['Content-Security-Policy']).toMatch(/^sandbox;/);
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('tải xuống tệp tên tiếng Việt không làm hỏng header', async () => {
      const key = 'uploads/u1/1700_hop_dong.pdf';
      await backend.put(key, Buffer.from('pdf'));
      const res = buildRes();

      const ok = await backend.stream(key, res, { fileName: 'Hợp đồng.pdf', mimeType: 'application/pdf' });

      expect(ok).toBe(true);
      expect(res.headers['Content-Disposition']).toBe(
        "attachment; filename=\"Hop dong.pdf\"; filename*=UTF-8''H%E1%BB%A3p%20%C4%91%E1%BB%93ng.pdf"
      );
      expect(res.headers['Cross-Origin-Resource-Policy']).toBeUndefined();
    });
  });

  it('healthcheck writes, verifies and cleans test file', async () => {
    const result = await backend.healthcheck();
    expect(result).toBe(true);
  });
});
