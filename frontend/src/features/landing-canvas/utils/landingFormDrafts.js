/**
 * Nháp biểu mẫu AI theo TỪNG CHỖ TRỐNG của landing đang soạn (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-7a).
 *
 * Khi AI landing đặt chỗ trống có loại (`<div data-founderai-form-slot="booking"></div>`), backend soạn trường cho từng chỗ trống và trả
 * `formDrafts = [{ slotIndex, kind, title, description, fields, settings, bookingConfig, needsAttention }]` (slotIndex = thứ tự chỗ trống
 * trong HTML, đếm cả chỗ trống trần). Trình soạn giữ chúng trong `form.formDrafts` (sống qua F5 cùng nháp landing), gửi kèm lúc Lưu và xoá
 * sau khi lưu thành công. Backend KHÔNG tin nháp: chuẩn hoá lại, sai loại / hỏng thì dùng mẫu (landingFormDrafts.util.js phía backend).
 *
 * Chỉ số chỗ trống đổi mỗi khi HTML đổi (AI thêm chỗ trống, người dùng bỏ / đổi chỗ một biểu mẫu trong danh sách, hoàn tác…), nên nháp phải
 * ĐI THEO chỗ trống của nó: `realignFormDrafts` sắp hàng chuỗi loại cũ với chuỗi loại mới (dãy con chung dài nhất) — PHẢI giống hệt bản
 * backend `alignFormSlotKinds`. Thuần (không React, không API) để test được.
 */
import { listFormSlotMatches } from '../../landing-pages/utils/injectLandingEnhancements.js';

/** Loại chỗ trống theo thứ tự trong HTML (chỗ trống trần = consult). */
export function listFormSlotKinds(html) {
  return listFormSlotMatches(html).map((slot) => slot.kind);
}

/**
 * Ghép chuỗi loại cũ với chuỗi loại mới (dãy con chung dài nhất, ghép sớm nhất khi hoà). Bản sao của backend `alignFormSlotKinds`.
 *
 * @param {string[]} oldKinds
 * @param {string[]} newKinds
 * @returns {number[]} độ dài = newKinds; phần tử j = chỉ số chỗ trống CŨ mà chỗ trống mới j là (hoặc -1 nếu là chỗ trống MỚI)
 */
export function alignFormSlotKinds(oldKinds, newKinds) {
  const a = Array.isArray(oldKinds) ? oldKinds : [];
  const b = Array.isArray(newKinds) ? newKinds : [];
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

/** Hợp nháp cũ (đã đánh số lại theo HTML mới) với nháp mới của lượt AI vừa rồi; cùng `slotIndex` thì nháp mới thắng. */
export function mergeFormDrafts(existing, incoming) {
  const bySlot = new Map();
  for (const draft of Array.isArray(existing) ? existing : []) bySlot.set(draft.slotIndex, draft);
  for (const draft of Array.isArray(incoming) ? incoming : []) bySlot.set(draft.slotIndex, draft);
  return [...bySlot.values()].sort((x, y) => x.slotIndex - y.slotIndex);
}

/**
 * Nháp sau một lượt AI: sinh trang mới thì thay hẳn bằng nháp của lượt; sửa trang thì nháp cũ đi theo chỗ trống của nó rồi hợp với nháp của
 * chỗ trống mới. `incoming` không phải mảng (cờ tắt / server cũ) → trả `null` = "không có gì để đổi" (caller giữ nguyên, bộ tự sắp hàng
 * trong `realignDraftsOnFormChange` lo phần đổi HTML).
 *
 * @returns {Array<object>|null}
 */
export function applyAiFormDrafts({ current, incoming, previousHtml, nextHtml, replaceAll = false }) {
  if (!Array.isArray(incoming)) return replaceAll ? [] : null;
  if (replaceAll) return mergeFormDrafts([], incoming);
  return mergeFormDrafts(realignFormDrafts(current, previousHtml, nextHtml), incoming);
}

/**
 * Dùng trong bộ bọc `setForm` của trang soạn: HTML đổi mà nơi gọi KHÔNG đụng tới `formDrafts` thì nháp phải đi theo chỗ trống của nó.
 * Không có nháp / chuỗi loại chỗ trống không đổi → trả nguyên `next` (không tốn gì cho các lần gõ trong tab Mã HTML).
 *
 * @param {object} prev
 * @param {object} next
 * @returns {object}
 */
export function realignDraftsOnFormChange(prev, next) {
  if (!prev || !next || next === prev) return next;
  if (next.formDrafts !== prev.formDrafts) return next; // nơi gọi đã tự đặt nháp (vd lượt AI)
  if (!Array.isArray(prev.formDrafts) || prev.formDrafts.length === 0) return next;
  if (next.htmlContent === prev.htmlContent) return next;
  const before = listFormSlotKinds(prev.htmlContent);
  const after = listFormSlotKinds(next.htmlContent);
  if (before.length === after.length && before.every((kind, index) => kind === after[index])) return next;
  return { ...next, formDrafts: realignFormDrafts(prev.formDrafts, prev.htmlContent, next.htmlContent) };
}

/** Nháp ứng với chỗ trống thứ `slotIndex` loại `kind` (khớp CẢ HAI mới dùng). */
export function findDraftForSlot(drafts, slotIndex, kind) {
  if (!Array.isArray(drafts)) return null;
  return drafts.find((d) => d?.slotIndex === slotIndex && d?.kind === kind) || null;
}

/**
 * Phần body gửi lên POST/PUT landing: chỉ các nháp còn khớp một chỗ trống KHÔNG phải consult trong HTML đang lưu (consult dựng từ cấu hình
 * form thu khách, không dùng nháp). Không có gì → `{}` (body y nguyên như trước PR-7a).
 *
 * @param {{ htmlContent?: string, formDrafts?: Array<object> }} form
 * @returns {{ formDrafts?: Array<object> }}
 */
export function buildFormDraftsPayload(form) {
  const drafts = Array.isArray(form?.formDrafts) ? form.formDrafts : [];
  if (drafts.length === 0) return {};
  const kinds = listFormSlotKinds(form?.htmlContent);
  const usable = drafts.filter((d) => d && d.kind !== 'consult' && kinds[d.slotIndex] === d.kind);
  return usable.length > 0 ? { formDrafts: usable } : {};
}
