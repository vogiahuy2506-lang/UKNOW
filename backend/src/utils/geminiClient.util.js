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
 * Mã HTTP Google trả khi QUÁ TẢI hoặc trục trặc tạm thời — gọi lại sau vài giây thường qua.
 * 400/401/403/404 thì không: gọi lại y hệt chỉ nhận y hệt lỗi đó.
 *
 * Sự cố 24/09/2026: khách bấm sinh landing, Google trả 503 "This model is currently experiencing
 * high demand … usually temporary" sau 1,4 giây. Lớp này không thử lại lần nào, và câu lỗi chứa
 * nguyên thân JSON của Google nên khách thấy nguyên cục `{ "error": { "code": 503, … } }` bằng
 * tiếng Anh. Trong khi `customChat.service.js` (chatbot trả lời khách cuối) đã có thử lại 5xx từ
 * trước — repo có sẵn lời giải, chỉ là lớp dùng chung này không có.
 */
export const GEMINI_TRANSIENT_STATUSES = Object.freeze([429, 500, 502, 503, 504]);

export const AI_PROVIDER_BUSY_CODE = 'AI_PROVIDER_BUSY';
export const AI_PROVIDER_BUSY_MESSAGE =
  'Máy chủ AI đang quá tải tạm thời. Bạn vui lòng thử lại sau ít phút.';

/** Nghỉ trước lần thử lại thứ 1 và thứ 2 — tức tối đa 3 lượt gọi. */
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1500, 4000]);

/**
 * Chỉ thử lại khi lỗi đến NHANH. Cloudflare cắt request /api sau 100 giây, còn một lượt sinh
 * landing thành công có thể mất tới 1–2 phút. Quá tải thường bị từ chối ngay (đo: 1,4 giây) nên
 * thử lại gần như miễn phí; còn một lượt đã chạy 60 giây rồi mới hỏng thì thử lại chỉ đổi lỗi này
 * lấy lỗi hết giờ của Cloudflare. Hết ngân sách thì trả lỗi ngay.
 */
const DEFAULT_RETRY_BUDGET_MS = 20000;

export function isTransientGeminiError(err) {
  return GEMINI_TRANSIENT_STATUSES.includes(err?.geminiStatus);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Hết lượt thử mà vẫn quá tải: đổi câu lỗi sang tiếng Việt cho khách, giữ câu gốc của Google ở
 * `providerMessage` để log máy chủ vẫn đọc được. Sửa tại chỗ (không tạo Error mới) để giữ stack.
 */
function toProviderBusyError(err, attempts) {
  err.providerMessage = err.message;
  err.message = AI_PROVIDER_BUSY_MESSAGE;
  err.code = AI_PROVIDER_BUSY_CODE;
  err.status = 503;
  err.attempts = attempts;
  return err;
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
 * @param {string|null} [input.fallbackModel]
 * @param {object} [input.systemInstruction]
 * @param {number|null} [input.thinkingBudget=0] — 0 tắt thinking; null/âm = để model tự quyết
 * @param {number[]} [input.retryDelaysMs] — nghỉ trước mỗi lần thử lại khi Google quá tải
 * @param {number} [input.retryBudgetMs] — quá mốc này (tính từ lượt đầu) thì thôi thử lại
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string, usage: object, modelUsed: string }>}
 */
