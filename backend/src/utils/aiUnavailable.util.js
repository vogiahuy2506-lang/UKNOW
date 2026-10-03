/**
 * Hang so + ham THUAN cho "chatbot khong tra loi duoc khach" (G3b, A P1-6). Khong import gi - cac kenh ghi tin
 * (zaloInbox, internal.routes, whatsappBaileysInbox, webhook) va truy van ban tin tuan dung chung ma khong keo them module.
 */

/** Gia tri `metadata.source` cua tin xin loi - KHONG phai cau tra loi cua AI (khac 'ai_auto_reply'). */
export const AI_UNAVAILABLE_SOURCE = 'ai_unavailable';

/**
 * Đầu chung của HAI câu xin lỗi cố định (VISITOR_CHAT_UNAVAILABLE_MESSAGE / VISITOR_CHAT_ERROR_MESSAGE ở aiCreditMeter.service.js).
 * Chỉ để lọc dữ liệu CŨ: tin xin lỗi ghi TRƯỚC khi có nhãn `ai_unavailable` mang nhãn 'ai_auto_reply' / role 'bot' và vẫn
 * nằm trong khoảng 7 ngày của bản tin tuần đầu tiên sau triển khai. Spec ghim hai câu đó vẫn bắt đầu bằng chuỗi này.
 */
export const LEGACY_APOLOGY_PREFIX = 'Xin lỗi, hiện chưa thể trả lời';

export const AI_UNAVAILABLE_REASON = Object.freeze({
  CREDIT_EXHAUSTED: 'credit_exhausted',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',
  TOKEN_LIMIT: 'ai_token_limit',
  AI_ERROR: 'ai_error',
});

/**
 * Phan loai loi AI. Ten resource khop `usage_logs.resource_type` ('ai_credit' - aiCreditMeter, 'ai_token' - aiUsageMeter);
 * viet thang chuoi de module nay khong phai import (spec khac mock thieu export se khong nap duoc).
 */
export function classifyAiFailure(error) {
  if (error?.code === 'RESOURCE_LIMIT_EXCEEDED') {
    if (error.subscriptionExpired) return AI_UNAVAILABLE_REASON.SUBSCRIPTION_EXPIRED;
    if (error.resource === 'ai_credit') return AI_UNAVAILABLE_REASON.CREDIT_EXHAUSTED;
    if (error.resource === 'ai_token') return AI_UNAVAILABLE_REASON.TOKEN_LIMIT;
  }
  return AI_UNAVAILABLE_REASON.AI_ERROR;
}

/**
 * Metadata gan vao tin bot khi do la cau xin loi; `{}` neu khong phai (cho de spread: `...unavailableMetadata(result)`).
 * @param {{ source?: string, reason?: string }|null|undefined} result - ket qua chatRouter (`source`/`reason`)
 */
export function unavailableMetadata(result) {
  if (result?.source !== AI_UNAVAILABLE_SOURCE) return {};
  return { source: AI_UNAVAILABLE_SOURCE, reason: result.reason || AI_UNAVAILABLE_REASON.AI_ERROR };
}
