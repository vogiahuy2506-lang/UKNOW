/**
 * Cổng quan sát MỌI lần gọi AI tới Google (lõi `generateGeminiContent` và `embedTextRaw`) — PLAN_SUA_AI_DOT4_PR10 mục 3(a).
 *
 * Lõi là util nên KHÔNG import service/CSDL. Cùng khuôn `setGeminiFallbackModelResolver`: tầng service (aiCallEvents.service.js) tự gắn
 * một hàm quan sát vào đây khi được nạp; lõi chỉ gọi `notifyAiCallFinished(event)` sau khi MỖI lần gọi xong (thành công hay lỗi).
 *
 * Vì sao là file riêng (không phải export thêm trong geminiClient.util.js): nhiều spec mock trọn module lõi Gemini với vài export —
 * thêm một export mới vào đó làm các spec ấy hỏng ("does not provide an export named …"). File này mới, không spec nào mock nó.
 *
 * Bất biến: `notifyAiCallFinished` KHÔNG BAO GIỜ ném lỗi và KHÔNG chờ — người quan sát hỏng/chậm không được làm hỏng hay kéo dài lượt AI.
 *
 * @typedef {object} AiCallEvent
 * @property {'generate'|'embedding'} source
 * @property {string} feature      tên tính năng nơi gọi truyền (thiếu = 'unknown')
 * @property {string|null} model   model THẬT đã trả lời (hoặc model định gọi khi lỗi)
 * @property {'ok'|'error'|'busy'|'timeout'|'fallback_ok'|'client_closed'|'blocked'} outcome
 * @property {number|null} httpStatus  mã HTTP THẬT của Google (không phải mã 503 tổng hợp của lõi)
 * @property {string|null} errorCode
 * @property {number} durationMs
 * @property {number|null} ownerUserId
 * @property {number|null} actorUserId
 * @property {object} meta         chỉ số đếm / mã / id — KHÔNG nội dung prompt hay câu trả lời
 */

let observer = null;

/** Gắn (hoặc gỡ, truyền null) hàm quan sát. Chỉ một hàm: gắn lần sau thay lần trước. */
export function setAiCallObserver(fn) {
  observer = typeof fn === 'function' ? fn : null;
}

/** Đã có ai gắn hàm quan sát vào lõi chưa (spec ghim việc gắn xảy ra khi nạp app thật). */
export function hasAiCallObserver() {
  return observer !== null;
}

/**
 * Báo một lần gọi AI vừa xong. `buildEvent` là HÀM dựng sự kiện (không phải sự kiện dựng sẵn) để chi phí dựng chỉ phát sinh khi có người
 * quan sát, và để lỗi dựng sự kiện cũng bị nuốt tại đây thay vì thành lỗi của lượt AI.
 *
 * @param {() => AiCallEvent} buildEvent
 */
export function notifyAiCallFinished(buildEvent) {
  if (!observer) return;
  try {
    const result = observer(buildEvent());
    // Người quan sát bất đồng bộ: nuốt cả lời hứa bị từ chối (không để thành unhandledRejection làm sập tiến trình).
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Quan sát hỏng không bao giờ được làm hỏng lượt AI.
  }
}
