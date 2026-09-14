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

export async function cancelSubmission(id, submissionId) {
  const res = await api.post(`/forms/${id}/submissions/${submissionId}/cancel`);
  return res.data?.data;
}
