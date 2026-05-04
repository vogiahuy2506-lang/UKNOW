import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { generateFileToken } from '../utils/fileDownloadToken.js';

// Resolve temp_uploads directory relative to project root (where the process starts)
const TEMP_DIR = path.resolve(process.cwd(), 'temp_uploads');
const UPLOADS_ROOT_DIR = path.resolve(process.cwd(), 'uploads');

class UploadController {
  constructor() {
    this.tempDir = TEMP_DIR;
    this.uploadsRootDir = UPLOADS_ROOT_DIR;
    this.ensureStorageDirs();
  }

  async ensureStorageDirs() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.uploadsRootDir, { recursive: true });
    } catch {
      // Không throw để tránh crash app khi khởi tạo; các thao tác I/O sẽ báo lỗi cụ thể sau.
    }
  }

  getPublicBaseUrlFromEnv() {
    const fromTracking = String(process.env.TRACKING_BASE_URL || '').trim();
    if (fromTracking) return fromTracking.replace(/\/+$/, '');
    const fromBackend = String(process.env.BACKEND_PUBLIC_URL || '').trim();
    if (fromBackend) return fromBackend.replace(/\/+$/, '');
    return 'http://localhost:5001';
  }

  sanitizeFileBaseName(fileName = '') {
    const ext = path.extname(String(fileName || ''));
    const base = path.basename(String(fileName || ''), ext).trim();
    return (base || 'upload').replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  /**
   * Chuẩn hóa storage key về định dạng `uploads/...`.
   *
   * Luồng hoạt động:
   * 1. Nếu input là object, ưu tiên đọc key/url/link/attachmentUrl.
   * 2. Nếu input là URL, tách pathname và lấy phần bắt đầu từ `uploads/`.
   * 3. Chặn path traversal để chỉ cho phép truy cập trong thư mục uploads.
   *
   * @param {unknown} input dữ liệu key hoặc URL từ DB/client
   * @returns {string} storage key hợp lệ hoặc chuỗi rỗng nếu không parse được
   */
  normalizeStorageKey(input) {
    if (!input) return '';

    let rawValue = input;
    if (typeof input === 'object' && input !== null) {
      rawValue = input.key || input.url || input.link || input.attachmentUrl || '';
    }

    const text = String(rawValue || '').trim();
    if (!text) return '';

    let candidate = text;
    try {
      const parsed = new URL(text);
      const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
      if (!pathname) return '';
      const idx = pathname.indexOf('uploads/');
      candidate = idx >= 0 ? pathname.slice(idx) : pathname;
    } catch {
      // Input không phải URL, giữ nguyên text để normalize phía dưới.
    }

    const withoutLeadingSlash = candidate.replace(/^\/+/, '');
    const uploadIdx = withoutLeadingSlash.indexOf('uploads/');
    const key = uploadIdx >= 0 ? withoutLeadingSlash.slice(uploadIdx) : withoutLeadingSlash;
    if (!key.startsWith('uploads/')) return '';
    if (key.includes('..')) return '';
    return key.replace(/\\/g, '/');
  }

  resolveAbsolutePathFromKey(storageKey) {
    const key = this.normalizeStorageKey(storageKey);
    if (!key) return '';
    const relativePath = key.slice('uploads/'.length);
    const resolvedPath = path.resolve(this.uploadsRootDir, relativePath);
    if (!resolvedPath.startsWith(this.uploadsRootDir)) return '';
    return resolvedPath;
  }

  /**
   * @param {{ download?: boolean, preview?: boolean, baseUrl?: string }} [opts]
   * - `preview: true` → `/file/:token/download?preview=true` (bytes file, dùng cho `<img src>`).
   * - Mặc định không preview → `/file/:token` (trang HTML viewer — không dùng làm URL ảnh).
   */
  buildDownloadUrlByKey(storageKey, { download = false, preview = false, baseUrl = '' } = {}) {
    const key = this.normalizeStorageKey(storageKey);
    if (!key) return '';
    const token = generateFileToken(key, null, null, null);
    const root = String(baseUrl || this.getPublicBaseUrlFromEnv()).replace(/\/+$/, '');
    const encodedToken = encodeURIComponent(token);
    if (preview) {
      return `${root}/file/${encodedToken}/download?preview=true`;
    }
    if (download) {
      return `${root}/file/${encodedToken}/download`;
    }
    return `${root}/file/${encodedToken}`;
  }
  // Lưu file tạm thời, chưa upload lên S3
  /**
   * Nhận file upload từ client và lưu vào thư mục temp_uploads/ với tên UUID.
   * File tạm sẽ được upload lên S3 khi user lưu nội dung liên quan.
   * @param {import('express').Request} req - multipart/form-data với trường 'file'
   * @param {import('express').Response} res
   */
  async uploadTemp(req, res) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Người dùng chưa được xác thực'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có tệp để tải lên'
        });
      }

      // Tạo unique filename
      const fileId = uuidv4();
      const originalName = req.file.originalname || 'upload';
      const ext = path.extname(originalName);
      const tempFileName = `${fileId}${ext}`;
      const tempFilePath = path.join(this.tempDir, tempFileName);

      // Lưu file vào temp directory
      await fs.writeFile(tempFilePath, req.file.buffer);

      return res.json({
        success: true,
        data: {
          tempId: fileId,
          originalName,
          size: req.file.size,
          contentType: req.file.mimetype,
          tempPath: tempFilePath
        }
      });
    } catch (error) {
      console.error('Upload temp error:', error);
      return res.status(500).json({
        success: false,
        message: 'Tải lên tạm thời thất bại'
      });
    }
  }
  // Upload files từ temp sang local uploads (dùng khi save template)
  /**
   * Di chuyển danh sách file tạm từ temp_uploads/ sang thư mục uploads local.
   * Storage key: `uploads/<userId>/<timestamp>_<sanitizedName><ext>`
   * @param {Array<{tempFileName: string, originalName: string}>} tempFiles - Danh sách file tạm
   * @param {string|number} userId - ID của user
   * @returns {Promise<Array<{key: string, url: string, originalName: string, tempFileName: string}>>}
   */
  async moveToS3(tempFiles, userId) {
    const results = [];
    
    for (const tempFile of tempFiles) {
      try {
        const tempPath = path.join(this.tempDir, `${tempFile.tempId}${path.extname(tempFile.originalName)}`);
        const fileBuffer = await fs.readFile(tempPath);
        
        const ext = path.extname(tempFile.originalName);
        const baseName = this.sanitizeFileBaseName(tempFile.originalName);
        const key = `uploads/${userId}/${Date.now()}_${baseName}${ext}`;
        const targetPath = this.resolveAbsolutePathFromKey(key);
        if (!targetPath) {
          throw new Error('Không thể xác định đường dẫn lưu file local');
        }

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, fileBuffer);
        /** URL dùng nhúng ảnh / tải nội dung — không dùng `/file/:token` (HTML viewer). */
        const signedUrl = this.buildDownloadUrlByKey(key, { preview: true });
        
        results.push({
          tempId: tempFile.tempId,
          key,
          url: signedUrl,
          originalName: tempFile.originalName,
          size: tempFile.size,
          contentType: tempFile.contentType
        });
        
        // Xóa file temp
        await fs.unlink(tempPath).catch(() => {});
      } catch (error) {
        console.error(`Error moving file ${tempFile.tempId} to S3:`, error);
        throw error;
      }
    }
    
    return results;
  }

  async createSignedGetObjectUrl(key, expiresIn = 60 * 60) {
    if (!key || expiresIn <= 0) {
      throw new Error('Thiếu key để tạo signed URL');
    }
    // Local storage không cần signed URL từ cloud; vẫn giữ method name để tương thích code cũ.
    return this.buildDownloadUrlByKey(key);
  }

  // Dọn dẹp các file temp cũ (hơn 24 giờ)
  /**
   * Xóa các file tạm trong temp_uploads/ cũ hơn 24 giờ.
   * Được gọi tự động mỗi 6 giờ từ index.js.
   * @returns {Promise<void>}
   */
  async cleanupTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 giờ

      let cleaned = 0;
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            cleaned++;
          }
        } catch (error) {
          // Bỏ qua file không đọc được
          console.warn(`Cannot cleanup temp file ${file}:`, error.message);
        }
      }
      
      if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old temp files`);
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error.message);
    }
  }

  // Xóa files từ local uploads
  /**
   * Xóa một hoặc nhiều file local theo storage key.
   * @param {string[]} fileKeys - Mảng storage key cần xóa
   * @returns {Promise<void>}
   */
  async deleteFromS3(fileKeys) {
    try {
      if (!fileKeys || fileKeys.length === 0) {
        return { success: true, message: 'Không có tệp để xóa' };
      }

      let deletedCount = 0;
      const errors = [];
      for (const rawKey of fileKeys) {
        const filePath = this.resolveAbsolutePathFromKey(rawKey);
        if (!filePath) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await fs.unlink(filePath);
          deletedCount += 1;
        } catch (error) {
          if (error?.code === 'ENOENT') continue;
          errors.push({ key: rawKey, message: error?.message || 'Unknown error' });
        }
      }

      return {
        success: true,
        deletedCount,
        errors,
      };
    } catch (error) {
      console.error('Error deleting local files:', error);
      throw error;
    }
  }

  async readFileBufferByKey(storageKey) {
    const filePath = this.resolveAbsolutePathFromKey(storageKey);
    if (!filePath) {
      throw new Error('Storage key không hợp lệ');
    }
    return fs.readFile(filePath);
  }

  async readTempFileBuffer(tempId, originalName) {
    const ext = path.extname(originalName || '');
    const tempFileName = `${tempId}${ext}`;
    const tempFilePath = path.join(this.tempDir, tempFileName);
    return fs.readFile(tempFilePath);
  }

  // Xóa temp file
  /**
   * Xóa một file tạm khỏi temp_uploads/ theo tên file.
   * @param {import('express').Request} req - params: { fileName }
   * @param {import('express').Response} res
   */
  async deleteTempFile(req, res) {
    try {
      const { tempId } = req.params;
      
      if (!tempId) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu temp ID'
        });
      }

      // Tìm và xóa temp file
      const files = await fs.readdir(this.tempDir);
      const tempFile = files.find(file => file.startsWith(tempId));
      
      if (tempFile) {
        const tempFilePath = path.join(this.tempDir, tempFile);
        await fs.unlink(tempFilePath);
      }

      return res.json({
        success: true,
        message: 'Xóa tệp tạm thời thành công'
      });
    } catch (error) {
      console.error('Delete temp file error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi xóa tệp tạm thời'
      });
    }
  }

  /**
   * Tạo presigned URL để truy cập file S3 (hết hạn sau 1 giờ).
   * @param {import('express').Request} req - params: { key } (S3 object key, URL-encoded)
   * @param {import('express').Response} res
   */
  async getSignedUrl(req, res) {
    try {
      const rawKey = req.params.key;
      const key = rawKey ? decodeURIComponent(rawKey) : '';

      if (!key) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu key của file'
        });
      }

      const normalizedKey = this.normalizeStorageKey(key);
      const filePath = this.resolveAbsolutePathFromKey(normalizedKey);
      if (!filePath) {
        return res.status(400).json({
          success: false,
          message: 'Key của file không hợp lệ'
        });
      }
      await fs.access(filePath);

      // Trả URL public dạng token để frontend mở tab mới trực tiếp.
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const signedUrl = this.buildDownloadUrlByKey(normalizedKey, { baseUrl });

      return res.json({
        success: true,
        data: {
          url: signedUrl,
          expires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
      });
    } catch (error) {
      console.error('Get signed URL error:', error);
      if (error?.code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          message: 'File không tồn tại'
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Không thể tạo signed URL'
      });
    }
  }
}

export default new UploadController();
