import crypto from 'crypto';

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
    if (rawKey && /^[a-zA-Z0-9_]{3,32}$/.test(rawKey) && !usedKeys.has(rawKey)) {
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
