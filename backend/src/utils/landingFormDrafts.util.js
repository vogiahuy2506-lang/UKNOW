/**
 * Nháp biểu mẫu THEO TỪNG CHỖ TRỐNG của landing (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-7a).
 *
 * Khi AI landing đặt chỗ trống có loại (`<div data-founderai-form-slot="booking"></div>`), dịch vụ `aiFormDraft` soạn trường cho từng
 * chỗ và trả `formDrafts = [{ slotIndex, kind, title, description, fields, settings, bookingConfig, needsAttention }]`; trình duyệt giữ
 * chúng cùng nháp landing rồi gửi kèm lúc Lưu. File này gồm hai nhóm hàm THUẦN:
 *
 *  1. SẮP HÀNG chỗ trống giữa hai bản HTML (`alignFormSlotKinds`, `findNewFormSlots`, `realignFormDrafts`, `mergeFormDrafts`) — chỗ
 *     trống được đánh số theo thứ tự xuất hiện (đếm cả chỗ trống trần), nên thêm / bớt / đổi chỗ một chỗ trống làm lệch chỉ số của các
 *     nháp đứng sau; sắp hàng theo chuỗi loại (dãy con chung dài nhất) để nháp đi theo đúng chỗ trống của nó.
 *  2. KHÔNG TIN nháp từ trình duyệt (`sanitizeIncomingFormDrafts`, `buildFormInputFromDraft`) — nháp đi qua chuẩn hoá THẬT
 *     (`normalizeFormFields` / `normalizeFormSettings` / `normalizeBookingConfig`), chỉ nhận loại trường trong danh sách AI, ÉP
 *     `paymentConfig = null`, `consentEnabled = true`, `notifyOwner = true`, cắt độ dài / số lượng. Nháp sai loại so với chỗ trống,
 *     hỏng chuẩn hoá hay có thứ lạ → trả null và nơi lưu dùng mẫu backend (không bao giờ làm hỏng lượt lưu landing).
 */
import {
  normalizeFormFields,
  normalizeFormSettings,
  normalizeBookingConfig,
  MAX_TITLE_LENGTH,
  MAX_INPUT_FIELDS,
  MAX_DISPLAY_BLOCKS,
  MAX_SUBMIT_BUTTON_TEXT_LENGTH,
  MAX_SUCCESS_MESSAGE_LENGTH,
} from './formDefinition.util.js';
import { AI_FORM_FIELD_TYPES, isDisplayFieldType } from './formFieldTypes.util.js';
import { buildStarterFormDraft } from './formStarterTemplates.util.js';
import { FORM_SLOT_KINDS, MAX_FORMS_PER_LANDING, listFormSlots, listFormSlotKinds } from './landingHtmlInjection.util.js';

/** Mô tả biểu mẫu tối đa (chữ giới thiệu hiện đầu biểu mẫu) — bằng trần của dịch vụ AI soạn biểu mẫu. */
const MAX_DRAFT_FORM_DESCRIPTION = 500;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (typeof value === 'string' ? value.trim() : '');
const clip = (value, max) => (value.length > max ? value.slice(0, max).trim() : value);

// ─── 1. Sắp hàng chỗ trống giữa hai bản HTML ───────────────────────────────────────────────────────────────────────────

/**
 * Ghép chuỗi loại cũ với chuỗi loại mới (dãy con chung dài nhất, ghép sớm nhất khi hoà): chỗ trống nào "còn nguyên" qua lần sửa.
 *
 * @param {string[]} oldKinds
 * @param {string[]} newKinds
 * @returns {number[]} độ dài = newKinds; phần tử j = chỉ số chỗ trống CŨ mà chỗ trống mới j là (hoặc -1 nếu là chỗ trống MỚI)
 */
export function alignFormSlotKinds(oldKinds, newKinds) {
  const a = Array.isArray(oldKinds) ? oldKinds : [];
  const b = Array.isArray(newKinds) ? newKinds : [];
  // lcs[i][j] = độ dài dãy con chung của a[i:] và b[j:]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const mapping = new Array(b.length).fill(-1);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      mapping[j] = i;
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return mapping;
}

/**
 * Chỗ trống MỚI xuất hiện trong `newHtml` so với `oldHtml` (không có ở bản cũ sau khi sắp hàng). `oldHtml` rỗng (sinh trang mới) thì
 * mọi chỗ trống đều mới. Bỏ qua chỗ trống có loại lạ (đã bị chốt chặn khác từ chối).
 *
 * @param {string} oldHtml
 * @param {string} newHtml
 * @returns {Array<{ slotIndex: number, kind: string }>} slotIndex = thứ tự chỗ trống trong `newHtml` (đếm cả chỗ trống trần)
 */
