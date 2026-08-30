import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import {
  CAMPAIGN_INTENT_V1_SCHEMA,
  validateCampaignIntentV1,
} from './campaignIntent.schema.js';

/**
 * Trích xuất ý định chiến dịch từ văn bản tự do bằng Gemini LLM với responseSchema.
 * Bắt mọi lỗi và trả về object có { error }, không bao giờ throw để không ảnh hưởng luồng chính.
 *
 * @param {string} text
 * @param {{ locale?: string, model?: string }} [opts]
 * @returns {Promise<{ intent: object|null, raw: string|null, error: string|null }>}
 */
export async function extractIntentFromText(text, { locale = 'vi', model = null } = {}) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { intent: null, raw: null, error: 'Empty text' };
  }

  const prompt = `Trích xuất ý định chiến dịch marketing từ câu sau đây của người dùng.
Điền các trường bạn biết chắc chắn (kênh gửi, nguồn người nhận, lịch gửi, nội dung).
Để trống hoặc bỏ qua các trường không có thông tin chắc chắn.

Câu của người dùng:
"${text.slice(0, 1000)}"`;

  try {
    const res = await generateGeminiContent({
      parts: [{ text: prompt }],
      responseSchema: CAMPAIGN_INTENT_V1_SCHEMA,
      timeoutMs: 15000,
      model,
    });

    const raw = res?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { intent: null, raw, error: 'Failed to parse JSON from LLM' };
    }

    const validation = validateCampaignIntentV1(parsed);
    if (!validation.valid) {
      return {
        intent: null,
        raw,
        error: `Schema validation failed: ${validation.errors.join('; ')}`,
      };
    }

    return { intent: parsed, raw, error: null };
  } catch (err) {
    return { intent: null, raw: null, error: err?.message || String(err) };
  }
}

/**
 * So sánh kết quả regex với kết quả LLM để tạo metadata log an toàn (không chứa nội dung tin nhắn).
 */
export function compareIntentShadow({ turn = 0, regexState = {}, llmIntent = null, llmError = null }) {
  const regexChannel = regexState?.channel || null;
  const llmChannel = llmIntent?.channel || null;

  const regexDataSource = regexState?.dataSource || null;
  const llmDataSource = llmIntent?.audience?.type || null;

  const regexScheduleMode = regexState?.schedule?.mode || regexState?.schedule?.type || null;
  const llmScheduleMode = llmIntent?.schedule?.type || null;

  const agreeChannel = regexChannel === llmChannel;
  const agreeDataSource = regexDataSource === llmDataSource;
  const agreeSchedule = regexScheduleMode === llmScheduleMode;
  const agree = agreeChannel && agreeDataSource && agreeSchedule;

  const logPayload = {
    turn,
    regexChannel,
    llmChannel,
    regexDataSource,
    llmDataSource,
    regexScheduleMode,
    llmScheduleMode,
    agree,
    ...(llmError ? { llmError } : {}),
  };

  return logPayload;
}

/**
 * Chạy trích xuất ý định shadow và ghi log so sánh.
 * Chỉ hoạt động khi INTENT_SHADOW_ENABLED='true'. Tuyệt đối không thay đổi luồng hay throw.
 */
export async function runShadowIntentExtraction({
  text,
  locale = 'vi',
  model = null,
  regexState = {},
  turn = 0,
}) {
  if (process.env.INTENT_SHADOW_ENABLED !== 'true') {
    return null;
  }

  const { intent: llmIntent, error: llmError } = await extractIntentFromText(text, {
    locale,
    model,
  });
  const shadowLog = compareIntentShadow({ turn, regexState, llmIntent, llmError });

  // Log an toàn: không chứa nội dung tin nhắn người dùng
  console.log('[IntentShadow]', JSON.stringify(shadowLog));
  return shadowLog;
}
