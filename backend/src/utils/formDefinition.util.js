import crypto from 'crypto';
import { isReservedCampaignItemFieldKey } from './formCampaignItem.util.js';
import { isDisplayFieldType } from './formFieldTypes.util.js';
import { normalizeFormFileConfig } from './formFileKinds.util.js';
import { VIETQR_BANKS } from '../constants/vietQrBanks.js';

export { DISPLAY_FIELD_TYPES, isDisplayFieldType } from './formFieldTypes.util.js';

// 9 loại gốc + 3 loại nhập mới (rating, yes_no, time) + 3 khối hiển thị (heading, paragraph, page_break) —
// PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4. Khối hiển thị xem formFieldTypes.util.js.
// PR-4b: `file` (khách tải tệp) — cấu hình `fileConfig` xem formFileKinds.util.js. Việc có CHO LƯU trường `file` hay không
// phụ thuộc cờ FORM_FILE_UPLOAD_ENABLED nên kiểm ở form.service.js, không ở bộ chuẩn hoá thuần này.
export const ALLOWED_FIELD_TYPES = Object.freeze([
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'select',
  'radio',
  'checkbox',
  'date',
  'rating',
  'yes_no',
  'time',
  'file',
  'heading',
  'paragraph',
  'page_break',
]);

export const ALLOWED_ROLES = Object.freeze(['name', 'email', 'phone']);
// Loại nhập KHÔNG nhận `role` (số sao / có-không / giờ / tệp không thể là tên, email hay SĐT người nộp).
const NO_ROLE_INPUT_TYPES = Object.freeze(['rating', 'yes_no', 'time', 'file']);
export const ALLOWED_FIELD_WIDTHS = Object.freeze(['full', 'half']);
// Trần số trường NHẬP (khách điền) và số khối HIỂN THỊ (tiêu đề / đoạn chữ / ngắt trang) — tách riêng để
// dàn trang không ăn vào hạn mức câu hỏi.
export const MAX_INPUT_FIELDS = 30;
export const MAX_DISPLAY_BLOCKS = 20;
// Tên cũ của MAX_INPUT_FIELDS — giữ để nơi đã import không gãy.
export const MAX_FIELDS = MAX_INPUT_FIELDS;
export const MAX_LABEL_LENGTH = 200;
// Nội dung đoạn chữ (`paragraph`) nằm trong `label` nên có trần riêng, dài hơn nhãn thường.
export const MAX_PARAGRAPH_LENGTH = 2000;
// Chữ hướng dẫn nhỏ hiện dưới nhãn/ô nhập (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-3).
export const MAX_HELP_TEXT_LENGTH = 300;
export const MAX_OPTIONS = 50;
export const MAX_OPTION_LENGTH = 100;

function createValidationError(message, code = 'INVALID_FORM_DEFINITION') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

/**
 * Chuẩn hoá `productId` (biểu mẫu dành cho sản phẩm nào): số nguyên dương hoặc null (không gắn).
 * Việc sản phẩm có thuộc cùng workspace hay không do service kiểm (cần DB).
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeProductId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw createValidationError('Sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647) {
    throw createValidationError('Sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
  }
  return n;
}

/**
 * Sinh key ngẫu nhiên dạng f_<8 ký tự hex> không trùng trong danh sách đã có.
 *
 * @param {Set<string>} existingKeys
 * @returns {string}
 */
export function generateFieldKey(existingKeys = new Set()) {
  let key = '';
  do {
    key = `f_${crypto.randomBytes(4).toString('hex')}`;
  } while (existingKeys.has(key));
  return key;
}

/**
 * Chuẩn hóa và xác thực danh sách trường (fields) của biểu mẫu.
 *
 * @param {any} rawFields
 * @returns {Array<object>}
 */
