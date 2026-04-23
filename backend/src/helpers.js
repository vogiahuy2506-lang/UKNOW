/**
 * Trả về response lỗi 500 chuẩn và ghi log lỗi ra console.
 * @param {import('express').Response} res
 * @param {string} label - Nhãn để nhận dạng lỗi trong log
 * @param {unknown} error - Đối tượng lỗi
 */
export const serverError = (res, label, error) => {
  console.error(`${label}:`, error);
  res.status(500).json({ success: false, message: 'Lỗi server' });
};

/**
 * Tính toán metadata phân trang.
 * @param {number|string} page - Trang hiện tại
 * @param {number|string} limit - Số bản ghi mỗi trang
 * @param {number|string} total - Tổng số bản ghi
 * @returns {{ page: number, limit: number, total: number, totalPages: number }}
 */
export const paginate = (page, limit, total) => ({
  page: parseInt(page),
  limit: parseInt(limit),
  total: parseInt(total),
  totalPages: Math.ceil(parseInt(total) / parseInt(limit)),
});

/**
 * Chuẩn hóa giá trị tiền tệ thành số thực.
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export const parseMoney = (value, fallback = 0) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Trả về chuỗi đã trim nếu có nội dung, ngược lại trả về null.
 * @param {*} value
 * @returns {string|null}
 */
export const toNullableText = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
};

/**
 * Chuẩn hóa chuỗi để so sánh: bỏ dấu, chuyển thường.
 * @param {*} value
 * @returns {string}
 */
export const normalizeTextForMatch = (value) => {
  const text = toNullableText(value);
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

/**
 * Chuyển chuỗi thành dạng slug (dùng để so sánh URL/code).
 * @param {*} value
 * @returns {string}
 */
export const slugify = (value) => {
  const normalized = normalizeTextForMatch(value);
  if (!normalized) return '';
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

/**
 * Chuyển đổi giá trị thành boolean.
 * @param {*} value
 * @returns {boolean}
 */
export const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  if (typeof value === 'number') return value !== 0;
  return false;
};

/**
 * Parse JSON an toàn, trả về fallback nếu lỗi hoặc không phải JSON.
 * @param {*} value
 * @param {*} [fallback={}]
 * @returns {*}
 */
export const parseJsonSafely = (value, fallback = {}) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
};

/**
 * Chuẩn hóa URL để so sánh (decode URI + lowercase).
 * @param {*} value
 * @returns {string}
 */
export const normalizeUrl = (value) => {
  const raw = toNullableText(value);
  if (!raw) return '';
  try { return decodeURIComponent(raw).toLowerCase(); } catch { return raw.toLowerCase(); }
};