export function findNewFormSlots(oldHtml, newHtml) {
  const newSlots = listFormSlots(newHtml);
  const mapping = alignFormSlotKinds(listFormSlotKinds(oldHtml), newSlots.map((s) => s.kind));
  const fresh = [];
  newSlots.forEach((slot, slotIndex) => {
    if (mapping[slotIndex] === -1 && slot.valid) fresh.push({ slotIndex, kind: slot.kind });
  });
  return fresh;
}

/**
 * Đánh số lại nháp theo HTML mới: nháp đi theo chỗ trống của nó (cùng loại); chỗ trống đã biến mất → bỏ nháp.
 *
 * @param {Array<{ slotIndex: number, kind: string }>} drafts
 * @param {string} oldHtml HTML mà `slotIndex` của `drafts` đang tính theo
 * @param {string} newHtml
 * @returns {Array<object>}
 */
export function realignFormDrafts(drafts, oldHtml, newHtml) {
  const list = Array.isArray(drafts) ? drafts : [];
  if (list.length === 0) return [];
  const newKinds = listFormSlotKinds(newHtml);
  const mapping = alignFormSlotKinds(listFormSlotKinds(oldHtml), newKinds);
  const newIndexByOld = new Map();
  mapping.forEach((oldIndex, newIndex) => {
    if (oldIndex !== -1) newIndexByOld.set(oldIndex, newIndex);
  });
  const out = [];
  for (const draft of list) {
    const next = newIndexByOld.get(draft?.slotIndex);
    if (next === undefined || newKinds[next] !== draft.kind) continue;
    out.push(next === draft.slotIndex ? draft : { ...draft, slotIndex: next });
  }
  return out.sort((x, y) => x.slotIndex - y.slotIndex);
}

/**
 * Hợp nháp cũ (đã đánh số lại theo HTML mới) với nháp mới của lượt vừa rồi; cùng `slotIndex` thì nháp mới thắng.
 *
 * @param {Array<object>} existing
 * @param {Array<object>} incoming
 * @returns {Array<object>} sắp theo slotIndex
 */
export function mergeFormDrafts(existing, incoming) {
  const bySlot = new Map();
  for (const draft of Array.isArray(existing) ? existing : []) bySlot.set(draft.slotIndex, draft);
  for (const draft of Array.isArray(incoming) ? incoming : []) bySlot.set(draft.slotIndex, draft);
  return [...bySlot.values()].sort((x, y) => x.slotIndex - y.slotIndex);
}

// ─── 2. Không tin nháp từ trình duyệt ──────────────────────────────────────────────────────────────────────────────────

/**
 * Lọc `body.formDrafts` thô: mảng (tối đa MAX_FORMS_PER_LANDING phần tử), mỗi phần tử là object có `slotIndex` nguyên 0..trần-1 và
 * `kind` thuộc FORM_SLOT_KINDS. Trùng `slotIndex` thì lấy cái ĐẦU. Chưa chuẩn hoá nội dung — việc đó của `buildFormInputFromDraft`.
 *
 * @param {unknown} raw
 * @returns {Map<number, { kind: string, draft: object }>}
 */
export function sanitizeIncomingFormDrafts(raw) {
  const map = new Map();
  if (!Array.isArray(raw)) return map;
  for (const item of raw.slice(0, MAX_FORMS_PER_LANDING)) {
    if (!isPlainObject(item)) continue;
    const { slotIndex } = item;
    const kind = asText(item.kind).toLowerCase();
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_FORMS_PER_LANDING) continue;
    if (!FORM_SLOT_KINDS.includes(kind) || map.has(slotIndex)) continue;
    map.set(slotIndex, { kind, draft: item });
  }
  return map;
}

/** Chỉ giữ những khoá của trường mà dịch vụ AI soạn biểu mẫu sinh ra — mọi khoá khác (kể cả `key`) bị bỏ, khoá trường sinh lại. */
function pickDraftField(raw) {
  if (!isPlainObject(raw)) return null;
  const type = asText(raw.type).toLowerCase();
  if (!AI_FORM_FIELD_TYPES.includes(type)) return null;
  const field = { type, label: typeof raw.label === 'string' ? raw.label : '', required: raw.required === true };
  if (typeof raw.role === 'string' && raw.role) field.role = raw.role;
  if (typeof raw.placeholder === 'string' && raw.placeholder) field.placeholder = raw.placeholder;
  if (typeof raw.helpText === 'string' && raw.helpText) field.helpText = raw.helpText;
  if (raw.width === 'half') field.width = 'half';
  if (Array.isArray(raw.options)) {
    field.options = raw.options.map((option) => (isPlainObject(option) ? (option.value ?? option.label) : option));
  }
  return field;
}

