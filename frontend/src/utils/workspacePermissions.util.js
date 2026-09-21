/**
 * Quyền của nhân viên trong một không gian làm việc (PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH).
 * Dùng chung cho trang Nhân viên (phía chủ) và màn hình phía nhân viên — thuần, không React.
 */

/**
 * Số quyền ĐÃ cấp. `user_members.permissions` mặc định là mảng rỗng `[]` cho nhân viên mới (không
 * phải `{}`), và sau khi lưu là object đủ khoá true/false — cả hai đều phải đếm ra đúng.
 */
export function countGrantedPermissions(permissions) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return 0;
  return Object.values(permissions).filter((value) => value === true).length;
}

/** Đang ở không gian của một công ty (ngữ cảnh nhân viên)? */
export const isEmployeeWorkspace = (activeContext) => activeContext?.type === 'employee';

/**
 * Nhân viên đã vào không gian công ty nhưng chủ chưa cấp quyền nào → không có gì để xem ngoài màn
 * hình hướng dẫn. Chủ tài khoản (ngữ cảnh `self`) không bao giờ rơi vào ca này.
 */
export const isEmployeeWithoutPermissions = (activeContext) =>
  isEmployeeWorkspace(activeContext) && countGrantedPermissions(activeContext.permissions) === 0;

/**
 * Nhân viên CÓ quyền khác nhưng chưa có quyền "Sử dụng Trợ lý AI" (`ai_assistant_use`). Trang chủ
 * `/app` là khung chat trợ lý, mà mọi lời gọi `/ai/chat` của họ trả 403 — và sau khi đổi sang không
 * gian công ty thì `/app` chính là nơi họ được đưa tới. Ca 0 quyền do `isEmployeeWithoutPermissions` lo.
 */
export const isEmployeeWithoutAiAssistant = (activeContext) =>
  isEmployeeWorkspace(activeContext) && activeContext.permissions?.ai_assistant_use !== true;
