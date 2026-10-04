/**
 * Gemini embedding client.
 * Hỗ trợ gemini-embedding-001 (text-only, stable) và gemini-embedding-2 (multimodal).
 * Model cũ text-embedding-004 đã bị deprecated từ 2026-01-14.
 */

import aiUsageMeter from '../services/ai/aiUsageMeter.service.js';
import { getFromCache, setToCache, getCacheKey, getCacheStats } from './embeddingCache.util.js';

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const DEFAULT_EMBEDDING_DIM = 768;

/** Tài liệu/đoạn lưu trong DB dùng RETRIEVAL_DOCUMENT; CÂU HỎI của khách dùng RETRIEVAL_QUERY (Google tối ưu hai phía theo cặp). */
export const DEFAULT_TASK_TYPE = 'RETRIEVAL_DOCUMENT';
const VALID_TASK_TYPES = new Set([
  'RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY', 'SEMANTIC_SIMILARITY', 'CLASSIFICATION',
  'CLUSTERING', 'QUESTION_ANSWERING', 'FACT_VERIFICATION', 'CODE_RETRIEVAL_QUERY',
]);

/** gemini-embedding-001 nhận tối đa 2.048 token/lời gọi; ~6.000 ký tự là mức an toàn (chia đoạn đã ≤ 1.500, đây chỉ là lưới chặn). */
export const EMBEDDING_MAX_INPUT_CHARS = 6000;
/** Số lời gọi embed chạy song song tối đa trong một lô (bản cũ `Promise.all` bắn đồng loạt: 300 đoạn = 300 request → 429). */
export const EMBEDDING_CONCURRENCY = 5;
/** Thử lại tối đa (ngoài lần đầu) khi Google trả 429/5xx hoặc đứt mạng. */
const EMBEDDING_MAX_RETRIES = 3;
const EMBEDDING_REQUEST_TIMEOUT_MS = 20000;
const EMBEDDING_MAX_BACKOFF_MS = 15000;

function resolveTaskType(options = {}) {
  return VALID_TASK_TYPES.has(options.taskType) ? options.taskType : DEFAULT_TASK_TYPE;
}

/** Cùng văn bản + cùng feature nhưng khác taskType là hai vector khác nhau → tách khoá bộ nhớ đệm. */
function cacheFeatureFor(options = {}) {
  const taskType = resolveTaskType(options);
  return taskType === DEFAULT_TASK_TYPE ? options.feature : `${options.feature || 'default'}#${taskType}`;
}

/** Cắt đầu vào theo trần ký tự, không cắt giữa cặp surrogate. */
function clampEmbeddingInput(text) {
  const value = String(text ?? '');
  if (value.length <= EMBEDDING_MAX_INPUT_CHARS) return value;
  let end = EMBEDDING_MAX_INPUT_CHARS;
  const code = value.charCodeAt(end);
  if (code >= 0xdc00 && code <= 0xdfff) end -= 1;
  return value.slice(0, end);
}

function retryBaseMs() {
  const parsed = Number(process.env.EMBEDDING_RETRY_BASE_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Nghỉ trước lần thử `attempt` (0 = lần thử lại đầu): theo `Retry-After` nếu Google gửi, không thì lùi luỹ thừa + nhiễu. */
function backoffDelayMs(attempt, retryAfterHeader) {
  const base = retryBaseMs();
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, EMBEDDING_MAX_BACKOFF_MS);
  }
  return Math.min(base * 2 ** attempt + Math.floor(Math.random() * (base / 2 + 1)), EMBEDDING_MAX_BACKOFF_MS);
}

/**
 * Normalize embedding API usage for admin token dashboard.
 *
 * @param {object} data - Gemini embedContent response body
 * @param {number} [textLength=0] - fallback estimate when API omits token counts
 */
export function extractEmbeddingUsage(data, textLength = 0) {
  const usage = data?.usageMetadata || {};
  const promptTokens = Number(usage.promptTokenCount) || 0;
  const totalTokens = Number(usage.totalTokenCount) || promptTokens;
  if (totalTokens > 0) {
    return { promptTokens, outputTokens: 0, totalTokens };
  }

  const billableChars = Number(usage.billableCharacterCount) || 0;
  const estimated = billableChars > 0
    ? Math.ceil(billableChars / 4)
    : (textLength > 0 ? Math.ceil(textLength / 4) : 0);

  return { promptTokens: estimated, outputTokens: 0, totalTokens: estimated };
}

/**
 * Ghi token của MỘT lời gọi embedding (chỉ chạy khi thật sự gọi Google — cache trúng thì không tới đây).
 *
 * `userId` rỗng = lời gọi KHÔNG CÓ CHỦ (câu hỏi trợ giúp của khách chưa đăng nhập, cron nạp lại bài hướng dẫn…): vẫn ghi,
 * `id_user = NULL` (migration 273), vì Google tính tiền các lượt này. Bản cũ `return` sớm ở đây nên trang Chi phí AI thấp hơn
 * hoá đơn. Không trừ credit (`aiUsageMeter.record` chỉ ghi `ai_token`; chính sách: embedding/RAG không trừ credit).
 */
async function recordEmbeddingUsage(userId, data, text, { feature, model } = {}) {
  const usage = extractEmbeddingUsage(data, String(text || '').length);
  if (usage.totalTokens <= 0) return;

  await aiUsageMeter.record(userId || null, usage, {
    feature: feature || 'embedding',
    model: model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    kind: 'embedding',
  });
}

