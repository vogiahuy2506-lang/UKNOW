/**
 * PR-C1 (C-NO-GOC1) — nguồn trạng thái wizard: `wizard_state` trong DB hay replay lịch sử do client gửi.
 *
 * Cờ `WIZARD_STATE_SOURCE`:
 *  - `history`: chỉ đường cũ (replay toàn bộ lịch sử + merge với bản đã lưu).
 *  - `shadow` (mặc định): VẪN phục vụ bằng đường cũ, đồng thời tính đường mới và in MỘT dòng log
 *    `[Compiler Shadow WizardState]` (khớp / lệch + TÊN trường — không bao giờ in giá trị).
 *  - `db`: phục vụ bằng đường mới khi bản đã lưu đủ điều kiện (xem isWizardStateInSync), ngược lại rơi về đường cũ.
 *
 * Điều kiện "đủ điều kiện" dùng hai dấu trong `wizard_state.meta` (KHÔNG đổi `v`, FE cũ đòi v===1):
 *  - `historyBackfilledAt`: bản đã lưu từng được dựng từ replay lịch sử đầy đủ (backfill lười — mọi lượt chat ghi dấu này).
 *  - `foldedMessageCount`: số tin trong `ai_chat_messages` tại lúc ghi. Lệch với số tin thật nghĩa là có tin vào DB mà
 *    bản đã lưu chưa gấp (lượt ghi hỏng, tin landing, tin lỗi…) → lượt đó rơi về replay, rồi ghi lại dấu mới (tự chữa).
 */

import { isDeepStrictEqual } from 'node:util';

export const WIZARD_STATE_SOURCES = ['history', 'shadow', 'db'];
export const DEFAULT_WIZARD_STATE_SOURCE = 'shadow';

/** Đọc lúc gọi (không cache) để đổi cờ không cần build lại; sửa .env vẫn phải khởi động lại tiến trình. */
export function resolveWizardStateSource(raw = process.env.WIZARD_STATE_SOURCE) {
  const value = String(raw ?? '').trim().toLowerCase();
  return WIZARD_STATE_SOURCES.includes(value) ? value : DEFAULT_WIZARD_STATE_SOURCE;
}

/**
 * Bản đã lưu có thể làm nguồn duy nhất cho lượt này không?
 * @param {object|null} persistedRaw  cột wizard_state thô
 * @param {number|null} messageCount  số tin hiện có của phiên trong ai_chat_messages (null = không biết)
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function isWizardStateInSync(persistedRaw, messageCount) {
  if (!persistedRaw || typeof persistedRaw !== 'object' || persistedRaw.v !== 1) {
    return { ok: false, reason: 'no_state' };
  }
  const meta = persistedRaw.meta && typeof persistedRaw.meta === 'object' ? persistedRaw.meta : {};
  if (!meta.historyBackfilledAt) return { ok: false, reason: 'not_backfilled' };
  if (!Number.isInteger(messageCount) || messageCount < 0) return { ok: false, reason: 'count_unknown' };
  if (!Number.isInteger(meta.foldedMessageCount)) return { ok: false, reason: 'no_folded_count' };
  if (meta.foldedMessageCount !== messageCount) return { ok: false, reason: 'count_mismatch' };
  return { ok: true, reason: null };
}

/**
 * Dấu backfill ghi kèm mỗi lần ghi state có gates sau lượt chat. `historyBackfilledAt` chỉ đặt một lần (giữ mốc đầu).
 * `foldedMessageCount` KHÔNG tính ở đây: repository đếm ngay trong câu UPDATE (stampFoldedCount) để số đếm và lần ghi
 * cùng một câu lệnh, không có khe giữa hai truy vấn.
 */
export function buildBackfillStamp(prevMeta, now = new Date()) {
  return { historyBackfilledAt: prevMeta?.historyBackfilledAt || now.toISOString() };
}

/**
 * Các khoá của `turn` khác `start` (so sâu). Lượt chat chỉ ghi phần NÓ THAY ĐỔI so với bản đã đọc lúc đầu lượt, để
 * khi lượt chạy lâu (LLM 10–30 giây) một PATCH xen giữa (approve_plan, set_zalo_friends…) không bị ghi đè lại bằng
 * giá trị cũ của đầu lượt.
 */
export function diffChangedKeys(start, turn) {
  const base = start && typeof start === 'object' ? start : {};
  const out = {};
  for (const [key, value] of Object.entries(turn || {})) {
    if (!isDeepStrictEqual(value, base[key])) out[key] = value;
  }
  return out;
}
