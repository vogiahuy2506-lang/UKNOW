import { useEffect, useRef } from 'react';

/**
 * PR-5 — Gửi chiều cao nội dung /f/:publicKey?embed=1 lên `parent` để form-embed.js chỉnh
 * `iframe.style.height`, tránh thanh cuộn dọc bên trong iframe nhúng.
 *
 * KHÁC useEmbedLeadFormResize (hook cũ, đã đánh dấu deprecated — dành cho iframe /embed/lead-form CŨ):
 *   - type: 'founderai-form-resize' (không phải 'uknow-lp-embed-resize').
 *   - luôn kèm `key` (publicKey) — bên form-embed.js đối chiếu key + event.source với ĐÚNG
 *     iframe đã mount trước khi áp chiều cao (nhiều form/khoá có thể cùng một trang).
 *
 * targetOrigin '*': cố ý — nội dung gửi chỉ là số nguyên chiều cao + key công khai (đã nằm
 * sẵn trong URL iframe), không có dữ liệu nhạy cảm; form-embed.js phía nhận tự lọc theo
 * event.origin nên không cần biết trước origin của trang nhúng để giới hạn targetOrigin.
 *
 * Luồng: chỉ chạy khi đang trong iframe (`parent !== window`); đo `scrollHeight` của root
 * qua ResizeObserver + 2 lần setTimeout (0ms/400ms) bắt layout sau font/đổi trạng thái.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled Chỉ đo/gửi khi đang ở chế độ nhúng (?embed=1)
 * @param {string} opts.formKey publicKey của form — bắt buộc kèm trong mọi message
 * @param {unknown} [opts.depsKey] Đổi khi cần đo lại (vd đổi trạng thái loading/success/lỗi,
 *   chọn tuần/khung giờ đặt lịch)
 * @returns {import('react').RefObject<HTMLDivElement|null>}
 */
export function useFormEmbedResize({ enabled, formKey, depsKey }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!enabled || !formKey) return;
    if (typeof window === 'undefined' || window.parent === window) return;

    const root = rootRef.current;
    if (!root) return;

    const post = () => {
      const h = Math.ceil(root.scrollHeight);
      if (h < 40) return;
      try {
        window.parent.postMessage({ type: 'founderai-form-resize', key: formKey, height: h }, '*');
      } catch {
        // Trang cha không nhận được (vd đã đóng) — bỏ qua, không phải lỗi người dùng cần thấy
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
  }, [enabled, formKey, depsKey]);

  return rootRef;
}
