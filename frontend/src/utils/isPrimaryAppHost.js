/**
 * Hostname của “app chính” (FounderAI) — mọi host khác được coi là custom domain landing.
 *
 * Khai báo trong `VITE_PRIMARY_APP_HOSTS` (phân tách dấu phẩy), ví dụ:
 * `localhost,127.0.0.1,www.founderai.biz,founderai.biz`
 *
 * @param {string} [hostname]
 * @returns {boolean}
 */
export function isPrimaryAppHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return true;
  const raw = String(import.meta.env.VITE_PRIMARY_APP_HOSTS || '').trim();
  const defaults = ['localhost', '127.0.0.1'];
  const fromEnv = raw
    ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : defaults;
  const set = new Set(fromEnv.length ? fromEnv : defaults);
  return set.has(h);
}
