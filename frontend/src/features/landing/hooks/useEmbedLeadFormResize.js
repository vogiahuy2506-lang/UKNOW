import { useEffect, useRef } from 'react';

/**
 * Gửi chiều cao nội dung form embed lên `parent` để trang có `lp-track.js` chỉnh `iframe.style.height`, tránh thanh cuộn dọc.
 *
 * Luồng:
 * 1. Chỉ chạy khi đang trong iframe (`parent !== window`).
 * 2. Đo `scrollHeight` của root, postMessage `uknow-lp-embed-resize`.
 * 3. ResizeObserver + timeout ngắn để bắt layout sau font / đổi trạng thái success.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled Có đo và gửi hay không
 * @param {unknown} [opts.depsKey] Đổi khi cần đo lại (vd `success`)
 * @returns {import('react').RefObject<HTMLDivElement|null>}
 */
export function useEmbedLeadFormResize({ enabled, depsKey }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || window.parent === window) return;

    const root = rootRef.current;
    if (!root) return;

    const post = () => {
      const h = Math.ceil(root.scrollHeight);
      if (h < 40) return;
      try {
        window.parent.postMessage({ type: 'uknow-lp-embed-resize', height: h }, '*');
      } catch {
        // Trang embed không gửi được — bỏ qua
      }
    };

    post();
    const t0 = window.setTimeout(post, 0);
    const t1 = window.setTimeout(post, 400);

    const ro = new ResizeObserver(() => post());
    ro.observe(root);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      ro.disconnect();
    };
  }, [enabled, depsKey]);

  return rootRef;
}
