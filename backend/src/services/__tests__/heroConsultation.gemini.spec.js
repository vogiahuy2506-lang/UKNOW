import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Chat tư vấn trang chủ đi qua LÕI Gemini dùng chung (D-05 / D-08 / D-01, 04/10/2026).
 *
 * Bản cũ gọi `fetch` thô: khoá nằm trong URL (`?key=`), không thử lại (một lần 503 là khách nhận ngay câu lỗi), không model dự
 * phòng, và dùng chung `GEMINI_API_KEY` với chatbot của mọi khách — một đợt đốt tiền vào đường không cần đăng nhập này làm cạn
 * hạn mức của chatbot. Google giả lập ở ranh giới `fetch` bằng `Response` THẬT (status/header/thân như Google trả).
 */
const resolveAllowedModel = jest.fn();
const record = jest.fn();
jest.unstable_mockModule('../ai/aiModelPolicy.service.js', () => ({ resolveAllowedModel }));
jest.unstable_mockModule('../ai/aiUsageMeter.service.js', () => ({ default: { record } }));

const { default: heroConsultationService, resolveHeroApiKey } = await import('../heroConsultation.service.js');
const { setGeminiFallbackModelResolver } = await import('../../utils/geminiClient.util.js');

const phanHoiThat = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const duocThat = (text) => phanHoiThat(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 60, totalTokenCount: 960 },
});
const modelKhongCon = () => phanHoiThat(404, {
  error: {
    code: 404,
    message: 'models/gemini-3.5-flash is not found for API version v1beta, or is not supported for generateContent.',
    status: 'NOT_FOUND',
  },
});

describe('heroConsultation — gọi Gemini qua lõi dùng chung', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalPublicKey = process.env.GEMINI_API_KEY_PUBLIC;
  let warn;
  let error;
  let n = 0;
  const chat = (extra = {}) => heroConsultationService.processChat({
    visitorId: `v_gemini_${(n += 1)}`, message: 'Chào', ip: `10.2.0.${n}`, ...extra,
  });

  beforeEach(() => {
    heroConsultationService._resetForTests();
    process.env.GEMINI_API_KEY = 'AIza-khoa-chung';
    delete process.env.GEMINI_API_KEY_PUBLIC;
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockResolvedValue('gemini-3.5-flash');
    record.mockReset();
    record.mockResolvedValue(undefined);
    global.fetch = jest.fn();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    setGeminiFallbackModelResolver(null);
    global.fetch = originalFetch;
    warn.mockRestore();
    error.mockRestore();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalPublicKey === undefined) delete process.env.GEMINI_API_KEY_PUBLIC;
    else process.env.GEMINI_API_KEY_PUBLIC = originalPublicKey;
  });

  describe('khoá API', () => {
    it('khoá đi bằng header x-goog-api-key, KHÔNG nằm trong URL (D-08)', async () => {
      global.fetch.mockResolvedValueOnce(duocThat('Xin chào!'));

      const res = await chat();

      expect(res).toMatchObject({ success: true, reply: 'Xin chào!' });
      const [url, init] = global.fetch.mock.calls[0];
      expect(String(url)).not.toMatch(/[?&]key=/);
      expect(String(url)).not.toContain('AIza-khoa-chung');
      expect(init.headers['x-goog-api-key']).toBe('AIza-khoa-chung');
    });

    it('GEMINI_API_KEY_PUBLIC đặt → chat tư vấn dùng khoá RIÊNG (D-01), không đụng khoá chung của chatbot khách', async () => {
      process.env.GEMINI_API_KEY_PUBLIC = 'AIza-khoa-rieng-hero';
      global.fetch.mockResolvedValueOnce(duocThat('Xin chào!'));

      await chat();

      const init = global.fetch.mock.calls[0][1];
      expect(init.headers['x-goog-api-key']).toBe('AIza-khoa-rieng-hero');
      expect(JSON.stringify(init)).not.toContain('AIza-khoa-chung');
    });

    it('GEMINI_API_KEY_PUBLIC rỗng / toàn khoảng trắng → dùng khoá chung như trước', async () => {
      process.env.GEMINI_API_KEY_PUBLIC = '   ';
      global.fetch.mockResolvedValueOnce(duocThat('Xin chào!'));

      await chat();

      expect(global.fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('AIza-khoa-chung');
    });

    it('resolveHeroApiKey: riêng thắng chung; không có riêng thì chung; không có gì thì rỗng', () => {
      process.env.GEMINI_API_KEY_PUBLIC = 'rieng';
      expect(resolveHeroApiKey()).toBe('rieng');
      delete process.env.GEMINI_API_KEY_PUBLIC;
      expect(resolveHeroApiKey()).toBe('AIza-khoa-chung');
      delete process.env.GEMINI_API_KEY;
      expect(resolveHeroApiKey()).toBe('');
    });

    it('không có khoá nào → SERVICE_UNAVAILABLE, KHÔNG gọi Google', async () => {
      delete process.env.GEMINI_API_KEY;

      const res = await chat();

      expect(res).toMatchObject({ success: false, code: 'SERVICE_UNAVAILABLE' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('Google từ chối khoá (400 "API key not valid") → SERVICE_UNAVAILABLE như trước', async () => {
      global.fetch.mockResolvedValue(phanHoiThat(400, {
        error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' },
      }));

      const res = await chat();

      expect(res).toMatchObject({ success: false, code: 'SERVICE_UNAVAILABLE' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('thử lại + dự phòng (đường trước đây KHÔNG có)', () => {
    it('503 một lần rồi được → khách nhận câu trả lời, không thấy lỗi', async () => {
      global.fetch
        .mockResolvedValueOnce(phanHoiThat(503, { error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } }))
        .mockResolvedValueOnce(duocThat('Qua rồi!'));

      const res = await chat();

      expect(res).toMatchObject({ success: true, reply: 'Qua rồi!' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    }, 15000);

    it('model hệ thống bị Google khai tử (404) + admin đã chọn dự phòng → khách vẫn được trả lời bằng model dự phòng', async () => {
      setGeminiFallbackModelResolver(async () => 'gemini-du-phong');
      global.fetch.mockResolvedValueOnce(modelKhongCon()).mockResolvedValueOnce(duocThat('Dự phòng trả lời'));

      const res = await chat();

      expect(res).toMatchObject({ success: true, reply: 'Dự phòng trả lời' });
      expect(String(global.fetch.mock.calls[1][0])).toContain('models/gemini-du-phong:generateContent');
      // Ghi sổ theo model THẬT đã trả lời (dự phòng), không phải model hệ thống.
      expect(record).toHaveBeenCalledWith(
        null,
        { promptTokens: 900, outputTokens: 60, totalTokens: 960 },
        { feature: 'hero_consultation', model: 'gemini-du-phong' },
      );
    });

    it('404 mà chưa chọn dự phòng → AI_ERROR (câu có dấu), không treo, không ném ra ngoài', async () => {
      global.fetch.mockResolvedValue(modelKhongCon());

      const res = await chat();

      expect(res).toMatchObject({ success: false, code: 'AI_ERROR' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('cấu hình sinh giữ nguyên hành vi cũ: temperature 0.3, maxOutputTokens 2048, thinkingBudget 0, KHÔNG gửi topP', async () => {
    global.fetch.mockResolvedValueOnce(duocThat('ok'));

    await chat();

    const { generationConfig, contents } = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(generationConfig).toMatchObject({ temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } });
    expect(generationConfig).not.toHaveProperty('topP');
    expect(contents[0].parts[0].text).toContain('Người dùng hỏi: Chào');
  });
});
