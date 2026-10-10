import {
  countContactSubmissionsByStatus,
  listContactSubmissions,
  updateContactSubmission,
} from '../../repositories/contact.repository.js';

/**
 * Liên hệ từ trang chủ (`POST /api/contact` → bảng `contact_submissions`) được gom vào màn admin cùng ticket
 * (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-4). Chỉ super admin; dữ liệu là của khách chưa chắc có tài khoản nên KHÔNG gắn với users.
 */

export const CONTACT_SUBMISSION_STATUSES = Object.freeze(['new', 'contacted', 'qualified', 'closed']);
export const CONTACT_NOTES_MAX = 5000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function toContactDto(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    company: row.company || null,
    companySize: row.company_size || null,
    message: row.message || '',
    status: row.status || 'new',
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {{ page?: unknown, limit?: unknown, status?: unknown, search?: unknown }} [query]
 * @returns {Promise<{ items: object[], counts: object, pagination: object }>}
 */
export async function listSubmissions(query = {}) {
  const rawStatus = String(query.status ?? '').trim();
  if (rawStatus && !CONTACT_SUBMISSION_STATUSES.includes(rawStatus)) {
    throw httpError(400, 'CONTACT_STATUS_INVALID', 'Trạng thái không hợp lệ');
  }
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const search = String(query.search ?? '').trim().slice(0, 100) || null;

  const [{ rows, total }, counts] = await Promise.all([
    listContactSubmissions({ status: rawStatus || null, search, page, limit }),
    countContactSubmissionsByStatus(),
  ]);
  return {
    items: rows.map(toContactDto),
    counts: { ...counts, all: counts.new + counts.contacted + counts.qualified + counts.closed },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * @param {string|number} id
 * @param {{ status?: unknown, notes?: unknown }} input ít nhất một trong hai
 * @returns {Promise<object>} dòng sau khi cập nhật
 */
export async function updateSubmission(id, input = {}) {
  const rawId = String(id ?? '').trim();
  if (!/^\d{1,18}$/.test(rawId) || Number(rawId) <= 0) {
    throw httpError(400, 'CONTACT_ID_INVALID', 'Mã liên hệ không hợp lệ');
  }

  const patch = {};
  if (input.status !== undefined) {
    const status = String(input.status ?? '').trim();
    if (!CONTACT_SUBMISSION_STATUSES.includes(status)) {
      throw httpError(400, 'CONTACT_STATUS_INVALID', 'Trạng thái không hợp lệ');
    }
    patch.status = status;
  }
  if (input.notes !== undefined) {
    if (input.notes !== null && typeof input.notes !== 'string') {
      throw httpError(400, 'CONTACT_NOTES_INVALID', 'Ghi chú không hợp lệ');
    }
    // NUL làm Postgres báo lỗi 500; ghi chú rỗng = xoá ghi chú.
    // eslint-disable-next-line no-control-regex
    const notes = (input.notes || '').replace(/\u0000/g, '').trim();
    if (notes.length > CONTACT_NOTES_MAX) {
      throw httpError(400, 'CONTACT_NOTES_TOO_LONG', `Ghi chú tối đa ${CONTACT_NOTES_MAX} ký tự`);
    }
    patch.notes = notes || null;
  }
  if (patch.status === undefined && patch.notes === undefined) {
    throw httpError(400, 'CONTACT_UPDATE_EMPTY', 'Không có gì để cập nhật');
  }

  const row = await updateContactSubmission(rawId, patch);
  if (!row) throw httpError(404, 'CONTACT_NOT_FOUND', 'Không tìm thấy liên hệ');
  return toContactDto(row);
}

export default { listSubmissions, updateSubmission };
