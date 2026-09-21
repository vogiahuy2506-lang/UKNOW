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

/** `{ code, message }` từ lỗi axios của backend; thiếu thì rỗng (backend cũ không có `code`). */
export function getEmployeeErrorInfo(err) {
  const data = err?.response?.data;
  return {
    code: typeof data?.code === 'string' ? data.code : '',
    message: typeof data?.message === 'string' ? data.message : '',
  };
}
