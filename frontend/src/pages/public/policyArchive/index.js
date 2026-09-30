/**
 * Bảng nạp lười các phiên bản chính sách ĐÃ LƯU TRỮ (đã bị thay thế).
 *
 * Khoá: `<slug>/<YYYY-MM-DD>` (ngày bắt đầu có hiệu lực của phiên bản cũ).
 * Giá trị: hàm `() => import('./<slug>/<YYYY-MM-DD>/<TênFile>.jsx')` trả về module có `default` là component trang.
 *
 * VIẾT TAY, không dùng `import.meta.glob`: để test mock được và để guard
 * (`__tests__/PolicyVersionsGuard.spec.js`) đối chiếu 1:1 với `versions.slice(1)` trong `policyVersions.js`.
 *
 * Hiện rỗng: chưa có phiên bản nào bị thay thế (bản hiện hành 29/09/2026 là bản đầu tiên được lưu).
 * Quy trình thêm phiên bản: xem đầu file `../policyVersions.js`.
 */
export const ARCHIVED_POLICY_LOADERS = {};
