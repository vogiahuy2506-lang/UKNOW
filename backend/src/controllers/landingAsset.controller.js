import path from 'path';
import { findStorageObjectByKey } from '../repositories/storage.repository.js';
import { getStorageBackend } from '../services/storage/storageBackend.js';

// PR-4a (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, "Bổ sung 15/09 khi soạn lệnh PR-4"):
// mở rộng thêm cặp `forms/` ↔ category `form_asset`, bên cạnh `landing/` ↔ `landing_asset` sẵn
// có — production nginx chỉ proxy `^/(file|download|track|lp-assets)/`, mở route gốc mới thì
// <img> nhận HTML của SPA thay vì ảnh, nên ảnh biểu mẫu PHẢI đi qua chung cửa `/lp-assets` này.
// Chọn "bảng tiền tố→category" ngay trong controller (không tách hàm dùng chung với
// `landingAsset.service.js`): hai loại tài nguyên không có transaction/nghiệp vụ chung nào khác
// ngoài việc CÙNG được stream qua route này, tách hàm sẽ chỉ thêm một lớp gọi cho hai dòng so
// sánh — và giữ nguyên 100% hành vi của nhánh `landing/` cũ (route/`state`/cache-control không
// đổi gì).
const VALID_KEY_REGEX = /^uploads\/\d+\/(landing|forms)\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i;
const CATEGORY_BY_KEY_PREFIX = {
  landing: 'landing_asset',
  forms: 'form_asset',
};

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
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

      const match = cleanKey.match(VALID_KEY_REGEX);
      if (!match || cleanKey.includes('..')) {
        return res.status(404).json({ success: false, message: 'Asset không tồn tại' });
      }
      const expectedCategory = CATEGORY_BY_KEY_PREFIX[match[1].toLowerCase()];

      const record = await findStorageObjectByKey(cleanKey);
      if (!record || record.category !== expectedCategory || !['temp', 'active'].includes(record.state)) {
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
