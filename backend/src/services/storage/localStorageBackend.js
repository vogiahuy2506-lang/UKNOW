import path from 'path';
import { createWriteStream, promises as fs } from 'fs';
import {
  applyUploadedFileSecurityHeaders,
  resolveFileServePolicy,
} from '../../utils/fileServePolicy.util.js';

/** Luồng ghi vượt trần byte cho phép (PUT tệp biểu mẫu lên kho cục bộ). */
export class StorageObjectTooLargeError extends Error {
  constructor(maxBytes) {
    super(`Tệp vượt quá ${maxBytes} byte cho phép`);
    this.name = 'StorageObjectTooLargeError';
    this.code = 'FILE_TOO_LARGE';
    this.maxBytes = maxBytes;
  }
}

const UPLOADS_ROOT_DIR = path.resolve(process.cwd(), 'uploads');
const TEMP_DIR = path.resolve(process.cwd(), 'temp_uploads');

export class LocalStorageBackend {
  constructor({ uploadsRootDir = UPLOADS_ROOT_DIR, tempDir = TEMP_DIR } = {}) {
    this.uploadsRootDir = uploadsRootDir;
    this.tempDir = tempDir;
    this.type = 'local';
    this.isRemote = false;
  }

  /**
   * Chuẩn hóa key và resolve đường dẫn tuyệt đối an toàn trên đĩa.
   * Key phải bắt đầu bằng 'uploads/'.
   * @param {string} storageKey
   * @returns {string} Đường dẫn tuyệt đối hoặc chuỗi rỗng nếu không hợp lệ
   */
  resolveAbsolutePathFromKey(storageKey) {
    const text = String(storageKey || '').trim();
    if (!text) return '';
    const withoutLeadingSlash = text.replace(/^\/+/, '');
    const uploadIdx = withoutLeadingSlash.indexOf('uploads/');
    const key = uploadIdx >= 0 ? withoutLeadingSlash.slice(uploadIdx) : withoutLeadingSlash;
    if (!key.startsWith('uploads/')) return '';
    if (key.includes('..')) return '';
    const cleanKey = key.replace(/\\/g, '/');
    const relativePath = cleanKey.slice('uploads/'.length);
    const rootDir = path.resolve(this.uploadsRootDir);
    const resolvedPath = path.resolve(rootDir, relativePath);
    // So khớp kèm dấu phân cách: `<root>-khac/...` có cùng tiền tố chuỗi nhưng nằm ngoài root.
    if (resolvedPath !== rootDir && !resolvedPath.startsWith(rootDir + path.sep)) return '';
    return resolvedPath;
  }

  /**
   * Ghi buffer vào storage key
   * @param {string} key
   * @param {Buffer|string} buffer
   * @param {object} [options]
   */
  async put(key, buffer, options = {}) {
    const absPath = this.resolveAbsolutePathFromKey(key);
    if (!absPath) {
      throw new Error(`Invalid storage key for local backend: ${key}`);
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, options.encoding || 'utf8');
    await fs.writeFile(absPath, content);
  }

  /**
   * Ghi MỘT luồng byte vào storage key, KHÔNG đọc trọn vào RAM, dừng ngay khi vượt `maxBytes`
   * (tệp ghi dở bị xoá). Dùng cho PUT tệp biểu mẫu ở máy dev/test — bản tương đương của URL ký GCS.
   * @param {string} key
   * @param {import('stream').Readable} readable
   * @param {{ maxBytes?: number }} [options]
   * @returns {Promise<{ size: number }>}
   */
  async putStream(key, readable, { maxBytes = Number.MAX_SAFE_INTEGER } = {}) {
    const absPath = this.resolveAbsolutePathFromKey(key);
    if (!absPath) {
      throw new Error(`Invalid storage key for local backend: ${key}`);
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true });

