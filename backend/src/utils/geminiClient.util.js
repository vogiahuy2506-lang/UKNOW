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

/**
 * Hết giờ chờ Google (đồng hồ từng lượt hoặc ngân sách tổng `totalTimeoutMs`). Trước đây ném nguyên
 * `This operation was aborted` — tiếng Anh, và khách thấy đúng câu đó ở Dashboard/Tóm tắt Hộp thư.
 * `name` giữ 'AbortError' vì `aiLandingPage.service.js` nhận ra hết giờ bằng đúng tên đó.
 */
export const AI_TIMEOUT_CODE = 'AI_TIMEOUT';
export const AI_TIMEOUT_MESSAGE = 'AI phản hồi quá lâu. Bạn vui lòng thử lại sau ít phút.';

/**
 * Mã lỗi mạng (đứt kết nối, DNS…) — gọi lại thường qua. `customChat.service.js` từng tự thử lại các mã này
 * trước khi chuyển sang lõi dùng chung; bỏ chúng đi là lùi một bước so với trước.
 */
const GEMINI_NETWORK_ERROR_CODES = Object.freeze([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
]);

export function isNetworkGeminiError(err) {
  if (!err || err.name === 'AbortError') return false;
  const code = err.code || err.cause?.code;
  if (GEMINI_NETWORK_ERROR_CODES.includes(code)) return true;
  return err.name === 'TypeError' && /fetch failed/i.test(String(err.message || ''));
}

const isRetryableGeminiError = (err) => isTransientGeminiError(err) || isNetworkGeminiError(err);

/**
 * Google trả 404 khi TÊN MODEL không còn (bị khai tử / đổi tên / không hỗ trợ generateContent), vd
 * "models/gemini-x is not found for API version v1beta, or is not supported for generateContent" (status NOT_FOUND).
 * Gọi lại y hệt chỉ nhận y hệt lỗi nên KHÔNG thử lại — nhưng đây đúng là lúc phải chuyển model dự phòng. Bản trước chỉ
 * chuyển khi 429/5xx: model bị khai tử lúc 10:00 làm cả hệ thống lỗi tới cron đồng bộ catalog 02:15 hôm sau (D-05).
 */
const MODEL_UNAVAILABLE_RE = /NOT_FOUND|not found|not supported|no longer available/i;

export function isModelUnavailableError(err) {
  return err?.geminiStatus === 404 && MODEL_UNAVAILABLE_RE.test(String(err?.message || ''));
}

/**
 * Hàm tra model dự phòng của HỆ THỐNG, do lớp trên gắn vào (aiModelPolicy.service.js tự đăng ký khi nạp). Lõi này là util nên không
 * import service/CSDL; nhờ cổng này mọi nơi gọi KHÔNG truyền `fallbackModel` đều tự có dự phòng mà không phải sửa từng nơi.
 * Chỉ được gọi LÚC CẦN (khi model chính vừa lỗi) → đường thành công không tốn thêm lượt tra nào.
 */
let fallbackModelResolver = null;

export function setGeminiFallbackModelResolver(resolver) {
  fallbackModelResolver = typeof resolver === 'function' ? resolver : null;
}

/** Tra danh mục model là việc phụ: treo quá mốc này thì coi như không có dự phòng, không kéo dài lỗi của khách. */
const FALLBACK_LOOKUP_TIMEOUT_MS = 3000;

