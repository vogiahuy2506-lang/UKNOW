/**
 * Đường dẫn trang thông báo theo vai trò. `/app/*` bị ProtectedRoute đá super admin sang `/admin`, nên admin có
 * cặp route riêng dưới `/admin/*` (cùng component, xem App.jsx).
 */
const baseOf = (user) => (user?.role === 'admin' ? '/admin' : '/app');

export const notificationsPagePath = (user) => `${baseOf(user)}/notifications`;
export const notificationPreferencesPath = (user) => `${baseOf(user)}/settings/notifications`;
