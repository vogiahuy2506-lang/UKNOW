/**
 * Cổng khoá gói hết hạn (PLAN_CONG_KHOA_GOI_HET_HAN_2026-10-11).
 *
 * Đường dẫn mà modal khoá KHÔNG hiện, để người dùng còn gia hạn / nhờ hỗ trợ / chỉnh thông báo.
 * Mỗi mục đã đối chiếu với `<Route path>` trong `App.jsx` (nhóm `/app`):
 *   - `billing`                → trang gia hạn (đích của nút "Gia hạn ngay").
 *   - `support`, `support/:id` → gửi/xem ticket hỗ trợ (đích của nút "Cần hỗ trợ").
 *   - `settings/notifications` → tuỳ chọn thông báo của chính người đăng nhập.
 * (`/app/settings/profile` trong plan KHÔNG có route nên không liệt kê.)
 */
export const PLAN_LOCK_EXCLUDED_PATH_PREFIXES = [
  '/app/billing',
  '/app/support',
  '/app/settings/notifications',
];

/**
 * pathname khớp tiền tố loại trừ có ranh giới `/` (`/app/billing` và `/app/billing/x` khớp,
 * `/app/billingx` thì không) — cùng kiểu `isPathExcludedFromPostAuthGates`.
 */
export const isPathExcludedFromPlanLock = (pathname) => {
  if (!pathname || typeof pathname !== 'string') return false;
  return PLAN_LOCK_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};