/**
 * Nháp từ trình duyệt → ĐẦU VÀO của `formService.createForm` cho đúng chỗ trống `kind`, hoặc `null` (caller dùng mẫu backend).
 *
 * Từ chối (null) khi: không phải object; `kind` của nháp khác `kind` của chỗ trống; `consult` (biểu mẫu tư vấn luôn dựng từ
 * leadFormConfig); có trường ngoài danh sách loại trường AI (vd `file`) hoặc quá nhiều trường; chuẩn hoá thật báo lỗi; chưa có trường
 * nhập nào; biểu mẫu đặt lịch / thu tiền không có ô số điện thoại lẫn email (chủ không có cách liên lạc lại).
 *
 * Luôn ÉP: `paymentConfig = null` (QĐ4 — AI không điền tiền / tài khoản), `consentEnabled = true`, `notifyOwner = true`. Cài đặt chỉ
 * nhận chữ nút gửi, lời cảm ơn, gửi xác nhận (mọi cài đặt khác — chuyển hướng, lời đồng ý… — bị bỏ). Khung giờ đặt lịch chỉ nhận khi
 * qua `normalizeBookingConfig` và đang bật, không thì dùng khung giờ mẫu.
 *
 * @param {unknown} rawDraft
 * @param {string} kind loại của chỗ trống
 * @returns {null|{ title: string|null, description: string|null, fields: object[], settings: object, bookingConfig: object|null, paymentConfig: null }}
 */
export function buildFormInputFromDraft(rawDraft, kind) {
  try {
    if (!isPlainObject(rawDraft)) return null;
    if (!FORM_SLOT_KINDS.includes(kind) || kind === 'consult') return null;
    if (asText(rawDraft.kind).toLowerCase() !== kind) return null;

    if (!Array.isArray(rawDraft.fields) || rawDraft.fields.length === 0) return null;
    if (rawDraft.fields.length > MAX_INPUT_FIELDS + MAX_DISPLAY_BLOCKS) return null;
    const picked = rawDraft.fields.map(pickDraftField);
    if (picked.some((field) => field === null)) return null;
    const fields = normalizeFormFields(picked);
    if (!fields.some((field) => !isDisplayFieldType(field.type))) return null;
    if ((kind === 'booking' || kind === 'payment') && !fields.some((f) => f.role === 'phone' || f.role === 'email')) return null;

    const starter = buildStarterFormDraft(kind);
    const rawSettings = isPlainObject(rawDraft.settings) ? rawDraft.settings : {};
    const submitButtonText = clip(asText(rawSettings.submitButtonText), MAX_SUBMIT_BUTTON_TEXT_LENGTH);
    const successMessage = clip(asText(rawSettings.successMessage), MAX_SUCCESS_MESSAGE_LENGTH);
    const settings = normalizeFormSettings({
      ...starter.settings,
      ...(submitButtonText ? { submitButtonText } : {}),
      ...(successMessage ? { successMessage } : {}),
      ...(typeof rawSettings.sendConfirmation === 'boolean' ? { sendConfirmation: rawSettings.sendConfirmation } : {}),
      consentEnabled: true,
      notifyOwner: true,
    });

    let bookingConfig = null;
    if (kind === 'booking') {
      let candidate = null;
      try {
        candidate = rawDraft.bookingConfig ? normalizeBookingConfig(rawDraft.bookingConfig) : null;
      } catch {
        candidate = null;
      }
      bookingConfig = candidate?.enabled === true ? candidate : starter.bookingConfig;
    }

    return {
      title: clip(asText(rawDraft.title), MAX_TITLE_LENGTH) || null,
      description: clip(asText(rawDraft.description), MAX_DRAFT_FORM_DESCRIPTION) || null,
      fields,
      settings,
      bookingConfig,
      paymentConfig: null,
    };
  } catch {
    // Mọi thứ lạ (chuẩn hoá từ chối, kiểu sai…) → để nơi lưu dùng mẫu backend; nháp không bao giờ được làm hỏng lượt lưu landing.
    return null;
  }
}
