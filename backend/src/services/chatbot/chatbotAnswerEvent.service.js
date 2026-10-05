import { recordAiCallEvent, errorCodeOf, AI_CALL_LAYER, AI_CALL_OUTCOME } from '../ai/aiCallEvents.service.js';

/**
 * Sổ đo lường chatbot TRẢ LỜI KHÁCH (PLAN_SUA_AI_DOT4_PR10 mục 3(e), A P2-10): dòng token chỉ có `feature` nên không biết BOT NÀO tốn tiền, BOT NÀO hay
 * "chưa có thông tin", hay RAG có kéo được đoạn nào không. Một sự kiện mỗi lượt khách hỏi, tầng 'app', feature `chatbot_answer`:
 *   meta { chatbotId, channel, ragChunks, ragKbChunks, topSimilarity, outcome, totalTokens, replyChars }
 *   meta.outcome = answered (AI trả lời) | no_info (AI trả lời "chưa có thông tin…") | fallback_text (khách nhận câu xin lỗi soạn sẵn vì AI không trả lời được).
 *
 * CHỌN MỘT, KHÔNG TRÙNG: plan cho chọn giữa "metadata của `aiUsageMeter.record`" và "sự kiện" — chọn SỰ KIỆN vì (a) `fallback_text` là lượt KHÔNG có lời gọi AI
 * thành công nên không có dòng token nào để gắn metadata, (b) `no_info` chỉ biết SAU khi có câu trả lời, mà `record` chạy trước đó. Tổng token của lượt nằm
 * ở `meta.totalTokens` → chi phí theo bot = SUM(meta->>'totalTokens') nhóm theo meta->>'chatbotId'. Không ghi nội dung câu hỏi/câu trả lời.
 */
export const CHATBOT_ANSWER_EVENT_FEATURE = 'chatbot_answer';

export const CHATBOT_ANSWER_OUTCOME = Object.freeze({
  ANSWERED: 'answered',
  NO_INFO: 'no_info',
  FALLBACK_TEXT: 'fallback_text',
});

/**
 * Câu AI nói khi KHÔNG có thông tin: khung prompt (`chatbotSystemPrompt.util.js`) dặn nguyên văn "Mình chưa có thông tin về [X] trong hệ thống…".
 * Spec `chatbotAnswerEvent.service.spec.js` ghim: đổi câu dặn trong prompt mà không đổi biểu thức này thì ca đó đỏ (nếu không `no_info` âm thầm về 0).
 */
export const NO_INFO_REPLY_RE = /chưa có thông tin/i;

export function classifyChatbotReply(reply) {
  return NO_INFO_REPLY_RE.test(String(reply || '')) ? CHATBOT_ANSWER_OUTCOME.NO_INFO : CHATBOT_ANSWER_OUTCOME.ANSWERED;
}

/**
 * Ghi MỘT sự kiện cho một lượt chatbot trả lời khách. KHÔNG ném lỗi, KHÔNG cần await.
 *
 * @param {object} p
 * @param {number|null} p.ownerUserId chủ chatbot
 * @param {string} p.channel kênh (web / zalo_personal / telegram_personal / studio_channel…)
 * @param {number|string|null} [p.chatbotId]
 * @param {{ kbChunks?: number, profileChunks?: number, topSimilarity?: number|null }|null} [p.ragStats] số liệu RAG (null = không đo được)
 * @param {string} [p.reply] câu trả lời đã gửi cho khách (CHỈ để phân loại answered/no_info; không được ghi)
 * @param {Error|null} [p.failure] lỗi khiến khách nhận câu xin lỗi soạn sẵn (null = AI trả lời được)
 * @param {string|null} [p.failureReason] lý do khi không có lỗi AI cụ thể (vd hết credit)
 * @param {{ totalTokens?: number }|null} [p.usage]
 * @param {string|null} [p.model]
 * @param {number|null} [p.durationMs]
 */
export function recordChatbotAnswerEvent({
  ownerUserId = null,
  channel,
  chatbotId = null,
  ragStats = null,
  reply = '',
  failure = null,
  failureReason = null,
  usage = null,
  model = null,
  durationMs = null,
} = {}) {
  try {
    const failed = Boolean(failure || failureReason);
    // null/undefined = "không đo được" (khác với 0 = đo được và bằng 0): `Number(null)` là 0 nên phải chặn trước.
    const asNumber = (value) => (value == null ? Number.NaN : Number(value));
    const topSimilarity = asNumber(ragStats?.topSimilarity);
    const kbChunks = asNumber(ragStats?.kbChunks);
    const profileChunks = asNumber(ragStats?.profileChunks);
    void recordAiCallEvent({
      layer: AI_CALL_LAYER.APP,
      feature: CHATBOT_ANSWER_EVENT_FEATURE,
      model,
      outcome: failed ? AI_CALL_OUTCOME.ERROR : AI_CALL_OUTCOME.OK,
      errorCode: failed ? (failure ? errorCodeOf(failure) : failureReason) : null,
      durationMs,
      ownerUserId,
      meta: {
        chatbotId,
        channel,
        outcome: failed ? CHATBOT_ANSWER_OUTCOME.FALLBACK_TEXT : classifyChatbotReply(reply),
        ...(Number.isFinite(kbChunks) ? { ragKbChunks: kbChunks } : {}),
        ...(Number.isFinite(kbChunks) || Number.isFinite(profileChunks)
          ? { ragChunks: (Number.isFinite(kbChunks) ? kbChunks : 0) + (Number.isFinite(profileChunks) ? profileChunks : 0) }
          : {}),
        ...(Number.isFinite(topSimilarity) ? { topSimilarity: Math.round(topSimilarity * 100) / 100 } : {}),
        ...(Number(usage?.totalTokens) > 0 ? { totalTokens: Number(usage.totalTokens) } : {}),
        ...(failed ? {} : { replyChars: String(reply || '').length }),
      },
    });
  } catch {
    // đo lường không bao giờ được làm hỏng câu trả lời cho khách
  }
}