export function normalizeFormFields(rawFields) {
  if (rawFields === undefined || rawFields === null) {
    return [];
  }

  if (!Array.isArray(rawFields)) {
    throw createValidationError('Danh sách trường của biểu mẫu phải là một mảng');
  }

  // Đếm riêng trường nhập và khối hiển thị (mục không phải đối tượng tính là trường nhập — vòng lặp dưới sẽ báo
  // lỗi "không hợp lệ" ngay sau đó).
  let inputCount = 0;
  let displayCount = 0;
  for (const raw of rawFields) {
    if (raw && typeof raw === 'object' && isDisplayFieldType(raw.type)) displayCount += 1;
    else inputCount += 1;
  }
  if (inputCount > MAX_INPUT_FIELDS) {
    throw createValidationError(`Biểu mẫu không được vượt quá ${MAX_INPUT_FIELDS} trường nhập liệu (đang có ${inputCount})`);
  }
  if (displayCount > MAX_DISPLAY_BLOCKS) {
    throw createValidationError(
      `Biểu mẫu không được vượt quá ${MAX_DISPLAY_BLOCKS} khối hiển thị — tiêu đề, đoạn chữ, ngắt trang (đang có ${displayCount})`
    );
  }

  const usedKeys = new Set();
  const usedRoles = new Set();
  const normalized = [];

  for (let i = 0; i < rawFields.length; i += 1) {
    const field = rawFields[i];
    if (!field || typeof field !== 'object') {
      throw createValidationError(`Trường thứ ${i + 1} không hợp lệ`);
    }

    const type = String(field.type || '').trim().toLowerCase();
    if (!ALLOWED_FIELD_TYPES.includes(type)) {
      throw createValidationError(`Kiểu trường "${type}" không được hỗ trợ`);
    }

    const isDisplay = isDisplayFieldType(type);
    const isParagraph = type === 'paragraph';

    // `label`: nhãn câu hỏi / chữ tiêu đề / NỘI DUNG đoạn chữ (paragraph, trần 2000) / tiêu đề bước (page_break —
    // loại duy nhất được để trống).
    const label = String(field.label || '').trim();
    if (!label && type !== 'page_break') {
      throw createValidationError(
        isParagraph
          ? `Nội dung đoạn chữ thứ ${i + 1} không được để trống`
          : `Nhãn trường thứ ${i + 1} không được để trống`
      );
    }
    if (isParagraph) {
      if (label.length > MAX_PARAGRAPH_LENGTH) {
        throw createValidationError(`Nội dung đoạn chữ "${label.slice(0, 30)}..." vượt quá ${MAX_PARAGRAPH_LENGTH} ký tự`);
      }
    } else if (label.length > MAX_LABEL_LENGTH) {
      throw createValidationError(`Nhãn trường "${label.slice(0, 30)}..." vượt quá ${MAX_LABEL_LENGTH} ký tự`);
    }

    // Khối hiển thị không có giá trị nên không thể bắt buộc / không có gợi ý trong ô.
    const required = isDisplay ? false : Boolean(field.required);
    const placeholder = !isDisplay && type !== 'file' && field.placeholder
      ? String(field.placeholder).trim().slice(0, MAX_LABEL_LENGTH)
      : '';
    // Chữ hướng dẫn: kiểm như nhãn — quá dài thì báo lỗi rõ thay vì cắt lặng lẽ (người dùng nhìn thấy chữ này).
    // paragraph / page_break không có chữ phụ (nội dung đã nằm ở `label`).
    const helpText = isParagraph || type === 'page_break' || !field.helpText ? '' : String(field.helpText).trim();
    if (helpText.length > MAX_HELP_TEXT_LENGTH) {
      throw createValidationError(
        `Chữ hướng dẫn của trường "${label.slice(0, 30)}..." vượt quá ${MAX_HELP_TEXT_LENGTH} ký tự`
      );
    }

    // Độ rộng: chỉ trường nhập; vắng/rỗng = full. Khối hiển thị luôn full (bỏ qua giá trị gửi lên).
    let width = 'full';
    if (!isDisplay && field.width !== undefined && field.width !== null && field.width !== '') {
      const w = String(field.width).trim().toLowerCase();
      if (!ALLOWED_FIELD_WIDTHS.includes(w)) {
        throw createValidationError(
          `Độ rộng của trường "${label.slice(0, 30)}" không hợp lệ (chỉ nhận ${ALLOWED_FIELD_WIDTHS.join(' hoặc ')})`
        );
      }
      width = w;
    }

    let role = null;
    if (field.role && !isDisplay && !NO_ROLE_INPUT_TYPES.includes(type)) {
      const r = String(field.role).trim().toLowerCase();
      if (ALLOWED_ROLES.includes(r)) {
        if (usedRoles.has(r)) {
          throw createValidationError(`Mỗi vai trò (${r}) chỉ được gán cho tối đa 1 trường`);
        }
        usedRoles.add(r);
        role = r;
      }
    }

    let options = [];
    if (type === 'select' || type === 'radio' || type === 'checkbox') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw createValidationError(`Trường "${label}" phải có ít nhất 1 lựa chọn`);
      }
      if (field.options.length > MAX_OPTIONS) {
        throw createValidationError(`Trường "${label}" không được vượt quá ${MAX_OPTIONS} lựa chọn`);
      }

      const seenOptionValues = new Set();
      for (let j = 0; j < field.options.length; j += 1) {
        const opt = field.options[j];
        let optLabel = '';
        let optVal = '';

        if (typeof opt === 'string') {
          optLabel = opt.trim();
          optVal = opt.trim();
        } else if (opt && typeof opt === 'object') {
          optLabel = String(opt.label || opt.value || '').trim();
          optVal = String(opt.value || opt.label || '').trim();
        }

        if (!optVal) {
          throw createValidationError(`Lựa chọn thứ ${j + 1} của trường "${label}" không được để trống`);
        }
        if (optVal.length > MAX_OPTION_LENGTH || optLabel.length > MAX_OPTION_LENGTH) {
          throw createValidationError(`Lựa chọn "${optVal.slice(0, 20)}..." vượt quá ${MAX_OPTION_LENGTH} ký tự`);
        }
        if (seenOptionValues.has(optVal)) {
          throw createValidationError(`Giá trị lựa chọn "${optVal}" bị trùng lặp trong trường "${label}"`);
        }
        seenOptionValues.add(optVal);
        options.push({ label: optLabel || optVal, value: optVal });
      }
    }

    // Trường tệp: nhóm tệp / dung lượng / số tệp (thiếu → mặc định, sai → 400).
    const fileConfig = type === 'file' ? normalizeFormFileConfig(field.fileConfig, label) : null;

    let key = '';
    const rawKey = typeof field.key === 'string' ? field.key.trim() : '';
    // Key trùng khoá cố định của item chiến dịch (email/phone/id/...) -> tự sinh khoá khác thay
    // vì báo lỗi: trình soạn không bao giờ gửi khoá đó, chỉ chặn client cố tình/API gọi thẳng
    // (PR-6a review 14/09 — formCampaignItem.util.js RESERVED_CAMPAIGN_ITEM_FIELD_KEYS).
    if (
      rawKey
      && /^[a-zA-Z0-9_]{3,32}$/.test(rawKey)
      && !usedKeys.has(rawKey)
      && !isReservedCampaignItemFieldKey(rawKey)
    ) {
      key = rawKey;
    } else {
      key = generateFieldKey(usedKeys);
    }
    usedKeys.add(key);

    normalized.push({
      key,
      type,
      label,
      required,
      placeholder,
      helpText,
      role,
      options,
      // Chỉ ghi khi 'half' — vắng khoá = full, nên dữ liệu/payload của trường cũ không đổi một byte.
      ...(width === 'half' ? { width } : {}),
      // Chỉ trường `file` có khoá này — trường khác không đổi một byte.
      ...(fileConfig ? { fileConfig } : {}),
    });
  }

  return normalized;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_SUBMIT_BUTTON_TEXT_LENGTH = 50;
