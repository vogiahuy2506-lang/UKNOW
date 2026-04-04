/**
 * Chuẩn hóa slug landing trước khi lưu DB.
 *
 * Luồng hoạt động:
 * 1. Trim + lowercase.
 * 2. Bỏ mọi dấu `/` ở đầu và cuối (client hay gửi `/l` thay vì `l`).
 * 3. Nếu sau bước 2 còn rỗng (vd chỉ là `/`) → coi như không có slug.
 *
 * @param {unknown} raw Giá trị từ body `landingPageSlug` / `landing_page_slug`
 * @returns {string|null} Slug lưu DB hoặc null
 */
export function canonicalLandingPageSlug(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return null;
  const stripped = t.replace(/^\/+|\/+$/g, '');
  if (!stripped) return null;
  return stripped.slice(0, 100);
}

/**
 * Mở rộng danh sách slug khi lọc SQL (`landing_page_slug = ANY(...)`).
 *
 * Luồng hoạt động:
 * 1. Với mỗi slug đã chọn, thêm cả dạng có `/` đầu và dạng đã bỏ slash (khớp dữ liệu cũ).
 * 2. Riêng landing React: filter `l` còn khớp bản ghi legacy lưu `/l` hoặc chỉ `/`.
 *
 * @param {string[]} slugs Slug đã lowercase/trim (như trong repository)
 * @returns {string[]} Danh sách không trùng để bind tham số SQL
 */
export function expandLandingSlugsForSqlFilter(slugs) {
  const out = new Set();
  for (const s of slugs) {
    const t = String(s ?? '').trim().toLowerCase();
    if (!t) continue;
    out.add(t);
    if (t.startsWith('/')) {
      const inner = t.replace(/^\/+|\/+$/g, '');
      if (inner) out.add(inner);
    } else {
      out.add(`/${t}`);
    }
    if (t === 'l') {
      out.add('/l');
      out.add('/');
    }
  }
  return Array.from(out).filter(Boolean);
}
