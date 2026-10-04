/**
 * Phiên chat CÔNG KHAI (trang /chat/:id) + nhịp hỏi tin nhân viên trả lời tay (H-02, PLAN_WEBCHAT_NHAN_TIN_TRA_LOI_TAY_2026-10-04).
 *
 * widget.js là file JS thuần chạy trên site khách (không import được) nên giữ BẢN SAO các hằng số/hàm này —
 * khi đổi ở đây phải đổi cả `frontend/public/widget.js` (spec widgetAgentPoll.spec.js chạy widget thật, spec
 * publicChatSession.util.spec.js ghim phía này).
 */

/** Khách mở trang: hỏi tin nhân viên trả lời tay mỗi 8 giây. */
export const AGENT_POLL_INTERVAL_MS = 8000;
/** Lỗi liên tiếp: giãn dần 16 → 32 → 60 giây (lỗi thứ 4 trở đi vẫn 60 giây). */
export const AGENT_POLL_BACKOFF_MS = Object.freeze([16000, 32000, 60000]);
/** Server báo còn tin chưa lấy hết (hasMore): hỏi lại sau 1 giây. */
export const AGENT_POLL_MORE_MS = 1000;
export const AGENT_LABEL = 'Nhân viên';

/**
 * sessionId là thứ DUY NHẤT chứng minh "hội thoại này của tôi" khi hỏi tin nhân viên trả lời
 * (GET .../messages), nên phiên mới sinh bằng crypto (128 bit), không dùng Date.now() + Math.random() đoán được.
 * Phiên cũ trong localStorage (dạng sess_<ms>_<ký tự>) giữ nguyên để không mất hội thoại đang dở.
 */
export function generateChatSessionId() {
  try {
    const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      let hex = '';
      for (let i = 0; i < bytes.length; i += 1) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
      return `sess_${hex}`;
    }
  } catch {
    // rơi xuống nhánh dự phòng
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}${Math.random().toString(36).slice(2, 11)}`;
}

/** Độ trễ tới lượt hỏi kế tiếp. `errorCount` = số lỗi liên tiếp vừa xảy ra (0 = lượt vừa rồi thành công). */
export function nextAgentPollDelay({ errorCount = 0, hasMore = false } = {}) {
  if (errorCount > 0) {
    return AGENT_POLL_BACKOFF_MS[Math.min(errorCount, AGENT_POLL_BACKOFF_MS.length) - 1];
  }
  return hasMore ? AGENT_POLL_MORE_MS : AGENT_POLL_INTERVAL_MS;
}

/**
 * id tin là BIGINT dạng chuỗi số: so sánh theo độ dài rồi theo chữ để không mất chính xác ở số lớn.
 * @returns {boolean} a > b
 */
export function idGreater(a, b) {
  const x = String(a);
  const y = String(b);
  return x.length !== y.length ? x.length > y.length : x > y;
}

/** id tin hợp lệ của server: chuỗi số nguyên không âm, tối đa 18 chữ số (khớp afterId phía backend). */
export function isValidMessageId(id) {
  return /^\d{1,18}$/.test(String(id ?? ''));
}
