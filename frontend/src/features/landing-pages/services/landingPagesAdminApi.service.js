import api from '../../../services/api.js';

/**
 * Danh sách landing page (admin) — dùng CMS và node Builder (lọc slug).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchLandingPagesAdminList() {
  const { data } = await api.get('/admin/landing-pages');
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Chi tiết một landing (kèm htmlContent).
 *
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function fetchLandingPageAdminById(id) {
  const { data } = await api.get(`/admin/landing-pages/${id}`);
  if (!data?.success || !data?.data) throw new Error(data?.message || 'Không tải được');
  return data.data;
}

/**
 * @param {object} body
 * @returns {Promise<object>}
 */
export async function createLandingPageAdmin(body) {
  const { data } = await api.post('/admin/landing-pages', body);
  if (!data?.success || !data?.data) throw new Error(data?.message || 'Không tạo được');
  return data.data;
}

/**
 * @param {number} id
 * @param {object} body
 * @returns {Promise<object>}
 */
export async function updateLandingPageAdmin(id, body) {
  const { data } = await api.put(`/admin/landing-pages/${id}`, body);
  if (!data?.success || !data?.data) throw new Error(data?.message || 'Không cập nhật được');
  return data.data;
}

/**
 * @param {number} id
 */
export async function deleteLandingPageAdmin(id) {
  await api.delete(`/admin/landing-pages/${id}`);
}

/**
 * Thống kê landing (view / click / submit) — dùng chung API dashboard.
 *
 * @param {object} [params] period | startDate | endDate
 * @returns {Promise<{ filters: object, rows: object[] }>}
 */
export async function fetchLandingPagesDashboardStats(params = {}) {
  const { data } = await api.get('/dashboard/landing-pages-stats', { params });
  return {
    filters: data?.data?.filters || {},
    rows: Array.isArray(data?.data?.rows) ? data.data.rows : [],
  };
}

/**
 * Sinh HTML landing đầy đủ (Tailwind + Gemini + context hồ sơ DN).
 *
 * @param {{ prompt: string, title?: string }} params
 * @returns {Promise<{ success?: boolean, data?: { title: string, html: string }, message?: string }>}
 */
export async function generateLandingHtmlWithAi({ prompt, title } = {}) {
  const { data } = await api.post(
    '/ai/generate-landing-html',
    { prompt, title },
    { timeout: 120000 }
  );
  return data;
}

/**
 * @param {number} landingPageId
 * @returns {Promise<object>}
 */
export async function fetchLandingCustomDomain(landingPageId) {
  const { data } = await api.get(`/admin/landing-pages/${landingPageId}/custom-domain`);
  return data;
}

/**
 * @param {number} landingPageId
 * @param {string} hostname
 * @returns {Promise<object>}
 */
export async function putLandingCustomDomain(landingPageId, hostname) {
  const { data } = await api.put(`/admin/landing-pages/${landingPageId}/custom-domain`, { hostname });
  return data;
}

/**
 * @param {number} landingPageId
 * @returns {Promise<object>}
 */
export async function postLandingCustomDomainVerify(landingPageId) {
  const { data } = await api.post(`/admin/landing-pages/${landingPageId}/custom-domain/verify`);
  return data;
}

/**
 * @param {number} landingPageId
 * @returns {Promise<object>}
 */
export async function deleteLandingCustomDomain(landingPageId) {
  const { data } = await api.delete(`/admin/landing-pages/${landingPageId}/custom-domain`);
  return data;
}
