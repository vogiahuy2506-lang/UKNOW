/**
 * Áp `fieldMap` (nameKey/emailKey/phoneKey) lên item bài nộp form phía CLIENT khi chạy thử node
 * trong Builder — API preview (`GET /forms/:id/campaign-preview`) LUÔN dùng fieldMap rỗng (backend
 * `getCampaignPreviewForForm`, PR-6b phản biện điểm 2: "chạy thử phải khớp chạy thật"), nên nếu
 * không áp lại ở đây, chạy thử sẽ hiện đúng khi fieldMap trống nhưng SAI khi người dùng đã chọn
 * ánh xạ khác role — không phản ánh dữ liệu thật lúc chạy chiến dịch.
 *
 * Quy tắc PHẢI khớp `backend/src/utils/formCampaignItem.util.js` (mapFormSubmissionToCampaignItem):
 * - `fieldMap` trống ở khoá nào → GIỮ NGUYÊN giá trị respondent_* đã có sẵn trên item preview
 *   (server đã trả theo role, xem getCampaignPreviewForForm).
 * - `fieldMap.emailKey`/`phoneKey`/`nameKey` có giá trị → đọc `item[field.key]` (mỗi trường form đã
 *   là một khoá phẳng trên item preview, xem RESERVED_CAMPAIGN_ITEM_FIELD_KEYS phía backend) rồi
 *   chuẩn hoá lại: email chữ thường, phone bỏ khoảng trắng (giữ dấu + đầu chuỗi).
 * - Trường trỏ tới không có trên item (đã bị xoá khỏi form) → rơi về giá trị respondent_* cũ,
 *   không lỗi.
 */

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizePhoneValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.replace(/\s+/g, '');
}

/**
 * @param {object} item Một dòng trả về từ preview API (đã có email/phone/fullName theo role)
 * @param {{ nameKey?: string, emailKey?: string, phoneKey?: string }} [fieldMap]
 * @returns {object} item mới, không sửa item gốc
 */
export function applyFieldMapToPreviewItem(item, fieldMap = {}) {
  const safeFieldMap = fieldMap && typeof fieldMap === 'object' ? fieldMap : {};
  const next = { ...item };

  const emailKey = String(safeFieldMap.emailKey || '').trim();
  if (emailKey && Object.prototype.hasOwnProperty.call(item, emailKey) && item[emailKey] != null) {
    next.email = String(item[emailKey]).trim().toLowerCase();
  }

  const phoneKey = String(safeFieldMap.phoneKey || '').trim();
  if (phoneKey && Object.prototype.hasOwnProperty.call(item, phoneKey) && item[phoneKey] != null) {
    next.phone = normalizePhoneValue(item[phoneKey]);
  }

  const nameKey = String(safeFieldMap.nameKey || '').trim();
  if (nameKey && Object.prototype.hasOwnProperty.call(item, nameKey) && item[nameKey] != null) {
    next.fullName = String(item[nameKey]);
  }

  return next;
}

/**
 * @param {Array<object>} items
 * @param {{ nameKey?: string, emailKey?: string, phoneKey?: string }} [fieldMap]
 * @returns {Array<object>}
 */
export function applyFieldMapToPreviewItems(items, fieldMap = {}) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => applyFieldMapToPreviewItem(item, fieldMap));
}
