/** Hằng số ticket góp ý — khớp backend `supportTicket.service.js` / `supportTicketAttachment.service.js`. */
export const SUPPORT_CATEGORIES = Object.freeze(['feedback', 'bug', 'billing', 'other']);
export const SUPPORT_STATUSES = Object.freeze(['open', 'awaiting_user', 'closed']);
export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_BODY_MAX = 5000;
export const SUPPORT_MAX_ATTACHMENTS = 3;
export const SUPPORT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SUPPORT_IMAGE_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export const CONTACT_STATUSES = Object.freeze(['new', 'contacted', 'qualified', 'closed']);

/** tone của StatusChip theo trạng thái ticket. */
export const STATUS_TONES = Object.freeze({ open: 'accent', awaiting_user: 'warning', closed: 'muted' });

/** Đường dẫn trang ticket theo vai trò: `/app/*` bị ProtectedRoute đá super admin, nên admin có cặp `/admin/tickets`. */
export const supportListPath = (user) => (user?.role === 'admin' ? '/admin/tickets' : '/app/support');
export const supportDetailPath = (user, id) => `${supportListPath(user)}/${id}`;

/**
 * Kiểm một tệp ảnh trước khi tải lên. Trả mã lỗi (khoá `support.attachments.errors.*`) hoặc null nếu hợp lệ.
 * @param {File} file
 * @returns {'type'|'size'|null}
 */
export function validateImageFile(file) {
  if (!file || !SUPPORT_IMAGE_MIMES.includes(file.type)) return 'type';
  if (file.size > SUPPORT_MAX_IMAGE_BYTES) return 'size';
  return null;
}

/** Lấy thông điệp lỗi hiển thị từ lỗi axios; trả null nếu không có thông điệp riêng. */
export function apiErrorMessage(error) {
  const message = error?.response?.data?.message;
  return typeof message === 'string' && message ? message : null;
}
