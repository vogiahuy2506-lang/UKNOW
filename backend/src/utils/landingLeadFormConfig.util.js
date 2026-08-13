/**
 * Schema form lead landing: normalize persisted JSONB, validate admin input,
 * public DTO, snapshot custom values, AI draft. Backend is the authority.
 */

export const LEAD_FORM_CONFIG_VERSION = 1;
export const MAX_CUSTOM_FIELDS = 20;
export const MAX_CUSTOM_FIELD_OPTIONS = 50;
export const MAX_CUSTOM_SUBMIT_JSON_BYTES = 20 * 1024;
export const CUSTOM_FIELD_KEY_RE = /^cf_[a-z0-9_]{4,40}$/;
export const CUSTOM_FIELD_TYPES = Object.freeze(['text', 'textarea', 'select', 'radio', 'checkbox']);
export const FORBIDDEN_FIELD_KEYS = Object.freeze(new Set(['__proto__', 'prototype', 'constructor']));

const LABEL_VI_MIN = 2;
const LABEL_VI_MAX = 100;
const LABEL_EN_MAX = 100;
const PLACEHOLDER_MAX = 160;
const TEXT_VALUE_MAX = 500;
const TEXTAREA_VALUE_MAX = 2000;
const OPTION_VALUE_MAX = 80;
const OPTION_LABEL_MAX = 100;
const MAX_AI_CUSTOM_LABELS = 10;

/** Khớp `founder_OCCUPATION_OPTIONS` — value lưu DB. */
export const OCCUPATION_VALUES = Object.freeze([
  'Sinh viên / Học sinh',
  'Nhân viên văn phòng',
  'Giáo viên / Giảng viên',
  'Kinh doanh / Khởi nghiệp',
  'Marketing / Truyền thông',
  'Lập trình viên / IT',
  'Freelancer',
  'Khác',
]);

/** Khớp `founder_INTEREST_OPTIONS` — value lưu DB. */
export const INTEREST_AREA_VALUES = Object.freeze([
  'ChatGPT & Prompt Engineering',
  'AI cho Marketing / Kinh doanh',
  'AI cho Thiết kế & Sáng tạo',
  'Lập trình với AI (No-code / Low-code)',
  'AI cho Giáo dục',
  'Tất cả các chủ đề AI',
]);

const OCCUPATION_SET = new Set(OCCUPATION_VALUES);
const INTEREST_SET = new Set(INTEREST_AREA_VALUES);

export function defaultLeadFormConfig() {
  return {
    version: LEAD_FORM_CONFIG_VERSION,
    fixedFields: {
      occupation: { visible: true },
      interestArea: { visible: true },
    },
    customFields: [],
  };
}

function configError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmed(value, max) {
  const text = String(value ?? '').trim();
  if (max != null && text.length > max) return text.slice(0, max);
  return text;
}

function visibleFlag(raw, fallback = true) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.visible === 'boolean') {
    return raw.visible;
  }
  if (typeof raw === 'boolean') return raw;
  return fallback;
}

/**
 * Đọc `custom_config` (hoặc object leadForm) đã persist → config đầy đủ.
 * Null/malformed/unknown version → default legacy (cả hai field hiện).
 *
 * @param {unknown} customConfigOrLeadForm
 * @returns {object}
 */
export function normalizePersistedLeadForm(customConfigOrLeadForm) {
  const defaults = defaultLeadFormConfig();
  let leadForm = customConfigOrLeadForm;
  if (isPlainObject(customConfigOrLeadForm) && customConfigOrLeadForm.leadForm != null) {
    leadForm = customConfigOrLeadForm.leadForm;
  }
  if (!isPlainObject(leadForm)) return defaults;
  if (Number(leadForm.version) !== LEAD_FORM_CONFIG_VERSION) return defaults;

  const occupationVisible = visibleFlag(leadForm.fixedFields?.occupation, true);
  const interestVisible = visibleFlag(leadForm.fixedFields?.interestArea, true);
  const customFields = Array.isArray(leadForm.customFields)
    ? leadForm.customFields
        .map((field) => normalizePersistedCustomField(field))
        .filter(Boolean)
        .slice(0, MAX_CUSTOM_FIELDS)
    : [];

  return {
    version: LEAD_FORM_CONFIG_VERSION,
    fixedFields: {
      occupation: { visible: occupationVisible },
      interestArea: { visible: interestVisible },
    },
    customFields,
  };
}

