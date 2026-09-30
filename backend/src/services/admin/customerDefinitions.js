import { getInternalUserIds } from '../../constants/internalAccounts.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9 — MỘT định nghĩa "khách" cho mọi màn admin
 * (Tổng quan, Thành viên, Phễu). Mỗi màn chỉ ghép các mảnh SQL ở đây, KHÔNG tự viết lại điều kiện:
 * trước PR-9 mỗi màn đếm `role = 'user'` theo cách riêng nên "thành viên" gồm nhân viên, tài khoản đã xoá và tài khoản
 * nội bộ (production 30/09/2026: 39 và 116 chiếm phần lớn dữ liệu; user 1 có 11 "nhân viên" là tài khoản nội bộ).
 *
 * ── Phân nhóm tài khoản (`customerSegmentSql`) — mỗi tài khoản đúng MỘT nhóm, xét theo thứ tự ───────────────────
 *   admin     role = 'admin'.
 *   deleted   status = 'deleted' (tạo bởi "Gỡ email" ở trang Thành viên).
 *   internal  id nằm trong danh sách nội bộ (constants/internalAccounts.js — mặc định 39, 116; ghi đè bằng env
 *             INTERNAL_USER_IDS). Không khai lại danh sách ở đây.
 *   employee  nhân viên thuần: role = 'employee' (giá trị cũ), HOẶC có dòng user_members (là nhân viên của ai đó)
 *             mà KHÔNG có gói trả tiền của riêng mình.
 *             Vì sao không dùng "không có gói": mọi tài khoản mới — kể cả nhân viên được mời rồi tự kích hoạt — đều
 *             được tự cấp gói dùng thử (signupTrialTx.service.js), nên nhân viên thuần LUÔN có gói. Điều phân biệt họ
 *             với khách thật là họ không tự trả tiền. Đếm mọi dòng user_members (cả 'inactive'): nhân viên bị chủ tắt
 *             vẫn là nhân viên, không phải một khách mới.
 *   customer  còn lại — đây là "khách".
 *
 * ── Khách trả tiền / dùng thử (chỉ xét trên khách) ───────────────────────────────────────────────────────────────
 *   active    có gói và chưa hết hạn (subscription_expires_at NULL hoặc còn ở tương lai). Ân hạn KHÔNG tính là active.
 *   paying    active + giá gói > 0 + đơn gói `success` GẦN NHẤT (không phải mua thêm) đã thu tiền thật (amount > 0).
 *   trial     active mà không phải paying: gói dùng thử / giá 0, HOẶC gói có giá nhưng admin gán "miễn phí/demo"
 *             (đơn free 0đ) hay voucher 100%. Hiển thị là "Đang dùng thử".
 *   Lý do chọn dựa trên ĐƠN chứ không chỉ `plans.price > 0`: AssignPlanModal mặc định là "Miễn phí / Demo", tức admin
 *   hay gán gói có giá cho đối tác/demo — chỉ nhìn giá gói thì các tài khoản đó bị đếm là "khách trả tiền" và con số
 *   dẫn đầu của Tổng quan phồng lên. Không có đơn nào thì KHÔNG coi là trả tiền (cần bằng chứng có thu tiền).
 *
 * Mọi hàm nhận alias của bảng users (mặc định 'u') và trả về mảnh SQL có thể đặt vào WHERE / SELECT / FILTER.
 */

export const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Nhóm tài khoản — thứ tự này cũng là thứ tự hiển thị ở bộ lọc Thành viên. */
export const CUSTOMER_SEGMENTS = Object.freeze(['customer', 'employee', 'internal', 'deleted', 'admin']);

