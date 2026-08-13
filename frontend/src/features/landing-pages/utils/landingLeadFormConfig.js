export const LEAD_FORM_CONFIG_VERSION = 1;
export const MAX_CUSTOM_FIELDS = 20;
export const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'select', 'radio', 'checkbox'];
export const CUSTOM_FIELD_KEY_RE = /^cf_[a-z0-9_]{4,40}$/;

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeLeadFormConfig(raw) {
  const defaults = defaultLeadFormConfig();
  const leadForm = isPlainObject(raw) && raw.leadForm ? raw.leadForm : raw;
  if (!isPlainObject(leadForm) || Number(leadForm.version) !== LEAD_FORM_CONFIG_VERSION) {
    return defaults;
  }
  const occupationVisible = leadForm.fixedFields?.occupation?.visible !== false;
  const interestVisible = leadForm.fixedFields?.interestArea?.visible !== false;
  const customFields = Array.isArray(leadForm.customFields)
    ? leadForm.customFields.filter((f) => f && CUSTOM_FIELD_KEY_RE.test(String(f.key || ''))).slice(0, MAX_CUSTOM_FIELDS)
    : [];
  return {
    version: LEAD_FORM_CONFIG_VERSION,
    fixedFields: {
      occupation: { visible: occupationVisible },
      interestArea: { visible: interestVisible },
    },
    customFields: customFields.map((field) => ({
      key: field.key,
      type: CUSTOM_FIELD_TYPES.includes(field.type) ? field.type : 'text',
      labelVi: String(field.labelVi || '').trim(),
      labelEn: field.labelEn ? String(field.labelEn).trim() : '',
      placeholderVi: field.placeholderVi ? String(field.placeholderVi).trim() : '',
      placeholderEn: field.placeholderEn ? String(field.placeholderEn).trim() : '',
      required: Boolean(field.required),
      options: Array.isArray(field.options) ? field.options.map((o) => ({
        value: String(o.value || '').trim(),
        labelVi: String(o.labelVi || '').trim(),
        labelEn: o.labelEn ? String(o.labelEn).trim() : '',
      })) : [],
    })),
  };
}

export function generateCustomFieldKey(label = 'field') {
  const slug = String(label)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'field';
  const rand = Math.random().toString(36).slice(2, 6);
  const rest = `${slug}_${rand}`.replace(/[^a-z0-9_]/g, '').slice(0, 40);
  return `cf_${rest.padEnd(4, 'x')}`;
}

/**
 * Mã option chưa dùng: tránh cả mã đang có trên field và mã từng persist (`opt_1`, `opt_2`, …).
 *
 * @param {{ value?: string }[]|string[]} [existingOptions]
 * @param {Iterable<string>} [reservedValues] Mã đã lưu (kể cả option vừa xóa trên UI)
 * @returns {string}
 */
export function nextUnusedOptionValue(existingOptions = [], reservedValues = []) {
  const used = new Set();
  const add = (raw) => {
    const value = String(raw || '').trim();
    if (value) used.add(value);
  };
  for (const item of Array.isArray(existingOptions) ? existingOptions : []) {
    add(typeof item === 'string' ? item : item?.value);
  }
  const reservedList = reservedValues instanceof Set
    ? reservedValues
    : (Array.isArray(reservedValues) ? reservedValues : []);
  for (const item of reservedList) {
    add(item);
  }
  let n = 1;
  while (used.has(`opt_${n}`)) n += 1;
  return `opt_${n}`;
}

export function applyLeadFormDraft(draft, baseConfig) {
  const base = normalizeLeadFormConfig(baseConfig || defaultLeadFormConfig());
  if (!draft || typeof draft !== 'object') return base;
  const occupationVisible = draft.fixedFields?.occupation?.visible === true;
  const interestVisible = draft.fixedFields?.interestArea?.visible === true;
  const labels = Array.isArray(draft.suggestedCustomFieldLabels) ? draft.suggestedCustomFieldLabels : [];
  const locale = draft.contentLocale === 'en' ? 'en' : 'vi';
  const customFields = labels.slice(0, 10).map((label, i) => {
    const text = String(label || '').trim().slice(0, 100);
    return {
      key: generateCustomFieldKey(`sugg_${i}_${text}`),
      type: 'text',
      labelVi: locale === 'en' ? text : text,
      labelEn: locale === 'en' ? text : '',
      placeholderVi: '',
      placeholderEn: '',
      required: false,
      options: [],
    };
  });
  return {
    version: LEAD_FORM_CONFIG_VERSION,
    fixedFields: {
      occupation: { visible: occupationVisible },
      interestArea: { visible: interestVisible },
    },
    customFields,
  };
}

export function fieldLabel(field, locale = 'vi') {
  if (!field) return '';
  if (locale === 'en') return field.labelEn || field.labelVi || field.key;
  return field.labelVi || field.labelEn || field.key;
}

export function optionLabel(opt, locale = 'vi') {
  if (!opt) return '';
  if (locale === 'en') return opt.labelEn || opt.labelVi || opt.value;
  return opt.labelVi || opt.labelEn || opt.value;
}

/**
 * Snapshot key + option value đã persist — dùng để khóa type/value trên UI và không drop field khi xóa nhãn.
 *
 * @param {unknown} raw
 * @returns {{ keys: string[], optionValuesByKey: Record<string, string[]> }}
 */
export function snapshotLeadFormPersistedMeta(raw) {
  const n = normalizeLeadFormConfig(raw);
  return {
    keys: n.customFields.map((f) => f.key),
    optionValuesByKey: Object.fromEntries(
      n.customFields.map((f) => [
        f.key,
        (f.options || []).map((o) => String(o.value || '').trim()).filter(Boolean),
      ])
    ),
  };
}

/**
 * Chuẩn bị config trước khi lưu: bỏ hàng mới chưa điền nhãn; không xóa field đã persist.
 *
 * @param {unknown} raw
 * @param {{ keys?: string[] }} [persistedMeta]
 * @returns {{ config: object, errors: { key: string, field: string, message: string }[] }}
 */
export function prepareLeadFormConfigForSave(raw, persistedMeta = {}) {
  const n = normalizeLeadFormConfig(raw);
  const persistedKeys = new Set(persistedMeta.keys || []);
  const errors = [];
  const customFields = [];
  for (const field of n.customFields) {
    const labelVi = String(field.labelVi || '').trim();
    const isPersisted = persistedKeys.has(field.key);
    if (!isPersisted && labelVi.length === 0) {
      continue;
    }
    if (labelVi.length < 2) {
      errors.push({
        key: field.key,
        field: 'labelVi',
        message: 'Nhãn tiếng Việt phải từ 2 đến 100 ký tự',
      });
    }
    customFields.push({ ...field, labelVi });
  }
  return {
    config: { ...n, customFields },
    errors,
  };
}

