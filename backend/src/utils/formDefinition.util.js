import crypto from 'crypto';
import { isReservedCampaignItemFieldKey } from './formCampaignItem.util.js';
import { VIETQR_BANKS } from '../constants/vietQrBanks.js';

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
]);

export const ALLOWED_ROLES = Object.freeze(['name', 'email', 'phone']);
export const MAX_FIELDS = 30;
export const MAX_LABEL_LENGTH = 200;
export const MAX_OPTIONS = 50;
export const MAX_OPTION_LENGTH = 100;

function createValidationError(message, code = 'INVALID_FORM_DEFINITION') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
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

  if (rawFields.length > MAX_FIELDS) {
    throw createValidationError(`Biểu mẫu không được vượt quá ${MAX_FIELDS} trường`);
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

    const label = String(field.label || '').trim();
    if (!label) {
      throw createValidationError(`Nhãn trường thứ ${i + 1} không được để trống`);
    }
    if (label.length > MAX_LABEL_LENGTH) {
      throw createValidationError(`Nhãn trường "${label.slice(0, 30)}..." vượt quá ${MAX_LABEL_LENGTH} ký tự`);
    }

    const required = Boolean(field.required);
    const placeholder = field.placeholder ? String(field.placeholder).trim().slice(0, MAX_LABEL_LENGTH) : '';

    let role = null;
    if (field.role) {
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
      role,
      options,
    });
  }

  return normalized;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_SUBMIT_BUTTON_TEXT_LENGTH = 50;
export const MAX_SUCCESS_MESSAGE_LENGTH = 500;
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
export const MIN_ACCOUNT_NUMBER_LENGTH = 6;
export const MAX_ACCOUNT_NUMBER_LENGTH = 19;
export const MAX_ACCOUNT_NAME_LENGTH = 50;
export const MIN_HOLD_MINUTES = 10;
export const MAX_HOLD_MINUTES = 120;
export const DEFAULT_HOLD_MINUTES = 30;
const ACCOUNT_NAME_RE = /^[A-Z0-9 ]{2,50}$/;
const ACCOUNT_NUMBER_RE = /^\d{6,19}$/;

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
 * PR-3a chỉ nhận `method: 'bank'` — `momo_image` dời sang sau PR-4 (chưa có endpoint upload
 * ảnh cho form) nên bị từ chối 400 ở đây thay vì âm thầm lưu cấu hình không dùng được.
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
 * } | null}
 */
export function normalizePaymentConfig(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createValidationError('Cấu hình thanh toán (paymentConfig) phải là một đối tượng', 'INVALID_PAYMENT_CONFIG');
  }
  if (!raw.enabled) return null;

  const method = String(raw.method || 'bank').trim().toLowerCase();
  if (method !== 'bank') {
    throw createValidationError('Phương thức thanh toán này chưa được hỗ trợ (chỉ nhận chuyển khoản ngân hàng)', 'PAYMENT_METHOD_UNSUPPORTED');
  }

  const amount = Number(raw.amount);
  if (!Number.isInteger(amount) || amount < MIN_PAYMENT_AMOUNT || amount > MAX_PAYMENT_AMOUNT) {
    throw createValidationError(
      `Số tiền phải là số nguyên từ ${MIN_PAYMENT_AMOUNT.toLocaleString('vi-VN')} đến ${MAX_PAYMENT_AMOUNT.toLocaleString('vi-VN')} VND`,
      'INVALID_PAYMENT_CONFIG'
    );
  }

  const bankBin = String(raw.bankBin || '').trim();
  if (!VIETQR_BANKS[bankBin]) {
    throw createValidationError('Ngân hàng (bankBin) không hợp lệ', 'INVALID_PAYMENT_CONFIG');
  }

  const accountNumber = String(raw.accountNumber || '').trim();
  if (!ACCOUNT_NUMBER_RE.test(accountNumber)) {
    throw createValidationError(
      `Số tài khoản phải gồm ${MIN_ACCOUNT_NUMBER_LENGTH}-${MAX_ACCOUNT_NUMBER_LENGTH} chữ số`,
      'INVALID_PAYMENT_CONFIG'
    );
  }

  const accountName = normalizeAccountName(raw.accountName);
  if (!ACCOUNT_NAME_RE.test(accountName)) {
    throw createValidationError(
      'Tên chủ tài khoản không hợp lệ (chỉ chữ in hoa không dấu, số, khoảng trắng, 2-50 ký tự)',
      'INVALID_PAYMENT_CONFIG'
    );
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

  return {
    enabled: true,
    method: 'bank',
    amount,
    bankBin,
    accountNumber,
    accountName,
    holdMinutes,
  };
}
