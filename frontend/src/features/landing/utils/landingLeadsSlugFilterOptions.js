import { fetchLandingPagesAdminList } from '../../landing-pages/services/landingPagesAdminApi.service.js';

/**
 * Tải danh sách slug landing dùng cho bộ lọc lead (trang admin + node Builder).
 *
 * Luồng hoạt động:
 * 1. Luôn có slug cố định `l` (landing React /l).
 * 2. Gộp thêm slug từ CMS (`/admin/landing-pages`), bỏ trùng.
 * 3. Lỗi mạng → chỉ trả về mục `l`.
 *
 * @returns {Promise<{ value: string, label: string }[]>}
 */
export async function fetchLandingLeadsSlugFilterOptions() {
  try {
    const rows = await fetchLandingPagesAdminList();
    const fromDb = (rows || [])
      .map((r) => {
        const raw = String(r.slug || '').trim().toLowerCase();
        const value = raw.replace(/^\/+|\/+$/g, '') || raw;
        return {
          value,
          label: `${r.slug}${r.isPublished ? '' : ' (chưa publish)'}`,
        };
      })
      .filter((o) => o.value && o.value !== 'l');
    const seen = new Set(['l']);
    const merged = [{ value: 'l', label: 'Landing React (/l)' }];
    for (const o of fromDb) {
      if (seen.has(o.value)) continue;
      seen.add(o.value);
      merged.push(o);
    }
    return merged;
  } catch {
    return [{ value: 'l', label: 'Landing React (/l)' }];
  }
}
