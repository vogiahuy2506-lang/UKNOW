/**
 * @deprecated Lớp tương thích cho landing page CŨ còn `<iframe src="/embed/lead-form?slug=...">`
 * trong html_content (khôi phục từ commit 50c05cd2 sau khi 3c514bc8 xoá route này — trang mới
 * dùng founderai-capture.js, không còn iframe). Gỡ file này sau khi các trang cũ được lưu lại
 * (mỗi lần AI/người dùng sửa & lưu, backend tự strip iframe qua landingHtmlInjection.util.js).
 */
import { useEffect, useRef } from 'react';

/**
 * Gửi chiều cao nội dung form embed lên `parent` để trang có `lp-track.js` chỉnh `iframe.style.height`, tránh thanh cuộn dọc.
 *
 * Luồng:
 * 1. Chỉ chạy khi đang trong iframe (`parent !== window`).
 * 2. Đo `scrollHeight` của root, postMessage `uknow-lp-embed-resize` (khớp `lp-track.js`).
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