export const MAX_SUCCESS_MESSAGE_LENGTH = 500;
// Lời đồng ý nhận tin tuỳ chỉnh hiện cạnh ô đồng ý tiếp thị (FormRenderer đọc settings.consentText).
export const MAX_CONSENT_TEXT_LENGTH = 500;
export const MAX_REDIRECT_URL_LENGTH = 2000;

/**
 * Chuẩn hóa và xác thực cấu hình settings của biểu mẫu theo whitelist.
 * Loại bỏ các khoá lạ; kiểm tra kiểu dữ liệu và độ dài.
 *
 * @param {any} rawSettings
 * @returns {object}
 */
export function normalizeFormSettings(rawSettings) {
  if (rawSettings === undefined || rawSettings === null) {
    return {
      notifyOwner: false,
      consentEnabled: false,
      sendConfirmation: false,
      submitButtonText: 'Gửi thông tin',
      successMessage: 'Cảm ơn bạn đã gửi thông tin!',
      redirectUrl: null,
    };
  }

  if (typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    throw createValidationError('Cài đặt biểu mẫu phải là một đối tượng', 'INVALID_FORM_SETTINGS');
  }

  const settings = {
    notifyOwner: false,
    consentEnabled: false,
    sendConfirmation: false,
    submitButtonText: 'Gửi thông tin',
    successMessage: 'Cảm ơn bạn đã gửi thông tin!',
    redirectUrl: null,
  };

  if (rawSettings.notifyOwner !== undefined) {
    if (typeof rawSettings.notifyOwner !== 'boolean') {
      throw createValidationError('notifyOwner phải là giá trị boolean', 'INVALID_FORM_SETTINGS');
    }
    settings.notifyOwner = rawSettings.notifyOwner;
  }

  if (rawSettings.consentEnabled !== undefined) {
    if (typeof rawSettings.consentEnabled !== 'boolean') {
      throw createValidationError('consentEnabled phải là giá trị boolean', 'INVALID_FORM_SETTINGS');
    }
    settings.consentEnabled = rawSettings.consentEnabled;
  }

  if (rawSettings.sendConfirmation !== undefined) {
    if (typeof rawSettings.sendConfirmation !== 'boolean') {
      throw createValidationError('sendConfirmation phải là giá trị boolean', 'INVALID_FORM_SETTINGS');
    }
    settings.sendConfirmation = rawSettings.sendConfirmation;
  }

  // showProductCard: CHỈ lưu khi được gửi lên, KHÔNG nằm trong object mặc định ở trên — nếu không mọi biểu mẫu cũ
  // sẽ bị ghi `true`. Vắng mặt = HIỆN thẻ sản phẩm (gắn sản phẩm xong mà không thấy gì là điều người dùng phàn nàn);
  // nơi đọc dùng `settings.showProductCard !== false`.
  if (rawSettings.showProductCard !== undefined) {
    if (typeof rawSettings.showProductCard !== 'boolean') {
      throw createValidationError('showProductCard phải là giá trị boolean', 'INVALID_FORM_SETTINGS');
    }
    settings.showProductCard = rawSettings.showProductCard;
  }

  if (rawSettings.submitButtonText !== undefined && rawSettings.submitButtonText !== null) {
    if (typeof rawSettings.submitButtonText !== 'string') {
      throw createValidationError('submitButtonText phải là chuỗi', 'INVALID_FORM_SETTINGS');
    }
    const text = rawSettings.submitButtonText.trim();
    if (text.length > MAX_SUBMIT_BUTTON_TEXT_LENGTH) {
      throw createValidationError(`Nút gửi không được vượt quá ${MAX_SUBMIT_BUTTON_TEXT_LENGTH} ký tự`, 'INVALID_FORM_SETTINGS');
    }
    settings.submitButtonText = text || 'Gửi thông tin';
  }

  if (rawSettings.successMessage !== undefined && rawSettings.successMessage !== null) {
    if (typeof rawSettings.successMessage !== 'string') {
      throw createValidationError('successMessage phải là chuỗi', 'INVALID_FORM_SETTINGS');
    }
    const msg = rawSettings.successMessage.trim();
    if (msg.length > MAX_SUCCESS_MESSAGE_LENGTH) {
      throw createValidationError(`Thông báo thành công không được vượt quá ${MAX_SUCCESS_MESSAGE_LENGTH} ký tự`, 'INVALID_FORM_SETTINGS');
    }
    settings.successMessage = msg || 'Cảm ơn bạn đã gửi thông tin!';
  }

  // consentText: chỉ lưu khi có chữ — vắng mặt = renderer dùng câu đồng ý mặc định của hệ thống.
  if (rawSettings.consentText !== undefined && rawSettings.consentText !== null) {
    if (typeof rawSettings.consentText !== 'string') {
      throw createValidationError('consentText phải là chuỗi', 'INVALID_FORM_SETTINGS');
    }
    const consentText = rawSettings.consentText.trim();
    if (consentText.length > MAX_CONSENT_TEXT_LENGTH) {
      throw createValidationError(`Lời đồng ý không được vượt quá ${MAX_CONSENT_TEXT_LENGTH} ký tự`, 'INVALID_FORM_SETTINGS');
    }
    if (consentText) settings.consentText = consentText;
  }

  if (rawSettings.redirectUrl !== undefined && rawSettings.redirectUrl !== null && rawSettings.redirectUrl !== '') {
    if (typeof rawSettings.redirectUrl !== 'string') {
      throw createValidationError('redirectUrl phải là chuỗi', 'INVALID_FORM_SETTINGS');
    }
    const urlStr = rawSettings.redirectUrl.trim();
    if (urlStr.length > MAX_REDIRECT_URL_LENGTH) {
      throw createValidationError(`Đường dẫn chuyển hướng không được vượt quá ${MAX_REDIRECT_URL_LENGTH} ký tự`, 'INVALID_FORM_SETTINGS');
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      throw createValidationError('Đường dẫn chuyển hướng (redirectUrl) không hợp lệ', 'INVALID_FORM_SETTINGS');
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw createValidationError('Đường dẫn chuyển hướng chỉ chấp nhận giao thức http:// hoặc https://', 'INVALID_FORM_SETTINGS');
    }
    settings.redirectUrl = urlStr;
  }

  return settings;
}

