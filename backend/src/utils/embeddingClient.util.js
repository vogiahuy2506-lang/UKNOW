/**
 * Gemini embedding client.
 * Hỗ trợ gemini-embedding-001 (text-only, stable) và gemini-embedding-2 (multimodal).
 * Model cũ text-embedding-004 đã bị deprecated từ 2026-01-14.
 */

import aiUsageMeter from '../services/ai/aiUsageMeter.service.js';

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const DEFAULT_EMBEDDING_DIM = 768;

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

async function recordEmbeddingUsage(userId, data, text, { feature, model } = {}) {
  if (!userId) return;
  const usage = extractEmbeddingUsage(data, String(text || '').length);
  if (usage.totalTokens <= 0) return;

  await aiUsageMeter.record(userId, usage, {
    feature: feature || 'embedding',
    model: model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    kind: 'embedding',
  });
}

/**
 * Embed một đoạn text thành vector.
 * Sử dụng gemini-embedding-001 cho text-only, output 768chiều.
 *
 * @param {string} text
 * @param {{ userId?: number|string, feature?: string, model?: string }} [options]
 * @returns {Promise<number[]>} vector
 */
export async function embedText(text, options = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Thiếu GEMINI_API_KEY'), { status: 500 });

  const model = options.model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const outputDim = parseInt(process.env.EMBEDDING_OUTPUT_DIM || DEFAULT_EMBEDDING_DIM, 10);

  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:embedContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    model: `models/${model}`,
    content: { parts: [{ text }] },
  };

  // gemini-embedding-001 hỗ trợ task_type và output_dimensionality
  if (model === 'gemini-embedding-001') {
    requestBody.task_type = 'RETRIEVAL_DOCUMENT';
    requestBody.output_dimensionality = outputDim;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw Object.assign(
      new Error(`Embedding API lỗi (${response.status}): ${body}`),
      { status: 502 }
    );
  }

  const data = await response.json();
  const values = data?.embedding?.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding trả về không hợp lệ');
  }

  await recordEmbeddingUsage(options.userId, data, text, { feature: options.feature, model });

  // Đảm bảo vector có đúng số chiều (pad hoặc truncate nếu cần)
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
 * Embed nhiều đoạn text song song (batch).
 *
 * @param {string[]} texts
 * @param {{ userId?: number|string, feature?: string, model?: string }} [options]
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, options = {}) {
  return Promise.all(texts.map((text) => embedText(text, options)));
}
