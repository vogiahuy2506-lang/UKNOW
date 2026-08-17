import path from 'path';
import { promises as fs } from 'fs';

const UPLOADS_ROOT_DIR = path.resolve(process.cwd(), 'uploads');
const TEMP_DIR = path.resolve(process.cwd(), 'temp_uploads');

export class LocalStorageBackend {
  constructor({ uploadsRootDir = UPLOADS_ROOT_DIR, tempDir = TEMP_DIR } = {}) {
    this.uploadsRootDir = uploadsRootDir;
    this.tempDir = tempDir;
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
    const resolvedPath = path.resolve(this.uploadsRootDir, relativePath);
    if (!resolvedPath.startsWith(this.uploadsRootDir)) return '';
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
   * Trả file ra HTTP response
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

    const safeName = String(fileName || 'file').replace(/"/g, '');
    const disposition = preview ? 'inline' : `attachment; filename="${safeName}"`;
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    res.setHeader('Content-Disposition', disposition);
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
