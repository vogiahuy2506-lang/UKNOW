import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

/**
 * Client axios độc lập dành riêng cho người dùng vãng lai nộp biểu mẫu công khai.
 * Tuyệt đối không gắn auth header hay token refresh interceptor.
 */
export const publicClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

/**
 * Lấy định nghĩa biểu mẫu công khai theo publicKey.
 *
 * @param {string} publicKey
 * @returns {Promise<object>}
 */
export async function fetchPublicForm(publicKey) {
  const res = await publicClient.get(`/public/forms/${encodeURIComponent(publicKey)}`);
  return res.data?.data;
}

/**
 * Nộp câu trả lời biểu mẫu công khai.
 *
 * @param {string} publicKey
 * @param {{ answers: Record<string, any>, marketingConsent?: boolean, _hp_website?: string }} payload
 * @returns {Promise<{ accessToken: string }>}
 */
export async function submitPublicForm(publicKey, payload) {
  const res = await publicClient.post(`/public/forms/${encodeURIComponent(publicKey)}/submissions`, payload);
  return res.data?.data;
}

export async function fetchPublicSlots(publicKey, { from, days } = {}) {
  const res = await publicClient.get(`/public/forms/${encodeURIComponent(publicKey)}/slots`, {
    params: { from, days },
  });
  return res.data?.data || { slots: [] };
}

/**
 * Trạng thái công khai của một bài nộp — trang dùng chung cho "vừa nộp xong" lẫn "mở lại từ
 * thư" (PR-3b). Không gắn auth, không lưu accessToken vào localStorage (chỉ nằm trên URL).
 *
 * @param {string} publicKey
 * @param {string} accessToken
 * @returns {Promise<{ status: string, formTitle: string, appointmentAt: string|null, holdExpiresAt: string|null, holdExpired: boolean, payment: object|null }>}
 */
export async function fetchPublicSubmissionStatus(publicKey, accessToken) {
  const res = await publicClient.get(
    `/public/forms/${encodeURIComponent(publicKey)}/submissions/${encodeURIComponent(accessToken)}`
  );
  return res.data?.data;
}

/**
 * Báo đã chuyển khoản cho một bài nộp pending_payment (PR-2).
 *
 * @param {string} publicKey
 * @param {string} accessToken
 * @returns {Promise<object>}
 */
export async function reportSubmissionPaid(publicKey, accessToken) {
  const res = await publicClient.post(
    `/public/forms/${encodeURIComponent(publicKey)}/submissions/${encodeURIComponent(accessToken)}/report-paid`
  );
  return res.data?.data;
}
