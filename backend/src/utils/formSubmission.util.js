import { parseMarketingConsent } from '../services/lead/lead.service.js';
import { isDisplayFieldType, RATING_MAX, YES_NO_VALUES } from './formFieldTypes.util.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Giờ 24h dạng HH:MM (đúng giá trị `<input type="time">` trả về, không có giây).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
 * Đọc danh sách `uploadId` của một trường `file` (PR-4b): mảng chuỗi UUID (hoặc 1 chuỗi), bỏ trùng, tối đa `maxFiles`.
 * Chỉ kiểm HÌNH DẠNG — đối chiếu với kho và DB làm ở formFileUpload.service.js (cần I/O).
 *
 * @param {unknown} val
 * @param {string} label
 * @param {number} maxFiles
 * @returns {string[]}
 */
function parseFileUploadIds(val, label, maxFiles) {
  if (val === undefined || val === null || val === '') return [];
  const list = Array.isArray(val) ? val : [val];
  const ids = [];
  for (const item of list) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!UPLOAD_ID_RE.test(id)) {
      throw createSubmissionValidationError(`Tệp đính kèm của trường "${label}" không hợp lệ`, 'INVALID_UPLOAD');
    }
    if (!ids.includes(id.toLowerCase())) ids.push(id.toLowerCase());
  }
  if (ids.length > maxFiles) {
    throw createSubmissionValidationError(`Trường "${label}" chỉ nhận tối đa ${maxFiles} tệp`, 'INVALID_UPLOAD');
  }
  return ids;
}

/**
 * Xác thực và chuẩn hóa câu trả lời của bài nộp form.
 * - Loại bỏ các key lạ không có trong định nghĩa fields.
 * - Kiểm tra các trường bắt buộc (required).
 * - Kiểm tra định dạng email theo regex lead.service.js:25.
 * - Kiểm tra lựa chọn (select, radio, checkbox) phải thuộc options.
 * - rating: số nguyên 1..5; yes_no: "yes"|"no"; time: HH:MM 24h.
 * - Khối hiển thị (heading, paragraph, page_break) KHÔNG có câu trả lời: bỏ qua hoàn toàn, kể cả khi client
 *   gửi kèm giá trị cho khoá của chúng. Việc chia trang chỉ là chuyện hiển thị — server luôn kiểm TẤT CẢ
 *   trường bắt buộc, không phụ thuộc trang nào.
 * - Trường `file` (PR-4b): `answers[key]` là mảng `uploadId` đã xin trước (POST .../uploads). Hàm này chỉ kiểm hình dạng và
 *   trả vào `fileInputs` (KHÔNG đưa vào `answers`) — service xác nhận tệp với kho rồi mới ghi câu trả lời. Trường tệp bắt
 *   buộc mà không có tệp vẫn qua nếu khách gửi `body.fileSkip[key]` (dấu chủ biểu mẫu hết dung lượng — service kiểm chữ ký).
 *   `options.fileUploadsEnabled=false` (cờ tắt): bỏ qua hoàn toàn trường `file`, kể cả bắt buộc — không để mất khách.
 * - Trích xuất respondent_name, respondent_email, respondent_phone theo role.
 * - Trích xuất marketingConsent qua parseMarketingConsent.
 *
 * @param {Array<object>} fields - Danh sách trường đã chuẩn hóa của form
 * @param {object} rawAnswers - Object câu trả lời gửi lên từ client
 * @param {object} rawBody - Toàn bộ body request (để lấy marketingConsent nếu có)
 * @param {{ fileUploadsEnabled?: boolean }} [options]
 * @returns {{
 *   answers: Record<string, any>,
 *   respondentName: string|null,
 *   respondentEmail: string|null,
 *   respondentPhone: string|null,
 *   marketingConsent: boolean|null,
 *   fileInputs?: Record<string, { field: object, uploadIds?: string[], skipToken?: string }>
 * }}
 */
export function validateFormSubmission(fields = [], rawAnswers = {}, rawBody = {}, options = {}) {
  const fileUploadsEnabled = options?.fileUploadsEnabled !== false;
  const safeAnswers = (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers))
    ? rawAnswers
    : {};

  const cleanAnswers = {};
  const fileInputs = {};
  let respondentName = null;
  let respondentEmail = null;
  let respondentPhone = null;

  for (const field of fields) {
    const { key, type, label, required, options = [], role } = field;
    if (isDisplayFieldType(type)) continue;
    const val = safeAnswers[key];

    if (type === 'file') {
      if (!fileUploadsEnabled) continue;
      const uploadIds = parseFileUploadIds(val, label, field.fileConfig?.maxFiles || 1);
      if (uploadIds.length > 0) {
        fileInputs[key] = { field, uploadIds };
        continue;
      }
      const skipRaw = rawBody?.fileSkip && typeof rawBody.fileSkip === 'object' ? rawBody.fileSkip[key] : null;
      const skipToken = typeof skipRaw === 'string' ? skipRaw.trim() : '';
      if (skipToken) {
        fileInputs[key] = { field, skipToken };
      } else if (required) {
        throw createSubmissionValidationError(`Trường "${label}" là bắt buộc`);
      }
      continue;
    }

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
    } else if (type === 'rating') {
      // Chỉ nhận số nguyên thật (hoặc chuỗi số nguyên): `true`/`[3]`/"4.5" không lọt qua Number().
      const num = typeof val === 'number' ? val : (typeof val === 'string' && /^\d+$/.test(val.trim()) ? Number(val.trim()) : NaN);
      if (!Number.isInteger(num) || num < 1 || num > RATING_MAX) {
        throw createSubmissionValidationError(`Trường "${label}" phải là số sao từ 1 đến ${RATING_MAX}`);
      }
      finalValue = num;
    } else if (type === 'yes_no') {
      const yn = typeof val === 'string' ? val.trim().toLowerCase() : '';
      if (!YES_NO_VALUES.includes(yn)) {
        throw createSubmissionValidationError(`Trường "${label}" chỉ nhận lựa chọn Có hoặc Không`);
      }
      finalValue = yn;
    } else if (type === 'time') {
      const timeStr = typeof val === 'string' ? val.trim() : '';
      if (!TIME_RE.test(timeStr)) {
        throw createSubmissionValidationError(`Giờ "${val}" không hợp lệ (định dạng HH:MM, 24 giờ)`);
      }
      finalValue = timeStr;
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
    ...(Object.keys(fileInputs).length > 0 ? { fileInputs } : {}),
  };
}
