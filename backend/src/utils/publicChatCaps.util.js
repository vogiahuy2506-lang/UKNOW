/**
 * Trần chat CÔNG KHAI không phụ thuộc client (A P0-4, PLAN_SUA_AI_DOT4_PR5 04/10/2026) — phần thuần: khoá IP, khoá người
 * gửi dự phòng, câu trả khách khi chạm trần. Bộ đếm nằm ở chatbotRateLimit.service.js (`checkPublicVisitor`).
 *
 * Vì sao cần: trần theo người gửi trước đó khoá bằng `sessionId` do CLIENT tự đặt — gửi mỗi request một sessionId mới (hoặc
 * trang theo id không gửi sessionId → khoá ngẫu nhiên mỗi request) thì trần 8/phút - 20/giờ - 50/ngày không bao giờ chạm,
 * mà gói không giới hạn credit lại bỏ qua credit: kẻ lạ đốt tiền Gemini của chủ chatbot tới trần 500 lượt/giờ/chatbot.
 *
 * Không import từ rateLimiter.middleware.js: nhiều spec route mock module đó với tập export hẹp, thêm import vào controller
 * sẽ vỡ ESM ("does not provide an export named …"). `ipKeyGenerator` của express-rate-limit chính là hàm clientIpKey dùng
 * (cùng nhóm IPv6 theo khối /56) nên "cùng IP" khớp với các limiter HTTP.
 */
import { ipKeyGenerator } from 'express-rate-limit';

/** Mã lỗi khách thấy khi chạm trần (nằm trong PUBLIC_CHAT_SAFE_ERROR_CODES của controller → thân trả kèm `code`). */
export const PUBLIC_CHAT_LIMITED_CODE = 'PUBLIC_CHAT_LIMITED';

/** Lý do (khoá của `checkPublicVisitor`) → câu tiếng Việt cho khách cuối. Không nói số, không lộ cấu hình. */
export const PUBLIC_CHAT_LIMIT_MESSAGES = Object.freeze({
  public_ip_burst: 'Bạn nhắn hơi nhanh rồi. Bạn vui lòng chờ vài phút rồi nhắn tiếp nhé.',
  public_ip_day: 'Hôm nay bạn đã nhắn khá nhiều nên mình tạm chưa trả lời thêm được. Bạn vui lòng quay lại vào ngày mai nhé.',
  public_chatbot_day: 'Hôm nay trợ lý đã nhận rất nhiều tin nhắn nên tạm thời chưa trả lời thêm được. Bạn vui lòng quay lại vào ngày mai hoặc liên hệ trực tiếp với cửa hàng nhé.',
});

const FALLBACK_MESSAGE = PUBLIC_CHAT_LIMIT_MESSAGES.public_ip_burst;

/**
 * Khoá IP của người gọi (đã nhóm IPv6 theo khối). Không có IP → '0.0.0.0' (một thùng chung — chặt hơn, không phải lách).
 * @param {{ ip?: string, socket?: { remoteAddress?: string } }} req
 */
export function getPublicChatIpKey(req) {
  return ipKeyGenerator(req?.ip || req?.socket?.remoteAddress || '0.0.0.0');
}

/**
 * Khoá "người gửi" cho bộ đếm theo người gửi (checkBeforeAi). Có sessionId thì theo sessionId (khách thật luôn gửi — trang
 * /chat và widget đều lưu trong localStorage); KHÔNG có thì theo IP + chatbot (trước: chuỗi ngẫu nhiên mỗi request → trần
 * không bao giờ chạm). Phần chặn kẻ đổi sessionId liên tục là `checkPublicVisitor` (IP + chatbot), không phải khoá này.
 */
export function buildPublicVisitorSenderKey({ clientSessionId, chatbotId, ipKey }) {
  const sid = String(clientSessionId || '').trim();
  return sid || `pub_ip_${chatbotId}_${ipKey}`;
}

/**
 * Lỗi 429 cho khách khi chạm trần: message tiếng Việt + `code`. Controller đưa qua `buildPublicChatErrorBody` (lỗi 4xx do chính
 * mình ném → giữ nguyên câu; mã nằm trong PUBLIC_CHAT_SAFE_ERROR_CODES → thân kèm `code`). Widget.js in `data.message` vào khung
 * chat; PublicChatbotPage đọc `err.response.data.message`.
 */
export function buildPublicChatLimitedError(reason) {
  return Object.assign(new Error(PUBLIC_CHAT_LIMIT_MESSAGES[reason] || FALLBACK_MESSAGE), {
    status: 429,
    code: PUBLIC_CHAT_LIMITED_CODE,
  });
}
