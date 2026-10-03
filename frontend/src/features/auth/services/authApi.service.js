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

export function getInvitationInfo(token) {
  return api.get(`/auth/invitation-info?token=${encodeURIComponent(token)}`);
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

/**
 * Bổ sung/đổi SĐT — dùng cho modal bắt buộc sau khi requirePhone chặn 403.
 * Gửi lại đúng số đang có là no-op (200), server đã loại trừ chính user.
 *
 * @param {{ phone: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, data: { phone: string } }>}
 */
export async function updateMyPhone({ phone }) {
  const response = await api.put('/users/me/phone', { phone });
  return response.data;
}

/**
 * Gửi OTP xác thực SĐT (PR-2, PHONE_OTP_PROVIDER bật). Yêu cầu đăng nhập.
 * Lỗi 429 kèm `retryAfterSec` khi đang trong cooldown 60s hoặc chạm trần/ngày.
 *
 * @param {{ phone: string }} payload
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function sendPhoneOtpCode({ phone }) {
  const response = await api.post('/verification/phone/send-code', { phone });
  return response.data;
}

/**
 * Xác thực mã OTP SĐT (PR-2). Đúng mã → `users.phone_verified_at` được set, trả kèm.
 * Lỗi 409 PHONE_TAKEN khi số đã được một tài khoản KHÁC xác thực.
 *
 * @param {{ phone: string, code: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, data: { phone: string, phoneVerifiedAt: string } }>}
 */
export async function verifyPhoneOtpCode({ phone, code }) {
  const response = await api.post('/verification/phone/verify', { phone, code });
  return response.data;
}

/**
 * Ghi nhận đồng ý bổ sung điều khoản cho người dùng cũ (PR-N3a).
 *
 * @param {{ terms: boolean, privacy: boolean, dpa: boolean }} payload
 * @returns {Promise<{ success: boolean, message?: string, data?: Record<string, any> }>}
 */
export async function submitUserConsents(payload) {
  const response = await api.post('/users/consents', payload);
  return response.data;
}

/**
 * Lấy lịch sử đồng ý pháp lý của người dùng (PR-N3a).
 *
 * @returns {Promise<{ success: boolean, data: Array<object> }>}
 */
export async function getUserConsentHistory() {
  const response = await api.get('/users/consents');
  return response.data;
}

/**
 * Liên kết người giới thiệu (Affiliate) ngay sau khi đăng ký tài khoản.
 *
 * @param {{ referralCode: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, data?: Record<string, any> }>}
 */
export async function bindReferrer({ referralCode }) {
  const response = await api.post('/users/me/referrer', { referralCode });
  return response.data;
}

/**
 * Ghi nhận ở server việc người dùng bấm "Bỏ qua" bảng nhập mã giới thiệu — sau đó server
 * không nhận mã bổ sung, đổi máy cũng không hỏi lại (luật sếp 19/09/2026).
 *
 * @returns {Promise<{ success: boolean, data?: { referralPromptDismissedAt: string|null } }>}
 */
export async function dismissReferralPromptRemote() {
  const response = await api.post('/users/me/referral-prompt/dismiss');
  return response.data;
}

/**
 * Chấp nhận lời mời vào nhóm của một chủ (membership đang `acceptedAt: null`).
 *
 * @param {number|string} ownerId
 * @returns {Promise<{ success: boolean, data?: object }>}
 */
export async function acceptWorkspaceInvite(ownerId) {
  const response = await api.post(`/users/me/memberships/${ownerId}/accept`);
  return response.data;
}

/**
 * Từ chối lời mời vào nhóm — xoá hẳn membership đang chờ.
 *
 * @param {number|string} ownerId
 * @returns {Promise<{ success: boolean, data?: object }>}
 */
export async function declineWorkspaceInvite(ownerId) {
  const response = await api.post(`/users/me/memberships/${ownerId}/decline`);
  return response.data;
}

// ── Xác thực hai lớp (2FA, TOTP) ────────────────────────────────────────────

/** @returns {Promise<{ success: boolean, data: { enabled: boolean, enabledAt: string|null, recoveryCodesLeft: number, requiresPasswordToDisable: boolean } }>} */
export async function getTwoFactorStatus() {
  const response = await api.get('/auth/2fa/status');
  return response.data;
}

/** @returns {Promise<{ success: boolean, data: { secret: string, otpauthUrl: string, qrDataUrl: string } }>} */
export async function beginTwoFactorSetup() {
  const response = await api.post('/auth/2fa/setup');
  return response.data;
}

/** @returns {Promise<{ success: boolean, data: { recoveryCodes: string[] } }>} */
export async function enableTwoFactor(code) {
  const response = await api.post('/auth/2fa/enable', { code });
  return response.data;
}

/** @param {{ code: string, password?: string }} payload */
export async function disableTwoFactor({ code, password }) {
  const body = { code };
  if (password) body.password = password;
  const response = await api.post('/auth/2fa/disable', body);
  return response.data;
}

/** @returns {Promise<{ success: boolean, data: { recoveryCodes: string[] } }>} */
export async function regenerateRecoveryCodes(code) {
  const response = await api.post('/auth/2fa/recovery-codes', { code });
  return response.data;
}
