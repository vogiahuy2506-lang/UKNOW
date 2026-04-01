/**
 * Chuẩn hóa URL file công khai để nhúng ảnh (`<img src>`).
 *
 * Luồng hoạt động:
 * - Backend `GET /file/:token` trả **trang HTML** (viewer), không phải bytes ảnh → `<img>` vỡ / không hiện.
 * - Ảnh cần `GET /file/:token/download?preview=true` (stream file, Content-Disposition inline).
 *
 * @param {string|null|undefined} url URL đã lưu (có thể là bản cũ chỉ có `/file/:token`)
 * @returns {string|null|undefined}
 */
export function normalizePublicFileUrlForEmbed(url) {
  if (url == null) return url;
  const s = String(url).trim();
  if (!s) return url;

  try {
    const u = new URL(s);
    const path = (u.pathname || '').replace(/\/+$/, '') || '';

    const downloadPath = path.match(/^\/file\/([^/]+)\/download$/);
    if (downloadPath) {
      if (u.searchParams.get('preview') === 'true') return s;
      const next = new URL(u.href);
      next.searchParams.set('preview', 'true');
      return next.toString();
    }

    const bareFile = path.match(/^\/file\/([^/]+)$/);
    if (bareFile) {
      const token = decodeURIComponent(bareFile[1]);
      const out = new URL(u.origin);
      out.pathname = `/file/${encodeURIComponent(token)}/download`;
      out.searchParams.set('preview', 'true');
      return out.toString();
    }
  } catch {
    return s;
  }
  return s;
}
