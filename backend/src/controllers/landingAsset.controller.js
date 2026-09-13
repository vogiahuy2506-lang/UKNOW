import path from 'path';
import { findStorageObjectByKey } from '../repositories/storage.repository.js';
import { getStorageBackend } from '../services/storage/storageBackend.js';

const VALID_KEY_REGEX = /^uploads\/\d+\/landing\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i;

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export class LandingAssetController {
  /**
   * Serve landing page asset công khai
   * GET /lp-assets/*
   */
  async serveAsset(req, res) {
    try {
      // req.params.key hoặc trích xuất từ req.path
      const rawKey = req.params.key || req.params[0] || req.path.replace(/^\/+/, '');
      const cleanKey = String(rawKey || '').replace(/^\/+/, '');

      if (!VALID_KEY_REGEX.test(cleanKey) || cleanKey.includes('..')) {
        return res.status(404).json({ success: false, message: 'Asset không tồn tại' });
      }

      const record = await findStorageObjectByKey(cleanKey);
      if (!record || record.category !== 'landing_asset' || !['temp', 'active'].includes(record.state)) {
        return res.status(404).json({ success: false, message: 'Asset không tồn tại' });
      }

      const ext = path.extname(cleanKey).toLowerCase();
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const fileName = path.basename(cleanKey);

      // Đặt header trước khi stream
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      const ok = await getStorageBackend().stream(cleanKey, res, {
        fileName,
        mimeType,
        preview: true,
        signedUrlTtlMs: 24 * 3600 * 1000, // 24 giờ
      });

      if (!ok && !res.headersSent) {
        return res.status(404).json({ success: false, message: 'Không thể tải asset' });
      }
    } catch (error) {
      console.error('[LandingAssetController.serveAsset] error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải asset' });
      }
    }
  }
}

export default new LandingAssetController();
