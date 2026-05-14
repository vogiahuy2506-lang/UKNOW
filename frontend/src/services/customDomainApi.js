import api from './api';

const customDomainApi = {
  /**
   * Get all custom domains for current user.
   */
  list: async () => {
    const response = await api.get('/custom-domains');
    return response.data;
  },

  /**
   * Get single domain by ID.
   * @param {number} id
   */
  get: async (id) => {
    const response = await api.get(`/custom-domains/${id}`);
    return response.data;
  },

  /**
   * Create a new custom domain.
   * @param {object} data - { domain, subdomain?, landingPageId? }
   */
  create: async (data) => {
    const response = await api.post('/custom-domains', data);
    return response.data;
  },

  /**
   * Update a custom domain.
   * @param {number} id
   * @param {object} data - { landingPageId?, isActive?, isPrimary? }
   */
  update: async (id, data) => {
    const response = await api.put(`/custom-domains/${id}`, data);
    return response.data;
  },

  /**
   * Delete a custom domain.
   * @param {number} id
   */
  delete: async (id) => {
    const response = await api.delete(`/custom-domains/${id}`);
    return response.data;
  },

  /**
   * Verify domain ownership.
   * @param {number} id
   */
  verify: async (id) => {
    const response = await api.post(`/custom-domains/${id}/verify`);
    return response.data;
  },

  /**
   * Get verification instructions.
   * @param {number} id
   */
  getVerificationInstructions: async (id) => {
    const response = await api.get(`/custom-domains/${id}/verification-instructions`);
    return response.data;
  },

  /**
   * Get SSL status.
   * @param {number} id
   */
  getSslStatus: async (id) => {
    const response = await api.get(`/custom-domains/${id}/ssl-status`);
    return response.data;
  },

  /**
   * Setup domain with Cloudflare (DNS + SSL).
   * @param {number} id
   */
  setupCloudflare: async (id) => {
    const response = await api.post(`/custom-domains/${id}/setup-cloudflare`);
    return response.data;
  },

  /**
   * Get Cloudflare setup status.
   * @param {number} id
   */
  getCloudflareStatus: async (id) => {
    const response = await api.get(`/custom-domains/${id}/cloudflare-status`);
    return response.data;
  },

  /**
   * Verify domain via Cloudflare API.
   * @param {number} id
   */
  verifyWithCloudflare: async (id) => {
    const response = await api.post(`/custom-domains/${id}/verify-cloudflare`);
    return response.data;
  },
};

export default customDomainApi;
