import path from 'path';

export const HELP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const HELP_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const HELP_IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
]);

/**
 * Validate raster image for help-article uploads (MIME + extension).
 * @param {{ mimetype?: string, originalName?: string, size?: number }} file
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateHelpImageFile(file = {}) {
  const mimetype = String(file.mimetype || '').toLowerCase();
  const originalName = String(file.originalName || file.originalname || '');
  const ext = path.extname(originalName).toLowerCase();
  const size = Number(file.size) || 0;

  if (size > HELP_IMAGE_MAX_BYTES) {
    return { ok: false, message: 'Ảnh bài viết tối đa 5MB' };
  }
  if (!HELP_IMAGE_MIMES.has(mimetype)) {
    return {
      ok: false,
      message: 'Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF (không chấp nhận SVG)',
    };
  }
  if (!HELP_IMAGE_EXTS.has(ext)) {
    return {
      ok: false,
      message: 'Đuôi file không hợp lệ. Chỉ .jpg, .jpeg, .png, .webp, .gif',
    };
  }
  return { ok: true };
}
