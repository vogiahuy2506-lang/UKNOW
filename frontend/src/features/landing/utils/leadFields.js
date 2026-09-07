/**
 * Helper chung cho dữ liệu Lead — dùng chung giữa Lead Form (gửi lên) và
 * Landing Leads Admin (đọc về). Mục tiêu: 2 bên cùng cách diễn dịch shape data.
 */

/**
 * Ghép họ tên hiển thị.
 * Ưu tiên `fullName` (server join sẵn) → fallback `lastName + firstName`.
 */
export function getLeadFullName(row) {
  if (!row) return '';
  const direct = String(row.fullName || '').trim();
  if (direct) return direct;
  const composed = `${String(row.lastName || '').trim()} ${String(row.firstName || '').trim()}`.trim();
  return composed;
}

/**
 * Lấy initials cho avatar (dùng nếu cần).
 */
export function getLeadInitials(row, locale = 'vi') {
  const name = getLeadFullName(row);
  if (!name) return '?';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Chuẩn hoá entry customField mà server trả về.
 *
 * Server có 2 dạng:
 *  (A) entry = { labelVi, labelEn, displayVi, displayEn, value }  (đã join label + value)
 *  (B) entry = { value }                                          (chỉ value thuần)
 *
 * Helper này luôn trả về { key, label, value, raw } để UI dùng thống nhất.
 *
 * @param {string} key
 * @param {any} entry
 * @param {string} [locale='vi']
 * @returns {{ key: string, label: string, value: any, display: string }}
 */
export function normalizeCustomFieldEntry(key, entry, locale = 'vi') {
  const isEn = locale === 'en';
  if (entry && typeof entry === 'object') {
    const label = entry.labelVi || entry.labelEn || key;
    const display = entry.displayVi || entry.displayEn;
    const raw = entry.value !== undefined ? entry.value : display;
    let displayStr = '';
    if (typeof raw === 'boolean') {
      displayStr = raw ? (isEn ? 'Yes' : 'Có') : (isEn ? 'No' : 'Không');
    } else if (Array.isArray(raw)) {
      displayStr = raw.join(', ');
    } else if (raw === null || raw === undefined || raw === '') {
      displayStr = '—';
    } else {
      displayStr = String(raw);
    }
    return { key, label, value: raw, display: display || displayStr };
  }
  // Primitive value
  let displayStr = '';
  if (typeof entry === 'boolean') {
    displayStr = entry ? (isEn ? 'Yes' : 'Có') : (isEn ? 'No' : 'Không');
  } else if (Array.isArray(entry)) {
    displayStr = entry.join(', ');
  } else if (entry === null || entry === undefined || entry === '') {
    displayStr = '—';
  } else {
    displayStr = String(entry);
  }
  return { key, label: key, value: entry, display: displayStr };
}

/**
 * Render customFields object thành chuỗi `Label: Value · Label: Value` cho list.
 *
 * @param {object|undefined|null} customFields
 * @param {{ key: string, labelVi?: string, labelEn?: string, options?: any[] }[]} [definitions]  Định nghĩa custom field (từ /leads/custom-field-definitions).
 * @param {'vi'|'en'} [locale='vi']
 * @returns {string}
 */
export function renderCustomFieldsSummary(customFields, definitions = [], locale = 'vi') {
  if (!customFields || typeof customFields !== 'object') return '';
  const keys = Object.keys(customFields);
  if (keys.length === 0) return '';
  const defByKey = new Map();
  for (const def of definitions || []) {
    if (def?.key) defByKey.set(def.key, def);
  }
  const parts = keys.map((key) => {
    const def = defByKey.get(key);
    const label = def?.labelVi || def?.labelEn || key;
    const entry = { value: customFields[key] };
    // Nếu là select/radio, tra label từ options
    if (def && (def.type === 'select' || def.type === 'radio') && Array.isArray(def.options)) {
      const opt = def.options.find((o) => o.value === customFields[key]);
      if (opt) {
        entry.labelVi = opt.labelVi || opt.value;
        entry.labelEn = opt.labelEn || opt.value;
      }
    }
    const { display } = normalizeCustomFieldEntry(key, entry, locale);
    return `${label}: ${display}`;
  });
  return parts.join(' · ');
}

/**
 * Build payload cho POST /api/public/leads từ state form (dùng cho hook FounderLeadFormCard).
 *
 * Quy ước: chỉ gửi field nào có giá trị hoặc config yêu cầu; customFields khử field rỗng.
 */
export function buildPublicLeadPayload({
  form,
  leadFormConfig,
  landingPageSlug,
  visitorId,
  toLowerCaseEmail = true,
}) {
  if (!form) return null;
  const payload = {
    lastName: String(form.lastName || '').trim(),
    firstName: String(form.firstName || '').trim(),
    email: toLowerCaseEmail ? String(form.email || '').trim().toLowerCase() : String(form.email || '').trim(),
    phone: String(form.phone || '').replace(/\s+/g, ' ').trim(),
    marketingConsent: Boolean(form.marketingConsent),
  };
  if (leadFormConfig?.fixedFields?.occupation?.visible) {
    payload.occupation = String(form.occupation ?? '').trim();
  }
  if (leadFormConfig?.fixedFields?.interestArea?.visible) {
    payload.interestArea = String(form.interestArea ?? '').trim();
  }
  const customFields = {};
  for (const field of leadFormConfig?.customFields || []) {
    if (Object.prototype.hasOwnProperty.call(form.customFields || {}, field.key)) {
      const v = form.customFields[field.key];
      // Bỏ field rỗng — backend không cần lưu placeholder
      if (v === '' || v === null || v === undefined) continue;
      customFields[field.key] = v;
    }
  }
  if (Object.keys(customFields).length > 0) {
    payload.customFields = customFields;
  }
  if (landingPageSlug) payload.landingPageSlug = landingPageSlug;
  if (visitorId) payload.visitorId = visitorId;
  return payload;
}
