import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;
const API_KEY = 'AIza-khoa-bi-mat-help';

const resolveAllowedModel = jest.fn();
const resolveFallbackModel = jest.fn();

jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: (...args) => resolveAllowedModel(...args),
}));
jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: { resolveFallbackModel: (...args) => resolveFallbackModel(...args) },
}));
// geminiClient.util.js KHÔNG mock: lõi thật chạy, chỉ `fetch` (ranh giới với Google) được giả bằng `Response` thật.

const { generateGeminiText } = await import('../geminiText.util.js');

const googleReply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const googleOk = (text) => googleReply(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 5, totalTokenCount: 45 },
});
const googleOverloaded = () => googleReply(503, {
  error: { code: 503, message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.', status: 'UNAVAILABLE' },
});
const hangingFetch = () => jest.fn((_url, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => {
    reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
  });
}));
const urlModel = (url) => decodeURIComponent(String(url).match(/models\/([^:]+):generateContent/)?.[1] || '');
const requestBody = (i = 0) => JSON.parse(global.fetch.mock.calls[i][1].body);

async function settle(promise, advanceMs = 100_000) {
  let settled = false;
  const guarded = promise.then(
    (value) => { settled = true; return value; },
    (error) => { settled = true; throw error; },
  );
  guarded.catch(() => {});
  await jest.advanceTimersByTimeAsync(advanceMs);
  expect(settled).toBe(true);
  return guarded;
}

describe('help/geminiText.util generateGeminiText — qua lõi Gemini dùng chung (G2.3)', () => {
  let warn;

  beforeEach(() => {
    jest.useFakeTimers();
    resolveAllowedModel.mockReset();
    resolveFallbackModel.mockReset();
    resolveAllowedModel.mockResolvedValue('gemini-3.5-flash');
    resolveFallbackModel.mockResolvedValue(null);
    global.fetch = jest.fn();
    process.env.GEMINI_API_KEY = API_KEY;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    warn.mockRestore();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('giữ hợp đồng { text (đã trim), modelName, raw } — nơi gọi đọc raw.usageMetadata / raw.candidates[0].finishReason', async () => {
    global.fetch.mockResolvedValueOnce(googleOk('  hỏi_đáp \n'));

    const res = await generateGeminiText({ userId: 1, systemPrompt: 'sp', userPrompt: 'cách gửi zalo' });

    expect(res.text).toBe('hỏi_đáp');
    expect(res.modelName).toBe('gemini-3.5-flash');
    expect(res.raw.usageMetadata).toEqual({ promptTokenCount: 40, candidatesTokenCount: 5, totalTokenCount: 45 });
    expect(res.raw.candidates[0].finishReason).toBe('STOP');
  });

  it('khoá API ở header, không ở URL; systemInstruction + lượt user đúng; không gửi topP; thinkingBudget null → không gửi thinkingConfig', async () => {
    global.fetch.mockResolvedValueOnce(googleOk('ok'));

    await generateGeminiText({ userId: 1, systemPrompt: 'sp', userPrompt: 'câu hỏi', temperature: 0, maxOutputTokens: 256 });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).not.toContain('key=');
    expect(url).not.toContain(API_KEY);
    expect(init.headers['x-goog-api-key']).toBe(API_KEY);
    const body = requestBody();
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sp' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'câu hỏi' }] }]);
    expect(body.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 256 });
  });

  it('không có systemPrompt → không gửi systemInstruction; thinkingBudget 0 → gửi thinkingConfig 0', async () => {
    global.fetch.mockResolvedValueOnce(googleOk('ok'));

    await generateGeminiText({ userId: 1, userPrompt: 'q', thinkingBudget: 0 });

    const body = requestBody();
    expect(body).not.toHaveProperty('systemInstruction');
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('model chính 503 ×3 → model DỰ PHÒNG trả lời; modelName trả về là model dự phòng (để ghi usage đúng)', async () => {
    resolveFallbackModel.mockResolvedValue('gemini-du-phong');
    global.fetch
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOk('dự phòng'));

    const res = await settle(generateGeminiText({ userId: 1, userPrompt: 'q' }));

    expect(res.text).toBe('dự phòng');
    expect(res.modelName).toBe('gemini-du-phong');
    expect(global.fetch.mock.calls.map(([url]) => urlModel(url))).toEqual([
      'gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-du-phong',
    ]);
  });

  it('503 mãi → lỗi mang geminiStatus + câu tiếng Việt (bản cũ ném nguyên câu tiếng Anh của Google)', async () => {
    global.fetch.mockImplementation(async () => googleOverloaded());

    const err = await settle(generateGeminiText({ userId: 1, userPrompt: 'q' }).catch((e) => e));

    expect(err.geminiStatus).toBe(503);
    expect(err.code).toBe('AI_PROVIDER_BUSY');
    expect(err.message).not.toMatch(/high demand|UNAVAILABLE|[{}]/);
    expect(err.status).toBe(503);
  });

  it('model từ chối thinkingBudget 0 → lõi tự gỡ thinkingConfig và nới trần (không cần nơi gọi bắt lỗi)', async () => {
    global.fetch
      .mockResolvedValueOnce(googleReply(400, {
        error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.', status: 'INVALID_ARGUMENT' },
      }))
      .mockResolvedValueOnce(googleOk('hỏi_đáp'));

    const res = await settle(generateGeminiText({ userId: 1, userPrompt: 'q', maxOutputTokens: 256, thinkingBudget: 0 }));

    expect(res.text).toBe('hỏi_đáp');
    expect(requestBody(1).generationConfig.thinkingConfig).toBeUndefined();
    expect(requestBody(1).generationConfig.maxOutputTokens).toBe(3072);
  });

  it('Google treo → mặc định hết 90 giây thì huỷ fetch (bản cũ không có timeout, treo tới khi Cloudflare cắt)', async () => {
    global.fetch = hangingFetch();

    const err = await settle(generateGeminiText({ userId: 1, userPrompt: 'q' }).catch((e) => e));

    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(err.code).toBe('AI_TIMEOUT');
  });

  it('timeoutMs nơi gọi truyền vào (bộ định tuyến: 20 giây) được tôn trọng', async () => {
    global.fetch = hangingFetch();

    let settled = false;
    const pending = generateGeminiText({ userId: 1, userPrompt: 'q', timeoutMs: 20_000 }).catch((e) => e).then((v) => { settled = true; return v; });
    await jest.advanceTimersByTimeAsync(19_000);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(settled).toBe(true);
    expect((await pending).code).toBe('AI_TIMEOUT');
  });

  it('thiếu GEMINI_API_KEY → lỗi 500 tiếng Việt, không gọi Google', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(generateGeminiText({ userId: 1, userPrompt: 'q' })).rejects.toMatchObject({ status: 500 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
