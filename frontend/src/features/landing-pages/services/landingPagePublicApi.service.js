import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const publicClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

/**
 * Tải payload HTML landing đã publish.
 *
 * @param {string} slug
 * @returns {Promise<{ title: string, htmlContent: string }>}
 */
export async function fetchPublishedLandingHtml(slug) {
  const { data } = await publicClient.get(`/public/landing-pages/${encodeURIComponent(String(slug || '').trim())}`);
  if (!data?.success || !data?.data) {
    throw new Error(data?.message || 'Không tải được landing page');
  }
  return data.data;
}

/**
 * Tải landing đã publish theo hostname custom (www.*) đã verify.
 *
 * @param {string} host window.location.hostname
 * @returns {Promise<{ title: string, htmlContent: string, slug: string }>}
 */
export async function fetchPublishedLandingByHost(host) {
  const h = String(host || '').trim().toLowerCase();
  const { data } = await publicClient.get('/public/landing-pages-by-host', {
    params: { host: h },
  });
  if (!data?.success || !data?.data) {
    throw new Error(data?.message || 'Không tải được landing page');
  }
  return data.data;
}

/**
 * Ghi nhận một lượt xem landing (slug `l` cho trang /l không cần bản ghi landing_pages).
 *
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function postLandingView(payload) {
  await publicClient.post('/public/landing-analytics/view', payload);
}
