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