function normalizePersistedCustomField(field) {
  if (!isPlainObject(field)) return null;
  const key = String(field.key || '').trim();
  if (!CUSTOM_FIELD_KEY_RE.test(key) || FORBIDDEN_FIELD_KEYS.has(key)) return null;
  const type = CUSTOM_FIELD_TYPES.includes(field.type) ? field.type : null;
  if (!type) return null;
  const labelVi = asTrimmed(field.labelVi, LABEL_VI_MAX);
  if (labelVi.length < LABEL_VI_MIN) return null;
  const labelEn = asTrimmed(field.labelEn, LABEL_EN_MAX) || null;
  const placeholderVi = asTrimmed(field.placeholderVi, PLACEHOLDER_MAX) || null;
  const placeholderEn = asTrimmed(field.placeholderEn, PLACEHOLDER_MAX) || null;
  const required = Boolean(field.required);
  let options = [];
  if (type === 'select' || type === 'radio') {
    const rawOpts = Array.isArray(field.options) ? field.options : [];
    const seen = new Set();
    for (const opt of rawOpts) {
      if (!isPlainObject(opt)) continue;
      const value = asTrimmed(opt.value, OPTION_VALUE_MAX);
      const optLabelVi = asTrimmed(opt.labelVi, OPTION_LABEL_MAX);
      if (!value || !optLabelVi || seen.has(value) || FORBIDDEN_FIELD_KEYS.has(value)) continue;
      seen.add(value);
      options.push({
        value,
        labelVi: optLabelVi,
        labelEn: asTrimmed(opt.labelEn, OPTION_LABEL_MAX) || null,
      });
      if (options.length >= MAX_CUSTOM_FIELD_OPTIONS) break;
    }
    if (options.length < 1) return null;
  }
  return {
    key,
    type,
    labelVi,
    labelEn,
    placeholderVi,
    placeholderEn,
    required,
    options: type === 'select' || type === 'radio' ? options : [],
  };
}

/**
 * Public/admin DTO hẹp — không lộ raw custom_config.
 *
 * @param {unknown} customConfigOrLeadForm
 * @returns {object}
 */
export function toPublicLeadFormConfig(customConfigOrLeadForm) {
  const normalized = normalizePersistedLeadForm(customConfigOrLeadForm);
  return {
    version: normalized.version,
    fixedFields: {
      occupation: { visible: Boolean(normalized.fixedFields.occupation.visible) },
      interestArea: { visible: Boolean(normalized.fixedFields.interestArea.visible) },
    },
    customFields: normalized.customFields.map((field) => ({
      key: field.key,
      type: field.type,
      labelVi: field.labelVi,
      labelEn: field.labelEn,
      placeholderVi: field.placeholderVi,
      placeholderEn: field.placeholderEn,
      required: Boolean(field.required),
      options: (field.options || []).map((opt) => ({
        value: opt.value,
        labelVi: opt.labelVi,
        labelEn: opt.labelEn,
      })),
    })),
  };
}

function assertSafeKey(key, label = 'key') {
  if (FORBIDDEN_FIELD_KEYS.has(key) || key === '__proto__') {
    throw configError(`${label} không hợp lệ`);
  }
}