    // Không dùng stream.pipeline: khi lỗi nó huỷ luôn `readable` (là req của Express) → socket đứt, không còn trả được 413.
    // Ở đây vượt trần thì NGỪNG GHI, vẫn đọc nốt (bỏ) phần còn lại của luồng rồi mới báo lỗi, để response tới được client.
    return new Promise((resolve, reject) => {
      const out = createWriteStream(absPath);
      let written = 0;
      let failure = null;
      let settled = false;
      let outOpened = false;

      const settle = (error) => {
        if (settled) return;
        settled = true;
        if (error) {
          // Cần chờ fd release trước khi unlink. Có thể dùng 'finish' (nếu gọi .end()) hoặc
          // 'close' (luôn emit kể cả khi destroyed). Subscribe cả hai rồi unlink 1 lần.
          let unlinked = false;
          const doUnlink = () => {
            if (unlinked) return;
            unlinked = true;
            fs.unlink(absPath).catch(() => {});
          };
          out.once('close', doUnlink);
          // Nếu stream chưa mở file (destroy quá sớm), 'close' vẫn fire — nhưng file chưa
          // từng tồn tại nên unlink ENOENT được catch nuốt.
          out.end();
          reject(error);
        } else {
          resolve({ size: written });
        }
      };

      out.on('open', () => {
        outOpened = true;
      });
      out.on('error', (error) => {
        failure = failure || error;
        readable.resume();
      });
      readable.on('data', (chunk) => {
        if (failure) return;
        written += chunk.length;
        if (written > maxBytes) {
          failure = new StorageObjectTooLargeError(maxBytes);
          // Vẫn tiêu thụ nốt stream để response tới được client (xem ghi chú đầu hàm) — settle
          // sẽ xử lý close + unlink khi readable 'end' về.
          return;
        }
        if (!out.write(chunk)) {
          readable.pause();
          out.once('drain', () => readable.resume());
        }
      });
      readable.on('end', () => {
        if (failure) {
          settle(failure);
          return;
        }
        out.end((error) => settle(failure || error || null));
      });
      readable.on('error', (error) => settle(failure || error));
      readable.on('close', () => {
        if (!settled && !readable.readableEnded) settle(failure || new Error('Kết nối bị ngắt giữa chừng'));
      });
    });
  }

  /**
   * Cỡ + loại của object; null nếu không có.
   * @param {string} key
   * @returns {Promise<{ size: number, contentType: string|null }|null>}
   */
  async getObjectInfo(key) {
    const absPath = this.resolveAbsolutePathFromKey(key);
    if (!absPath) return null;
    try {
      const stats = await fs.stat(absPath);
      if (!stats.isFile()) return null;
      return { size: stats.size, contentType: null };
    } catch {
      return null;
    }
  }

  /**
   * Đọc tối đa `length` byte đầu của object (kiểm chữ ký tệp) mà không nạp cả tệp.
   * @param {string} key
   * @param {number} length
   * @returns {Promise<Buffer>}
   */
  async readHead(key, length) {
    const absPath = this.resolveAbsolutePathFromKey(key);
    if (!absPath) {
      throw new Error(`Invalid storage key for local backend: ${key}`);
    }
    const handle = await fs.open(absPath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  /**
   * Sao chép object sang key mới (giữ bản gốc).
   * @param {string} srcKey
   * @param {string} destKey
   */
  async copy(srcKey, destKey) {
    const srcPath = this.resolveAbsolutePathFromKey(srcKey);
    const destPath = this.resolveAbsolutePathFromKey(destKey);
    if (!srcPath || !destPath) {
      throw new Error(`Invalid storage key for local backend: ${!srcPath ? srcKey : destKey}`);
    }
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
  }

  /**
   * Đích để trình duyệt PUT tệp lên. Kho cục bộ không có URL ký nên trả đường dẫn endpoint backend
   * (`fallbackPath`) — cùng HỢP ĐỒNG với GCS: `{ uploadUrl, method, headers, expiresAt }`.
   * @param {{ key: string, contentType: string, maxBytes: number, ttlMs: number, fallbackPath: string }} params
   */
  async createUploadTarget({ contentType, ttlMs, fallbackPath }) {
    return {
      uploadUrl: fallbackPath,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
  }

  /**
   * Đọc Buffer từ storage key
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async getBuffer(key) {
    const absPath = this.resolveAbsolutePathFromKey(key);
    if (!absPath) {
      throw new Error(`Invalid storage key for local backend: ${key}`);
    }
    return fs.readFile(absPath);
  }

  /**
   * Kiểm tra tồn tại của storage key
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    const absPath = this.resolveAbsolutePathFromKey(key);
    if (!absPath) return false;
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Xoá danh sách storage keys
   * @param {string|string[]} keys
   * @returns {Promise<void>}
   */
  async delete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const rawKey of list) {
      if (!rawKey) continue;
      const absPath = this.resolveAbsolutePathFromKey(rawKey);
      if (!absPath) continue;
      try {
        await fs.unlink(absPath);
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          console.warn(`[LocalStorageBackend] Failed to unlink ${absPath}:`, err.message);
        }
      }
    }
  }

  /**
   * Trả file ra HTTP response.
   * `preview` chỉ cho `inline` với loại tệp an toàn (ảnh raster, PDF, audio/video, text/plain) —
   * loại khác luôn `attachment`; luôn kèm `nosniff`, và CSP sandbox cho mọi loại trừ PDF.
   * @param {string} key
   * @param {import('express').Response} res
   * @param {object} [options]
   * @returns {Promise<boolean>}
   */
  async stream(key, res, { fileName = 'file', mimeType = '', preview = false } = {}) {
    const absPath = this.resolveAbsolutePathFromKey(key);
    if (!absPath) return false;
    try {
      await fs.access(absPath);
    } catch {
      return false;
    }

    const policy = resolveFileServePolicy({ mimeType, storageKey: absPath, fileName, preview });
    // Có contentType thì đặt tường minh (sendFile không ghi đè); không có thì sendFile tự suy
    // theo đuôi — loại suy ra đó không nằm trong danh sách inline nên đã bị ép `attachment`.
    if (policy.contentType) {
      res.setHeader('Content-Type', policy.contentType);
    }
    res.setHeader('Content-Disposition', policy.disposition);
    applyUploadedFileSecurityHeaders(res, policy);
    if (preview) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    res.sendFile(absPath);
    return true;
  }

  /**
   * Healthcheck bằng cách ghi/đọc/xoá file tạm
   * @returns {Promise<boolean>}
   */
  async healthcheck() {
    const testKey = `uploads/_healthcheck/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    const payload = Buffer.from('local storage healthcheck', 'utf8');
    try {
      await this.put(testKey, payload);
      const readBuf = await this.getBuffer(testKey);
      if (readBuf.toString('utf8') !== payload.toString('utf8')) {
        throw new Error('Healthcheck data mismatch');
      }
      await this.delete(testKey);
      return true;
    } catch (err) {
      console.error('[LocalStorageBackend] Healthcheck failed:', err.message);
      return false;
    }
  }
}
