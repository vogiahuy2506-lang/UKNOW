/**
 * Phần THUẦN của trang Nhân viên (PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH, PR-2): chọn nhanh bộ quyền,
 * đếm quyền đã cấp, tìm nhân viên vừa thêm, đọc mã lỗi của backend. Không React, không mạng.
 */

export const EMAIL_ALREADY_REGISTERED_CODE = 'EMAIL_ALREADY_REGISTERED';
export const USERNAME_TAKEN_CODE = 'USERNAME_TAKEN';

// Bộ quyền chọn nhanh. Chỉ là các ô được tick sẵn — KHÔNG tự lưu; backend tự kéo thêm quyền phụ thuộc
// (vd chiến dịch — tạo kéo theo chiến dịch — xem) khi lưu.
export const PERMISSION_PRESETS = {
  viewOnly: ['campaigns_view', 'reports_view', 'customers', 'leads'],
  marketing: [
    'campaigns_view', 'campaigns_create', 'campaigns_run',
    'email_templates', 'zalo_templates',
    'landing_pages', 'forms', 'customers', 'leads',
    'reports_view', 'ai_assistant_use',
  ],
};

/**
 * Dựng bản đồ quyền đầy đủ cho một bộ chọn nhanh: MỌI khoá đều có mặt (true/false) để chọn bộ mới
 * thay hẳn bộ cũ, không giữ sót ô đã tick trước đó.
 *
 * @param {'viewOnly'|'marketing'|'all'|'none'} preset
 * @param {string[]} allKeys mọi khoá quyền hiện có trên màn hình
 */
export function buildPermissionPreset(preset, allKeys) {
  const keys = Array.isArray(allKeys) ? allKeys : [];
  const granted = new Set(preset === 'all' ? keys : (PERMISSION_PRESETS[preset] || []));
  const out = {};
  for (const key of keys) out[key] = granted.has(key);
  return out;
}

// Đếm quyền đã cấp dùng chung với màn hình phía nhân viên — nguồn duy nhất ở utils.
export { countGrantedPermissions } from '../../utils/workspacePermissions.util';

/** Quyền để nạp vào form: mảng rỗng của nhân viên mới → `{}` (không gửi lại `[]` lên backend). */
export function toPermissionState(permissions) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return {};
  return permissions;
}

/**
 * Tìm nhân viên vừa thêm trong danh sách mới tải. Theo `id` backend trả về (BIGINT → chuỗi, nên so
 * bằng String) và dự phòng theo email — backend cũ chưa trả `data.id`.
 */
export function findEmployeeAfterAdd(list, { id = null, email = '' } = {}) {
  const employees = Array.isArray(list) ? list : [];
  if (id != null && id !== '') {
    const byId = employees.find((e) => String(e.id) === String(id));
    if (byId) return byId;
  }
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return null;
  return employees.find((e) => String(e.email || '').trim().toLowerCase() === wanted) || null;
}

/**
 * `{ code, message, canBuySlot }` từ lỗi axios của backend; thiếu thì rỗng/false (backend cũ không
 * có `code`/`canBuySlot`). `canBuySlot` chỉ backend gửi kèm lỗi EMPLOYEE_LIMIT_REACHED khi mặt hàng
 * 'employees' đang thật sự được bán (topup_pricing.is_active) — xem employee.service.js.
 */
export function getEmployeeErrorInfo(err) {
  const data = err?.response?.data;
  return {
    code: typeof data?.code === 'string' ? data.code : '',
    message: typeof data?.message === 'string' ? data.message : '',
    canBuySlot: Boolean(data?.canBuySlot),
  };
}

/**
 * Hai danh sách id có cùng tập phần tử không (không phân biệt thứ tự, không phân biệt số/chuỗi). Dùng để biết tab
 * "Tài khoản Zalo" có thay đổi chưa lưu hay không.
 */
export function sameIdSet(a, b) {
  const left = new Set((Array.isArray(a) ? a : []).map(String));
  const right = new Set((Array.isArray(b) ? b : []).map(String));
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

/** Thêm / bớt một id khỏi danh sách đã chọn, giữ kiểu số của id; không nhân đôi. */
export function toggleIdInList(list, id, checked) {
  const rest = (Array.isArray(list) ? list : []).filter((x) => String(x) !== String(id));
  return checked ? [...rest, id] : rest;
}