function validateCustomFieldInput(field, existingByKey) {
  if (!isPlainObject(field)) {
    throw configError('customFields không hợp lệ');
  }
  const key = String(field.key || '').trim();
  assertSafeKey(key, 'custom field key');
  if (!CUSTOM_FIELD_KEY_RE.test(key)) {
    throw configError('Mã trường tùy chỉnh không hợp lệ');
  }
  const type = String(field.type || '').trim();
  if (!CUSTOM_FIELD_TYPES.includes(type)) {
    throw configError('Loại trường tùy chỉnh không hợp lệ');
  }
  const existing = existingByKey.get(key);
  if (existing && existing.type !== type) {
    throw configError('Không được đổi loại trường đã lưu');
  }

  const labelVi = String(field.labelVi ?? '').trim();
  if (labelVi.length < LABEL_VI_MIN || labelVi.length > LABEL_VI_MAX) {
    throw configError('Nhãn tiếng Việt phải từ 2 đến 100 ký tự');
  }
  const labelEnRaw = field.labelEn == null ? '' : String(field.labelEn).trim();
  if (labelEnRaw.length > LABEL_EN_MAX) {
    throw configError('Nhãn tiếng Anh tối đa 100 ký tự');
  }
  const placeholderViRaw = field.placeholderVi == null ? '' : String(field.placeholderVi).trim();
  const placeholderEnRaw = field.placeholderEn == null ? '' : String(field.placeholderEn).trim();
  if (placeholderViRaw.length > PLACEHOLDER_MAX || placeholderEnRaw.length > PLACEHOLDER_MAX) {
    throw configError('Placeholder tối đa 160 ký tự');
  }

  let options = [];
  if (type === 'select' || type === 'radio') {
    if (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > MAX_CUSTOM_FIELD_OPTIONS) {
      throw configError('Trường chọn phải có từ 1 đến 50 lựa chọn');
    }
    const seen = new Set();
    for (const opt of field.options) {
      if (!isPlainObject(opt)) {
        throw configError('Lựa chọn không hợp lệ');
      }
      const value = String(opt.value ?? '').trim();
      assertSafeKey(value, 'option value');
      if (!value || value.length > OPTION_VALUE_MAX) {
        throw configError('Giá trị lựa chọn không hợp lệ');
      }
      if (seen.has(value)) {
        throw configError('Giá trị lựa chọn bị trùng');
      }
      seen.add(value);
      const optLabelVi = String(opt.labelVi ?? '').trim();
      if (!optLabelVi || optLabelVi.length > OPTION_LABEL_MAX) {
        throw configError('Nhãn lựa chọn không hợp lệ');
      }
      const optLabelEn = opt.labelEn == null ? '' : String(opt.labelEn).trim();
      if (optLabelEn.length > OPTION_LABEL_MAX) {
        throw configError('Nhãn lựa chọn tiếng Anh tối đa 100 ký tự');
      }
      options.push({
        value,
        labelVi: optLabelVi,
        labelEn: optLabelEn || null,
      });
    }

    if (existing) {
      const oldVals = (existing.options || [])
        .map((o) => String(o.value || '').trim())
        .filter(Boolean);
      const newVals = options.map((o) => o.value);
      const oldSet = new Set(oldVals);
      const newSet = new Set(newVals);
      const removed = oldVals.filter((v) => !newSet.has(v));
      const added = newVals.filter((v) => !oldSet.has(v));
      // Chỉ thêm hoặc chỉ xóa. Mọi payload vừa xóa vừa thêm (kể cả small → tiny + xl) đều là đổi mã.
      if (removed.length > 0 && added.length > 0) {
        throw configError('Không được đổi mã lựa chọn đã lưu');
      }
    }
  }

  return {
    key,
    type,
    labelVi,
    labelEn: labelEnRaw || null,
    placeholderVi: placeholderViRaw || null,
    placeholderEn: placeholderEnRaw || null,
    required: Boolean(field.required),
    options,
  };
}

/**
 * Validate input admin `leadFormConfig`. Key/type đã persist thì immutable.
 *
 * @param {unknown} input
 * @param {{ existing?: object|null }} [opts]
 * @returns {object}
 */