// ─── Booking config (PR-2a, PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md) ──────────────────

export const WEEKDAY_KEYS = Object.freeze(['0', '1', '2', '3', '4', '5', '6']);
export const MAX_SLOTS_PER_DAY = 48;
export const MIN_SLOT_CAPACITY = 1;
export const MAX_SLOT_CAPACITY = 1000;
export const MIN_DAYS_AHEAD = 1;
export const MAX_DAYS_AHEAD = 180;
export const DEFAULT_DAYS_AHEAD = 30;
export const MIN_NOTICE_MINUTES_MIN = 0;
export const MIN_NOTICE_MINUTES_MAX = 10080;
export const DEFAULT_MIN_NOTICE_MINUTES = 60;
export const MAX_CLOSED_DATES = 366;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidCalendarDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

/**
 * Chuẩn hóa và xác thực cấu hình đặt lịch (booking_config) của biểu mẫu.
 * `null`/`undefined`/`{enabled:false}` đều chuẩn hoá về `null` (tắt đặt lịch).
 *
 * @param {any} raw
 * @returns {{
 *   enabled: true,
 *   weeklySlots: Record<'0'|'1'|'2'|'3'|'4'|'5'|'6', string[]>,
 *   slotCapacity: number|null,
 *   daysAhead: number,
 *   minNoticeMinutes: number,
 *   closedDates: string[]
 * } | null}
 */
