import { parseMarketingConsent } from '../services/lead/lead.service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createSubmissionValidationError(message, code = 'INVALID_SUBMISSION') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

/**
 * Chuẩn hóa số điện thoại: bỏ khoảng trắng, giữ số và dấu + đầu chuỗi.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.replace(/\s+/g, '');
}

/**
 * Xác thực và chuẩn hóa câu trả lời của bài nộp form.
 * - Loại bỏ các key lạ không có trong định nghĩa fields.
 * - Kiểm tra các trường bắt buộc (required).
 * - Kiểm tra định dạng email theo regex lead.service.js:25.
 * - Kiểm tra lựa chọn (select, radio, checkbox) phải thuộc options.
 * - Trích xuất respondent_name, respondent_email, respondent_phone theo role.
 * - Trích xuất marketingConsent qua parseMarketingConsent.
 *
 * @param {Array<object>} fields - Danh sách trường đã chuẩn hóa của form
 * @param {object} rawAnswers - Object câu trả lời gửi lên từ client
 * @param {object} rawBody - Toàn bộ body request (để lấy marketingConsent nếu có)
 * @returns {{
 *   answers: Record<string, any>,
 *   respondentName: string|null,
 *   respondentEmail: string|null,
 *   respondentPhone: string|null,
 *   marketingConsent: boolean|null
 * }}
 */
export function validateFormSubmission(fields = [], rawAnswers = {}, rawBody = {}) {
  const safeAnswers = (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers))
    ? rawAnswers
    : {};

  const cleanAnswers = {};
  let respondentName = null;
  let respondentEmail = null;
  let respondentPhone = null;

  for (const field of fields) {
    const { key, type, label, required, options = [], role } = field;
    const val = safeAnswers[key];

    // Kiểm tra trường bắt buộc
    const isArrayEmpty = Array.isArray(val) && val.length === 0;
    const isScalarEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
    const isEmpty = type === 'checkbox' ? (isScalarEmpty || isArrayEmpty) : isScalarEmpty;

    if (required && isEmpty) {
      throw createSubmissionValidationError(`Trường "${label}" là bắt buộc`);
    }

    // Nếu không có giá trị và không bắt buộc thì bỏ qua
    if (isEmpty) {
      continue;
    }

    // Validate theo kiểu dữ liệu
    const validOptionValues = new Set((options || []).map((o) => (o && typeof o === 'object' ? String(o.value) : String(o))));
    let finalValue = null;

    if (type === 'email') {
      const emailStr = String(val).trim().toLowerCase();
      if (!EMAIL_RE.test(emailStr)) {
        throw createSubmissionValidationError(`Email "${val}" không hợp lệ`);
      }
      finalValue = emailStr;
    } else if (type === 'phone') {
      const phoneStr = normalizePhone(val);
      if (!/^\+?[0-9]{8,20}$/.test(phoneStr)) {
        throw createSubmissionValidationError(`Số điện thoại "${val}" không hợp lệ`);
      }
      finalValue = phoneStr;
    } else if (type === 'number') {
      const num = Number(val);
      if (Number.isNaN(num)) {
        throw createSubmissionValidationError(`Trường "${label}" phải là số hợp lệ`);
      }
      finalValue = num;
    } else if (type === 'date') {
      const dateStr = String(val).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw createSubmissionValidationError(`Ngày "${val}" không hợp lệ (định dạng YYYY-MM-DD)`);
      }
      const parsedDate = new Date(`${dateStr}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateStr) {
        throw createSubmissionValidationError(`Ngày "${val}" không hợp lệ`);
      }
      finalValue = dateStr;
    } else if (type === 'select' || type === 'radio') {
      const strVal = String(val).trim();
      if (!validOptionValues.has(strVal)) {
        throw createSubmissionValidationError(`Lựa chọn "${val}" không nằm trong danh sách của trường "${label}"`);
      }
      finalValue = strVal;
    } else if (type === 'checkbox') {
      const items = Array.isArray(val) ? val : [val];
      const validItems = [];
      for (const item of items) {
        const strItem = String(item).trim();
        if (!validOptionValues.has(strItem)) {
          throw createSubmissionValidationError(`Lựa chọn "${item}" không nằm trong danh sách của trường "${label}"`);
        }
        validItems.push(strItem);
      }
      finalValue = validItems;
    } else if (type === 'short_text') {
      const textVal = typeof val === 'string' ? val.trim() : String(val);
      if (textVal.length > 500) {
        throw createSubmissionValidationError(`Trường "${label}" không được vượt quá 500 ký tự`);
      }
      finalValue = textVal;
    } else {
      // long_text
      const textVal = typeof val === 'string' ? val.trim() : String(val);
      if (textVal.length > 5000) {
        throw createSubmissionValidationError(`Trường "${label}" không được vượt quá 5000 ký tự`);
      }
      finalValue = textVal;
    }

    // Snapshot cả label và type tại thời điểm nộp bài
    cleanAnswers[key] = {
      label,
      type,
      value: finalValue,
    };

    // Ánh xạ respondent theo role
    if (role === 'name' && finalValue) {
      respondentName = String(finalValue).slice(0, 255);
    } else if (role === 'email' && finalValue) {
      respondentEmail = String(finalValue).toLowerCase().slice(0, 255);
    } else if (role === 'phone' && finalValue) {
      respondentPhone = String(finalValue).slice(0, 50);
    }
  }

  // Marketing consent lấy từ rawBody hoặc safeAnswers
  const consentRaw = rawBody.marketingConsent ?? safeAnswers.marketingConsent;
  const marketingConsent = parseMarketingConsent(consentRaw);

  return {
    answers: cleanAnswers,
    respondentName,
    respondentEmail,
    respondentPhone,
    marketingConsent,
  };
}
