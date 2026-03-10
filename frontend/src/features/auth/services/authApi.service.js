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
