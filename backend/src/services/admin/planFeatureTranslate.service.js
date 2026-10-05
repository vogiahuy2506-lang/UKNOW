import { generateGeminiText } from '../../utils/geminiClient.util.js';
import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';

/**
 * Dịch dòng "tính năng gói" (admin) từ tiếng Việt sang tiếng Anh bằng Gemini — tách khỏi controller để chia lô + ghi token + xử lý JSON hỏng
 * có test (PLAN_SUA_AI_DOT4_PR10 mục 4 + 6, D-22 / D-OLD-A5 / D-25).
 *
 * Bản cũ gửi MỌI dòng trong một lượt với `maxOutputTokens: 1024` cố định: danh sách dài thì JSON trả về bị cắt giữa chừng, `JSON.parse` ném
 * SyntaxError và admin thấy 500; lượt gọi cũng không ghi token (trang Chi phí AI thấp hơn hoá đơn Google).
 *
 * Giờ: chia lô ≤ 20 dòng / lượt (đủ rộng so với trần token; các lô chạy song song), mỗi lô ghi token `admin_plan_translate`, và kết quả
 * hỏng (JSON không đọc được / sai số dòng) → lỗi 422 có câu tiếng Việt chứ không phải 500.
 */
export const FEATURE_TRANSLATE_BATCH_SIZE = 20;
/** Trần tổng số dòng một yêu cầu (5 lô song song): đủ cho mọi danh sách tính năng thật, và chặn một yêu cầu đốt hàng chục lượt Gemini. */
export const FEATURE_TRANSLATE_MAX_TEXTS = 100;
export const FEATURE_TRANSLATE_USAGE_FEATURE = 'admin_plan_translate';
/** 20 dòng ngắn × (bản dịch + dấu JSON) vẫn dưới mức này nhiều lần; nới so với 1024 cũ cho dòng dài bất thường. */
const FEATURE_TRANSLATE_MAX_OUTPUT_TOKENS = 2048;

const httpError = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

const BAD_RESULT_MESSAGE = 'AI dịch trả về kết quả không đọc được. Bạn vui lòng thử lại, hoặc dịch ít dòng hơn mỗi lần.';

function chunkOf(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

function parseTranslations(text, expectedCount) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) throw httpError(422, BAD_RESULT_MESSAGE, 'TRANSLATE_BAD_RESULT');
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw httpError(422, BAD_RESULT_MESSAGE, 'TRANSLATE_BAD_RESULT');
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedCount || parsed.some((item) => typeof item !== 'string')) {
    throw httpError(422, BAD_RESULT_MESSAGE, 'TRANSLATE_BAD_RESULT');
  }
  return parsed;
}

async function translateBatch(batch, { model, userId }) {
  const list = batch.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = `Translate the following Vietnamese SaaS plan feature strings into concise English. Return ONLY a JSON array of strings in the same order, no explanation.\n\n${list}`;
  const result = await generateGeminiText({
    prompt,
    model,
    maxOutputTokens: FEATURE_TRANSLATE_MAX_OUTPUT_TOKENS,
    temperature: 0.1,
    jsonMode: true,
    feature: FEATURE_TRANSLATE_USAGE_FEATURE,
    ownerUserId: userId ?? null,
  });
  // Ghi token NGAY sau lượt gọi, trước khi kiểm kết quả: Google đã tính tiền kể cả khi JSON hỏng. Không trừ credit (công cụ admin).
  // `record` không bao giờ ném lỗi nên bản dịch không hỏng vì sổ.
  await aiUsageMeter.record(userId ?? null, result.usage, {
    feature: FEATURE_TRANSLATE_USAGE_FEATURE,
    model: result.modelUsed || model,
  });
  return parseTranslations(result.text, batch.length);
}

/**
 * @param {{ texts: unknown, userId?: number|null }} params
 * @returns {Promise<string[]>} bản dịch, cùng thứ tự và cùng số phần tử với `texts`
 */
export async function translateFeatureTexts({ texts, userId = null } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw httpError(400, 'texts phải là mảng không rỗng');
  }
  if (texts.length > FEATURE_TRANSLATE_MAX_TEXTS) {
    throw httpError(400, `Tối đa ${FEATURE_TRANSLATE_MAX_TEXTS} dòng mỗi lần dịch`);
  }
  if (texts.some((t) => typeof t !== 'string')) {
    throw httpError(400, 'Mỗi phần tử của texts phải là chuỗi');
  }
  // Không chọn model ở lõi: không truyền thì lớp gọi rơi về GEMINI_MODEL trong .env — tức bỏ qua model admin chọn.
  const model = await resolveAllowedModel(userId);
  const batches = chunkOf(texts, FEATURE_TRANSLATE_BATCH_SIZE);
  const translated = await Promise.all(batches.map((batch) => translateBatch(batch, { model, userId })));
  return translated.flat();
}