export async function generateGeminiContent({
  parts,
  timeoutMs = 180000,
  jsonMode = false,
  responseSchema = null,
  maxOutputTokens = 16384,
  temperature = 0.35,
  model,
  fallbackModel = null,
  systemInstruction,
  thinkingBudget = 0,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  retryBudgetMs = DEFAULT_RETRY_BUDGET_MS,
} = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Thiếu GEMINI_API_KEY trong môi trường backend');
    err.status = 500;
    throw err;
  }

  const modelName = String(model || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  const runOnce = async ({ targetModel, useThinkingBudget, tokenCap }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const generationConfig = {
        temperature,
        topP: 0.9,
        maxOutputTokens: tokenCap,
      };
      if (responseSchema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = responseSchema;
      } else if (jsonMode) {
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

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        // Câu gốc GIỮ NGUYÊN: isThinkingBudgetRejection() (ở đây và ở 3 service help/*) soi đúng
        // câu này để nhận lỗi 400 "budget 0 is invalid". Chỉ lỗi quá tải mới được đổi câu, và chỉ
        // sau khi hết lượt thử — xem toProviderBusyError().
        const err = new Error(`Gemini API lỗi (${response.status}): ${bodyText || response.statusText}`);
        err.status = 503;
        err.geminiStatus = response.status;
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
        modelUsed: targetModel,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const attachThinking = shouldAttachThinkingBudget(thinkingBudget);
  // Nhớ qua các lượt thử lại: model đã từ chối thinkingBudget một lần thì lượt sau khỏi gửi nữa,
  // không thì mỗi lượt thử lại tốn thêm một lượt 400 vô ích.
  let thinkingRejected = false;

  const callWithThinkingFallback = async (targetModel) => {
    const useThinkingBudget = attachThinking && !thinkingRejected;
    try {
      return await runOnce({
        targetModel,
        useThinkingBudget,
        tokenCap: thinkingRejected ? Math.max(maxOutputTokens, 3072) : maxOutputTokens,
      });
    } catch (error) {
      if (!useThinkingBudget || !isThinkingBudgetRejection(error)) {
        throw error;
      }
      // Model chỉ-thinking từ chối budget 0 — bỏ thinkingConfig, nới cap.
      thinkingRejected = true;
      return runOnce({
        targetModel,
        useThinkingBudget: false,
        tokenCap: Math.max(maxOutputTokens, 3072),
      });
    }
  };

  const startedAt = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callWithThinkingFallback(modelName);
    } catch (error) {
      if (!isTransientGeminiError(error)) throw error;

      const delayMs = retryDelaysMs[attempt];
      const withinBudget = Date.now() - startedAt < retryBudgetMs;
      if (delayMs === undefined || !withinBudget) {
        const cleanFallback = String(fallbackModel || '').trim();
        const canTryFallback =
          Boolean(cleanFallback) &&
          cleanFallback !== modelName &&
          Date.now() - startedAt < retryBudgetMs;

        if (canTryFallback) {
          console.warn(
            `[Gemini] ${modelName} quá tải sau ${attempt + 1} lượt, chuyển sang model dự phòng ${cleanFallback}`,
          );
          try {
            return await callWithThinkingFallback(cleanFallback);
          } catch (fallbackError) {
            if (isTransientGeminiError(fallbackError)) {
              throw toProviderBusyError(fallbackError, attempt + 2);
            }
            const primaryBusyError = toProviderBusyError(error, attempt + 1);
            primaryBusyError.fallbackError = fallbackError;
            throw primaryBusyError;
          }
        }

        throw toProviderBusyError(error, attempt + 1);
      }
      // Log để đo được tần suất về sau — trước sự cố 24/09 lỗi này không để lại dấu vết bền nào.
      console.warn(
        `[Gemini] ${modelName} trả ${error.geminiStatus} ở lượt ${attempt + 1}, thử lại sau ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
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
 * @param {string} [input.model]
 * @param {string|null} [input.fallbackModel]
 * @param {number|null} [input.thinkingBudget=0]
 */
export async function generateGeminiText({
  prompt,
  timeoutMs = 120000,
  jsonMode = false,
  maxOutputTokens = 8192,
  temperature = 0.35,
  model,
  fallbackModel = null,
  thinkingBudget = 0,
} = {}) {
  return generateGeminiContent({
    parts: [{ text: prompt }],
    timeoutMs,
    jsonMode,
    maxOutputTokens,
    temperature,
    model,
    fallbackModel,
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
