import { isResourceLocked } from '../services/payment/topupLock.service.js';
import db from '../config/database.js';

/**
 * @param {string} resourceKey
 * @param {number|string|null|undefined} resourceId
 * @returns {Promise<boolean>} true if locked
 */
export async function resourceIsLocked(resourceKey, resourceId) {
  if (resourceId == null || resourceId === '') return false;
  try {
    return await isResourceLocked(resourceKey, resourceId);
  } catch (err) {
    // Fail-open có chủ ý: đây là chốt doanh thu, không phải rào bảo mật.
    // Bảng chưa tồn tại (deploy trước migration) hoặc DB trục trặc thoáng qua mà
    // fail-closed thì hạ toàn bộ landing page + chatbot công khai của mọi khách cùng lúc.
    // Cron reconcile sẽ áp lại khoá khi DB khoẻ.
    if (err?.code === '42P01') {
      console.warn('[TopupLock] table missing, skip lock check');
    } else {
      console.error(`[TopupLock] lock check failed (${resourceKey}#${resourceId}):`, err.message);
    }
    return false;
  }
}

/**
 * @param {string} slug
 * @returns {Promise<{ id: number, locked: boolean }|null>}
 */
export async function getLandingLockBySlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  try {
    const { rows } = await db.query(
      `SELECT id FROM landing_pages WHERE slug = $1 AND is_published = true LIMIT 1`,
      [s]
    );
    if (!rows[0]) return null;
    const locked = await resourceIsLocked('landing_pages', rows[0].id);
    return { id: Number(rows[0].id), locked };
  } catch (err) {
    if (err?.code !== '42P01') {
      console.error(`[TopupLock] landing lock lookup failed (${s}):`, err.message);
    }
    return null;
  }
}

export function pausedLandingHtml(title = 'Trang tạm ngừng') {
  const safe = String(title || 'Trang tạm ngừng')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${safe}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a}
.box{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#64748b;line-height:1.5}</style></head>
<body><div class="box"><h1>Trang tạm ngừng</h1><p>Landing page này đang tạm ngừng do hạn mức gói / slot mua thêm hết hạn. Vui lòng liên hệ chủ cửa hàng.</p></div></body></html>`;
}
