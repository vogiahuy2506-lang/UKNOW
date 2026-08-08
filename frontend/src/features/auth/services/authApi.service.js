import api from '../../../services/api';

/**
 * Đổi mật khẩu cho người dùng đang đăng nhập.
 *
 * @param {{ currentPassword: string, newPassword: string }} payload
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function changePassword({ currentPassword, newPassword }) {
  const response = await api.put('/users/change-password', { currentPassword, newPassword });
  return response.data;
}

/**
 * Lấy profile đầy đủ của người dùng đang đăng nhập.
 *
 * @returns {Promise<{ success: boolean, data: Record<string, any> }>}
 */
export async function getMyProfile() {
  const response = await api.get('/users/profile');
  return response.data;
}

/**
 * Cập nhật thông tin tài khoản cá nhân.
 *
 * @param {{ fullName?: string, email?: string, phone?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, data: Record<string, any> }>}
 */
export async function updateMyProfile(payload) {
  const response = await api.put('/users/profile', payload);
  return response.data;
}

export async function getMyOrders() {
  const response = await api.get('/users/my-orders');
  return response.data;
}

/**
 * Chủ tài khoản đặt trần lượt bot trả lời mỗi ngày.
 * @param {{ botDailyReplyCap: number|null }} payload
 */
export async function updateBotDailyReplyCap(payload) {
  const response = await api.patch('/users/bot-daily-reply-cap', payload);
  return response.data;
}

/**
 * Chủ tài khoản: tự bật lại AI sau handoff (null = tắt).
 * @param {{ aiHandoffAutoResumeMinutes: number|null }} payload
 */
export async function updateAiHandoffAutoResume(payload) {
  const response = await api.patch('/users/ai-handoff-auto-resume', payload);
  return response.data;
}

export function activateAccount(payload) {
  return api.post('/auth/activate', payload);
}

export function requestPasswordReset(payload) {
  return api.post('/auth/forgot-password', payload);
}

export function resetPassword(payload) {
  return api.post('/auth/reset-password', payload);
}

export function sendVerificationCode(payload) {
  return api.post('/verification/send-code', payload);
}