export function normalizeBookingConfig(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createValidationError('Cấu hình đặt lịch (bookingConfig) phải là một đối tượng', 'INVALID_BOOKING_CONFIG');
  }
  if (!raw.enabled) return null;

  const rawWeekly = (raw.weeklySlots && typeof raw.weeklySlots === 'object' && !Array.isArray(raw.weeklySlots))
    ? raw.weeklySlots
    : {};

  const weeklySlots = {};
  let hasAnySlot = false;
  for (const dayKey of WEEKDAY_KEYS) {
    const rawList = Array.isArray(rawWeekly[dayKey]) ? rawWeekly[dayKey] : [];
    if (rawList.length > MAX_SLOTS_PER_DAY) {
      throw createValidationError(`Thứ ${dayKey} có quá ${MAX_SLOTS_PER_DAY} khung giờ`, 'INVALID_BOOKING_CONFIG');
    }
    const seen = new Set();
    const times = [];
    for (const raw_ of rawList) {
      const timeStr = String(raw_ || '').trim();
      if (!TIME_RE.test(timeStr)) {
        throw createValidationError(`Khung giờ "${timeStr}" không hợp lệ (định dạng HH:MM, 00:00–23:59)`, 'INVALID_BOOKING_CONFIG');
      }
      if (seen.has(timeStr)) {
        throw createValidationError(`Khung giờ "${timeStr}" bị trùng lặp`, 'INVALID_BOOKING_CONFIG');
      }
      seen.add(timeStr);
      times.push(timeStr);
    }
    times.sort();
    weeklySlots[dayKey] = times;
    if (times.length > 0) hasAnySlot = true;
  }

  if (!hasAnySlot) {
    throw createValidationError('Bật đặt lịch phải có ít nhất 1 khung giờ trong tuần', 'INVALID_BOOKING_CONFIG');
  }

  let slotCapacity = null;
  if (raw.slotCapacity !== undefined && raw.slotCapacity !== null) {
    const n = Number(raw.slotCapacity);
    if (!Number.isInteger(n) || n < MIN_SLOT_CAPACITY || n > MAX_SLOT_CAPACITY) {
      throw createValidationError(
        `slotCapacity phải là số nguyên ${MIN_SLOT_CAPACITY}-${MAX_SLOT_CAPACITY}, hoặc để trống (không giới hạn)`,
        'INVALID_BOOKING_CONFIG'
      );
    }
    slotCapacity = n;
  }

  let daysAhead = DEFAULT_DAYS_AHEAD;
  if (raw.daysAhead !== undefined && raw.daysAhead !== null) {
    const n = Number(raw.daysAhead);
    if (!Number.isInteger(n) || n < MIN_DAYS_AHEAD || n > MAX_DAYS_AHEAD) {
      throw createValidationError(`daysAhead phải là số nguyên ${MIN_DAYS_AHEAD}-${MAX_DAYS_AHEAD}`, 'INVALID_BOOKING_CONFIG');
    }
    daysAhead = n;
  }

  let minNoticeMinutes = DEFAULT_MIN_NOTICE_MINUTES;
  if (raw.minNoticeMinutes !== undefined && raw.minNoticeMinutes !== null) {
    const n = Number(raw.minNoticeMinutes);
    if (!Number.isInteger(n) || n < MIN_NOTICE_MINUTES_MIN || n > MIN_NOTICE_MINUTES_MAX) {
      throw createValidationError(
        `minNoticeMinutes phải là số nguyên ${MIN_NOTICE_MINUTES_MIN}-${MIN_NOTICE_MINUTES_MAX}`,
        'INVALID_BOOKING_CONFIG'
      );
    }
    minNoticeMinutes = n;
  }

  const closedDates = [];
  const rawClosed = Array.isArray(raw.closedDates) ? raw.closedDates : [];
  if (rawClosed.length > MAX_CLOSED_DATES) {
    throw createValidationError(`Không được vượt quá ${MAX_CLOSED_DATES} ngày nghỉ`, 'INVALID_BOOKING_CONFIG');
  }
  const seenDates = new Set();
  for (const d of rawClosed) {
    const dateStr = String(d || '').trim();
    if (!isValidCalendarDateStr(dateStr)) {
      throw createValidationError(`Ngày nghỉ "${dateStr}" không hợp lệ (định dạng YYYY-MM-DD, ngày có thật)`, 'INVALID_BOOKING_CONFIG');
    }
    if (seenDates.has(dateStr)) {
      throw createValidationError(`Ngày nghỉ "${dateStr}" bị trùng lặp`, 'INVALID_BOOKING_CONFIG');
    }
    seenDates.add(dateStr);
    closedDates.push(dateStr);
  }

  return {
    enabled: true,
    weeklySlots,
    slotCapacity,
    daysAhead,
    minNoticeMinutes,
    closedDates,
  };
}

// ─── Payment config (PR-3a, PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md) ──────────────────

export const MIN_PAYMENT_AMOUNT = 1000;
export const MAX_PAYMENT_AMOUNT = 100000000;
// Cách người mua thấy khoản tiền: giữ chỗ (lịch hẹn) / thanh toán đơn hàng / đặt cọc.
// Thiếu hoặc không hợp lệ = 'hold' (biểu mẫu cũ giữ nguyên chữ). Chỉ đổi CHỮ hiển thị, không đổi logic tiền.
export const PAYMENT_PURPOSES = Object.freeze(['hold', 'order', 'deposit']);
export const DEFAULT_PAYMENT_PURPOSE = 'hold';

export function resolvePaymentPurpose(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PAYMENT_PURPOSES.includes(s) ? s : DEFAULT_PAYMENT_PURPOSE;
}
export const MIN_ACCOUNT_NUMBER_LENGTH = 6;
export const MAX_ACCOUNT_NUMBER_LENGTH = 19;
export const MAX_ACCOUNT_NAME_LENGTH = 50;
export const MIN_HOLD_MINUTES = 10;
export const MAX_HOLD_MINUTES = 120;
export const DEFAULT_HOLD_MINUTES = 30;
const ACCOUNT_NAME_RE = /^[A-Z0-9 ]{2,50}$/;
const ACCOUNT_NUMBER_RE = /^\d{6,19}$/;
const MOMO_PHONE_RE = /^0[35789]\d{8}$/;
const MOMO_QR_BIN_RE = /^\d{6}$/;
const MOMO_QR_ACCOUNT_RE = /^[A-Z0-9]{6,19}$/;
const MOMO_QR_REF_LABEL_RE = /^[A-Z0-9]{1,25}$/;
export const MOMO_VIETQR_BIN = '971025';

