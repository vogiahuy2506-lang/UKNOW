import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-05 (04/10/2026): lõi `generateGeminiContent` tự tra model dự phòng HỆ THỐNG khi nơi gọi không truyền `fallbackModel`.
 * Lõi là util nên không import service — chính `aiModelPolicy.service.js` tự gắn `getFallbackModel` vào lõi khi được nạp.
 * Spec này ghim đoạn gắn đó (xoá dòng đăng ký ở policy → mọi nơi gọi không truyền lại mất dự phòng mà spec lõi vẫn xanh):
 * danh mục model giả lập ở ranh giới `getCatalog`, Google giả lập ở ranh giới `fetch` bằng `Response` thật.
 */
const getCatalog = jest.fn();
jest.unstable_mockModule('../aiModelCatalog.service.js', () => ({ getCatalog }));

await import('../aiModelPolicy.service.js');
const { generateGeminiContent, generateGeminiText } = await import('../../../utils/geminiClient.util.js');

const row = (modelId, extra = {}) => ({
  modelId, displayName: modelId, isEnabled: false, isFallback: false, supportsGenerateContent: true, ...extra,
});

const phanHoiThat = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const duocThat = (text) => phanHoiThat(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
});
const modelKhongCon = () => phanHoiThat(404, {
  error: {
    code: 404,
    message: 'models/gemini-da-khai-tu is not found for API version v1beta, or is not supported for generateContent.',
    status: 'NOT_FOUND',
  },
});
const quaTai = () => phanHoiThat(503, { error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } });

describe('aiModelPolicy gắn dự phòng hệ thống vào lõi Gemini', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  let warn;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIza-test';
    global.fetch = jest.fn();
    getCatalog.mockReset();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warn.mockRestore();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it('nơi gọi KHÔNG truyền fallbackModel + model chính 404 → lõi tra danh mục, gọi đúng model dự phòng admin đã chọn', async () => {
    getCatalog.mockResolvedValue([
      row('gemini-he-thong', { isEnabled: true }),
      row('gemini-du-phong', { isFallback: true }),
    ]);
    global.fetch.mockResolvedValueOnce(modelKhongCon()).mockResolvedValueOnce(duocThat('dự phòng đã trả lời'));

    const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-da-khai-tu' });

    expect(kq.text).toBe('dự phòng đã trả lời');
    expect(kq.modelUsed).toBe('gemini-du-phong');
    expect(String(global.fetch.mock.calls[1][0])).toContain('models/gemini-du-phong:generateContent');
  });

  it('bản bọc generateGeminiText (Dashboard, Hộp thư, dịch gói gọi bằng đây) cũng có dự phòng', async () => {
    getCatalog.mockResolvedValue([
      row('gemini-he-thong', { isEnabled: true }),
      row('gemini-du-phong', { isFallback: true }),
    ]);
    global.fetch.mockResolvedValueOnce(modelKhongCon()).mockResolvedValueOnce(duocThat('đã cứu'));

    const kq = await generateGeminiText({ prompt: 'hi', model: 'gemini-da-khai-tu' });

    expect(kq.text).toBe('đã cứu');
    expect(kq.modelUsed).toBe('gemini-du-phong');
  });

  it('quá tải 503 ×3 (không nghỉ giữa các lượt) → cũng chuyển dự phòng hệ thống', async () => {
    getCatalog.mockResolvedValue([
      row('gemini-he-thong', { isEnabled: true }),
      row('gemini-du-phong', { isFallback: true }),
    ]);
    global.fetch
      .mockResolvedValueOnce(quaTai())
      .mockResolvedValueOnce(quaTai())
      .mockResolvedValueOnce(quaTai())
      .mockResolvedValueOnce(duocThat('đã cứu'));

    const kq = await generateGeminiContent({
      parts: [{ text: 'hi' }], model: 'gemini-he-thong', retryDelaysMs: [0, 0],
    });

    expect(kq.modelUsed).toBe('gemini-du-phong');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('admin chưa chọn dự phòng → không có gì để chuyển: lỗi 404 gốc, fetch 1 lần', async () => {
    getCatalog.mockResolvedValue([row('gemini-he-thong', { isEnabled: true })]);
    global.fetch.mockResolvedValue(modelKhongCon());

    const err = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-da-khai-tu' }).catch((e) => e);

    expect(err.geminiStatus).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('model dự phòng của admin trùng model hệ thống → policy trả null (không tự chuyển sang chính nó)', async () => {
    getCatalog.mockResolvedValue([row('gemini-he-thong', { isEnabled: true, isFallback: true })]);
    global.fetch.mockResolvedValue(modelKhongCon());

    const err = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-da-khai-tu' }).catch((e) => e);

    expect(err.geminiStatus).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('tra danh mục nổ lỗi (CSDL chập chờn) → lỗi 404 của Google vẫn tới nơi gọi, không bị thay bằng lỗi CSDL', async () => {
    getCatalog.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5433'));
    global.fetch.mockResolvedValue(modelKhongCon());

    const err = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-da-khai-tu' }).catch((e) => e);

    expect(err.geminiStatus).toBe(404);
    expect(err.message).not.toContain('ECONNREFUSED');
  });
});