export function validateAdminLeadFormConfig(input, opts = {}) {
  if (input == null) {
    return defaultLeadFormConfig();
  }
  if (!isPlainObject(input)) {
    throw configError('leadFormConfig không hợp lệ');
  }
  if (input.version != null && Number(input.version) !== LEAD_FORM_CONFIG_VERSION) {
    throw configError('Phiên bản leadFormConfig không được hỗ trợ');
  }

  const existing = opts.existing ? normalizePersistedLeadForm(opts.existing) : null;
  const existingByKey = new Map((existing?.customFields || []).map((f) => [f.key, f]));

  const occupationVisible = visibleFlag(input.fixedFields?.occupation, true);
  const interestVisible = visibleFlag(input.fixedFields?.interestArea, true);

  const rawFields = input.customFields == null ? [] : input.customFields;
  if (!Array.isArray(rawFields)) {
    throw configError('customFields không hợp lệ');
  }
  if (rawFields.length > MAX_CUSTOM_FIELDS) {
    throw configError(`Tối đa ${MAX_CUSTOM_FIELDS} trường tùy chỉnh`);
  }

  const customFields = [];
  const seenKeys = new Set();
  for (const field of rawFields) {
    const normalized = validateCustomFieldInput(field, existingByKey);
    if (seenKeys.has(normalized.key)) {
      throw configError('Mã trường tùy chỉnh bị trùng');
    }
    seenKeys.add(normalized.key);
    customFields.push(normalized);
  }

  return {
    version: LEAD_FORM_CONFIG_VERSION,
    fixedFields: {
      occupation: { visible: occupationVisible },
      interestArea: { visible: interestVisible },
    },
    customFields,
  };
}

/**
 * Merge `leadForm` vào custom_config JSONB, giữ key top-level khác.
 * `leadFormConfigInput === undefined` → preserve leadForm hiện tại.
 *
 * @param {unknown} existingCustomConfig
 * @param {unknown} leadFormConfigInput
 * @returns {object}
 */
export function mergeLeadFormIntoCustomConfig(existingCustomConfig, leadFormConfigInput) {
  const base = isPlainObject(existingCustomConfig) ? { ...existingCustomConfig } : {};
  delete base.__proto__;
  if (leadFormConfigInput === undefined) {
    if (!base.leadForm) {
      base.leadForm = defaultLeadFormConfig();
    }
    return base;
  }
  const existingLeadForm = base.leadForm;
  base.leadForm = validateAdminLeadFormConfig(leadFormConfigInput, { existing: existingLeadForm });
  return base;
}

export function isOccupationVisible(config) {
  return Boolean(normalizePersistedLeadForm(config).fixedFields.occupation.visible);
}

export function isInterestAreaVisible(config) {
  return Boolean(normalizePersistedLeadForm(config).fixedFields.interestArea.visible);
}

/**
 * Chuẩn hóa occupation/interest khi field đang hiện. Hidden → chuỗi rỗng.
 * Giá trị lạ khi field hiện → rỗng (optional, không reject) trừ khi caller muốn 400.
 *
 * @param {string} raw
 * @param {Set<string>} allowed
 * @returns {string}
 */
export function normalizeOptionalSelectValue(raw, allowed) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return allowed.has(value) ? value : '';
}

export function normalizeOccupationValue(raw) {
  return normalizeOptionalSelectValue(raw, OCCUPATION_SET);
}

export function normalizeInterestAreaValue(raw) {
  return normalizeOptionalSelectValue(raw, INTEREST_SET);
}

function utf8Bytes(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
}

/**
 * Validate custom submit values theo schema đã publish; dựng snapshot server-owned.
 *
 * @param {object} leadFormConfig normalized config
 * @param {unknown} clientCustomFields
 * @returns {object} snapshot object
 */
