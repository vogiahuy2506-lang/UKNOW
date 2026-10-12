/**
 * Hằng số của MỘT lượt sinh / sửa landing bằng AI (PLAN_SUA_AI_DOT4_PR9, B-4 / B-20).
 *
 * Production: /api đi thẳng Cloudflare → backend, Cloudflare cắt ở 100 giây NẾU không có byte nào chạy. Hai route landing
 * giờ trả phản hồi dạng luồng (NDJSON) kèm nhịp `ping`, nên Cloudflare luôn thấy byte đi → không còn 524; trần tổng
 * dưới đây chỉ để lượt không treo vô hạn khi Google chậm.
 */

/** Trần tổng một lượt (đọc tệp + mọi lời gọi Gemini: sinh, sinh lại khi trượt chốt, tự sửa). */
export const LANDING_TURN_TOTAL_MS = 240000;

/** Nhịp giữ kết nối: mỗi chừng này ghi một dòng `{"type":"ping"}`. Cloudflare cắt khi 100 giây không có byte. */
export const LANDING_TURN_PING_MS = 15000;

/** Giữ kết quả theo `requestId` chừng này — khách mất mạng rồi bấm lại không bị trừ lần hai. */
export const LANDING_REQUEST_ID_TTL_MS = 10 * 60 * 1000;

/** Số lượt tối đa nhớ cùng lúc trong RAM (mỗi lượt giữ nguyên HTML kết quả, hàng trăm KB). */
export const LANDING_TURN_REGISTRY_MAX = 300;

/** Phần ngân sách tổng CÒN LẠI để truyền cho `totalTimeoutMs` của lõi Gemini (luôn > 0: hết hạn thì lõi tự báo hết giờ). */
export function remainingTurnMs(deadlineAtMs) {
  if (!Number.isFinite(deadlineAtMs)) return null;
  return Math.max(1, Math.ceil(deadlineAtMs - Date.now()));
}

/**
 * PR-7a — bước soạn nháp biểu mẫu cho từng chỗ trống có loại (booking / payment / survey / blank) NGAY SAU khi AI landing có HTML.
 * Các nháp chạy SONG SONG nên thời gian thêm vào lượt ≈ thời gian của MỘT lời gọi model (thường 5–15 giây), không nhân theo số chỗ trống.
 *
 *  - `LANDING_FORM_DRAFT_MAX_MS`: trần cứng cho cả bước (quá thì bỏ nháp chưa xong, lúc lưu dùng mẫu backend — lượt không hỏng);
 *  - `LANDING_FORM_DRAFT_RESERVE_MS`: phần ngân sách chừa lại cho ghi phiên / trừ credit / giao kết quả sau bước này;
 *  - `LANDING_FORM_DRAFT_MIN_MS`: còn ít hơn mức này thì KHÔNG bắt đầu (một lời gọi model không kịp xong) — dùng mẫu luôn.
 */
export const LANDING_FORM_DRAFT_MAX_MS = 25000;
export const LANDING_FORM_DRAFT_RESERVE_MS = 8000;
export const LANDING_FORM_DRAFT_MIN_MS = 6000;

/**
 * Ngân sách (ms) cho bước soạn nháp biểu mẫu: min(trần cứng, phần ngân sách "quyết định" còn lại − chừa, phần ngân sách TỔNG của lượt còn
 * lại − chừa). Trả 0 nếu còn dưới LANDING_FORM_DRAFT_MIN_MS (không đủ giờ để bắt đầu).
 *
 * @param {{ deadlineAtMs?: number|null, startedAtMs: number, timeBudgetMs: number, nowMs?: number }} params
 *   `timeBudgetMs`: ngân sách dùng để QUYẾT ĐỊNH của lượt (lượt luồng: LANDING_TURN_TOTAL_MS; đường JSON cũ bị Cloudflare cắt ở 100 giây: 85 giây).
 * @returns {number}
 */
export function resolveFormDraftBudgetMs({ deadlineAtMs = null, startedAtMs, timeBudgetMs, nowMs = Date.now() }) {
  const byDecisionBudget = timeBudgetMs - (nowMs - startedAtMs) - LANDING_FORM_DRAFT_RESERVE_MS;
  const byTurnDeadline = Number.isFinite(deadlineAtMs) ? deadlineAtMs - nowMs - LANDING_FORM_DRAFT_RESERVE_MS : Infinity;
  const budget = Math.min(LANDING_FORM_DRAFT_MAX_MS, byDecisionBudget, byTurnDeadline);
  return budget >= LANDING_FORM_DRAFT_MIN_MS ? Math.floor(budget) : 0;
}
