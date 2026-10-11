import api from '../../../services/api';

/**
 * Service gọi API quản trị biểu mẫu (/api/forms).
 * Sử dụng instance `api` chính đã có token và interceptor X-Owner-Context cho nhân viên.
 */

export async function fetchForms() {
  const res = await api.get('/forms');
  return res.data?.data || [];
}

export async function fetchFormById(id) {
  const res = await api.get(`/forms/${id}`);
  return res.data?.data || null;
}

export async function createForm(payload) {
  const res = await api.post('/forms', payload);
  return res.data?.data;
}

export async function updateForm(id, payload) {
  const res = await api.put(`/forms/${id}`, payload);
  return res.data?.data;
}

export async function deleteForm(id) {
  const res = await api.delete(`/forms/${id}`);
  return res.data;
}

export async function publishForm(id, isPublished) {
  const res = await api.put(`/forms/${id}/publish`, { isPublished });
  return res.data?.data;
}

export async function fetchFormSubmissions(id, { page = 1, pageSize = 20, date } = {}) {
  const params = { page, pageSize };
  if (date) params.date = date;
  const res = await api.get(`/forms/${id}/submissions`, { params });
  return res.data?.data || { submissions: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
}

/**
 * Bài nộp của MỌI biểu mẫu trong workspace (tab "Từ biểu mẫu" của màn "Khách để lại thông tin").
 * `from`/`to` là ngày `YYYY-MM-DD` (giờ VN, gồm cả hai đầu). Mỗi dòng kèm `formTitle`.
 *
 * @param {{ page?: number, limit?: number, formId?: number|string, landingPageSlug?: string, from?: string, to?: string }} [options]
 * @returns {Promise<{ items: Array<object>, total: number, page: number, limit: number }>}
 */
export async function fetchWorkspaceSubmissions({ page = 1, limit = 20, formId, landingPageSlug, from, to } = {}) {
  const params = { page, limit };
  if (formId) params.formId = formId;
  if (landingPageSlug) params.landingPageSlug = landingPageSlug;
  if (from) params.from = from;
  if (to) params.to = to;
  const res = await api.get('/forms/submissions', { params });
  return res.data?.data || { items: [], total: 0, page: 1, limit: 20 };
}

export async function cancelSubmission(id, submissionId) {
  const res = await api.post(`/forms/${id}/submissions/${submissionId}/cancel`);
  return res.data?.data;
}

/**
 * PR-3b — chủ form (hoặc nhân viên có quyền forms) xác nhận đã nhận tiền chuyển khoản cho một
 * bài nộp đang pending_payment.
 *
 * @param {number|string} id ID biểu mẫu
 * @param {number|string} submissionId
 * @returns {Promise<object>}
 */
export async function confirmPayment(id, submissionId) {
  const res = await api.post(`/forms/${id}/submissions/${submissionId}/confirm-payment`);
  return res.data?.data;
}

/**
 * PR-4b — bước 1/2 của luồng upload ảnh giao diện (banner/logo): gửi file lên kho tạm, trả
 * `{tempId, originalName, contentType, size}`. Bước 2 là `uploadFormAsset` bên dưới.
 *
 * @param {File} file
 * @returns {Promise<{tempId: string, originalName: string, contentType: string, size: number}>}
 */
export async function uploadFormTempFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post('/uploads/temp', fd, {
    headers: { 'Content-Type': undefined },
  });
  return res.data?.data;
}

/**
 * PR-4b — bước 2/2: đăng ký tệp tạm thành ảnh giao diện chính thức của form (banner/logo).
 * Hợp đồng PLAN mục "Upload": {tempId, originalName, contentType, size} -> {storageKey, url, sizeBytes}.
 *
 * @param {{tempId: string, originalName: string, contentType: string, size: number}} temp
 * @returns {Promise<{storageKey: string, url: string, sizeBytes: number}>}
 */
export async function uploadFormAsset({ tempId, originalName, contentType, size }) {
  const res = await api.post('/forms/assets', { tempId, originalName, contentType, size });
  return res.data?.data;
}

/**
 * PR-5 — Chủ form (hoặc nhân viên có quyền forms) xem ảnh biên lai chuyển khoản.
 * Trả về Blob để trình duyệt tạo ObjectURL an toàn, không lộ URL trực tiếp.
 *
 * @param {number|string} formId
 * @param {number|string} submissionId
 * @returns {Promise<Blob>}
 */
export async function fetchSubmissionReceiptBlob(formId, submissionId) {
  const res = await api.get(`/forms/${formId}/submissions/${submissionId}/receipt`, {
    responseType: 'blob',
  });
  return res.data;
}

