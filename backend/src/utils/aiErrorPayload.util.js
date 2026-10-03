import {
  AI_PROVIDER_BUSY_CODE,
  AI_PROVIDER_BUSY_MESSAGE,
  GEMINI_TRANSIENT_STATUSES,
} from './geminiClient.util.js';

/**
 * Lỗi đến từ Google (có `geminiStatus`) mang nguyên câu/thân JSON tiếng Anh của họ trong `message`
 * — KHÔNG đưa câu đó ra cho khách. Sự cố 24/09/2026: khách sinh landing thấy nguyên cục
 * `Gemini API lỗi (503): { "error": { "code": 503, "message": "This model is currently …" } }`.
 *  - quá tải/tạm thời (429, 5xx) → câu tiếng Việt bảo thử lại + mã AI_PROVIDER_BUSY;
 *  - lỗi khác của Google (400, 403…) → câu dự phòng của route; câu gốc vẫn nằm trong log máy chủ.
 * Lỗi nghiệp vụ của chính mình (hết hạn mức, thiếu quyền…) không có `geminiStatus` nên đi như cũ.
 * Hết giờ chờ Google (AI_TIMEOUT) đã mang sẵn câu tiếng Việt từ lõi `geminiClient.util.js` nên cũng đi như cũ.
 *
 * Tách khỏi `ai.controller.js` (G2.4, 03/10/2026) để Dashboard / Tóm tắt Hộp thư dùng chung mà không phải import cả
 * controller 2.500 dòng; `ai.controller.js` vẫn re-export tên này cho nơi cũ.
 */
export function buildAiErrorPayload(error, fallbackMessage = 'Lỗi khi xử lý yêu cầu AI') {
  const providerStatus = error?.geminiStatus;
  const fromProvider = providerStatus != null;
  const providerBusy = fromProvider && GEMINI_TRANSIENT_STATUSES.includes(providerStatus);

  let message = error.message || fallbackMessage;
  let code = error.code;
  if (providerBusy) {
    message = AI_PROVIDER_BUSY_MESSAGE;
    code = AI_PROVIDER_BUSY_CODE;
  } else if (fromProvider) {
    message = fallbackMessage;
  }

  return {
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(error.resource ? { resource: error.resource } : {}),
    ...(error.used !== undefined ? { used: error.used } : {}),
    ...(error.limit !== undefined ? { limit: error.limit } : {}),
    ...(error.upgradeRequired ? { upgradeRequired: true } : {}),
  };
}
