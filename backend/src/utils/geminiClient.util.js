/**
 * Gemini client util (Google Generative Language API).
 */

const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Model chỉ-thinking (vd gemini-2.5-pro) từ chối thinkingBudget: 0. */
export const THINKING_BUDGET_RETRY_RE = /budget 0 is invalid|thinking mode|thinking_?budget/i;

export function isThinkingBudgetRejection(err) {
  return THINKING_BUDGET_RETRY_RE.test(String(err?.message || ''));
}

/**
 * Join candidate text parts, skipping thought/reasoning parts.
 * @param {Array<{text?: string, thought?: boolean}>|undefined} parts
 * @returns {string}
 */
export function joinGeminiTextParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p?.text && !p.thought)
    .map((p) => p.text)
    .join('');
}

export function extractGeminiUsage(data) {
  const usage = data?.usageMetadata || {};
  const promptTokens = Number(usage.promptTokenCount) || 0;
  const outputTokens = Number(usage.candidatesTokenCount) || 0;
  const totalTokens = Number(usage.totalTokenCount) || (promptTokens + outputTokens);

  return { promptTokens, outputTokens, totalTokens };
}

function shouldAttachThinkingBudget(thinkingBudget) {
  return Number.isFinite(thinkingBudget) && thinkingBudget >= 0;
}

/**
 * Gọi Gemini để sinh nội dung từ danh sách các parts (hỗ trợ multimodal).
 *
 * @param {object} input
 * @param {Array<{text?: string, inlineData?: {mimeType: string, data: string}}>} input.parts
 * @param {number} [input.timeoutMs=180000]
 * @param {boolean} [input.jsonMode=false]
 * @param {number} [input.maxOutputTokens=16384]
 * @param {number} [input.temperature=0.35]
 * @param {string} [input.model]
 * @param {object} [input.systemInstruction]
 * @param {number|null} [input.thinkingBudget=0] — 0 tắt thinking; null/âm = để model tự quyết
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string, usage: object }>}
 */
export async function generateGeminiContent({
  parts,
  timeoutMs = 180000,
  jsonMode = false,
  maxOutputTokens = 16384,
  temperature = 0.35,
  model,
  systemInstruction,
  thinkingBudget = 0,
} = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Thiếu GEMINI_API_KEY trong môi trường backend');
    err.status = 500;
    throw err;
  }

  const modelName = String(model || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const runOnce = async ({ useThinkingBudget, tokenCap }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const generationConfig = {
        temperature,
        topP: 0.9,
        maxOutputTokens: tokenCap,
      };
      if (jsonMode) {
        generationConfig.responseMimeType = 'application/json';
      }
      if (useThinkingBudget && shouldAttachThinkingBudget(thinkingBudget)) {
        generationConfig.thinkingConfig = { thinkingBudget };
      }

      const body = {
        contents: [{ role: 'user', parts }],
        generationConfig,
      };
      if (systemInstruction) {
        body.systemInstruction = systemInstruction;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        const err = new Error(`Gemini API lỗi (${response.status}): ${bodyText || response.statusText}`);
        err.status = 502;
        throw err;
      }

      const data = await response.json();
      const candidate = data.candidates && data.candidates[0];
      const text = joinGeminiTextParts(candidate?.content?.parts);

      return {
        text,
        finishReason: candidate?.finishReason,
        blockReason: data.promptFeedback?.blockReason,
        usage: extractGeminiUsage(data),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const attachThinking = shouldAttachThinkingBudget(thinkingBudget);
  try {
    return await runOnce({ useThinkingBudget: attachThinking, tokenCap: maxOutputTokens });
  } catch (error) {
    if (!attachThinking || !isThinkingBudgetRejection(error)) {
      throw error;
    }
    // Model chỉ-thinking từ chối budget 0 — bỏ thinkingConfig, nới cap.
    return runOnce({
      useThinkingBudget: false,
      tokenCap: Math.max(maxOutputTokens, 3072),
    });
  }
}

/**
 * Gọi Gemini để sinh nội dung từ prompt (text).
 *
 * @param {object} input
 * @param {string} input.prompt
 * @param {number} [input.timeoutMs=120000]
 * @param {boolean} [input.jsonMode=false]
 * @param {number} [input.maxOutputTokens=8192]
 * @param {number} [input.temperature=0.35]
 * @param {number|null} [input.thinkingBudget=0]
 */
export async function generateGeminiText({
  prompt,
  timeoutMs = 120000,
  jsonMode = false,
  maxOutputTokens = 8192,
  temperature = 0.35,
  model,
  thinkingBudget = 0,
} = {}) {
  return generateGeminiContent({
    parts: [{ text: prompt }],
    timeoutMs,
    jsonMode,
    maxOutputTokens,
    temperature,
    model,
    thinkingBudget,
  });
}

export async function countGeminiTokens({
  model,
  contents,
  systemInstruction,
  timeoutMs = 15000,
}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const modelName = String(model || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:countTokens?key=${encodeURIComponent(apiKey)}`;
    const body = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timer);

    if (!response.ok) return null;
    const data = await response.json();
    const total = Number(data?.totalTokens);
    return Number.isFinite(total) && total >= 0 ? total : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
