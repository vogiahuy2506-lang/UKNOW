import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { generateGeminiContent } from '../../utils/geminiClient.util.js';

/**
 * Trần một lượt gọi (gồm cả thử lại + model dự phòng). Bản cũ dùng `fetch` KHÔNG có timeout: Google treo thì request treo
 * tới khi Cloudflare cắt ở 100 giây. 90 giây đủ cho bản dịch dài (8.192 token đầu ra) mà vẫn nằm dưới trần đó;
 * nơi cần nhanh (bộ định tuyến ý định) truyền `timeoutMs` nhỏ hơn.
 */
const DEFAULT_TIMEOUT_MS = 90000;

/**
 * Lightweight Gemini generateContent for help-center routing / Q&A.
 * Does not touch aiCampaign prompts.
 *
 * G2.3 (03/10/2026): đi qua `generateGeminiContent` (lõi dùng chung) — thử lại 429/5xx/lỗi mạng, model dự phòng, khoá API ở
 * header, hết giờ thì huỷ fetch, và lỗi mang `geminiStatus` + câu tiếng Việt (bản cũ ném nguyên câu tiếng Anh của Google).
 * Giữ nguyên hợp đồng trả về `{ text, modelName, raw }` — `modelName` là model THẬT đã trả lời (có thể là model dự phòng),
 * `raw` là thân phản hồi Google (nơi gọi đọc `usageMetadata` / `finishReason`).
 */
export async function generateGeminiText({
  userId,
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  maxOutputTokens = 1024,
  thinkingBudget = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const modelName = await resolveAllowedModel(userId, null);
  const fallbackModel = await aiUsageMeter.resolveFallbackModel();

  const result = await generateGeminiContent({
    parts: [{ text: userPrompt }],
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    model: modelName,
    fallbackModel,
    temperature,
    topP: null, // đường này chưa bao giờ gửi topP — giữ nguyên
    maxOutputTokens,
    thinkingBudget, // null (mặc định) = không gửi thinkingConfig; số ≥ 0 thì lõi tự gỡ khi model từ chối
    timeoutMs,
    totalTimeoutMs: timeoutMs,
  });

  return {
    text: result.text.trim(),
    modelName: result.modelUsed || modelName,
    raw: result.raw,
  };
}