/**
 * Embed một đoạn text thành vector.
 * Sử dụng gemini-embedding-001 cho text-only, output 768chiều.
 * Kết quả được cache theo userId + feature + text hash.
 *
 * @param {string} text
 * @param {{ userId?: number|string, feature?: string, model?: string, taskType?: string }} [options]
 *   `taskType: 'RETRIEVAL_QUERY'` cho CÂU HỎI (mặc định RETRIEVAL_DOCUMENT cho tài liệu)
 * @returns {Promise<number[]>} vector
 */
export async function embedText(text, options = {}) {
  const model = options.model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const outputDim = parseInt(process.env.EMBEDDING_OUTPUT_DIM || DEFAULT_EMBEDDING_DIM, 10);
  const cacheKey = getCacheKey(options.userId, cacheFeatureFor(options), text, { model, outputDim });
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await embedTextRaw(text, options);
  setToCache(cacheKey, result);
  return result;
}

/**
 * Embed text trực tiếp (không cache).
 * @param {string} text
 * @param {object} options
 * @returns {Promise<number[]>}
 */
async function embedTextRaw(text, options = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Thiếu GEMINI_API_KEY'), { status: 500 });

  const model = options.model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const outputDim = parseInt(process.env.EMBEDDING_OUTPUT_DIM || DEFAULT_EMBEDDING_DIM, 10);
  const input = clampEmbeddingInput(text);

  // Khoá gửi bằng header, KHÔNG nằm trong URL (D-08 / EXTRA-A2): URL hay bị in ra log, lỗi mạng và proxy — cùng khuôn lõi geminiClient.util.js.
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:embedContent`;

  const requestBody = {
    model: `models/${model}`,
    content: { parts: [{ text: input }] },
  };

  if (model === 'gemini-embedding-001') {
    requestBody.task_type = resolveTaskType(options);
    requestBody.output_dimensionality = outputDim;
  }

  let response = null;
  let lastNetworkError = null;
  for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES; attempt += 1) {
    response = null;
    lastNetworkError = null;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS),
      });
    } catch (networkError) {
      lastNetworkError = networkError;
    }

    if (response?.ok) break;
    // Lỗi không thể khắc phục bằng thử lại (400 sai đầu vào, 401/403 khoá…) → ném ngay, không đốt thêm lời gọi.
    if (response && !isRetryableStatus(response.status)) break;
    if (attempt < EMBEDDING_MAX_RETRIES) {
      // Đọc hết thân phản hồi bị bỏ để trả kết nối về hồ (undici giữ kết nối tới khi thân được đọc/GC).
      if (response) await Promise.resolve(response.text?.()).catch(() => {});
      await sleep(backoffDelayMs(attempt, response?.headers?.get?.('retry-after')));
    }
  }

  if (!response) {
    throw Object.assign(
      new Error(`Embedding API không phản hồi: ${lastNetworkError?.message || 'lỗi mạng'}`),
      { status: 503 }
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw Object.assign(
      new Error(`Embedding API lỗi (${response.status}): ${body}`),
      { status: 503, upstreamStatus: response.status }
    );
  }

  const data = await response.json();
  const values = data?.embedding?.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding trả về không hợp lệ');
  }

  await recordEmbeddingUsage(options.userId, data, input, { feature: options.feature, model });

  const targetDim = outputDim;
  let result = values;
  if (result.length > targetDim) {
    result = result.slice(0, targetDim);
  } else if (result.length < targetDim) {
    result = [...result, ...new Array(targetDim - result.length).fill(0)];
  }

  return result;
}

/**
 * Chạy `worker` trên từng phần tử với tối đa `limit` việc cùng lúc. Lỗi đầu tiên DỪNG việc nhận thêm phần tử mới
 * (các việc đang bay chạy nốt) rồi được ném lại — không bắn tiếp hàng trăm lời gọi tốn tiền cho một lô đã hỏng.
 */
async function runWithConcurrency(items, limit, worker) {
  let next = 0;
  let failure = null;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failure) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch (error) {
        failure = failure || { error };
        return;
      }
    }
  });
  await Promise.all(runners);
  if (failure) throw failure.error;
}

/**
 * Embed nhiều đoạn text (batch): tối đa EMBEDDING_CONCURRENCY lời gọi cùng lúc, mỗi lời gọi thử lại 429/5xx có nghỉ,
 * văn bản trùng nhau trong lô chỉ embed một lần, dùng bộ nhớ đệm để khỏi embed lại text đã có.
 * Một đoạn lỗi hẳn (hết lần thử lại) → ném lỗi cho cả lô — người gọi KHÔNG được coi lô như đã xong.
 *
 * @param {string[]} texts
 * @param {{ userId?: number|string, feature?: string, model?: string, taskType?: string }} [options]
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, options = {}) {
  const results = [];
  const pendingByKey = new Map();
  const model = options.model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const outputDim = parseInt(process.env.EMBEDDING_OUTPUT_DIM || DEFAULT_EMBEDDING_DIM, 10);
  const cacheFeature = cacheFeatureFor(options);

  for (let i = 0; i < texts.length; i++) {
    const cacheKey = getCacheKey(options.userId, cacheFeature, texts[i], { model, outputDim });
    const cached = getFromCache(cacheKey);

    if (cached) {
      results[i] = cached;
    } else {
      results[i] = null;
      const group = pendingByKey.get(cacheKey);
      if (group) group.push(i);
      else pendingByKey.set(cacheKey, [i]);
    }
  }

  const pending = [...pendingByKey.entries()];
  await runWithConcurrency(pending, EMBEDDING_CONCURRENCY, async ([cacheKey, indices]) => {
    const result = await embedTextRaw(texts[indices[0]], options);
    setToCache(cacheKey, result);
    for (const index of indices) results[index] = result;
  });

  return results;
}

export { getCacheStats };
