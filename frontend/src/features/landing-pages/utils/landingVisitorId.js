const STORAGE_KEY = 'founder_landing_vid';

/**
 * Lấy hoặc tạo visitorId ổn định trên trình duyệt (thống kê view/click/submit).
 *
 * @returns {string}
 */
export function getOrCreateLandingVisitorId() {
  try {
    let v = window.localStorage.getItem(STORAGE_KEY);
    if (v && String(v).trim()) return String(v).trim();
    v =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(STORAGE_KEY, v);
    return v;
  } catch {
    return `anon_${Date.now()}`;
  }
}
