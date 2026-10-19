/**
 * tiktokBusinessApi.service.js
 *
 * API service cho TikTok Business connection management (per-user).
 * Pattern copy từ `facebookSettingsApi.service.js` (axios shared instance,
 * error handling chuẩn, cookies/auth headers tự động).
 *
 * Việc 7.1 của plan tiktok-business-messaging-integration.md.
 */

import api from '../../../services/api';

export default {
  /**
   * GET /api/settings/tiktok-business/accounts
   * Trả về { data: Array<{ id, business_id, display_name, region, role, ... }> }
   * đã được BE sanitize (không có access_token/refresh_token).
   */
  listAccounts: () => api.get('/settings/tiktok-business/accounts'),

  /**
   * POST /api/settings/tiktok-business/accounts/:id/refresh
   * Force refresh access token. Trả về { success }.
   */
  refreshAccount: (id) => api.post(`/settings/tiktok-business/accounts/${id}/refresh`),

  /**
   * DELETE /api/settings/tiktok-business/accounts/:id
   * Soft-delete + revoke token ở TikTok.
   */
  deleteAccount: (id) => api.delete(`/settings/tiktok-business/accounts/${id}`),

  /**
   * POST /api/settings/tiktok-business/accounts/:id/test-send
   * Stub ở PR-2 (trả 501) — PR-3 sẽ impl.
   */
  testSend: (id, { conversationId, message }) => api.post(
    `/settings/tiktok-business/accounts/${id}/test-send`,
    { conversationId, message }
  ),

  /**
   * Kết nối tài khoản TikTok Business mới. BE redirect sang TikTok authorize URL.
   * Caller dùng window.location.href = response.data.auth_url (nếu BE trả URL)
   * HOẶC window.location.href = '/api/settings/tiktok-business/connect' (BE sẽ
   * tự redirect vì handler cũng gọi res.redirect).
   *
   * Ở plan: controller `connect` đã gọi `res.redirect(url)` nên FE chỉ cần
   * navigate tới endpoint. Method này để dành khi cần custom (vd: mở popup).
   */
  getConnectUrl: () => '/api/settings/tiktok-business/connect',
};
