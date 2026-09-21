import api from "../../../services/api";
export default {
  /** GET /api/settings/facebook-connections */
  listConnections: () => api.get("/settings/facebook-connections"),
  /** POST /api/settings/facebook-connections/refresh-all */
  refreshAll: () => api.post("/settings/facebook-connections/refresh-all"),
  /** POST /api/settings/facebook-connections/:id/refresh-token */
  refreshToken: (id) => api.post(`/settings/facebook-connections/${id}/refresh-token`),
  /** DELETE /api/settings/facebook-connections/:id */
  disconnect: (id) => api.delete(`/settings/facebook-connections/${id}`),
  /**
   * Initiate Facebook OAuth from ChannelSettings.
   * Returns { auth_url } — caller should window.open(auth_url).
   * Endpoint: GET /api/webhooks/oauth/facebook/init?redirect_to=settings
   */
  initOAuth: () => api.get("/webhooks/oauth/facebook/init", { params: { redirect_to: "settings" } })
};