export function buildTrustedCustomFieldsSnapshot(leadFormConfig, clientCustomFields) {
  const config = normalizePersistedLeadForm(leadFormConfig);
  const schemaFields = config.customFields || [];
  const schemaByKey = new Map(schemaFields.map((f) => [f.key, f]));

  if (clientCustomFields == null || clientCustomFields === '') {
    clientCustomFields = {};
  }
  if (!isPlainObject(clientCustomFields)) {
    throw configError('customFields không hợp lệ');
  }
  if (utf8Bytes(clientCustomFields) > MAX_CUSTOM_SUBMIT_JSON_BYTES) {
    throw configError('Dữ liệu trường tùy chỉnh vượt quá giới hạn');
  }

  const clientKeys = Object.keys(clientCustomFields);
  for (const key of clientKeys) {
    assertSafeKey(key);
    if (!schemaByKey.has(key)) {
      throw configError('Trường tùy chỉnh không thuộc form này');
    }
  }

  const snapshot = {};
  for (const field of schemaFields) {
    const raw = Object.prototype.hasOwnProperty.call(clientCustomFields, field.key)
      ? clientCustomFields[field.key]
      : undefined;
    const { value, displayVi, displayEn } = normalizeCustomSubmitValue(field, raw);
    snapshot[field.key] = {
      type: field.type,
      labelVi: field.labelVi,
      labelEn: field.labelEn,
      value,
      displayVi,
      displayEn,
    };
  }
  return snapshot;
}

function normalizeCustomSubmitValue(field, raw) {
  if (field.type === 'checkbox') {
    if (raw == null || raw === '') {
      if (field.required) throw configError(`Vui lòng điền ${field.labelVi}`);
      return { value: false, displayVi: 'Không', displayEn: 'No' };
    }
    if (typeof raw !== 'boolean') {
      throw configError(`${field.labelVi} không hợp lệ`);
    }
    if (field.required && raw !== true) {
      throw configError(`Vui lòng điền ${field.labelVi}`);
    }
    return {
      value: raw,
      displayVi: raw ? 'Có' : 'Không',
      displayEn: raw ? 'Yes' : 'No',
    };
  }

  if (raw != null && typeof raw === 'object') {
    throw configError(`${field.labelVi} không hợp lệ`);
  }

  const text = raw == null ? '' : String(raw).trim();
  if (field.required && !text) {
    throw configError(`Vui lòng điền ${field.labelVi}`);
  }

  if (field.type === 'text') {
    if (text.length > TEXT_VALUE_MAX) {
      throw configError(`${field.labelVi} tối đa ${TEXT_VALUE_MAX} ký tự`);
    }
    return { value: text, displayVi: text, displayEn: text };
  }
  if (field.type === 'textarea') {
    if (text.length > TEXTAREA_VALUE_MAX) {
      throw configError(`${field.labelVi} tối đa ${TEXTAREA_VALUE_MAX} ký tự`);
    }
    return { value: text, displayVi: text, displayEn: text };
  }

  if (field.type === 'select' || field.type === 'radio') {
    if (!text) {
      return { value: '', displayVi: '', displayEn: '' };
    }
    const opt = (field.options || []).find((o) => o.value === text);
    if (!opt) {
      throw configError(`${field.labelVi} không hợp lệ`);
    }
    return {
      value: text,
      displayVi: opt.labelVi,
      displayEn: opt.labelEn || opt.labelVi,
    };
  }

  throw configError(`${field.labelVi} không hợp lệ`);
}

/**
 * Snapshot JSONB → `{ key: primitive }` cho campaign item.
 *
 * @param {unknown} snapshot
 * @returns {Record<string, string|boolean>}
 */
export function customFieldsSnapshotToPrimitives(snapshot) {
  if (!isPlainObject(snapshot)) return {};
  const out = {};
  for (const key of Object.keys(snapshot)) {
    if (!CUSTOM_FIELD_KEY_RE.test(key) || FORBIDDEN_FIELD_KEYS.has(key)) continue;
    const entry = snapshot[key];
    if (isPlainObject(entry) && Object.prototype.hasOwnProperty.call(entry, 'value')) {
      const value = entry.value;
      if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
        out[key] = value;
      }
    }
  }
  return out;
}

/**
 * Snapshot JSONB → DTO admin (label/value/display, không metadata nội bộ thừa).
 *
 * @param {unknown} snapshot
 * @returns {Record<string, object>}
 */
