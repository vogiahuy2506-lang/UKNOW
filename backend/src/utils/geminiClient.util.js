/**
 * Gemini client util (Google Generative Language API).
 */

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Gọi Gemini để sinh nội dung từ danh sách các parts (hỗ trợ multimodal).
 *
 * @param {object} input
 * @param {Array<{text?: string, inlineData?: {mimeType: string, data: string}}>} input.parts Danh sách các parts gửi lên Gemini.
 * @param {number} [input.timeoutMs=180000] Timeout request (ms).
 * @param {boolean} [input.jsonMode=false] Bật responseMimeType: application/json.
 * @param {number} [input.maxOutputTokens=16384] Giới hạn token đầu ra.
 * @param {number} [input.temperature=0.35]
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string }>}
 */
export async function generateGeminiContent({
  parts,
  timeoutMs = 180000,
  jsonMode = false,
  maxOutputTokens = 16384,
  temperature = 0.35,
}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Thiếu GEMINI_API_KEY trong môi trường backend');
    err.status = 500;
    throw err;
  }

  const model = String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const generationConfig = {
      temperature,
      topP: 0.9,
      maxOutputTokens,
    };
    if (jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: parts,
          },
        ],
        generationConfig,
      }),
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
    
    if (candidate?.content?.parts) {
      console.log('[Gemini DEBUG] Raw Parts:', JSON.stringify(candidate.content.parts, null, 2));
    }
    
    // Filter only text parts (avoid thought/reasoning parts if present)
    const text = candidate?.content?.parts
      ?.filter((p) => p.text && !p.thought)
      ?.map((p) => p.text)
      .join('') || '';

    return {
      text,
      finishReason: candidate?.finishReason,
      blockReason: data.promptFeedback?.blockReason,
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
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string }>}
 */
export async function generateGeminiText({
  prompt,
  timeoutMs = 120000,
  jsonMode = false,
  maxOutputTokens = 8192,
}) {
  return generateGeminiContent({
    parts: [{ text: prompt }],
    timeoutMs,
    jsonMode,
    maxOutputTokens,
  });
}
