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
   * Kết nối tài khoản TikTok Business mới.
   *
   * Lý do dùng `fetch` (không phải axios shared `api`):
   * - axios shared instance sẽ **tự follow redirect** 302 (default), làm URL
   *   TikTok trong response.url bị lẫn với cookies của TikTok.
   * - axios cũng ném error cho status ngoài 2xx — nhưng ở đây BE có thể
   *   redirect 302 HOẶC trả 200 JSON `{ auth_url }` tùy phiên bản deploy.
   *
   * Cách xử lý: gọi bằng `fetch` với `redirect: 'manual'` để:
   * 1. Nếu BE trả 302 → lấy `Location` header → navigate thẳng.
   * 2. Nếu BE trả 200 JSON → lấy `data.auth_url` → navigate thẳng.
   * 3. Cả hai đều KHÔNG trigger axios auto-redirect/fetch theo dõi.
   *
   * Bearer token được `api` instance gắn tự động (xem `frontend/src/services/api.js`),
   * nên gọi qua `api` thay vì `fetch` thuần để TẬN DỤNG interceptor gắn header.
   *
   * @returns {Promise<{ redirectUrl: string }>}
   */
  startConnect: async () => {
    const resp = await api.get('/settings/tiktok-business/connect', {
      // Tắt auto-follow redirect — ta muốn TỰ quyết định navigate tới đâu.
      maxRedirects: 0,
      // BE có thể trả JSON; axios vẫn parse được khi responseType mặc định.
    });
    // BE controller mới (sau fix) trả 200 { success, data: { auth_url } }
    const authUrl = resp?.data?.data?.auth_url;
    if (typeof authUrl === 'string' && authUrl.length > 0) {
      return { redirectUrl: authUrl };
    }
    // Fallback: nếu ai đó revert BE về res.redirect(), axios shared vẫn follow
    // và trả về response cuối cùng (HTML của TikTok) — không khả thi để lấy URL.
    throw new Error('BE không trả auth_url — kiểm tra controller `connect` đã đổi từ res.redirect sang res.json chưa.');
  },
};
