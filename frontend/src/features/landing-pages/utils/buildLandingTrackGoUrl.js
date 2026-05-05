import { normalizeLandingLpTrackApiBase } from './normalizeLandingLpTrackApiBase.js';

/**
 * URL redirect trung gian ghi nhận click landing rồi 302 sang đích (backend chấp nhận mọi URL http/https hợp lệ).
 *
 * @param {string} landingSlug slug landing (vd: l, ai, khoahoc)
 * @param {string} targetUrl URL đích đầy đủ (http/https)
 * @returns {string}
 */
export function buildLandingTrackGoUrl(landingSlug, targetUrl) {
  const base = normalizeLandingLpTrackApiBase(String(import.meta.env.VITE_API_URL || '/api'));
  const slug = String(landingSlug || '').trim().toLowerCase();
  const u = encodeURIComponent(String(targetUrl || '').trim());
  return `${base}/public/landing-track/go?slug=${encodeURIComponent(slug)}&u=${u}`;
}
