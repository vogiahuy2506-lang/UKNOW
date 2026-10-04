/**
 * Phạm vi tài khoản Zalo cá nhân mà người thao tác được dùng (PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN), cho tầng
 * repository. Giá trị là kết quả của `getAccessibleZaloAccountIds(ctx)` (services/user/memberChannelAccess.service.js):
 *
 *  - `null`  → chủ / super admin, KHÔNG lọc;
 *  - `number[]` → nhân viên, chỉ các tài khoản này (mảng rỗng = không thấy tài khoản nào);
 *  - mọi giá trị khác (`undefined`, chuỗi, ...) → coi như `[]`. HỎNG THÌ CHẶN: chỗ gọi quên truyền phạm vi thì không lộ
 *    dữ liệu, chỉ trả rỗng (ngược với khuôn `topupLockGate` — khuôn đó cố ý cho qua khi lỗi).
 *
 * Hàm thuần, không đụng DB.
 */

/**
 * @param {unknown} scope
 * @returns {number[]|null}
 */
export function normalizeZaloAccessScope(scope) {
  if (scope === null) return null;
  if (!Array.isArray(scope)) return [];
  return Array.from(new Set(scope.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)));
}

/**
 * Đẩy mảng id vào `params` và trả đoạn SQL `AND <column> = ANY($n::bigint[])`; chủ / super admin → chuỗi rỗng, không
 * đẩy gì. `params` là mảng tham số ĐÃ có sẵn (đánh số tiếp từ độ dài hiện tại).
 *
 * @param {unknown} scope
 * @param {string} column cột id tài khoản Zalo có alias, do server viết (KHÔNG phải input người dùng)
 * @param {unknown[]} params
 * @returns {string}
 */
export function pushZaloAccessFilter(scope, column, params) {
  const normalized = normalizeZaloAccessScope(scope);
  if (normalized === null) return '';
  params.push(normalized);
  return `AND ${column} = ANY($${params.length}::bigint[])`;
}
