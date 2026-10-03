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
 * Lấy templates của user hiện tại.
 * 
 * @returns {Promise<object[]>}
 */
export async function fetchMyLandingTemplates() {
  const { data } = await api.get('/landing-templates/my');
  return data?.success ? (data.data || []) : [];
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

function formatLandingFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return undefined;
  return files.map((f) => {
    const item = {
      originalName: f.originalName || f.name,
      contentType: f.contentType || f.type || 'application/octet-stream',
      size: f.size,
    };
    if (f.storageKey || f.storage_key) {
      item.storageKey = f.storageKey || f.storage_key;
    } else if (f.tempId) {
      item.tempId = f.tempId;
    }
    return item;
  });
}

/**
 * Sinh HTML landing page mới bằng AI (Tailwind CDN, nội dung thật).
 *
 * @param {{ prompt: string, title?: string, locale?: string, files?: Array, landingPageId?: number|null }} params
 * @returns {Promise<{ success?: boolean, data?: { title: string, html: string }, message?: string }>}
 */
export async function generateLandingHtmlWithAi({ prompt, title, locale, files = [], landingPageId = null } = {}) {
  const formattedFiles = formatLandingFiles(files);
  const payload = {
    prompt,
    title,
    locale,
    ...(formattedFiles ? { files: formattedFiles } : {}),
    ...(landingPageId != null ? { landingPageId: Number(landingPageId) } : {}),
  };
  const { data } = await api.post(
    '/ai/generate-landing-html',
    payload,
    { timeout: 120000 }
  );
  return data;
}

/**
 * Chỉnh sửa HTML landing hiện tại (Tailwind + Gemini + giữ nguyên cấu trúc/nội dung).
 *
 * @param {{ instruction: string, currentHtml: string, locale?: string, files?: Array, landingPageId?: number|null }} params
 * @returns {Promise<{ success?: boolean, data?: { title: string, html: string }, message?: string }>}
 */
export async function editLandingHtmlWithAi({ instruction, currentHtml, locale, files = [], landingPageId = null } = {}) {
  const formattedFiles = formatLandingFiles(files);
  const payload = {
    instruction,
    currentHtml,
    locale,
    ...(formattedFiles ? { files: formattedFiles } : {}),
    ...(landingPageId != null ? { landingPageId: Number(landingPageId) } : {}),
  };
  const { data } = await api.post(
    '/ai/edit-landing-html',
    payload,
    { timeout: 120000 }
  );
  return data;
}

// ── Tên miền riêng của landing (PLAN_TEN_MIEN_RIENG, PR-D) ─────────────────────────────────────────────────────
// Backend kiểm DNS thật (dns.resolve) nên mất vài giây — nới timeout mặc định 10 giây của api.js. Mọi hàm trả `data.data`
// (thân phản hồi `{ success, data }` đã bóc); lỗi HTTP ném AxiosError, `error.response.data.message` là câu tiếng Việt
// của server, riêng 422 của PUT còn mang `error.response.data.data` (bảng bản ghi DNS cần thêm).
const CUSTOM_DOMAIN_TIMEOUT_MS = 30000;

/**
 * Thông tin hàng tên miền của landing: `{ configured, hostname, status, cfManaged, dnsRecords, cnameTarget, apexFixedIp,
 * isApexDomain, ... }`. `cfManaged=true` là link miễn phí `<slug>.founderai.biz`; `false` là tên miền riêng của khách.
 *
 * @param {number} landingPageId
 * @returns {Promise<object>}
 */
export async function fetchLandingCustomDomain(landingPageId) {
  const { data } = await api.get(`/admin/landing-pages/${landingPageId}/custom-domain`);
  return data?.data ?? null;
}

/**
 * Xem trước DNS — KHÔNG ghi gì. `{ verified, reason, dnsRecords: [{type, host, value, ttl}], message, ... }`.
 * `verified=false` vẫn là 200 (chưa cài DNS không phải lỗi của request).
 *
 * @param {number} landingPageId
 * @param {string} hostname
 * @param {boolean} [isApexDomain]
 * @returns {Promise<object>}
 */
