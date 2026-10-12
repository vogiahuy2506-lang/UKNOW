/**
 * Danh sách biểu mẫu của node chiến dịch `read_form_submissions` (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-7b).
 *
 * Sau PR-6 một landing có NHIỀU biểu mẫu, nên node nhận `formIds: number[]`. Đồ thị đã lưu trước đó chỉ có `formId` (một số) —
 * vẫn phải chạy y như cũ, nên MỌI nơi đọc cấu hình node đều đi qua hàm này thay vì đọc thẳng `config.formId`.
 *
 * Hàm thuần — không đụng DB.
 */

/** Trần số biểu mẫu một node đọc (landing tối đa 20 biểu mẫu; 50 chừa chỗ cho node chọn tay nhiều trang). */
export const MAX_CAMPAIGN_FORM_IDS = 50;

/**
 * @param {unknown} value
 * @returns {number|null} số nguyên dương an toàn, hoặc null
 */
function toPositiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^\d{1,15}$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Chuẩn hoá một danh sách id (mảng hoặc chuỗi "1,2,3") thành mảng số nguyên dương, bỏ trùng, giữ thứ tự, tối đa
 * `MAX_CAMPAIGN_FORM_IDS`.
 *
 * @param {unknown} raw
 * @returns {number[]}
 */
export function normalizeFormIdList(raw) {
  const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const id = toPositiveInt(item);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_CAMPAIGN_FORM_IDS) break;
  }
  return out;
}

/**
 * Danh sách biểu mẫu của một node `read_form_submissions` từ `config`:
 *  - `config.formIds` (mảng) nếu có ít nhất một id hợp lệ → dùng nó (ưu tiên, kể cả khi còn sót `formId` cũ);
 *  - ngược lại rơi về `config.formId` (đồ thị lưu trước PR-7b) → mảng một phần tử;
 *  - không có gì hợp lệ → `[]`.
 *
 * @param {object|null|undefined} config
 * @returns {number[]}
 */
export function normalizeCampaignFormIds(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const fromList = normalizeFormIdList(cfg.formIds);
  if (fromList.length > 0) return fromList;
  const legacy = toPositiveInt(cfg.formId);
  return legacy === null ? [] : [legacy];
}
