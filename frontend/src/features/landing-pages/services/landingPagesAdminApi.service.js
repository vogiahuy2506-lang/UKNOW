import api from '../../../services/api.js';

/**
 * Lấy danh sách template landing page.
 * 
 * @param {object} [params] category filter
 * @returns {Promise<object[]>}
 */
export async function fetchLandingTemplates(params = {}) {
  const { data } = await api.get('/landing-templates', { params });
  return data?.success ? data.data : [];
}

/**
 * Lấy categories của template.
 * 
 * @returns {Promise<object[]>}
 */
export async function fetchLandingTemplateCategories() {
  const { data } = await api.get('/landing-templates/categories');
  return data?.success ? data.data : [];
}

/**
 * Lấy chi tiết một template.
 * 
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function fetchLandingTemplateById(id) {
  const { data } = await api.get(`/landing-templates/${id}`);
  if (!data?.success) throw new Error(data?.message || 'Không tải được');
  return data.data;
}

/**
 * Lấy HTML structure của template.
 * 
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function fetchLandingTemplateHtml(id) {
  const { data } = await api.get(`/landing-templates/${id}/html`);
  if (!data?.success) throw new Error(data?.message || 'Không tải được');
  return data.data;
}

/**
 * Sinh HTML landing page với template (AI).
 * 
 * @param {{ prompt: string, templateId?: number, title?: string }} params
 * @returns {Promise<object>}
 */
export async function generateLandingWithTemplate({ prompt, templateId, title } = {}) {
  const { data } = await api.post(
    '/landing-templates/generate',
    { prompt, templateId, title },
    { timeout: 120000 }
  );
  if (!data?.success) throw new Error(data?.message || 'Không sinh được');
  return data.data;
}

/**
 * Lấy danh sách landing page (admin) — dùng CMS và node Builder (lọc slug).
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
  const result = data.data;
  if (data?.warning && !result.warning) {
    result.warning = data.warning;
  }
  return result;
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
 * Chỉnh sửa HTML landing hiện tại (Tailwind + Gemini + giữ nguyên cấu trúc/nội dung).
 *
 * @param {{ instruction: string, currentHtml: string, locale?: string }} params
 * @returns {Promise<{ success?: boolean, data?: { title: string, html: string }, message?: string }>}
 */
export async function editLandingHtmlWithAi({ instruction, currentHtml, locale } = {}) {
  const { data } = await api.post(
    '/ai/edit-landing-html',
    { instruction, currentHtml, locale },
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
 * @param {boolean} [isApexDomain]
 * @returns {Promise<object>}
 */
export async function putLandingCustomDomain(landingPageId, hostname, isApexDomain = false) {
  const { data } = await api.put(`/admin/landing-pages/${landingPageId}/custom-domain`, { hostname, isApexDomain });
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
export async function postLandingCustomDomainProvisionSsl(landingPageId) {
  const { data } = await api.post(`/admin/landing-pages/${landingPageId}/custom-domain/provision-ssl`);
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

/**
 * Cập nhật template landing page (chỉ owner).
 *
 * @param {number} id
 * @param {object} body
 * @returns {Promise<object>}
 */
export async function updateLandingTemplate(id, body) {
  const { data } = await api.put(`/landing-templates/${id}`, body);
  if (!data?.success || !data?.data) throw new Error(data?.message || 'Không cập nhật được');
  return data.data;
}

/**
 * Lấy danh sách lịch sử phiên bản của landing page.
 *
 * @param {number} landingPageId
 * @returns {Promise<{ versions: Array<object>, totalSizeBytes: number, maxVersions: number }>}
 */
export async function fetchLandingPageVersions(landingPageId) {
  const { data } = await api.get(`/admin/landing-pages/${landingPageId}/versions`);
  if (!data?.success) throw new Error(data?.message || 'Không tải được danh sách phiên bản');
  return data.data;
}

/**
 * Xem trước HTML của một phiên bản.
 *
 * @param {number} landingPageId
 * @param {number} versionId
 * @returns {Promise<{ version: object, htmlContent: string }>}
 */
export async function previewLandingPageVersion(landingPageId, versionId) {
  const { data } = await api.get(`/admin/landing-pages/${landingPageId}/versions/${versionId}/preview`);
  if (!data?.success) throw new Error(data?.message || 'Không tải được nội dung phiên bản');
  return data.data;
}

/**
 * Khôi phục landing page về một phiên bản.
 *
 * @param {number} landingPageId
 * @param {number} versionId
 * @returns {Promise<object>}
 */
export async function restoreLandingPageVersion(landingPageId, versionId) {
  const { data } = await api.post(`/admin/landing-pages/${landingPageId}/versions/${versionId}/restore`);
  if (!data?.success) throw new Error(data?.message || 'Không khôi phục được phiên bản');
  return data;
}

/**
 * Xóa một phiên bản lịch sử.
 *
 * @param {number} landingPageId
 * @param {number} versionId
 * @returns {Promise<object>}
 */
export async function deleteLandingPageVersion(landingPageId, versionId) {
  const { data } = await api.delete(`/admin/landing-pages/${landingPageId}/versions/${versionId}`);
  if (!data?.success) throw new Error(data?.message || 'Không xóa được phiên bản');
  return data;
}