/**
 * Chuẩn hoá tên chủ tài khoản: bỏ dấu tiếng Việt (kể cả Đ/đ — không decompose qua NFD), viết
 * HOA, gộp khoảng trắng liên tiếp. Ngân hàng chỉ hiển thị/đối chiếu được chữ không dấu trên nội
 * dung chuyển khoản/tên chủ TK, nên chuẩn hoá NGAY LÚC LƯU thay vì để nguyên rồi lỗi khi in QR.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeAccountName(raw) {
  const s = String(raw || '').trim();
  const noDiacritics = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toUpperCase();
  return noDiacritics.replace(/\s+/g, ' ').trim();
}

/**
 * Chuẩn hoá và xác thực cấu hình thanh toán giữ chỗ (payment_config) của biểu mẫu.
 * `null`/`undefined`/`{enabled:false}` đều chuẩn hoá về `null` (tắt thu tiền).
 *
 * Hỗ trợ `method: 'bank'` (VietQR) và `method: 'momo'` (thông tin ví, không QR — PR-3c).
 * `momo_image` vẫn bị từ chối 400 (đã thay bằng thông tin ví không QR).
 *
 * Không tự kiểm `phone_verified_at`/`requirePhone` ở đây — route `/api/forms` đã gắn
 * `requirePhone` cho TOÀN BỘ router (`form.routes.js`), nên request tới được hàm này tức là
 * đã qua đúng luật đó (Bổ sung 15/09 mục 2, thay cho giả định ban đầu "đòi phone_verified_at
 * cứng" — sai vì OTP chỉ bật khi production đặt PHONE_OTP_PROVIDER).
 *
 * @param {any} raw
 * @returns {{
 *   enabled: true,
 *   method: 'bank',
 *   amount: number,
 *   bankBin: string,
 *   accountNumber: string,
 *   accountName: string,
 *   holdMinutes: number
 * } | {
 *   enabled: true,
 *   method: 'momo',
 *   amount: number,
 *   momoPhone: string,
 *   momoName: string,
 *   holdMinutes: number
 * } | null}
 */
export function normalizePaymentConfig(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createValidationError('Cấu hình thanh toán (paymentConfig) phải là một đối tượng', 'INVALID_PAYMENT_CONFIG');
  }
  if (!raw.enabled) return null;

  // V6: Hỗ trợ cả 2 phương thức (ngân hàng và MoMo). methods là mảng con không rỗng của ['bank', 'momo']
  let methods = [];
  if (Array.isArray(raw.methods)) {
    for (const m of raw.methods) {
      const s = String(m || '').trim().toLowerCase();
      if ((s === 'bank' || s === 'momo') && !methods.includes(s)) {
        methods.push(s);
      }
    }
  } else if (raw.method !== undefined && raw.method !== null) {
    const s = String(raw.method).trim().toLowerCase();
    if (s === 'bank' || s === 'momo') {
      methods.push(s);
    } else {
      throw createValidationError('Phương thức thanh toán này chưa được hỗ trợ (chỉ nhận chuyển khoản ngân hàng hoặc MoMo)', 'PAYMENT_METHOD_UNSUPPORTED');
    }
  }

  if (methods.length === 0) {
    throw createValidationError('Vui lòng chọn ít nhất một phương thức thanh toán (chuyển khoản ngân hàng hoặc ví MoMo)', 'INVALID_PAYMENT_CONFIG');
  }

  const primaryMethod = methods[0];

  const amount = Number(raw.amount);
  if (!Number.isInteger(amount) || amount < MIN_PAYMENT_AMOUNT || amount > MAX_PAYMENT_AMOUNT) {
    throw createValidationError(
      `Số tiền phải là số nguyên từ ${MIN_PAYMENT_AMOUNT.toLocaleString('vi-VN')} đến ${MAX_PAYMENT_AMOUNT.toLocaleString('vi-VN')} VND`,
      'INVALID_PAYMENT_CONFIG'
    );
  }

  let bankBin;
  let accountNumber;
  let accountName;
  let momoPhone;
  let momoName;
  let momoQrMode = null;
  let momoQrBin = null;
  let momoQrAccount = null;
  let momoQrRefLabel = null;

  if (methods.includes('bank')) {
    bankBin = String(raw.bankBin || '').trim();
    if (!VIETQR_BANKS[bankBin]) {
      throw createValidationError('Ngân hàng (bankBin) không hợp lệ', 'INVALID_PAYMENT_CONFIG');
    }

    accountNumber = String(raw.accountNumber || '').trim();
    if (!ACCOUNT_NUMBER_RE.test(accountNumber)) {
      throw createValidationError(
        `Số tài khoản phải gồm ${MIN_ACCOUNT_NUMBER_LENGTH}-${MAX_ACCOUNT_NUMBER_LENGTH} chữ số`,
        'INVALID_PAYMENT_CONFIG'
      );
    }

    accountName = normalizeAccountName(raw.accountName);
    if (!ACCOUNT_NAME_RE.test(accountName)) {
      throw createValidationError(
        'Tên chủ tài khoản không hợp lệ (chỉ chữ in hoa không dấu, số, khoảng trắng, 2-50 ký tự)',
        'INVALID_PAYMENT_CONFIG'
      );
    }
  }

  if (methods.includes('momo')) {
    momoPhone = String(raw.momoPhone || '').trim();
    if (!MOMO_PHONE_RE.test(momoPhone)) {
      throw createValidationError(
        'Số điện thoại MoMo phải gồm 10 chữ số (bắt đầu bằng 03, 05, 07, 08, 09)',
        'INVALID_PAYMENT_CONFIG'
      );
    }

    momoName = normalizeAccountName(raw.momoName);
    if (!ACCOUNT_NAME_RE.test(momoName)) {
      throw createValidationError(
        'Tên chủ ví MoMo không hợp lệ (chỉ chữ in hoa không dấu, số, khoảng trắng, 2-50 ký tự)',
        'INVALID_PAYMENT_CONFIG'
      );
    }

    momoQrMode = raw.momoQrMode !== undefined && raw.momoQrMode !== null
      ? String(raw.momoQrMode).trim().toLowerCase()
      : null;

    if (!momoQrMode) {
      const rawBin = raw.momoQrBin !== undefined && raw.momoQrBin !== null ? String(raw.momoQrBin).trim() : null;
      const rawAccount = raw.momoQrAccount !== undefined && raw.momoQrAccount !== null ? String(raw.momoQrAccount).trim() : null;

      if (rawBin || rawAccount) {
        if (!rawBin || !rawAccount) {
          throw createValidationError(
            'Cần cung cấp đủ cả mã BIN và số tài khoản QR MoMo',
            'INVALID_PAYMENT_CONFIG'
          );
        }
        if (!MOMO_QR_BIN_RE.test(rawBin)) {
          throw createValidationError(
            'Mã BIN của QR MoMo không hợp lệ (phải gồm 6 chữ số)',
            'INVALID_PAYMENT_CONFIG'
          );
        }
        momoQrMode = 'account';
      } else {
        momoQrMode = 'none';
      }
    }

    if (momoQrMode !== 'none' && momoQrMode !== 'phone' && momoQrMode !== 'account') {
      throw createValidationError(
        'Cách tạo mã QR MoMo không hợp lệ (chỉ nhận none, phone hoặc account)',
        'INVALID_PAYMENT_CONFIG'
      );
    }

    if (momoQrMode === 'account') {
      if (raw.momoQrAccount === undefined || raw.momoQrAccount === null || String(raw.momoQrAccount).trim() === '') {
        throw createValidationError(
          'Số tài khoản QR MoMo không được để trống khi chọn nhập số tài khoản',
          'INVALID_PAYMENT_CONFIG'
        );
      }
      const cleanAccount = String(raw.momoQrAccount).replace(/\s+/g, '').toUpperCase();
      if (!MOMO_QR_ACCOUNT_RE.test(cleanAccount)) {
        throw createValidationError(
          'Số tài khoản QR MoMo không hợp lệ (6-19 ký tự gồm chữ in hoa và số)',
          'INVALID_PAYMENT_CONFIG'
        );
      }
      momoQrBin = MOMO_VIETQR_BIN;
      momoQrAccount = cleanAccount;

      if (raw.momoQrRefLabel !== undefined && raw.momoQrRefLabel !== null && String(raw.momoQrRefLabel).trim() !== '') {
        const refLabel = String(raw.momoQrRefLabel).trim();
        if (!MOMO_QR_REF_LABEL_RE.test(refLabel)) {
          throw createValidationError(
            'Nhãn tham chiếu QR MoMo không hợp lệ (1-25 ký tự chữ in hoa và số)',
            'INVALID_PAYMENT_CONFIG'
          );
        }
        momoQrRefLabel = refLabel;
      }
    } else if (momoQrMode === 'phone') {
      momoQrBin = MOMO_VIETQR_BIN;
      momoQrAccount = momoPhone;
    } else {
      momoQrBin = null;
      momoQrAccount = null;
      momoQrRefLabel = null;
    }
  }

  let holdMinutes = DEFAULT_HOLD_MINUTES;
  if (raw.holdMinutes !== undefined && raw.holdMinutes !== null) {
    const n = Number(raw.holdMinutes);
    if (!Number.isInteger(n) || n < MIN_HOLD_MINUTES || n > MAX_HOLD_MINUTES) {
      throw createValidationError(
        `holdMinutes phải là số nguyên ${MIN_HOLD_MINUTES}-${MAX_HOLD_MINUTES}`,
        'INVALID_PAYMENT_CONFIG'
      );
    }
    holdMinutes = n;
  }

  const config = {
    enabled: true,
    methods,
    method: primaryMethod,
    amount,
    holdMinutes,
    purpose: resolvePaymentPurpose(raw.purpose),
  };

  if (methods.includes('bank')) {
    config.bankBin = bankBin;
    config.accountNumber = accountNumber;
    config.accountName = accountName;
  }

  if (methods.includes('momo')) {
    config.momoPhone = momoPhone;
    config.momoName = momoName;
    config.momoQrMode = momoQrMode;
    if (momoQrBin && momoQrAccount) {
      config.momoQrBin = momoQrBin;
      config.momoQrAccount = momoQrAccount;
      if (momoQrRefLabel) {
        config.momoQrRefLabel = momoQrRefLabel;
      }
    }
  }

  return config;
}

