import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { generateGeminiContent, generateGeminiText } from '../geminiClient.util.js';
import { setAiCallObserver, hasAiCallObserver } from '../aiCallObserver.util.js';

/**
 * PR-10 mục 3(a): MỖI lần gọi `generateGeminiContent` báo ĐÚNG MỘT sự kiện cho người quan sát (sổ bền ai_call_events), phân loại đúng
 * ok / fallback_ok / busy / timeout / client_closed / blocked / error — và người quan sát hỏng KHÔNG làm hỏng lượt AI.
 * Google được giả lập ở RANH GIỚI `fetch` bằng `Response` thật (đúng hình dạng phản hồi), lõi là mã thật.
 */
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const okBody = (text = 'xin chào', extra = {}) => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
  ...extra,
});
const overloaded = () => json(503, { error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } });
const modelGone = () => json(404, {
  error: { code: 404, message: 'models/gemini-x is not found for API version v1beta, or is not supported for generateContent.', status: 'NOT_FOUND' },
});

describe('lõi Gemini báo sự kiện cho sổ bền', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  let events;
  let warn;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIza-test';
    global.fetch = jest.fn();
    events = [];
    setAiCallObserver((event) => { events.push(event); });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setAiCallObserver(null);
    global.fetch = originalFetch;
    warn.mockRestore();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  const common = { parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: null, retryDelaysMs: [0, 0] };

  it('đã gắn người quan sát thì hasAiCallObserver = true', () => {
    expect(hasAiCallObserver()).toBe(true);
  });

  it('lượt thành công → ĐÚNG MỘT sự kiện ok, đủ feature/model/chủ/người thao tác/thời gian/finishReason', async () => {
    global.fetch.mockResolvedValueOnce(json(200, okBody()));
    const result = await generateGeminiContent({ ...common, feature: 'chatbot_reply', ownerUserId: 7, actorUserId: 9 });
    expect(result.text).toBe('xin chào');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'generate',
      feature: 'chatbot_reply',
      model: 'gemini-chinh',
      outcome: 'ok',
      httpStatus: null,
      errorCode: null,
      ownerUserId: 7,
      actorUserId: 9,
      meta: { finishReason: 'STOP', fallbackUsed: false },
    });
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('thiếu feature → undefined ở lõi (service ép thành "unknown"); không truyền chủ → null', async () => {
    global.fetch.mockResolvedValueOnce(json(200, okBody()));
    await generateGeminiContent(common);
    expect(events[0].feature).toBeUndefined();
    expect(events[0]).toMatchObject({ ownerUserId: null, actorUserId: null });
  });

  it('503 rồi thử lại thành công → VẪN chỉ MỘT sự kiện ok (thử lại là chi tiết của cùng một lần gọi)', async () => {
    global.fetch.mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(json(200, okBody()));
    await generateGeminiContent({ ...common, feature: 'x' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe('ok');
  });

  it('model chính quá tải hết lượt, model dự phòng trả lời → fallback_ok, ghi model THẬT + model chính', async () => {
    global.fetch
      .mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(overloaded())
      .mockResolvedValueOnce(json(200, okBody('từ dự phòng')));
    const result = await generateGeminiContent({ ...common, fallbackModel: 'gemini-du-phong', feature: 'x' });
    expect(result.fallbackUsed).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      outcome: 'fallback_ok',
      model: 'gemini-du-phong',
      meta: { fallbackUsed: true, primaryModel: 'gemini-chinh' },
    });
  });

  it('quá tải hết lượt thử, KHÔNG có dự phòng → busy, mã HTTP THẬT của Google, lỗi vẫn ném nguyên cho nơi gọi', async () => {
    global.fetch.mockResolvedValue(overloaded());
    await expect(generateGeminiContent({ ...common, feature: 'x' })).rejects.toMatchObject({ code: 'AI_PROVIDER_BUSY' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'busy', httpStatus: 503, errorCode: 'AI_PROVIDER_BUSY', model: 'gemini-chinh' });
    expect(events[0].meta).toMatchObject({ attempts: 3, fallbackTried: false });
  });

  it('model chính VÀ dự phòng đều quá tải → busy + fallbackTried', async () => {
    global.fetch.mockResolvedValue(overloaded());
    await expect(generateGeminiContent({ ...common, fallbackModel: 'gemini-du-phong' })).rejects.toMatchObject({ code: 'AI_PROVIDER_BUSY' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'busy', meta: { fallbackTried: true } });
  });

  it('model chính bị khai tử (404), không có dự phòng → error + mã MODEL_NOT_FOUND + http 404', async () => {
    global.fetch.mockResolvedValue(modelGone());
    await expect(generateGeminiContent({ ...common, feature: 'x' })).rejects.toMatchObject({ geminiStatus: 404 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'error', httpStatus: 404, errorCode: 'MODEL_NOT_FOUND' });
  });

  it('lỗi 400 thường → error, mã GEMINI_400', async () => {
    global.fetch.mockResolvedValue(json(400, { error: { code: 400, message: 'bad request' } }));
    await expect(generateGeminiContent(common)).rejects.toMatchObject({ geminiStatus: 400 });
    expect(events[0]).toMatchObject({ outcome: 'error', httpStatus: 400, errorCode: 'GEMINI_400' });
  });

  it('Google treo quá hạn → timeout (không có mã HTTP vì Google chưa trả lời)', async () => {
    global.fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    await expect(generateGeminiContent({ ...common, timeoutMs: 15, totalTimeoutMs: 15 })).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'timeout', errorCode: 'AI_TIMEOUT', httpStatus: null });
  });

  it('người dùng đóng kết nối (signal đã huỷ) → client_closed, không gọi Google', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(generateGeminiContent({ ...common, signal: controller.signal })).rejects.toMatchObject({ code: 'AI_CLIENT_ABORTED' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'client_closed', errorCode: 'AI_CLIENT_ABORTED' });
  });

  it('Google chặn nội dung (blockReason) → blocked, mã là lý do chặn', async () => {
    global.fetch.mockResolvedValueOnce(json(200, { candidates: [], promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: {} }));
    const result = await generateGeminiContent(common);
    expect(result.blockReason).toBe('SAFETY');
    expect(events[0]).toMatchObject({ outcome: 'blocked', errorCode: 'SAFETY' });
  });

  it('generateGeminiText chuyển feature / chủ xuống lõi', async () => {
    global.fetch.mockResolvedValueOnce(json(200, okBody()));
    await generateGeminiText({ prompt: 'hi', model: 'gemini-chinh', fallbackModel: null, feature: 'admin_plan_translate', ownerUserId: 3 });
    expect(events[0]).toMatchObject({ feature: 'admin_plan_translate', ownerUserId: 3, outcome: 'ok' });
  });

  describe('KHÔNG làm hỏng lượt AI', () => {
    it('người quan sát ném lỗi ĐỒNG BỘ → lượt thành công vẫn trả kết quả', async () => {
      setAiCallObserver(() => { throw new Error('quan sát hỏng'); });
      global.fetch.mockResolvedValueOnce(json(200, okBody('vẫn đến tay khách')));
      await expect(generateGeminiContent(common)).resolves.toMatchObject({ text: 'vẫn đến tay khách' });
    });

    it('người quan sát trả lời hứa bị từ chối → không rò unhandledRejection, lượt vẫn xong', async () => {
      const unhandled = jest.fn();
      process.once('unhandledRejection', unhandled);
      setAiCallObserver(() => Promise.reject(new Error('ghi sổ hỏng')));
      global.fetch.mockResolvedValueOnce(json(200, okBody()));
      await expect(generateGeminiContent(common)).resolves.toMatchObject({ text: 'xin chào' });
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      process.removeListener('unhandledRejection', unhandled);
      expect(unhandled).not.toHaveBeenCalled();
    });

    it('lượt LỖI mà người quan sát cũng ném → nơi gọi vẫn nhận ĐÚNG lỗi gốc của Google, không phải lỗi của người quan sát', async () => {
      setAiCallObserver(() => { throw new Error('quan sát hỏng'); });
      global.fetch.mockResolvedValue(json(400, { error: { code: 400, message: 'bad request' } }));
      await expect(generateGeminiContent(common)).rejects.toMatchObject({ geminiStatus: 400 });
    });

    it('chưa gắn người quan sát → lõi chạy như cũ', async () => {
      setAiCallObserver(null);
      global.fetch.mockResolvedValueOnce(json(200, okBody()));
      await expect(generateGeminiContent(common)).resolves.toMatchObject({ text: 'xin chào' });
    });
  });
});
