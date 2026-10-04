import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;
const resolveAllowedModel = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const resolveFallbackModel = jest.fn();
const buildAiPartsFromHistory = jest.fn();

// customChat.service đọc hồ sơ + sản phẩm của chủ (widget/trang /chat) — mock ở ranh giới, mặc định không có hồ sơ.
const mockFormattedProfile = jest.fn(async () => '');
jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../businessProfile.service.js', () => ({ default: { getFormattedProfileForPrompt: (...args) => mockFormattedProfile(...args) } }));
jest.unstable_mockModule('../../../utils/fileExtractor.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({ stripMarkdown: (t) => t }));
// geminiClient.util.js KHÔNG mock: lõi thật chạy, chỉ `fetch` (ranh giới với Google) được giả bằng `Response` thật.
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve: (...args) => reserve(...args),
    record: (...args) => record(...args),
    resolveFallbackModel: (...args) => resolveFallbackModel(...args),
  },
}));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: (...args) => resolveAllowedModel(...args),
}));
jest.unstable_mockModule('../../chatbot/chatAttachment.service.js', () => ({
  default: { buildAiPartsFromHistory: (...args) => buildAiPartsFromHistory(...args) },
}));

const { default: customChatService } = await import('../customChat.service.js');

/** Phản hồi HTTP THẬT như Google trả (status, header, thân JSON). */
const googleReply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const googleOk = (text, usage = { promptTokenCount: 50, candidatesTokenCount: 8, totalTokenCount: 58 }) => googleReply(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: usage,
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

/** Chạy hết đồng hồ giả (nghỉ giữa các lượt thử lại, hạn 25 giây) rồi trả kết quả, KHÔNG để lời hứa treo. */
async function settle(promise, advanceMs = 40_000) {
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

const consoleSpies = [];
const silenceConsole = (...methods) => {
  for (const method of methods) consoleSpies.push(jest.spyOn(console, method).mockImplementation(() => {}));
};
const restoreConsole = () => {
  while (consoleSpies.length) consoleSpies.pop().mockRestore();
};

beforeEach(() => {
  jest.useFakeTimers();
  resolveAllowedModel.mockReset();
  reserve.mockReset();
  record.mockReset();
  resolveFallbackModel.mockReset();
  buildAiPartsFromHistory.mockReset();
  resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
  reserve.mockResolvedValue({ maxOutputTokens: 100 });
  record.mockResolvedValue(undefined);
  resolveFallbackModel.mockResolvedValue(null);
  buildAiPartsFromHistory.mockResolvedValue([]);
  process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-customchat';
  silenceConsole('log', 'warn', 'error');
});

afterEach(() => {
  jest.useRealTimers();
  restoreConsole();
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
});

describe('customChat.callGeminiWithRetry — đi qua lõi Gemini dùng chung (G2.2)', () => {
  it('gửi thinkingConfig budget 0, lọc thought parts, khoá API ở header (không ở URL), không gửi topP', async () => {
    global.fetch = jest.fn().mockResolvedValue(googleReply(200, {
      candidates: [{ content: { parts: [{ text: 'nghĩ thầm', thought: true }, { text: 'Chào bạn' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
    }));

    const res = await settle(customChatService.callGeminiWithRetry('hi', { maxTokens: 2048, userId: 1 }));

    expect(res.text).toBe('Chào bạn');
    expect(res.usage).toEqual({ promptTokens: 5, outputTokens: 2, totalTokens: 7 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig).not.toHaveProperty('topP');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
    expect(url).not.toContain('key=');
    expect(url).not.toContain('AIza-khoa-bi-mat-customchat');
    expect(init.headers['x-goog-api-key']).toBe('AIza-khoa-bi-mat-customchat');
  });

  it('budget-0 bị model chỉ-thinking từ chối → bỏ thinkingConfig, nới cap ≥3072, thành công ngay lượt kế', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(googleReply(400, {
        error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.', status: 'INVALID_ARGUMENT' },
      }))
      .mockResolvedValueOnce(googleOk('cứu'));

    const res = await settle(customChatService.callGeminiWithRetry('hi', { maxTokens: 512, userId: 1 }));

    expect(res.text).toBe('cứu');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(global.fetch.mock.calls[0][1].body);
    const second = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(first.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(second.generationConfig.thinkingConfig).toBeUndefined();
    expect(second.generationConfig.maxOutputTokens).toBe(3072); // Math.max(min(512,65536), 3072)
  });

  it('429 → được THỬ LẠI (bản cũ chỉ thử lại 5xx nên khách nhận lỗi ngay)', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(googleReply(429, { error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }))
      .mockResolvedValueOnce(googleOk('Dạ có ạ'));

    const res = await settle(customChatService.callGeminiWithRetry('hi', { userId: 1 }));

    expect(res.text).toBe('Dạ có ạ');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('model chính 503 liên tục → chuyển MODEL DỰ PHÒNG, trả modelUsed = dự phòng', async () => {
    resolveFallbackModel.mockResolvedValue('gemini-du-phong');
    global.fetch = jest.fn()
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOk('Dạ dự phòng đây ạ'));

    const res = await settle(customChatService.callGeminiWithRetry('hi', { userId: 1 }));

    expect(res.text).toBe('Dạ dự phòng đây ạ');
    expect(res.modelUsed).toBe('gemini-du-phong');
    expect(global.fetch.mock.calls.map(([url]) => urlModel(url))).toEqual([
      'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-du-phong',
    ]);
  });

  it('503 mãi, chưa chọn dự phòng → ném lỗi sau 3 lượt, câu của khách là tiếng Việt (không phải JSON Google)', async () => {
    global.fetch = jest.fn().mockImplementation(async () => googleOverloaded());

    const err = await settle(customChatService.callGeminiWithRetry('hi', { userId: 1 }).catch((e) => e));

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(err.status).toBe(503);
    expect(err.code).toBe('AI_PROVIDER_BUSY');
    expect(err.message).not.toMatch(/[{}]|UNAVAILABLE|high demand/);
  });

  it('Google treo → hết ngân sách 25 giây thì fetch bị HUỶ THẬT (bản cũ: 3 × 30 giây, chạm trần Cloudflare)', async () => {
    global.fetch = hangingFetch();

    const err = await settle(customChatService.callGeminiWithRetry('hi', { userId: 1 }).catch((e) => e), 26_000);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(err.name).toBe('AbortError');
    expect(err.code).toBe('AI_TIMEOUT');
  });

  describe('bỏ ảnh khi model không nhận ảnh (logic riêng được giữ)', () => {
    const partsWithImage = [{ text: 'khách gửi ảnh' }, { inline_data: { mime_type: 'image/png', data: 'AAAA' } }];
    const imageRejected = () => googleReply(400, {
      error: { code: 400, message: 'Unable to process input image: inline_data mime type is not supported', status: 'INVALID_ARGUMENT' },
    });

    it('400 liên quan ảnh → thử lại MỘT lần chỉ còn chữ + dòng "[Không đọc được ảnh đính kèm]"', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce(imageRejected())
        .mockResolvedValueOnce(googleOk('Mình chưa xem được ảnh ạ'));

      const res = await settle(customChatService.callGeminiWithRetry(partsWithImage, { userId: 1 }));

      expect(res.text).toBe('Mình chưa xem được ảnh ạ');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const first = JSON.parse(global.fetch.mock.calls[0][1].body);
      const second = JSON.parse(global.fetch.mock.calls[1][1].body);
      expect(first.contents[0].parts.some((p) => p.inline_data)).toBe(true);
      expect(second.contents[0].parts.some((p) => p.inline_data)).toBe(false);
      expect(second.contents[0].parts.map((p) => p.text)).toContain('[Không đọc được ảnh đính kèm]');
    });

    it('lượt bỏ ảnh dùng PHẦN CÒN LẠI của ngân sách 25 giây, không phải 25 giây mới', async () => {
      global.fetch = jest.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { setTimeout(() => resolve(imageRejected()), 10_000); }))
        .mockImplementationOnce(hangingFetch());

      let settled = false;
      const pending = customChatService.callGeminiWithRetry(partsWithImage, { userId: 1 }).catch((e) => e).then((v) => { settled = true; return v; });

      await jest.advanceTimersByTimeAsync(24_000);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1_500); // tổng 25,5 giây — còn nằm trong "25 giây MỚI" của bản lỗi nếu có
      expect(settled).toBe(true);
      expect((await pending).code).toBe('AI_TIMEOUT');
    });

    it('400 KHÔNG liên quan ảnh (chính sách nội dung…) → không bỏ ảnh, lỗi ném ra như thường', async () => {
      global.fetch = jest.fn().mockResolvedValue(googleReply(400, {
        error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' },
      }));

      const err = await settle(customChatService.callGeminiWithRetry(partsWithImage, { userId: 1 }).catch((e) => e));

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.geminiStatus).toBe(400);
    });
  });
});

describe('customChat.chat — câu lỗi cho khách + ghi token theo model thật (G2.2)', () => {
  const chatArgs = {
    history: [{ role: 'user', content: 'xin chao' }],
    chatbotId: 1,
    userId: 2,
    systemInstruction: 'Ban la tro ly cua shop.',
    temperature: 0.7,
    maxTokens: 100,
  };
  let searchSpy;

  beforeEach(() => {
    searchSpy = jest.spyOn(customChatService, 'searchChunks').mockResolvedValue([]);
  });

  afterEach(() => {
    searchSpy.mockRestore();
  });

  it('Google quá tải mãi → khách nhận câu tiếng Việt UPSTREAM_ERROR, KHÔNG ghi token', async () => {
    global.fetch = jest.fn().mockImplementation(async () => googleOverloaded());

    const err = await settle(customChatService.chat(chatArgs).catch((e) => e));

    expect(err.status).toBe(503);
    expect(err.code).toBe('UPSTREAM_ERROR');
    expect(err.message).toBe('AI gặp sự cố tạm thời, vui lòng thử lại.');
    expect(record).not.toHaveBeenCalled();
  });

  it('model chính quá tải, dự phòng trả lời → khách nhận câu trả lời; token ghi theo model DỰ PHÒNG', async () => {
    resolveFallbackModel.mockResolvedValue('gemini-du-phong');
    global.fetch = jest.fn()
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOk('Dạ dự phòng đây ạ'));

    const res = await settle(customChatService.chat(chatArgs));

    expect(res).toEqual({ content: 'Dạ dự phòng đây ạ', type: 'text' });
    expect(record).toHaveBeenCalledWith(
      2,
      { promptTokens: 50, outputTokens: 8, totalTokens: 58 },
      { feature: 'kb_chat', model: 'gemini-du-phong' },
    );
  });

  it('Google treo → khách nhận câu TIMEOUT tiếng Việt trong ≤ 25 giây', async () => {
    global.fetch = hangingFetch();

    const err = await settle(customChatService.chat(chatArgs).catch((e) => e), 26_000);

    expect(err.status).toBe(503);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('AI đang bận, vui lòng thử lại sau vài giây.');
  });

  it('thiếu GEMINI_API_KEY → lỗi 500, KHÔNG gọi Google, câu không còn là tiếng Anh "GEMINI_API_KEY not configured"', async () => {
    delete process.env.GEMINI_API_KEY;
    global.fetch = jest.fn();

    const err = await settle(customChatService.chat(chatArgs).catch((e) => e));

    expect(err.status).toBe(500);
    expect(err.message).not.toMatch(/not configured/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('customChat.chat — phong cách trả lời (responseStyle)', () => {
  const runChat = async (extra = {}) => {
    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
    const svc = customChatService;
    const searchSpy = jest.spyOn(svc, 'searchChunks').mockResolvedValue([]);
    const callSpy = jest.spyOn(svc, 'callGeminiWithRetry').mockResolvedValue({ text: 'ok', usage: {} });
    reserve.mockResolvedValue({ maxOutputTokens: 100 });
    record.mockResolvedValue(undefined);
    buildAiPartsFromHistory.mockResolvedValue([]);
    await svc.chat({
      history: [{ role: 'user', content: 'xin chao' }],
      chatbotId: 1,
      userId: 2,
      systemInstruction: 'Ban la tro ly cua shop.',
      temperature: 0.7,
      maxTokens: 100,
      ...extra,
    });
    const text = callSpy.mock.calls[0][1].systemInstruction.parts[0].text;
    searchSpy.mockRestore();
    callSpy.mockRestore();
    return text;
  };

  it("responseStyle 'professional' -> prompt chứa câu phong cách chuyên nghiệp", async () => {
    const text = await runChat({ responseStyle: 'professional' });
    expect(text).toContain('## PHONG CACH TRA LOI\nChuyen nghiep, ngan gon, suc tich.');
    expect(text).toContain('Ban la tro ly cua shop.');
  });

  it("responseStyle 'casual' -> prompt chứa câu phong cách thoải mái", async () => {
    const text = await runChat({ responseStyle: 'casual' });
    expect(text).toContain('Than thien nhung thoai mai, co the dung tieng long nhe.');
  });

  it('không truyền responseStyle -> khung chung dùng mặc định friendly (như đường kênh khi cột response_style trống)', async () => {
    const text = await runChat();
    expect(text).toContain('## PHONG CACH TRA LOI\nThan thien, gan gui, dung emoji phu hop.');
  });
});