// ─── Theme (PR-4a, PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md "Bổ sung 15/09 khi soạn lệnh
// PR-4") ─────────────────────────────────────────────────────────────────────────────────

// 8 font đã kiểm có subset `vietnamese` trên Google Fonts CSS API (15/09) — form PR-4a chỉ
// nhận đúng danh sách này, không nhận font tuỳ ý (chống chọn font không hiển thị được dấu).
export const ALLOWED_FORM_FONTS = Object.freeze([
  'Be Vietnam Pro',
  'Inter',
  'Roboto',
  'Nunito',
  'Montserrat',
  'Lora',
  'Playfair Display',
  'Quicksand',
]);
export const ALLOWED_FORM_LAYOUTS = Object.freeze(['card', 'wide']);
export const ALLOWED_FORM_BANNER_HEIGHTS = Object.freeze(['sm', 'md', 'lg']);
export const MAX_FORM_THEME_PRESET_LENGTH = 32;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FORM_THEME_PRESET_RE = /^[a-z0-9_-]{1,32}$/;

/**
 * Regex khoá kho ảnh biểu mẫu cho MỘT workspaceOwnerId cụ thể — `bannerKey`/`logoKey` phải
 * khớp đúng id của CHÍNH chủ form đang sửa, không phải bất kỳ số nào. Đây là lớp kiểm ĐẦU (định
 * dạng, thuần — không đụng DB); lớp kiểm THỨ HAI (khoá có thật trong `storage_objects`,
 * `owner_user_id`/`category`/`state` đúng) nằm ở `form.service.js` vì cần query DB.
 *
 * @param {number|string} workspaceOwnerId
 * @returns {RegExp}
 */
