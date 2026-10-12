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

/**
 * PR-5 (AI soạn biểu mẫu) — `POST /api/forms/ai-draft`. CHỈ trả NHÁP, không ghi gì vào CSDL; mỗi lần gọi trừ 1 lượt AI của chủ
 * workspace (chỉ gọi khi người dùng bấm, không tự gọi). Ba chế độ:
 *  - `create`: dựng biểu mẫu từ `description` (+ `kind` tuỳ chọn) → `{ title, description, fields, settings, bookingConfig, kind, needsAttention }`
 *  - `suggest_questions`: gợi ý THÊM câu hỏi cho `existingForm` → `{ fields }` (chỉ câu mới)
 *  - `rewrite`: viết lại nhãn / chữ hướng dẫn / lựa chọn của `existingForm` → `{ fields }` (cùng số lượng, cùng thứ tự)
 *
 * @param {{
 *   mode?: 'create'|'suggest_questions'|'rewrite',
 *   description?: string,
 *   kind?: 'consult'|'booking'|'payment'|'survey'|'blank',
 *   productId?: number,
 *   locale?: 'vi'|'en',
 *   existingForm?: { title?: string, description?: string, fields: object[] },
 * }} payload
 * @returns {Promise<object>} nháp
 */
export async function aiDraftForm(payload) {
  // Gemini có thể mất vài chục giây (server chờ tối đa 85 giây) — cùng timeout với "AI viết hộ" chatbot.
  const res = await api.post('/forms/ai-draft', payload, { timeout: 120000 });
  return res.data?.data;
}

/**
 * Tính năng đang bật cho trình soạn (PR-4b): `fileUploadsEnabled` = cho thêm trường "Tải tệp" (cờ FORM_FILE_UPLOAD_ENABLED ở backend).
 * Lỗi mạng/khác → coi là TẮT, không ném (trình soạn vẫn dùng bình thường, chỉ ẩn loại trường mới).
 *
 * @returns {Promise<{ fileUploadsEnabled: boolean }>}
 */
export async function fetchFormCapabilities() {
  try {
    const res = await api.get('/forms/capabilities');
    return { fileUploadsEnabled: Boolean(res.data?.data?.fileUploadsEnabled) };
  } catch {
    return { fileUploadsEnabled: false };
  }
}

/**
 * Link tải NGẮN HẠN (vài phút) cho một tệp khách đã tải lên bài nộp (PR-4b). Chỉ chủ / nhân viên có quyền `forms`;
 * workspace khác → 404. Trả `{ url, fileName, expiresAt }` — `url` đầy đủ (ghép sau base API), mở bằng thẻ <a> để trình duyệt tải về
 * (tệp có thể tới 1 GB nên KHÔNG tải qua axios/blob).
 *
 * @param {number|string} formId
 * @param {number|string} submissionId
 * @param {string} fieldKey
 * @param {number} index vị trí tệp trong câu trả lời của trường
 * @returns {Promise<{ url: string, fileName: string, expiresAt: string }>}
 */
export async function fetchSubmissionFileLink(formId, submissionId, fieldKey, index) {
  const res = await api.get(
    `/forms/${formId}/submissions/${submissionId}/files/${encodeURIComponent(fieldKey)}/${index}/link`
  );
  const data = res.data?.data || {};
  const base = String(api.defaults?.baseURL || '/api').replace(/\/+$/, '');
  return { url: `${base}${data.path || ''}`, fileName: data.fileName || '', expiresAt: data.expiresAt || null };
}
