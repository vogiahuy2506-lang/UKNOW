import { getAiQuotaErrorMessage, isAiQuotaExceededError } from '../../../utils/aiLimitError.util';

/**
 * Câu báo lỗi thân thiện cho các nút AI của Biểu mẫu (`POST /forms/ai-draft`).
 *  - hết lượt AI / gói hết hạn → câu chuẩn của app (`aiChatbot.aiCreditExceeded`), cùng nguồn với các nút AI khác;
 *  - lỗi nghiệp vụ có câu tiếng Việt từ server (400/422/502, "AI phản hồi quá lâu"…) → dùng nguyên;
 *  - còn lại (mất mạng, không có phản hồi) → câu dự phòng của nơi gọi.
 *
 * @param {unknown} error lỗi axios
 * @param {(key: string, params?: object) => string} t
 * @param {string} fallback
 * @returns {string}
 */
export function getAiDraftErrorMessage(error, t, fallback) {
  if (isAiQuotaExceededError(error)) return getAiQuotaErrorMessage(error, t);
  const message = error?.response?.data?.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return fallback;
}
