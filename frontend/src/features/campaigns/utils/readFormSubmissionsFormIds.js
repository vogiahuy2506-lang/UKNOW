/**
 * Danh sách biểu mẫu của node «Dữ liệu Biểu mẫu» (read_form_submissions, PR-7b).
 *
 * Node nhận `formIds: number[]` (nhiều biểu mẫu). Đồ thị lưu trước đó chỉ có `formId` (một số hoặc chuỗi số) — vẫn phải mở và chạy
 * như cũ, nên mọi chỗ đọc cấu hình node ở frontend đi qua `getFormIdsFromConfig`. Khớp `normalizeCampaignFormIds` phía backend
 * (backend/src/utils/campaignFormIds.util.js): `formIds` hợp lệ thắng `formId` cũ; số nguyên dương, bỏ trùng, giữ thứ tự, tối đa 50.
 */

export const MAX_READ_FORM_SUBMISSIONS_FORM_IDS = 50;

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function toPositiveInt(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^\d{1,15}$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * @param {unknown} raw mảng id (số hoặc chuỗi số)
 * @returns {number[]}
 */
export function normalizeFormIdList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const id = toPositiveInt(item);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_READ_FORM_SUBMISSIONS_FORM_IDS) break;
  }
  return out;
}

/**
 * @param {object|null|undefined} config cấu hình node read_form_submissions
 * @returns {number[]} `formIds` nếu có id hợp lệ, không thì `[formId]` cũ, không có gì thì `[]`
 */
export function getFormIdsFromConfig(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const fromList = normalizeFormIdList(cfg.formIds);
  if (fromList.length > 0) return fromList;
  const legacy = toPositiveInt(cfg.formId);
  return legacy === null ? [] : [legacy];
}

/**
 * Gọi API preview đúng đường theo số biểu mẫu: đúng MỘT → `/forms/:id/campaign-preview` (y như trước PR-7b, nên node cũ và mock
 * cũ không đổi); từ HAI → `/forms/campaign-preview?formIds=` (server khử trùng người điền nhiều biểu mẫu).
 *
 * @param {{ previewFormSubmissions: Function, previewFormsSubmissions: Function }} service campaignBuilderApiService
 * @param {unknown} formIds
 * @param {{ limit?: number }} [params]
 * @param {object} [options] axios options
 */
export function previewFormSubmissionsForIds(service, formIds, params = {}, options = {}) {
  const ids = normalizeFormIdList(formIds);
  if (ids.length === 1) return service.previewFormSubmissions(ids[0], params, options);
  return service.previewFormsSubmissions(ids, params, options);
}