export function sanitizeCustomFieldsSnapshotForAdmin(snapshot) {
  if (!isPlainObject(snapshot)) return {};
  const out = {};
  for (const key of Object.keys(snapshot)) {
    if (!CUSTOM_FIELD_KEY_RE.test(key) || FORBIDDEN_FIELD_KEYS.has(key)) continue;
    const entry = snapshot[key];
    if (!isPlainObject(entry)) continue;
    out[key] = {
      type: CUSTOM_FIELD_TYPES.includes(entry.type) ? entry.type : 'text',
      labelVi: asTrimmed(entry.labelVi, LABEL_VI_MAX) || key,
      labelEn: asTrimmed(entry.labelEn, LABEL_EN_MAX) || null,
      value: entry.value === true || entry.value === false ? entry.value : String(entry.value ?? ''),
      displayVi: asTrimmed(entry.displayVi, TEXTAREA_VALUE_MAX),
      displayEn: asTrimmed(entry.displayEn, TEXTAREA_VALUE_MAX),
    };
  }
  return out;
}

function splitSuggestedLabels(customText) {
  const raw = String(customText || '');
  const parts = raw.split(/[\n,;]+/);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const label = part.trim().replace(/\s+/g, ' ');
    if (label.length < LABEL_VI_MIN || label.length > LABEL_VI_MAX) continue;
    const dedupe = label.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(label);
    if (out.length >= MAX_AI_CUSTOM_LABELS) break;
  }
  return out;
}

/**
 * Draft metadata server-owned từ LandingBrief đã resolve. Không parse HTML/model.
 *
 * @param {object|null} normalizedBrief
 * @returns {object|null}
 */
export function buildLeadFormDraftFromBrief(normalizedBrief) {
  const preset = normalizedBrief?.formFields?.preset;
  if (preset !== 'basic' && preset !== 'extended' && preset !== 'custom') {
    return null;
  }
  const visible = preset === 'extended';
  const contentLocale = normalizedBrief.contentLocale === 'en' ? 'en' : 'vi';
  return {
    preset,
    contentLocale,
    fixedFields: {
      occupation: { visible },
      interestArea: { visible },
    },
    suggestedCustomFieldLabels: preset === 'custom'
      ? splitSuggestedLabels(normalizedBrief.formFields?.customText)
      : [],
  };
}

/**
 * Áp AI draft lên config editor (chưa persist). Custom suggestions → text rows nháp.
 *
 * @param {object|null} draft
 * @param {object} [baseConfig]
 * @returns {object}
 */
export function applyLeadFormDraftToConfig(draft, baseConfig) {
  const base = normalizePersistedLeadForm(baseConfig || defaultLeadFormConfig());
  if (!draft || typeof draft !== 'object') return base;
  const occupationVisible = visibleFlag(draft.fixedFields?.occupation, base.fixedFields.occupation.visible);
  const interestVisible = visibleFlag(draft.fixedFields?.interestArea, base.fixedFields.interestArea.visible);
  const labels = Array.isArray(draft.suggestedCustomFieldLabels) ? draft.suggestedCustomFieldLabels : [];
  const locale = draft.contentLocale === 'en' ? 'en' : 'vi';
  const customFields = [];
  const seen = new Set();
  for (let i = 0; i < labels.length && customFields.length < MAX_CUSTOM_FIELDS; i += 1) {
    const label = String(labels[i] || '').trim();
    if (label.length < LABEL_VI_MIN) continue;
    const key = `cf_sugg_${String(i + 1).padStart(2, '0')}_text`;
    if (!CUSTOM_FIELD_KEY_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    const clipped = label.slice(0, LABEL_VI_MAX);
    customFields.push({
      key,
      type: 'text',
      labelVi: clipped,
      labelEn: locale === 'en' ? clipped.slice(0, LABEL_EN_MAX) : null,
      placeholderVi: null,
      placeholderEn: null,
      required: false,
      options: [],
    });
  }
  return {
    version: LEAD_FORM_CONFIG_VERSION,
    fixedFields: {
      occupation: { visible: occupationVisible },
      interestArea: { visible: interestVisible },
    },
    customFields,
  };
}