export function buildFormAssetKeyRegex(workspaceOwnerId) {
  const id = Number(workspaceOwnerId);
  return new RegExp(`^uploads/${id}/forms/[A-Za-z0-9._-]+\\.(png|jpe?g|webp)$`, 'i');
}

function normalizeFormThemeAssetKey(raw, keyLabel, workspaceOwnerId) {
  if (raw === null) return null; // gỡ ảnh
  const key = String(raw || '').trim();
  if (!workspaceOwnerId || !buildFormAssetKeyRegex(workspaceOwnerId).test(key)) {
    throw createValidationError(`${keyLabel} không hợp lệ`, 'INVALID_FORM_THEME');
  }
  return key;
}

/**
 * Chuẩn hoá và xác thực giao diện (theme) của biểu mẫu theo whitelist — mọi khoá tuỳ chọn,
 * `{}`/thiếu = giữ giao diện hiện tại (KHÔNG force default như `normalizeFormSettings`; khooá
 * nào không được gửi/không hợp lệ thì vắng mặt trong kết quả, không tự điền giá trị mặc định).
 * Khoá lạ bị bỏ, giống `normalizeFormSettings`.
 *
 * Xác thực `bannerKey`/`logoKey` ở đây CHỈ là định dạng (regex, thuần) — lớp kiểm DB (khoá có
 * thật, đúng chủ, đúng category) nằm ở service, KHÔNG đưa vào util này (Bổ sung 15/09 mục theme:
 * "Kiểm dòng DB nằm ở service, util giữ thuần").
 *
 * `theme` là đối tượng THAY THẾ TOÀN BỘ mỗi khi được gửi (cùng quy ước với `settings`/
 * `bookingConfig`/`paymentConfig`) — gửi `theme: { primaryColor: '#112233' }` mà không có
 * `bannerKey` nghĩa là ảnh banner (nếu có từ trước) cũng bị bỏ, không phải "giữ nguyên ảnh cũ,
 * chỉ đổi màu". Muốn giữ ảnh cũ, payload phải gửi lại đúng `bannerKey` cũ cùng lúc.
 *
 * @param {any} raw
 * @param {{ workspaceOwnerId: number }} ctx
 * @returns {object}
 */
export function normalizeFormTheme(raw, { workspaceOwnerId } = {}) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createValidationError('Giao diện biểu mẫu (theme) phải là một đối tượng', 'INVALID_FORM_THEME');
  }

  const theme = {};

  if (raw.preset !== undefined && raw.preset !== null) {
    const preset = String(raw.preset).trim();
    if (!FORM_THEME_PRESET_RE.test(preset)) {
      throw createValidationError('preset không hợp lệ (chỉ a-z, 0-9, _, -, tối đa 32 ký tự)', 'INVALID_FORM_THEME');
    }
    theme.preset = preset;
  }

  if (raw.primaryColor !== undefined && raw.primaryColor !== null) {
    const c = String(raw.primaryColor).trim();
    if (!HEX_COLOR_RE.test(c)) {
      throw createValidationError('primaryColor phải có dạng mã màu hex #RRGGBB', 'INVALID_FORM_THEME');
    }
    theme.primaryColor = c;
  }

  if (raw.backgroundColor !== undefined && raw.backgroundColor !== null) {
    const c = String(raw.backgroundColor).trim();
    if (!HEX_COLOR_RE.test(c)) {
      throw createValidationError('backgroundColor phải có dạng mã màu hex #RRGGBB', 'INVALID_FORM_THEME');
    }
    theme.backgroundColor = c;
  }

  if (raw.fontFamily !== undefined && raw.fontFamily !== null) {
    const f = String(raw.fontFamily).trim();
    if (!ALLOWED_FORM_FONTS.includes(f)) {
      throw createValidationError('fontFamily không nằm trong danh sách font hỗ trợ', 'INVALID_FORM_THEME');
    }
    theme.fontFamily = f;
  }

  if (raw.layout !== undefined && raw.layout !== null) {
    const l = String(raw.layout).trim();
    if (!ALLOWED_FORM_LAYOUTS.includes(l)) {
      throw createValidationError('layout phải là "card" hoặc "wide"', 'INVALID_FORM_THEME');
    }
    theme.layout = l;
  }

  if (raw.bannerHeight !== undefined && raw.bannerHeight !== null) {
    const h = String(raw.bannerHeight).trim();
    if (!ALLOWED_FORM_BANNER_HEIGHTS.includes(h)) {
      throw createValidationError('bannerHeight phải là "sm", "md" hoặc "lg"', 'INVALID_FORM_THEME');
    }
    theme.bannerHeight = h;
  }

  if (raw.bannerKey !== undefined) {
    theme.bannerKey = normalizeFormThemeAssetKey(raw.bannerKey, 'bannerKey', workspaceOwnerId);
  }

  if (raw.logoKey !== undefined) {
    theme.logoKey = normalizeFormThemeAssetKey(raw.logoKey, 'logoKey', workspaceOwnerId);
  }

  return theme;
}
