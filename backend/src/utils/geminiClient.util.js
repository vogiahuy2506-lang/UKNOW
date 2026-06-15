/**
 * Gemini client util (Google Generative Language API).
 */

const DEFAULT_MODEL = 'gemini-2.5-flash';

export function extractGeminiUsage(data) {
  const usage = data?.usageMetadata || {};
  const promptTokens = Number(usage.promptTokenCount) || 0;
  const outputTokens = Number(usage.candidatesTokenCount) || 0;
  const totalTokens = Number(usage.totalTokenCount) || (promptTokens + outputTokens);

  return { promptTokens, outputTokens, totalTokens };
}

/**
 * Gọi Gemini để sinh nội dung từ danh sách các parts (hỗ trợ multimodal).
 *
 * @param {object} input
 * @param {Array<{text?: string, inlineData?: {mimeType: string, data: string}}>} input.parts Danh sách các parts gửi lên Gemini.
 * @param {number} [input.timeoutMs=180000] Timeout request (ms).
 * @param {boolean} [input.jsonMode=false] Bật responseMimeType: application/json.
 * @param {number} [input.maxOutputTokens=16384] Giới hạn token đầu ra.
 * @param {number} [input.temperature=0.35]
 * @param {string} [input.model]
 * @param {object} [input.systemInstruction]
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string, usage: { promptTokens: number, outputTokens: number, totalTokens: number } }>}
 */
export async function generateGeminiContent({
  parts,
  timeoutMs = 180000,
  jsonMode = false,
  maxOutputTokens = 16384,
  temperature = 0.35,
  model,
  systemInstruction,
}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Thiếu GEMINI_API_KEY trong môi trường backend');
    err.status = 500;
    throw err;
  }

  const modelName = String(model || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const generationConfig = {
      temperature,
      topP: 0.9,
      maxOutputTokens,
    };
    if (jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: parts,
        },
      ],
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

    clearTimeout(timer);

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const err = new Error(`Gemini API lỗi (${response.status}): ${bodyText || response.statusText}`);
      err.status = 502;
      throw err;
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    
    // Filter only text parts (avoid thought/reasoning parts if present)
    const text = candidate?.content?.parts
      ?.filter((p) => p.text && !p.thought)
      ?.map((p) => p.text)
      .join('') || '';

    return {
      text,
      finishReason: candidate?.finishReason,
      blockReason: data.promptFeedback?.blockReason,
      usage: extractGeminiUsage(data),
    };
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * Gọi Gemini để sinh nội dung từ prompt (text).
 *
 * @param {object} input
 * @param {string} input.prompt Prompt dạng text.
 * @param {number} [input.timeoutMs=120000] Timeout request (ms).
 * @param {boolean} [input.jsonMode=false] Bật responseMimeType: application/json.
 * @param {number} [input.maxOutputTokens=8192] Giới hạn token đầu ra.
 * @param {number} [input.temperature=0.35]
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string }>}
 */
export async function generateGeminiText({
  prompt,
  timeoutMs = 120000,
  jsonMode = false,
  maxOutputTokens = 8192,
  temperature = 0.35,
  model,
}) {
  return generateGeminiContent({
    parts: [{ text: prompt }],
    timeoutMs,
    jsonMode,
    maxOutputTokens,
    temperature,
    model,
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
