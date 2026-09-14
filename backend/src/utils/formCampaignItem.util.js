/**
 * Ánh xạ một dòng bài nộp biểu mẫu (form_submissions) thành item phẳng dùng trong node chiến
 * dịch "Lấy dữ liệu từ biểu mẫu" (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-6a).
 *
 * Hàm thuần — không đụng DB, dễ test độc lập.
 */

/**
 * Khoá cố định của item chiến dịch (xem object `item` trong mapFormSubmissionToCampaignItem bên
 * dưới) — trường form KHÔNG được có field.key trùng các khoá này, nếu không giá trị đã chuẩn hoá
 * (email chữ thường, phone đã normalize...) bị trường tự khai ghi đè âm thầm (PR-6a review 14/09).
 * `formDefinition.util.js` `normalizeFormFields` import danh sách này để CHẶN từ lúc lưu form
 * (client gửi key trùng → tự sinh khoá khác, không báo lỗi vì trình soạn không bao giờ gửi khoá
 * đó); mapper dưới đây BỎ QUA trường nào lỡ trùng, phòng dữ liệu cũ tạo trước khi có chặn này.
 */
export const RESERVED_CAMPAIGN_ITEM_FIELD_KEYS = Object.freeze([
  'submissionId',
  'id',
  'formId',
  'fullName',
  'email',
  'phone',
  'appointmentAt',
  'createdAt',
  'marketingConsent',
]);

const RESERVED_CAMPAIGN_ITEM_FIELD_KEYS_LOWER = new Set(
  RESERVED_CAMPAIGN_ITEM_FIELD_KEYS.map((k) => k.toLowerCase())
);

/**
 * So không phân biệt hoa thường — "Email"/"EMAIL" cũng bị chặn như "email".
 *
 * @param {unknown} key
 * @returns {boolean}
 */
export function isReservedCampaignItemFieldKey(key) {
  return RESERVED_CAMPAIGN_ITEM_FIELD_KEYS_LOWER.has(String(key || '').toLowerCase());
}

/**
 * Chuẩn hoá số điện thoại: bỏ khoảng trắng, giữ số và dấu + đầu chuỗi.
 * Bản tương đương của `lead.service.js` (const nội bộ, không export) và
 * `formSubmission.util.js` (cũng không export) — không import được nên viết lại tại đây,
 * cùng logic (trim + bỏ khoảng trắng, giữ nguyên các ký tự khác).
 *
 * @param {unknown} raw
 * @returns {string}
 */
function normalizePhoneValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.replace(/\s+/g, '');
}

/**
 * Lấy giá trị đã nộp cho một khoá trường từ object `answers` snapshot
 * (`{ [key]: { label, type, value } }` — xem `formSubmission.util.js`).
 * checkbox (value là mảng) nối bằng ", ".
 *
 * @param {Record<string, any>} answers
 * @param {string|null} key
 * @returns {unknown}
 */
function readAnswerValue(answers, key) {
  if (!key) return null;
  const entry = answers?.[key];
  if (!entry || typeof entry !== 'object' || !('value' in entry)) return null;
  const raw = entry.value;
  if (Array.isArray(raw)) return raw.join(', ');
  return raw;
}

/**
 * Ánh xạ một dòng form_submissions (đã JOIN đủ cột cần) thành item phẳng cho campaign.
 *
 * Quy tắc:
 * - `fieldMap` (nameKey/emailKey/phoneKey) trống → dùng thẳng cột respondent_name/
 *   respondent_email/respondent_phone đã chuẩn hoá sẵn LÚC NỘP theo `role` của trường tại thời
 *   điểm đó (formSubmission.util.js) — tránh lệch nếu chủ form đổi role sau khi đã có bài nộp cũ.
 * - `fieldMap` có khoá → đọc trực tiếp `answers[key].value`, chuẩn hoá lại (email chữ thường,
 *   phone qua normalizePhoneValue) vì trường được trỏ tới không chắc đã qua chuẩn hoá đó
 *   (chỉ trường type='email'/'phone' mới được chuẩn hoá lúc validateFormSubmission).
 * - Mỗi trường hiện có trong `fields` là một khoá phẳng riêng = `field.key` (KHÔNG dùng nhãn —
 *   đổi nhãn không được làm gãy mapping đã lưu trong node gửi, xem campaignFlow.service.js
 *   getFieldValue/campaignEmailSender.service.js).
 * - Trường trong fieldMap trỏ tới khoá không còn trong `answers` → readAnswerValue trả null,
 *   item rơi về giá trị respondent_*, không ném lỗi.
 *
 * @param {object} row Dòng form_submissions (id, formId, answers, respondentName,
 *   respondentEmail, respondentPhone, appointmentAt, createdAt, marketingConsent, ...)
 * @param {Array<{key: string, label: string, type: string, role?: string|null}>} fields
 *   Định nghĩa trường HIỆN TẠI của form (form.fields)
 * @param {{ nameKey?: string, emailKey?: string, phoneKey?: string }} [fieldMap]
 * @returns {{
 *   submissionId: number, id: number, formId: number,
 *   fullName: string|null, email: string|null, phone: string|null,
 *   appointmentAt: string|Date|null, createdAt: string|Date,
 *   marketingConsent: boolean|null,
 *   [fieldKey: string]: unknown
 * }}
 */
export function mapFormSubmissionToCampaignItem(row, fields = [], fieldMap = {}) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const answers = row?.answers && typeof row.answers === 'object' ? row.answers : {};
  const safeFieldMap = fieldMap && typeof fieldMap === 'object' ? fieldMap : {};

  const emailKey = String(safeFieldMap.emailKey || '').trim() || null;
  const phoneKey = String(safeFieldMap.phoneKey || '').trim() || null;
  const nameKey = String(safeFieldMap.nameKey || '').trim() || null;

  const emailFromField = emailKey ? readAnswerValue(answers, emailKey) : null;
  const email = emailFromField != null
    ? String(emailFromField).trim().toLowerCase()
    : (row?.respondentEmail || null);

  const phoneFromField = phoneKey ? readAnswerValue(answers, phoneKey) : null;
  const phone = phoneFromField != null
    ? normalizePhoneValue(phoneFromField)
    : (row?.respondentPhone || null);

  const nameFromField = nameKey ? readAnswerValue(answers, nameKey) : null;
  const fullName = nameFromField != null
    ? String(nameFromField)
    : (row?.respondentName || null);

  const item = {
    submissionId: row?.id,
    id: row?.id,
    formId: row?.formId,
    fullName,
    email,
    phone,
    appointmentAt: row?.appointmentAt ?? null,
    createdAt: row?.createdAt,
    marketingConsent: row?.marketingConsent ?? null,
  };

  for (const field of safeFields) {
    const key = field?.key;
    if (!key || isReservedCampaignItemFieldKey(key)) continue;
    const value = readAnswerValue(answers, key);
    if (value !== null) item[key] = value;
  }

  return item;
}
