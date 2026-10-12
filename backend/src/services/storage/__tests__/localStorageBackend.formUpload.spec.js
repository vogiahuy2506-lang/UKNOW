/**
 * PR-4b — phần LocalStorageBackend phục vụ tải tệp biểu mẫu ở máy dev/test: ghi dạng luồng có trần, đọc đầu tệp, sao chép, thông tin object,
 * và hợp đồng `createUploadTarget` GIỐNG GCS (`{ uploadUrl, method, headers, expiresAt }`).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
import { LocalStorageBackend, StorageObjectTooLargeError } from '../localStorageBackend.js';

let root;
let backend;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'uknow-local-formupload-'));
  backend = new LocalStorageBackend({ uploadsRootDir: path.join(root, 'uploads'), tempDir: path.join(root, 'temp') });
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** Luồng `count` chunk, mỗi chunk `size` byte, đếm số chunk đã được ĐỌC (kiểm "đọc nốt phần còn lại"). */
function makeStream(count, size) {
  const state = { produced: 0 };
  const stream = new Readable({
    read() {
      if (state.produced >= count) {
        this.push(null);
        return;
      }
      state.produced += 1;
      this.push(Buffer.alloc(size, 0x61));
    },
  });
  return { stream, state };
}

describe('putStream', () => {
  it('ghi luồng xuống đĩa, trả đúng số byte', async () => {
    const { stream } = makeStream(4, 1000);
    const result = await backend.putStream('uploads/7/forms/3/tmp/a.txt', stream, { maxBytes: 10000 });
    expect(result).toEqual({ size: 4000 });
    const stat = await fs.stat(path.join(root, 'uploads', '7/forms/3/tmp/a.txt'));
    expect(stat.size).toBe(4000);
  });

  it('đúng bằng trần thì ghi được', async () => {
    const { stream } = makeStream(2, 500);
    await expect(backend.putStream('uploads/7/forms/3/tmp/exact.txt', stream, { maxBytes: 1000 })).resolves.toEqual({ size: 1000 });
  });

  it('vượt trần → StorageObjectTooLargeError (code FILE_TOO_LARGE), tệp ghi dở bị xoá, luồng vẫn được đọc nốt', async () => {
    const { stream, state } = makeStream(50, 1000);
    const err = await backend.putStream('uploads/7/forms/3/tmp/big.txt', stream, { maxBytes: 2500 }).catch((e) => e);
    expect(err).toBeInstanceOf(StorageObjectTooLargeError);
    expect(err.code).toBe('FILE_TOO_LARGE');
    expect(err.maxBytes).toBe(2500);
    expect(await backend.exists('uploads/7/forms/3/tmp/big.txt')).toBe(false);
    // Đọc nốt (bỏ) toàn bộ — không huỷ luồng giữa chừng để response còn tới được client (xem ghi chú trong putStream).
    expect(state.produced).toBe(50);
  });

  it('luồng báo lỗi giữa chừng → từ chối và không để lại tệp', async () => {
    // Đẩy một chunk rồi huỷ NGAY trong read(): hoãn việc huỷ sang nextTick sẽ để read() chạy vô hạn đồng bộ (luồng chảy) và tràn bộ nhớ.
    const stream = new Readable({
      read() {
        this.push(Buffer.alloc(100, 0x62));
        this.destroy(new Error('mat ket noi'));
      },
    });
    await expect(backend.putStream('uploads/7/forms/3/tmp/broken.txt', stream, { maxBytes: 1000 })).rejects.toThrow();
    expect(await backend.exists('uploads/7/forms/3/tmp/broken.txt')).toBe(false);
  });

  it('khoá không hợp lệ bị từ chối trước khi đụng đĩa', async () => {
    const { stream } = makeStream(1, 10);
    await expect(backend.putStream('uploads/../escape.txt', stream, { maxBytes: 100 })).rejects.toThrow(/Invalid storage key/);
  });
});

describe('getObjectInfo / readHead / copy', () => {
  const key = 'uploads/7/forms/3/tmp/info.bin';

  it('getObjectInfo: cỡ thật của tệp; không có tệp → null', async () => {
    await backend.put(key, Buffer.from('0123456789'));
    await expect(backend.getObjectInfo(key)).resolves.toEqual({ size: 10, contentType: null });
    await expect(backend.getObjectInfo('uploads/7/forms/3/tmp/khong-co.bin')).resolves.toBeNull();
    await expect(backend.getObjectInfo('uploads/../x')).resolves.toBeNull();
  });

  it('readHead: đọc đúng `length` byte đầu, tệp ngắn hơn thì trả phần có', async () => {
    await backend.put('uploads/7/forms/3/tmp/head.bin', Buffer.from('ABCDEFGHIJ'));
    expect((await backend.readHead('uploads/7/forms/3/tmp/head.bin', 4)).toString()).toBe('ABCD');
    expect((await backend.readHead('uploads/7/forms/3/tmp/head.bin', 1024)).toString()).toBe('ABCDEFGHIJ');
  });

  it('readHead: tệp không có → ném lỗi (ENOENT)', async () => {
    await expect(backend.readHead('uploads/7/forms/3/tmp/none.bin', 8)).rejects.toThrow();
  });

  it('copy: tạo thư mục đích, giữ nguyên bản gốc', async () => {
    await backend.put('uploads/7/forms/3/tmp/src.bin', Buffer.from('noi dung'));
    await backend.copy('uploads/7/forms/3/tmp/src.bin', 'uploads/7/forms/3/submissions/9/dst.bin');
    expect((await backend.getBuffer('uploads/7/forms/3/submissions/9/dst.bin')).toString()).toBe('noi dung');
    expect(await backend.exists('uploads/7/forms/3/tmp/src.bin')).toBe(true);
  });

  it('copy: khoá lạ bị từ chối', async () => {
    await expect(backend.copy('uploads/7/a.bin', 'uploads/../b.bin')).rejects.toThrow(/Invalid storage key/);
  });
});

describe('createUploadTarget (hợp đồng giống GCS)', () => {
  it('trả đường dẫn endpoint backend + header Content-Type + hạn', async () => {
    const before = Date.now();
    const target = await backend.createUploadTarget({
      key: 'uploads/7/forms/3/tmp/a.pdf',
      contentType: 'application/pdf',
      maxBytes: 5 * 1024 * 1024,
      ttlMs: 15 * 60 * 1000,
      fallbackPath: '/api/public/forms/KEY/uploads/ID/content',
    });
    expect(Object.keys(target).sort()).toEqual(['expiresAt', 'headers', 'method', 'uploadUrl']);
    expect(target.uploadUrl).toBe('/api/public/forms/KEY/uploads/ID/content');
    expect(target.method).toBe('PUT');
    expect(target.headers).toEqual({ 'Content-Type': 'application/pdf' });
    expect(new Date(target.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
  });
});