const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function alias(name) {
  if (!ALIAS_RE.test(String(name))) throw new Error(`customerDefinitions: alias không hợp lệ: ${name}`);
  return name;
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Mảng id tài khoản nội bộ dạng literal SQL, ví dụ `ARRAY[39, 116]::bigint[]`. Đọc env LÚC GỌI (getInternalUserIds).
 * Chỉ nhận số nguyên dương (getInternalUserIds đã kiểm bằng regex) nên nội suy thẳng vào chuỗi là an toàn.
 */
export function internalUserIdsSql(env = process.env) {
  const ids = getInternalUserIds(env).filter((id) => Number.isSafeInteger(id) && id > 0);
  return `ARRAY[${ids.join(', ')}]::bigint[]`;
}

/** Gói còn hiệu lực (chưa hết hạn). */
export function activePlanSql(u = 'u') {
  const a = alias(u);
  return `(${a}.active_plan_id IS NOT NULL AND (${a}.subscription_expires_at IS NULL OR ${a}.subscription_expires_at > NOW()))`;
}

/** Khách đang trả tiền — xem khối chú thích đầu file. */
export function payingSql(u = 'u') {
  const a = alias(u);
  return `(${activePlanSql(a)}
    AND EXISTS (SELECT 1 FROM plans pp WHERE pp.id = ${a}.active_plan_id AND pp.price > 0)
    AND COALESCE((
      SELECT lo.amount > 0 FROM orders lo
       WHERE lo.user_id = ${a}.id AND lo.status = 'success' AND lo.plan_id IS NOT NULL
         AND lo.topup_config IS NULL AND COALESCE(lo.note, '') <> 'topup'
       ORDER BY COALESCE(lo.paid_at, lo.created_at) DESC, lo.id DESC
       LIMIT 1
    ), FALSE))`;
}

/** Đang dùng thử / miễn phí: gói còn hiệu lực nhưng không phải trả tiền. */
export function trialSql(u = 'u') {
  const a = alias(u);
  return `(${activePlanSql(a)} AND NOT ${payingSql(a)})`;
}

/** Gói sắp hết hạn trong `days` ngày tới (còn hiệu lực). Trùng điều kiện bộ lọc `expiry=expiring` của Thành viên. */
export function expiringSql(u = 'u', days = 7) {
  const a = alias(u);
  const n = positiveInt(days, 7);
  return `(${a}.subscription_expires_at IS NOT NULL AND ${a}.subscription_expires_at > NOW()`
    + ` AND ${a}.subscription_expires_at <= NOW() + INTERVAL '${n} days')`;
}

/** Gói đã hết hạn trong `days` ngày gần nhất (kể cả đang ân hạn). */
export function expiredWithinSql(u = 'u', days = 30) {
  const a = alias(u);
  const n = positiveInt(days, 30);
  return `(${a}.subscription_expires_at IS NOT NULL AND ${a}.subscription_expires_at <= NOW()`
    + ` AND ${a}.subscription_expires_at >= NOW() - INTERVAL '${n} days')`;
}

/** Nhóm của tài khoản — CASE trả về một trong CUSTOMER_SEGMENTS. */
export function customerSegmentSql(u = 'u', env = process.env) {
  const a = alias(u);
  return `(CASE
    WHEN ${a}.role = 'admin' THEN 'admin'
    WHEN ${a}.status = 'deleted' THEN 'deleted'
    WHEN ${a}.id = ANY(${internalUserIdsSql(env)}) THEN 'internal'
    WHEN ${a}.role = 'employee' THEN 'employee'
    WHEN EXISTS (SELECT 1 FROM user_members um WHERE um.employee_id = ${a}.id)
         AND NOT ${payingSql(a)} THEN 'employee'
    ELSE 'customer'
  END)`;
}

/** Điều kiện "là khách". */
export function customerSql(u = 'u', env = process.env) {
  return `${customerSegmentSql(u, env)} = 'customer'`;
}

/**
 * Điều kiện lọc danh sách theo nhóm. `segment` không thuộc CUSTOMER_SEGMENTS (kể cả rỗng) → mặc định 'customer':
 * danh sách Thành viên mặc định CHỈ có khách. 'all' = mọi nhóm trừ admin (admin có tab riêng).
 */
export function segmentFilterSql(segment, u = 'u', env = process.env) {
  if (segment === 'all') return `${alias(u)}.role <> 'admin'`;
  const chosen = CUSTOMER_SEGMENTS.includes(segment) ? segment : 'customer';
  return `${customerSegmentSql(u, env)} = '${chosen}'`;
}

/**
 * Bộ lọc theo trạng thái gói (thẻ đầu trang Thành viên): trùng ĐÚNG điều kiện đã đếm ở các thẻ để bấm thẻ ra đúng
 * số dòng. Giá trị lạ → null (không lọc).
 * @returns {string|null}
 */
export function planStateFilterSql(planState, u = 'u') {
  switch (planState) {
    case 'paying': return payingSql(u);
    case 'trial': return trialSql(u);
    case 'expiring': return expiringSql(u, 7);
    case 'expired30': return expiredWithinSql(u, 30);
    default: return null;
  }
}