async function resolveSystemFallbackModel() {
  if (!fallbackModelResolver) return '';
  let timer;
  try {
    const found = await Promise.race([
      Promise.resolve().then(() => fallbackModelResolver()),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), FALLBACK_LOOKUP_TIMEOUT_MS);
      }),
    ]);
    return String(found || '').trim();
  } catch (error) {
    console.warn(`[Gemini] không tra được model dự phòng hệ thống, gọi không dự phòng: ${error?.message || error}`);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** Còn dưới mốc này thì không bắt đầu thêm một lượt gọi nào nữa (một lượt Gemini không thể xong nhanh hơn). */
const MIN_ATTEMPT_WINDOW_MS = 3000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function toTimeoutError(err) {
  const timeoutError = new Error(AI_TIMEOUT_MESSAGE);
  timeoutError.name = 'AbortError';
  timeoutError.code = AI_TIMEOUT_CODE;
  timeoutError.status = 503;
  timeoutError.providerMessage = err?.message;
  return timeoutError;
}

/** Khoá API không bao giờ được nằm trong thông báo lỗi/log, kể cả khi Google (hay proxy) lỡ trích lại. */
function redactSecret(text, secret) {
  const raw = String(text ?? '');
  return secret ? raw.split(secret).join('[khoá API đã ẩn]') : raw;
}

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
 * @param {Array<{text?: string, inlineData?: {mimeType: string, data: string}}>} [input.parts] — một lượt `user`
 * @param {Array<{role: string, parts: Array}>} [input.contents] — hội thoại nhiều lượt; có thì thay cho `parts`
 * @param {number} [input.timeoutMs=180000] — đồng hồ MỖI lượt gọi
 * @param {number|null} [input.totalTimeoutMs=null] — ngân sách TỔNG (thử lại + dự phòng cộng lại); hết thì huỷ fetch đang chạy
 * @param {boolean} [input.jsonMode=false]
 * @param {number} [input.maxOutputTokens=16384]
 * @param {number} [input.temperature=0.35]
 * @param {number|null} [input.topP=0.9] — null = không gửi (để Google dùng mặc định)
 * @param {string} [input.model]
 * @param {string|null} [input.fallbackModel] — model dự phòng khi model chính quá tải (429/5xx/mạng) HOẶC không còn (404).
 *   KHÔNG truyền (undefined) → lõi tự tra model dự phòng hệ thống (xem setGeminiFallbackModelResolver), chỉ lúc model chính lỗi.
 *   `null` / '' = nơi gọi đã tra và KHÔNG có dự phòng → không tra lại. Trùng model chính thì không gọi lại.
 * @param {string|null} [input.apiKey] — khoá Gemini riêng cho lời gọi này (vd tư vấn trang chủ); trống = GEMINI_API_KEY chung
 * @param {object} [input.systemInstruction]
 * @param {number|null} [input.thinkingBudget=0] — 0 tắt thinking; null/âm = để model tự quyết
 * @param {number[]} [input.retryDelaysMs] — nghỉ trước mỗi lần thử lại khi Google quá tải
 * @param {number} [input.retryBudgetMs] — quá mốc này (tính từ lượt đầu) thì thôi thử lại
 * @returns {Promise<{ text: string, finishReason: string, blockReason: string, usage: object, modelUsed: string, fallbackUsed: boolean, raw: object }>}
 */
export async function generateGeminiContent({
  parts,
  contents = null,
  timeoutMs = 180000,
  totalTimeoutMs = null,
  jsonMode = false,
  responseSchema = null,
  maxOutputTokens = 16384,
  temperature = 0.35,
  topP = 0.9,
  model,
  fallbackModel,
  apiKey: apiKeyOverride = null,
  systemInstruction,
  thinkingBudget = 0,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  retryBudgetMs = DEFAULT_RETRY_BUDGET_MS,
} = {}) {
  const apiKey = String(apiKeyOverride ?? '').trim() || String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Thiếu GEMINI_API_KEY trong môi trường backend');
    err.status = 500;
    throw err;
  }

  const modelName = String(model || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  const startedAt = Date.now();
  const deadline = Number.isFinite(totalTimeoutMs) && totalTimeoutMs > 0 ? startedAt + totalTimeoutMs : Infinity;
  const msLeft = () => deadline - Date.now();

  const runOnce = async ({ targetModel, useThinkingBudget, tokenCap }) => {
    const remaining = msLeft();
    if (remaining <= 0) throw toTimeoutError(new Error('Hết ngân sách thời gian tổng'));
    const controller = new AbortController();
    // Đồng hồ mỗi lượt không bao giờ dài hơn phần ngân sách tổng còn lại: lượt cuối cùng cũng bị huỷ ĐÚNG hạn,
    // không để `fetch` chạy tiếp sau khi người dùng đã nhận câu xin lỗi (Google vẫn tính tiền lượt đó).
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    try {
      const generationConfig = {
        temperature,
        maxOutputTokens: tokenCap,
      };
      if (topP != null) generationConfig.topP = topP;
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
        contents: Array.isArray(contents) && contents.length > 0 ? contents : [{ role: 'user', parts }],
        generationConfig,
      };
      if (systemInstruction) {
        body.systemInstruction = systemInstruction;
      }

      // Khoá gửi bằng header, KHÔNG nằm trong URL: URL hay bị in ra log (AxiosError.config.url, lỗi fetch của proxy…).
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const bodyText = redactSecret(await response.text().catch(() => ''), apiKey);
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
        fallbackUsed: false,
        raw: data,
      };
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) throw toTimeoutError(error);
      throw error;
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

  // `undefined` = nơi gọi không nói gì → tra model dự phòng hệ thống (một lần, đúng lúc cần); null/'' = nơi gọi đã tra và không có.
  let systemFallbackPromise = null;
  const lookupFallbackModel = async () => {
    if (fallbackModel !== undefined) return String(fallbackModel || '').trim();
    if (!systemFallbackPromise) systemFallbackPromise = resolveSystemFallbackModel();
    return systemFallbackPromise;
  };

  const canTryFallback = (cleanFallback) =>
    Boolean(cleanFallback) &&
    cleanFallback !== modelName &&
    Date.now() - startedAt < retryBudgetMs &&
    msLeft() > MIN_ATTEMPT_WINDOW_MS;

  const callFallback = async (cleanFallback) => ({
    ...(await callWithThinkingFallback(cleanFallback)),
    fallbackUsed: true,
  });

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callWithThinkingFallback(modelName);
    } catch (error) {
      if (isModelUnavailableError(error)) {
        // Model chính không còn (404): thử lại vô ích, chuyển dự phòng NGAY. Không có dự phòng thì trả đúng lỗi 404 gốc.
        const cleanFallback = await lookupFallbackModel();
        if (!canTryFallback(cleanFallback)) throw error;
        console.warn(`[Gemini] ${modelName} không còn / không hỗ trợ (404), chuyển sang model dự phòng ${cleanFallback}`);
        try {
          return await callFallback(cleanFallback);
        } catch (fallbackError) {
          if (isRetryableGeminiError(fallbackError)) throw toProviderBusyError(fallbackError, 2);
          error.fallbackError = fallbackError;
          throw error;
        }
      }
      if (!isRetryableGeminiError(error)) throw error;

      const delayMs = retryDelaysMs[attempt];
      const withinBudget =
        Date.now() - startedAt < retryBudgetMs &&
        msLeft() > (delayMs ?? 0) + MIN_ATTEMPT_WINDOW_MS;
      if (delayMs === undefined || !withinBudget) {
        const cleanFallback = await lookupFallbackModel();

        if (canTryFallback(cleanFallback)) {
          console.warn(
            `[Gemini] ${modelName} quá tải sau ${attempt + 1} lượt, chuyển sang model dự phòng ${cleanFallback}`,
          );
          try {
            return await callFallback(cleanFallback);
          } catch (fallbackError) {
            if (isRetryableGeminiError(fallbackError)) {
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
        `[Gemini] ${modelName} trả ${error.geminiStatus ?? error.cause?.code ?? error.code ?? error.name} ở lượt ${attempt + 1}, thử lại sau ${delayMs}ms`,
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
 * @param {string|null} [input.fallbackModel] — như `generateGeminiContent`: không truyền = lõi tự tra dự phòng hệ thống
 * @param {number|null} [input.thinkingBudget=0]
 */
export async function generateGeminiText({
  prompt,
  timeoutMs = 120000,
  jsonMode = false,
  maxOutputTokens = 8192,
  temperature = 0.35,
  model,
  fallbackModel,
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:countTokens`;
    const body = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
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
