import api from '../../../services/api';

/**
 * API ticket góp ý / hỗ trợ (backend PR-4).
 *  - Người dùng: `/api/support/tickets/*` (chỉ authMiddleware).
 *  - Super admin: `/api/admin/support/*`.
 *
 * Route người dùng gắn `skipOwnerContext: true`: ticket thuộc về NGƯỜI ĐĂNG NHẬP thật (nhân viên cũng gửi được),
 * không theo không gian làm việc — gắn `X-Owner-Context` thì authMiddleware có thể trả 403 EMPLOYEE_LOCKED
 * đúng lúc nhân viên cần liên hệ hỗ trợ (cùng lý do với chuông thông báo).
 *
 * Response bọc `{ success, data }`; các hàm trả thẳng phần `data`.
 */
const USER_OPTIONS = { skipOwnerContext: true };

const EMPTY_PAGINATION = Object.freeze({ page: 1, limit: 20, total: 0, totalPages: 0 });
const EMPTY_LIST = Object.freeze({
  items: [],
  counts: { open: 0, awaiting_user: 0, closed: 0, all: 0 },
  pagination: EMPTY_PAGINATION,
});

const unwrap = (response, fallback) => response?.data?.data ?? fallback;

/** Chỉ đưa vào query các tham số có giá trị (không gửi `status=` rỗng / `all`). */
const compactParams = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all',
    ),
  );

export const supportUserApi = {
  async listTickets({ page = 1, limit = 20, status } = {}) {
    const response = await api.get('/support/tickets', {
      params: compactParams({ page, limit, status }),
      ...USER_OPTIONS,
    });
    return unwrap(response, EMPTY_LIST);
  },

  async getTicket(id) {
    const response = await api.get(`/support/tickets/${encodeURIComponent(id)}`, USER_OPTIONS);
    return unwrap(response, null);
  },

  /** @param {{ subject: string, category: string, body: string, attachmentIds: Array<number|string> }} payload */
  async createTicket({ subject, category, body, attachmentIds }) {
    const response = await api.post('/support/tickets', { subject, category, body, attachmentIds }, USER_OPTIONS);
    return unwrap(response, null);
  },

  async postMessage(id, { body, attachmentIds }) {
    const response = await api.post(
      `/support/tickets/${encodeURIComponent(id)}/messages`,
      { body, attachmentIds },
      USER_OPTIONS,
    );
    return unwrap(response, null);
  },

  async closeTicket(id) {
    const response = await api.post(`/support/tickets/${encodeURIComponent(id)}/close`, null, USER_OPTIONS);
    return unwrap(response, null);
  },

  /** @returns {Promise<{ storageObjectId: number|string, name: string, size: number, mime: string }>} */
  async uploadAttachment(file) {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/support/tickets/attachments', form, USER_OPTIONS);
    return unwrap(response, null);
  },

  /**
   * Ảnh đính kèm: kho GCS trả 302 sang signed URL nên KHÔNG gắn thẳng URL API vào `<img src>` (không mang Bearer).
   * Tải blob qua axios (kèm Bearer) rồi `URL.createObjectURL` ở chỗ gọi.
   * @returns {Promise<Blob>}
   */
  async fetchAttachmentBlob(ticketId, objectId) {
    const response = await api.get(
      `/support/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(objectId)}`,
      { responseType: 'blob', ...USER_OPTIONS },
    );
    return response.data;
  },
};

export const supportAdminApi = {
  async listTickets({ page = 1, limit = 20, status, category, search } = {}) {
    const response = await api.get('/admin/support/tickets', {
      params: compactParams({ page, limit, status, category, search: search?.trim() }),
    });
    return unwrap(response, EMPTY_LIST);
  },

  async getTicket(id) {
    const response = await api.get(`/admin/support/tickets/${encodeURIComponent(id)}`);
    return unwrap(response, null);
  },

  async reply(id, { body, attachmentIds }) {
    const response = await api.post(`/admin/support/tickets/${encodeURIComponent(id)}/reply`, { body, attachmentIds });
    return unwrap(response, null);
  },

  async setStatus(id, status) {
    const response = await api.post(`/admin/support/tickets/${encodeURIComponent(id)}/status`, { status });
    return unwrap(response, null);
  },

  async uploadAttachment(file) {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/admin/support/attachments', form);
    return unwrap(response, null);
  },

  async fetchAttachmentBlob(ticketId, objectId) {
    const response = await api.get(
      `/admin/support/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(objectId)}`,
      { responseType: 'blob' },
    );
    return response.data;
  },

  async listContactSubmissions({ page = 1, limit = 20, status, search } = {}) {
    const response = await api.get('/admin/support/contact-submissions', {
      params: compactParams({ page, limit, status, search: search?.trim() }),
    });
    return unwrap(response, {
      items: [],
      counts: { new: 0, contacted: 0, qualified: 0, closed: 0, all: 0 },
      pagination: EMPTY_PAGINATION,
    });
  },

  async updateContactSubmission(id, patch) {
    const response = await api.patch(`/admin/support/contact-submissions/${encodeURIComponent(id)}`, patch);
    return unwrap(response, null);
  },
};