export async function postLandingCustomDomainCheck(landingPageId, hostname, isApexDomain = false) {
  const { data } = await api.post(
    `/admin/landing-pages/${landingPageId}/custom-domain/check`,
    { hostname, isApexDomain },
    { timeout: CUSTOM_DOMAIN_TIMEOUT_MS }
  );
  return data?.data ?? null;
}

/**
 * Kết nối tên miền riêng — backend chỉ ghi khi DNS đã đúng (chưa đúng → 422, không đổi gì).
 *
 * @param {number} landingPageId
 * @param {string} hostname
 * @param {boolean} [isApexDomain]
 * @returns {Promise<object>}
 */
export async function putLandingCustomDomain(landingPageId, hostname, isApexDomain = false) {
  const { data } = await api.put(
    `/admin/landing-pages/${landingPageId}/custom-domain`,
    { hostname, isApexDomain },
    { timeout: CUSTOM_DOMAIN_TIMEOUT_MS }
  );
  return data?.data ?? null;
}

/**
 * Xác minh lại hàng tên miền riêng đang `pending_verification` (hàng cũ). Qua `api` nên có Bearer tự động.
 *
 * @param {number} landingPageId
 * @returns {Promise<object>}
 */
export async function postLandingCustomDomainVerify(landingPageId) {
  const { data } = await api.post(
    `/admin/landing-pages/${landingPageId}/custom-domain/verify`,
    undefined,
    { timeout: CUSTOM_DOMAIN_TIMEOUT_MS }
  );
  return data?.data ?? null;
}

/**
 * Gỡ tên miền riêng — backend cấp lại link miễn phí `<slug>.founderai.biz` rồi mới gỡ (không có slug / cấp lỗi thì
 * giữ nguyên tên miền riêng và báo lỗi).
 *
 * @param {number} landingPageId
 * @returns {Promise<object>}
 */
export async function deleteLandingCustomDomain(landingPageId) {
  const { data } = await api.delete(`/admin/landing-pages/${landingPageId}/custom-domain`, {
    timeout: CUSTOM_DOMAIN_TIMEOUT_MS,
  });
  return data?.data ?? null;
}

/**
 * Cấp lại link miễn phí `<slug>.founderai.biz` cho trang mất link (domain_type='custom' mà không còn tên miền nào).
 * Không gửi `slug` thì backend dùng slug hiện có của trang. Lỗi 400 / 409 ném AxiosError, `error.response.data.message`
 * là câu tiếng Việt của server (409: slug trùng trang khác, hoặc trang đang dùng tên miền riêng).
 * Trả `{ id, slug, domainType, restored, provisioned, message, domain }` — `slug` là giá trị server đã ghi (đã chuẩn hoá).
 *
 * @param {number} landingPageId
 * @param {string} [slug]
 * @returns {Promise<{ slug: string|null, restored: boolean, provisioned: boolean, message: string|null, domain: object }|null>}
 */
export async function postLandingFreeLink(landingPageId, slug) {
  const body = typeof slug === 'string' && slug.trim() ? { slug: slug.trim() } : {};
  const { data } = await api.post(`/admin/landing-pages/${landingPageId}/free-link`, body, {
    timeout: CUSTOM_DOMAIN_TIMEOUT_MS,
  });
  return data?.data ?? null;
}

/**
 * Tạo template landing page mới.
 *
 * @param {object} body - { name, description, category, htmlContent, thumbnailUrl, isPublic }
 * @returns {Promise<object>}
 */
export async function createLandingTemplate(body) {
  const { data } = await api.post('/landing-templates', body);
  if (!data?.success || !data?.data) throw new Error(data?.message || 'Không tạo được template');
  return data.data;
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

/**
 * Tải ảnh cho landing page (không qua AI).
 *
 * @param {{ tempId: string, originalName?: string, contentType?: string, size?: number, landingPageId?: number }} payload
 * @returns {Promise<{ url: string, storageKey: string, originalName: string, sizeBytes: number }>}
 */
export async function uploadLandingAsset({ tempId, originalName, contentType, size, landingPageId }) {
  const { data } = await api.post('/admin/landing-pages/assets', {
    tempId,
    originalName,
    contentType,
    size,
    landingPageId: landingPageId ? Number(landingPageId) : undefined,
  });
  if (!data?.success) throw new Error(data?.message || 'Không tải được ảnh lên');
  return data.data;
}


