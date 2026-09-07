/**
 * Minimal lead form config utilities.
 * 
 * Kept for compatibility - the lead form config is stored but not configurable
 * via UI anymore (removed in v2).
 */

export const DEFAULT_LEAD_FIELDS = [
  { key: 'name', enabled: true, required: true, label: 'Họ và tên', placeholder: 'Nhập họ và tên' },
  { key: 'phone', enabled: true, required: true, label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
  { key: 'email', enabled: false, required: false, label: 'Email', placeholder: 'Nhập email' },
  { key: 'note', enabled: false, required: false, label: 'Ghi chú', placeholder: 'Nhập ghi chú' },
];

export const DEFAULT_LEAD_FORM_THEME = {
  primaryColor: '#f97316',    // orange-500
  accentColor: '#ea580c',     // orange-600
  cardBg: '#ffffff',
  textColor: '#1f2937',       // gray-800
  borderColor: '#d1d5db',     // gray-300
  borderRadius: 8,
  formTitle: 'Đăng ký tư vấn',
  formDescription: 'Để lại thông tin, chúng tôi sẽ liên hệ bạn sớm nhất!',
  submitButton: 'Gửi đăng ký',
  successMessage: 'Cảm ơn bạn! Chúng tôi sẽ liên hệ trong 24h.',
  errorMessage: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
};

export function defaultLeadFormConfig() {
  return {
    fields: DEFAULT_LEAD_FIELDS,
    theme: { ...DEFAULT_LEAD_FORM_THEME },
    nameMode: 'split', // 'split' | 'single'
    submitEndpoint: '/api/public/leads',
  };
}

/**
 * Normalize raw config to full config with defaults
 */
export function normalizeLeadFormConfig(raw) {
  if (!raw) return defaultLeadFormConfig();
  
  const defaults = defaultLeadFormConfig();
  
  return {
    fields: raw.fields || defaults.fields,
    theme: {
      ...defaults.theme,
      ...(raw.theme || {}),
    },
    nameMode: raw.nameMode || defaults.nameMode,
    submitEndpoint: raw.submitEndpoint || defaults.submitEndpoint,
  };
}

/**
 * Prepare config for save - validates and normalizes
 */
export function prepareLeadFormConfigForSave(raw, _persistedMeta = {}) {
  const normalized = normalizeLeadFormConfig(raw);
  const errors = [];

  // Validate: at least name or phone must be enabled
  const enabledFields = normalized.fields?.filter((f) => f.enabled) || [];
  const hasContactField = enabledFields.some((f) => f.key === 'name' || f.key === 'phone');

  if (!hasContactField) {
    errors.push('Cần có ít nhất trường Họ tên hoặc Số điện thoại');
  }

  return {
    config: normalized,
    errors,
  };
}

/**
 * Snapshot the persisted meta (keys + option values) from raw config.
 * Used for draft tracking.
 */
export function snapshotLeadFormPersistedMeta(raw) {
  if (!raw) return { keys: [], optionValuesByKey: {} };

  const base = normalizeLeadFormConfig(raw);
  return {
    keys: base.fields?.map((f) => f.key) || [],
    optionValuesByKey: {},
  };
}

/**
 * Apply a leadFormDraft (from AI) to create a normalized config.
 */
export function applyLeadFormDraft(draft) {
  if (!draft) return defaultLeadFormConfig();
  return normalizeLeadFormConfig(draft);
}
