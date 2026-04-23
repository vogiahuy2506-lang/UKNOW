/**
 * Gemini client util (Google Generative Language API).
 *
 * Lưu ý bảo mật:
 * - API key phải nằm ở backend env, KHÔNG gửi xuống frontend.
 * - Endpoint backend sẽ gọi Gemini và trả về insight đã xử lý.
 *
 * Ghi chú model:
 * - Một số tên model cũ (ví dụ `gemini-1.5-flash` không suffix) có thể trả 404 trên v1beta.
 * - Mặc định dùng `gemini-2.0-flash`; có thể override bằng `GEMINI_MODEL` (vd `gemini-2.5-flash` — trần output token cao hơn, phù hợp JSON insight dài).
 */

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Gọi Gemini để sinh nội dung từ prompt (text).
 *
 * Luồng hoạt động:
 * 1. Lấy `GEMINI_API_KEY` + `GEMINI_MODEL` từ env.
 * 2. Gọi endpoint `generateContent`.
 * 3. Gom text từ response parts và trả về chuỗi.
 *
 * @param {object} input
 * @param {string} input.prompt Prompt dạng text.
 * @param {number} [input.timeoutMs=120000] Timeout request (ms) — insight JSON dài cần thời gian hơn.
 * @param {boolean} [input.jsonMode=false] Bật `responseMimeType: application/json` để giảm lỗi JSON bị cắt/thừa text.
 * @param {number} [input.maxOutputTokens=8192] Giới hạn token đầu ra (JSON phân tích dài).
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string }>} text + lý do kết thúc (debug / retry)
 */
export async function generateGeminiText({
  prompt,
  timeoutMs = 120000,
  jsonMode = false,
  maxOutputTokens = 8192,
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
      temperature: 0.35,
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
            parts: [{ text: String(prompt || '') }],
          },
        ],
        generationConfig,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const err = new Error(`Gemini API lỗi (${response.status}): ${bodyText || response.statusText}`);
      err.status = 502;
      throw err;
    }

    const data = await response.json();
    const firstCand = data?.candidates?.[0];
    const finishReason = String(firstCand?.finishReason || '').trim();
    const blockReason = String(data?.promptFeedback?.blockReason || '').trim();

    const text = (data?.candidates || [])
      .flatMap((c) => c?.content?.parts || [])
      .map((p) => p?.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    return { text, finishReason, blockReason };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const err = new Error('Gemini API quá thời gian xử lý, vui lòng thử lại');
      err.status = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
