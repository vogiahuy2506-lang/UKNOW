import { Storage } from '@google-cloud/storage';

export class GcsStorageBackend {
  constructor({
    bucketName = process.env.GCS_BUCKET || 'founderai-storage',
    keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS,
    storageClient = null,
  } = {}) {
    this.bucketName = String(bucketName || '').trim();
    this.keyFilename = keyFilename ? String(keyFilename).trim() : null;
    this.storage = storageClient || (this.keyFilename ? new Storage({ keyFilename: this.keyFilename }) : new Storage());
    this.bucket = this.storage.bucket(this.bucketName);
  }

  /**
   * Chuẩn hoá key object trên GCS (loại bỏ leading slash và path traversal).
   * @param {string} storageKey
   * @returns {string}
   */
  normalizeKey(storageKey) {
    const text = String(storageKey || '').trim();
    if (!text) return '';
    const withoutLeadingSlash = text.replace(/^\/+/, '');
    const uploadIdx = withoutLeadingSlash.indexOf('uploads/');
    const key = uploadIdx >= 0 ? withoutLeadingSlash.slice(uploadIdx) : withoutLeadingSlash;
    if (!key.startsWith('uploads/')) return '';
    if (key.includes('..')) return '';
    return key.replace(/\\/g, '/');
  }

  /**
   * Ghi buffer lên GCS
   * @param {string} key
   * @param {Buffer|string} buffer
   * @param {object} [options]
   */
  async put(key, buffer, options = {}) {
    const cleanKey = this.normalizeKey(key);
    if (!cleanKey) {
      throw new Error(`Invalid storage key for GCS: ${key}`);
    }
    const file = this.bucket.file(cleanKey);
    const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, options.encoding || 'utf8');
    await file.save(content, {
      contentType: options.contentType || 'application/octet-stream',
      resumable: false,
    });
  }

  /**
   * Đọc Buffer từ GCS
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async getBuffer(key) {
    const cleanKey = this.normalizeKey(key);
    if (!cleanKey) {
      throw new Error(`Invalid storage key for GCS: ${key}`);
    }
    const file = this.bucket.file(cleanKey);
    const [buf] = await file.download();
    return buf;
  }

  /**
   * Kiểm tra object có tồn tại trên GCS
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    const cleanKey = this.normalizeKey(key);
    if (!cleanKey) return false;
    try {
      const file = this.bucket.file(cleanKey);
      const [exists] = await file.exists();
      return Boolean(exists);
    } catch {
      return false;
    }
  }

  /**
   * Xoá danh sách objects khỏi GCS
   * @param {string|string[]} keys
   * @returns {Promise<void>}
   */
  async delete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    await Promise.all(
      list.map(async (rawKey) => {
        const cleanKey = this.normalizeKey(rawKey);
        if (!cleanKey) return;
        try {
          const file = this.bucket.file(cleanKey);
          await file.delete({ ignoreNotFound: true });
        } catch (err) {
          console.warn(`[GcsStorageBackend] Failed to delete ${cleanKey}:`, err.message);
        }
      })
    );
  }

  /**
   * Phục vụ stream file bằng cách 302 Redirect sang Signed URL hạn ngắn (15 phút).
   * Không proxy byte qua tiến trình Node.js để tránh phình RAM/băng thông.
   * @param {string} key
   * @param {import('express').Response} res
   * @param {object} [options]
   * @returns {Promise<boolean>}
   */
  async stream(key, res, { fileName = 'file', mimeType = '', preview = false } = {}) {
    const cleanKey = this.normalizeKey(key);
    if (!cleanKey) return false;

    const file = this.bucket.file(cleanKey);
    const [exists] = await file.exists().catch(() => [false]);
    if (!exists) return false;

    const safeName = String(fileName || 'file').replace(/"/g, '');
    const disposition = preview ? 'inline' : `attachment; filename="${safeName}"`;

    const signOptions = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 phút
      responseDisposition: disposition,
    };
    if (mimeType) {
      signOptions.responseType = mimeType;
    }

    const [signedUrl] = await file.getSignedUrl(signOptions);

    if (preview) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    res.redirect(302, signedUrl);
    return true;
  }

  /**
   * Healthcheck bằng cách ghi, đọc, xoá object trong _healthcheck/
   * TUYỆT ĐỐI KHÔNG gọi bucket.exists() hay bucket.getMetadata()
   * vì Service Account chỉ có quyền cấp object (roles/storage.objectAdmin).
   * @returns {Promise<boolean>}
   */
  async healthcheck() {
    const testKey = `uploads/_healthcheck/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    const payload = Buffer.from('uknow gcs healthcheck', 'utf8');
    try {
      await this.put(testKey, payload, { contentType: 'text/plain' });
      const readBuf = await this.getBuffer(testKey);
      if (readBuf.toString('utf8') !== payload.toString('utf8')) {
        throw new Error('GCS healthcheck data mismatch');
      }
      await this.delete(testKey);
      return true;
    } catch (err) {
      console.error('[GcsStorageBackend] Healthcheck failed:', err.message);
      return false;
    }
  }
}
