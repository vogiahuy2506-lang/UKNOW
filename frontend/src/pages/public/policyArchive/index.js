/**
 * Bảng nạp lười các phiên bản chính sách ĐÃ LƯU TRỮ (đã bị thay thế).
 *
 * Khoá: `<slug>/<YYYY-MM-DD>` (ngày bắt đầu có hiệu lực của phiên bản cũ).
 * Giá trị: hàm `() => import('./<slug>/<YYYY-MM-DD>/<TênFile>.jsx')` trả về module có `default` là component trang.
 *
 * VIẾT TAY, không dùng `import.meta.glob`: để test mock được và để guard
 * (`__tests__/PolicyVersionsGuard.spec.js`) đối chiếu 1:1 với `versions.slice(1)` trong `policyVersions.js`.
 *
 * Hiện có 3 bản lưu trữ 29/09/2026 (support, payment, complaint) — bị thay bởi bản giờ hỗ trợ mới có hiệu lực 19/10/2026.
 * Quy trình thêm phiên bản: xem đầu file `../policyVersions.js`.
 */
export const ARCHIVED_POLICY_LOADERS = {
  'support/2026-09-29': () => import('./support/2026-09-29/Support.jsx'),
  'payment/2026-09-29': () => import('./payment/2026-09-29/PaymentPolicy.jsx'),
  'complaint/2026-09-29': () => import('./complaint/2026-09-29/ComplaintPolicy.jsx'),
};
