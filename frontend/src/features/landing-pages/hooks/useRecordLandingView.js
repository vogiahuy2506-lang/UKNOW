import { useEffect, useRef } from 'react';
import { postLandingView } from '../services/landingPagePublicApi.service.js';
import { getOrCreateLandingVisitorId } from '../utils/landingVisitorId.js';

/**
 * Gửi một lần POST view khi mount (bỏ qua nếu thiếu slug).
 *
 * @param {string} slug
 */
export function useRecordLandingView(slug) {
  const sent = useRef(false);

  useEffect(() => {
    const s = String(slug || '').trim().toLowerCase();
    if (!s || sent.current) return;
    sent.current = true;
    let ref = '';
    try {
      ref = document.referrer || '';
    } catch {
      ref = '';
    }
    postLandingView({
      slug: s,
      visitorId: getOrCreateLandingVisitorId(),
      referrer: ref || undefined,
    }).catch(() => {
      /* không chặn hiển thị trang nếu analytics lỗi */
    });
  }, [slug]);
}
