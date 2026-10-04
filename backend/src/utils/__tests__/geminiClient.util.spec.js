import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AI_PROVIDER_BUSY_CODE,
  AI_PROVIDER_BUSY_MESSAGE,
  AI_TIMEOUT_CODE,
  AI_TIMEOUT_MESSAGE,
  countGeminiTokens,
  extractGeminiUsage,
  GEMINI_TRANSIENT_STATUSES,
  generateGeminiContent,
  generateGeminiText,
  isModelUnavailableError,
  isThinkingBudgetRejection,
  joinGeminiTextParts,
  setGeminiFallbackModelResolver,
  THINKING_BUDGET_RETRY_RE,
} from '../geminiClient.util.js';

describe('geminiClient.util', () => {
  describe('extractGeminiUsage', () => {
    it('maps Gemini usageMetadata to normalized token counts', () => {
      expect(extractGeminiUsage({
        usageMetadata: {
          promptTokenCount: 123,
          candidatesTokenCount: 45,
          totalTokenCount: 168,
        },
      })).toEqual({
        promptTokens: 123,
        outputTokens: 45,
        totalTokens: 168,
      });
    });

    it('falls back to prompt + output tokens when totalTokenCount is missing', () => {
      expect(extractGeminiUsage({
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
        },
      })).toEqual({
        promptTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      });
    });
  });

  describe('joinGeminiTextParts / isThinkingBudgetRejection', () => {
    it('skips thought parts', () => {
      expect(joinGeminiTextParts([
        { text: 'secret', thought: true },
        { text: 'hello' },
        { text: ' world' },
      ])).toBe('hello world');
    });

    it('detects thinking-budget rejection messages', () => {
      expect(isThinkingBudgetRejection(new Error('Budget 0 is invalid. This model only works in thinking mode.'))).toBe(true);
      expect(THINKING_BUDGET_RETRY_RE.test('thinking_budget is not supported')).toBe(true);
      expect(isThinkingBudgetRejection(new Error('Thiếu GEMINI_API_KEY'))).toBe(false);
    });
  });

  describe('generateGeminiContent thinkingBudget', () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.GEMINI_API_KEY;

    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    });

    function mockOk(text = 'ok') {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      });
    }

    it('defaults to thinkingBudget 0 in generationConfig', async () => {
      mockOk();
      await generateGeminiContent({ parts: [{ text: 'hi' }], maxOutputTokens: 100 });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
      expect(body.generationConfig.maxOutputTokens).toBe(100);
    });

    it('sends custom positive thinkingBudget', async () => {
      mockOk();
      await generateGeminiContent({ parts: [{ text: 'hi' }], thinkingBudget: 512 });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 512 });
    });

    it.each([null, -1])('omits thinkingConfig when thinkingBudget is %p', async (budget) => {
      mockOk();
      await generateGeminiContent({ parts: [{ text: 'hi' }], thinkingBudget: budget });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.generationConfig.thinkingConfig).toBeUndefined();
    });

    it('retries without thinkingConfig when model rejects budget 0', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Budget 0 is invalid. This model only works in thinking mode.',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'rescued' }] } }],
            usageMetadata: {},
          }),
        });

      const result = await generateGeminiContent({
        parts: [{ text: 'hi' }],
        maxOutputTokens: 1024,
        thinkingBudget: 0,
      });

      expect(result.text).toBe('rescued');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const first = JSON.parse(global.fetch.mock.calls[0][1].body);
      const second = JSON.parse(global.fetch.mock.calls[1][1].body);
      expect(first.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
      expect(second.generationConfig.thinkingConfig).toBeUndefined();
      expect(second.generationConfig.maxOutputTokens).toBe(3072);
    });
  });

  /**
   * Sự cố 24/09/2026: Google trả 503 "high demand … usually temporary" sau 1,4 giây, lớp này không
   * thử lại lần nào, và khách thấy nguyên cục JSON tiếng Anh trong khung chat sinh landing.
   */
  describe('generateGeminiContent — Google quá tải', () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.GEMINI_API_KEY;
    // Nghỉ 0ms giữa các lượt để bài chạy tức thì; ngân sách rộng để không cản.
    const NHANH = { retryDelaysMs: [0, 0], retryBudgetMs: 60_000 };
    const THAN_503 = '{ "error": { "code": 503, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE" } }';

    const loi = (status, text = THAN_503) => ({ ok: false, status, statusText: 'x', text: async () => text });
    const duoc = (text = 'ok') => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} }),
    });

    let warn;
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
      global.fetch = jest.fn();
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      global.fetch = originalFetch;
      warn.mockRestore();
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    });

    it('503 một lần rồi được → khách nhận kết quả, không thấy lỗi nào', async () => {
      global.fetch.mockResolvedValueOnce(loi(503)).mockResolvedValueOnce(duoc('cứu được'));

      const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH });

      expect(kq.text).toBe('cứu được');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it.each(GEMINI_TRANSIENT_STATUSES)('mã %i được coi là tạm thời → có thử lại', async (status) => {
      global.fetch.mockResolvedValueOnce(loi(status)).mockResolvedValueOnce(duoc());

      await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('quá tải cả 3 lượt → câu tiếng Việt, mã AI_PROVIDER_BUSY, KHÔNG còn JSON của Google', async () => {
      global.fetch.mockResolvedValue(loi(503));

      const err = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(err.message).toBe(AI_PROVIDER_BUSY_MESSAGE);
      expect(err.message).not.toMatch(/[{}]|UNAVAILABLE|high demand/);
      expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      expect(err.status).toBe(503);
      expect(err.attempts).toBe(3);
      // Câu gốc vẫn còn cho log máy chủ.
      expect(err.providerMessage).toContain('high demand');
    });

    it('400 → KHÔNG thử lại (gọi lại y hệt chỉ nhận y hệt lỗi), câu gốc giữ nguyên', async () => {
      global.fetch.mockResolvedValue(loi(400, 'Request payload size exceeds the limit'));

      const err = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.geminiStatus).toBe(400);
      expect(err.code).toBeUndefined();
      // isThinkingBudgetRejection ở 3 service help/* soi đúng câu gốc — đổi câu là gãy nhánh đó.
      expect(err.message).toContain('Request payload size exceeds the limit');
    });

    it('lỗi đến CHẬM (quá ngân sách) → thôi thử lại, trả lỗi ngay', async () => {
      // Lượt sinh landing có thể chạy 1–2 phút; hỏng ở giây 60 mà còn thử lại thì chỉ đổi lỗi này
      // lấy lỗi hết giờ 100 giây của Cloudflare. Ngân sách 0 = mọi lỗi đều "đến chậm".
      global.fetch.mockResolvedValue(loi(503));

      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], retryDelaysMs: [0, 0], retryBudgetMs: 0,
      }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
    });

    it('hết giờ chờ (AbortError) → KHÔNG thử lại, câu TIẾNG VIỆT thay cho "This operation was aborted"', async () => {
      const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
      global.fetch.mockRejectedValue(abort);

      const err = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.message).toBe(AI_TIMEOUT_MESSAGE);
      expect(err.message).not.toMatch(/aborted/i);
      expect(err.code).toBe(AI_TIMEOUT_CODE);
      // aiLandingPage.service nhận ra hết giờ bằng đúng tên này — đổi tên là gãy nhánh 'timeout' của nó.
      expect(err.name).toBe('AbortError');
      expect(err.status).toBe(503);
      expect(err.providerMessage).toBe('This operation was aborted');
    });

    it('model từ chối thinkingBudget rồi quá tải → lượt thử lại KHÔNG gửi lại thinkingBudget', async () => {
      global.fetch
        .mockResolvedValueOnce(loi(400, 'Budget 0 is invalid. This model only works in thinking mode.'))
        .mockResolvedValueOnce(loi(503))
        .mockResolvedValueOnce(duoc('xong'));

      const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], thinkingBudget: 0, ...NHANH });

      expect(kq.text).toBe('xong');
      expect(global.fetch).toHaveBeenCalledTimes(3);
      const lanBa = JSON.parse(global.fetch.mock.calls[2][1].body);
      expect(lanBa.generationConfig.thinkingConfig).toBeUndefined();
    });

    describe('fallbackModel behavior (PR-1 bảng 4.1)', () => {
      it('Model chính 503 ×3, dự phòng 200 → trả kết quả dự phòng, fetch 4 lần, modelUsed = dự phòng', async () => {
        global.fetch
          .mockResolvedValueOnce(loi(503))
          .mockResolvedValueOnce(loi(503))
          .mockResolvedValueOnce(loi(503))
          .mockResolvedValueOnce(duoc('dự phòng đã cứu'));

        const kq = await generateGeminiContent({
          parts: [{ text: 'hi' }],
          model: 'gemini-chinh',
          fallbackModel: 'gemini-du-phong',
          ...NHANH,
        });

        expect(kq.text).toBe('dự phòng đã cứu');
        expect(kq.modelUsed).toBe('gemini-du-phong');
        expect(global.fetch).toHaveBeenCalledTimes(4);
        expect(global.fetch.mock.calls[0][0]).toContain('models/gemini-chinh:generateContent');
        expect(global.fetch.mock.calls[1][0]).toContain('models/gemini-chinh:generateContent');
        expect(global.fetch.mock.calls[2][0]).toContain('models/gemini-chinh:generateContent');
        expect(global.fetch.mock.calls[3][0]).toContain('models/gemini-du-phong:generateContent');
      });

      it('Model chính 503 ×3, chưa chọn dự phòng → AI_PROVIDER_BUSY, fetch 3 lần', async () => {
        global.fetch.mockResolvedValue(loi(503));

        const err = await generateGeminiContent({
          parts: [{ text: 'hi' }],
          model: 'gemini-chinh',
          fallbackModel: null,
          ...NHANH,
        }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      });

      it('Model chính 503 ×3, dự phòng cũng 503 → AI_PROVIDER_BUSY, fetch 4 lần (dự phòng không thử lại)', async () => {
        global.fetch.mockResolvedValue(loi(503));

        const err = await generateGeminiContent({
          parts: [{ text: 'hi' }],
          model: 'gemini-chinh',
          fallbackModel: 'gemini-du-phong',
          ...NHANH,
        }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(4);
        expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      });

      it('Model chính 400 → KHÔNG chuyển dự phòng, fetch 1 lần, câu gốc giữ nguyên', async () => {
        global.fetch.mockResolvedValue(loi(400, 'Invalid argument'));

        const err = await generateGeminiContent({
          parts: [{ text: 'hi' }],
          model: 'gemini-chinh',
          fallbackModel: 'gemini-du-phong',
          ...NHANH,
        }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(err.geminiStatus).toBe(400);
        expect(err.message).toContain('Invalid argument');
      });

      it('Model chính 503 nhưng đã quá ngân sách (retryBudgetMs: 0) → Không chuyển dự phòng, fetch 1 lần', async () => {
        global.fetch.mockResolvedValue(loi(503));

        const err = await generateGeminiContent({
          parts: [{ text: 'hi' }],
          model: 'gemini-chinh',
          fallbackModel: 'gemini-du-phong',
          retryDelaysMs: [0, 0],
          retryBudgetMs: 0,
        }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      });

      it('fallbackModel trùng model chính → Không gọi lại lần thứ 4', async () => {
        global.fetch.mockResolvedValue(loi(503));

        const err = await generateGeminiContent({
          parts: [{ text: 'hi' }],
          model: 'gemini-chinh',
          fallbackModel: 'gemini-chinh',
          ...NHANH,
        }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      });
    });
  });

  /**
   * G2 (03/10/2026): lõi này giờ gánh luôn chatbot + trợ lý, nên cần: hội thoại nhiều lượt, ngân sách TỔNG có huỷ
   * fetch thật, khoá API ra khỏi URL, lỗi mạng được thử lại. Mock ở RANH GIỚI fetch bằng `Response` THẬT (có
   * status/headers/body như Google trả), không dùng object `{ ok, json }` tự chế.
   */
  describe('generateGeminiContent — G2: contents, ngân sách tổng, khoá API', () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.GEMINI_API_KEY;
    const NHANH = { retryDelaysMs: [0, 0], retryBudgetMs: 60_000 };

    const phanHoiThat = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
    const duocThat = (text = 'ok') => phanHoiThat(200, {
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3, totalTokenCount: 14 },
      modelVersion: 'gemini-2.5-flash',
    });
    const quaTaiThat = () => phanHoiThat(503, {
      error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' },
    });

    /** fetch treo cho tới khi bị huỷ — đúng hành vi của một lượt Google không chịu trả lời. */
    const fetchTreo = () => jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
      });
    }));

    let warn;
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-123';
      global.fetch = jest.fn();
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      global.fetch = originalFetch;
      warn.mockRestore();
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    });

    it('khoá API đi bằng header x-goog-api-key, KHÔNG nằm trong URL', async () => {
      global.fetch.mockResolvedValue(duocThat());

      await generateGeminiContent({ parts: [{ text: 'hi' }] });

      const [url, init] = global.fetch.mock.calls[0];
      expect(url).not.toContain('key=');
      expect(url).not.toContain('AIza-khoa-bi-mat-123');
      expect(init.headers['x-goog-api-key']).toBe('AIza-khoa-bi-mat-123');
    });

    it('lỗi 4xx mà Google lỡ trích lại khoá → câu lỗi KHÔNG chứa khoá', async () => {
      global.fetch.mockResolvedValue(phanHoiThat(400, {
        error: { code: 400, message: 'API key not valid: AIza-khoa-bi-mat-123', status: 'INVALID_ARGUMENT' },
      }));

      const err = await generateGeminiContent({ parts: [{ text: 'hi' }] }).catch((e) => e);

      expect(err.geminiStatus).toBe(400);
      expect(err.message).not.toContain('AIza-khoa-bi-mat-123');
    });

    it('countGeminiTokens cũng gửi khoá bằng header, không đưa vào URL', async () => {
      global.fetch.mockResolvedValue(phanHoiThat(200, { totalTokens: 42 }));

      const total = await countGeminiTokens({ model: 'gemini-chinh', contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });

      expect(total).toBe(42);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url).not.toContain('key=');
      expect(init.headers['x-goog-api-key']).toBe('AIza-khoa-bi-mat-123');
    });

    it('`contents` (hội thoại nhiều lượt) được gửi nguyên văn, không bị bọc lại thành 1 lượt user', async () => {
      global.fetch.mockResolvedValue(duocThat());
      const contents = [
        { role: 'user', parts: [{ text: 'Xin chào' }] },
        { role: 'model', parts: [{ text: 'Chào bạn' }] },
        { role: 'user', parts: [{ text: 'Giá bao nhiêu?' }] },
      ];

      await generateGeminiContent({ contents, systemInstruction: { parts: [{ text: 'sp' }] } });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.contents).toEqual(contents);
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'sp' }] });
    });

    it('topP mặc định 0.9; truyền null thì KHÔNG gửi topP (giữ đúng hành vi cũ của chatbot/trợ lý)', async () => {
      global.fetch.mockImplementation(async () => duocThat());

      await generateGeminiContent({ parts: [{ text: 'hi' }] });
      await generateGeminiContent({ parts: [{ text: 'hi' }], topP: null });

      expect(JSON.parse(global.fetch.mock.calls[0][1].body).generationConfig.topP).toBe(0.9);
      expect(JSON.parse(global.fetch.mock.calls[1][1].body).generationConfig).not.toHaveProperty('topP');
    });

    it('kết quả mang theo `raw` (thân Google) cho nơi cần finishReason/usageMetadata nguyên bản', async () => {
      global.fetch.mockResolvedValue(duocThat('xin chào'));

      const kq = await generateGeminiContent({ parts: [{ text: 'hi' }] });

      expect(kq.text).toBe('xin chào');
      expect(kq.raw.usageMetadata.totalTokenCount).toBe(14);
      expect(kq.raw.candidates[0].finishReason).toBe('STOP');
    });

    it('ngân sách TỔNG hết → fetch đang bay bị HUỶ THẬT (signal.aborted) và lỗi là câu tiếng Việt', async () => {
      global.fetch = fetchTreo();

      const bat = Date.now();
      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], timeoutMs: 60_000, totalTimeoutMs: 60,
      }).catch((e) => e);

      expect(Date.now() - bat).toBeLessThan(2000);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(err.code).toBe(AI_TIMEOUT_CODE);
      expect(err.message).toBe(AI_TIMEOUT_MESSAGE);
    });

    it('ngân sách tổng còn quá ít (< 3 giây) → thôi thử lại và thôi dự phòng, trả lỗi quá tải ngay', async () => {
      global.fetch.mockImplementation(async () => quaTaiThat());

      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-du-phong',
        totalTimeoutMs: 2000, ...NHANH,
      }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
    });

    it('ngân sách tổng đủ rộng: chính 503 ×3 → dự phòng 200 vẫn cứu được (bảng PR-1 không đổi)', async () => {
      global.fetch
        .mockResolvedValueOnce(quaTaiThat())
        .mockResolvedValueOnce(quaTaiThat())
        .mockResolvedValueOnce(quaTaiThat())
        .mockResolvedValueOnce(duocThat('dự phòng cứu'));

      const kq = await generateGeminiContent({
        parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-du-phong',
        totalTimeoutMs: 25_000, ...NHANH,
      });

      expect(kq.text).toBe('dự phòng cứu');
      expect(kq.modelUsed).toBe('gemini-du-phong');
      expect(global.fetch.mock.calls[3][0]).toContain('models/gemini-du-phong:generateContent');
    });

    it('lỗi mạng (fetch failed / ECONNRESET) → được thử lại như 503', async () => {
      const mang = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
      global.fetch.mockRejectedValueOnce(mang).mockResolvedValueOnce(duocThat('qua rồi'));

      const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH });

      expect(kq.text).toBe('qua rồi');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('lỗi mạng cả 3 lượt → câu quá tải TIẾNG VIỆT (không lộ "fetch failed")', async () => {
      const mang = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      global.fetch.mockRejectedValue(mang);

      const err = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(err.message).toBe(AI_PROVIDER_BUSY_MESSAGE);
      expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
    });

    it('lỗi lập trình thường (TypeError khác "fetch failed") KHÔNG bị coi là lỗi mạng để thử lại', async () => {
      global.fetch.mockRejectedValue(new TypeError('Cannot read properties of undefined'));

      await expect(generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH })).rejects.toThrow('Cannot read properties');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * D-05 (04/10/2026): (1) 404 "model không còn" phải chuyển dự phòng — bản cũ chỉ chuyển khi 429/5xx nên model bị Google khai tử
   * làm cả hệ thống lỗi tới cron 02:15; (2) nơi gọi KHÔNG truyền `fallbackModel` thì lõi tự tra dự phòng hệ thống (6 đường:
   * Dashboard, Hộp thư, dịch gói, OCR, slot filler, hero). Mock ở ranh giới fetch bằng `Response` thật, thân 404 đúng như Google trả.
   */
  describe('generateGeminiContent — D-05: 404 model không còn + dự phòng hệ thống tự tra', () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.GEMINI_API_KEY;
    const NHANH = { retryDelaysMs: [0, 0], retryBudgetMs: 60_000 };

    const phanHoiThat = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
    const duocThat = (text = 'ok') => phanHoiThat(200, {
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3, totalTokenCount: 14 },
    });
    const quaTaiThat = () => phanHoiThat(503, {
      error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' },
    });
    // Nguyên văn câu Google trả khi tên model không còn.
    const modelKhongCon = (model = 'gemini-chinh') => phanHoiThat(404, {
      error: {
        code: 404,
        message: `models/${model} is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.`,
        status: 'NOT_FOUND',
      },
    });
    const urlGoi = (n) => String(global.fetch.mock.calls[n][0]);

    let warn;
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-123';
      global.fetch = jest.fn();
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      setGeminiFallbackModelResolver(null);
      global.fetch = originalFetch;
      warn.mockRestore();
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    });

    it('isModelUnavailableError: chỉ 404 mang câu "không còn / không hỗ trợ" của Google', () => {
      expect(isModelUnavailableError({ geminiStatus: 404, message: 'Gemini API lỗi (404): models/x is not found for API version v1beta' })).toBe(true);
      expect(isModelUnavailableError({ geminiStatus: 404, message: 'Gemini API lỗi (404): {"error":{"status":"NOT_FOUND"}}' })).toBe(true);
      expect(isModelUnavailableError({ geminiStatus: 404, message: 'Gemini API lỗi (404): This model is no longer available to new users.' })).toBe(true);
      expect(isModelUnavailableError({ geminiStatus: 404, message: 'Gemini API lỗi (404): trang khác hẳn' })).toBe(false);
      expect(isModelUnavailableError({ geminiStatus: 400, message: 'models/x is not found' })).toBe(false);
      expect(isModelUnavailableError({ geminiStatus: 503, message: 'NOT_FOUND' })).toBe(false);
      expect(isModelUnavailableError(null)).toBe(false);
    });

    it('model chính 404 + có dự phòng → chuyển NGAY (không thử lại model chết), fetch 2 lần, modelUsed + fallbackUsed', async () => {
      global.fetch
        .mockResolvedValueOnce(modelKhongCon())
        .mockResolvedValueOnce(duocThat('dự phòng cứu'));

      const kq = await generateGeminiContent({
        parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-du-phong', ...NHANH,
      });

      expect(kq.text).toBe('dự phòng cứu');
      expect(kq.modelUsed).toBe('gemini-du-phong');
      expect(kq.fallbackUsed).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(urlGoi(0)).toContain('models/gemini-chinh:generateContent');
      expect(urlGoi(1)).toContain('models/gemini-du-phong:generateContent');
    });

    it('model chính trả lời bình thường → fallbackUsed = false', async () => {
      global.fetch.mockResolvedValueOnce(duocThat());

      const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-du-phong' });

      expect(kq.fallbackUsed).toBe(false);
      expect(kq.modelUsed).toBe('gemini-chinh');
    });

    it('model chính 404, chưa chọn dự phòng (null) → ném đúng lỗi 404 gốc, KHÔNG bọc thành "quá tải", fetch 1 lần', async () => {
      global.fetch.mockResolvedValue(modelKhongCon());

      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: null, ...NHANH,
      }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.geminiStatus).toBe(404);
      expect(err.code).toBeUndefined();
      expect(err.message).toContain('is not found');
    });

    it('model chính 404, dự phòng TRÙNG model chính → không gọi lại', async () => {
      global.fetch.mockResolvedValue(modelKhongCon());

      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-chinh', ...NHANH,
      }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.geminiStatus).toBe(404);
    });

    it('cả model chính lẫn dự phòng đều 404 → ném lỗi 404 của model chính, kèm fallbackError', async () => {
      global.fetch.mockImplementation(async () => modelKhongCon());

      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-du-phong', ...NHANH,
      }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(err.geminiStatus).toBe(404);
      expect(err.fallbackError?.geminiStatus).toBe(404);
    });

    it('404 mang thân lạ (không phải câu "model không còn") → KHÔNG chuyển dự phòng', async () => {
      global.fetch.mockResolvedValue(phanHoiThat(404, { error: { message: 'trang khác hẳn' } }));

      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-du-phong', ...NHANH,
      }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.geminiStatus).toBe(404);
    });

    describe('không truyền fallbackModel → lõi tự tra dự phòng hệ thống', () => {
      it('404 + resolver trả dự phòng → chuyển dự phòng, resolver gọi đúng 1 lần', async () => {
        const resolver = jest.fn().mockResolvedValue('gemini-du-phong');
        setGeminiFallbackModelResolver(resolver);
        global.fetch.mockResolvedValueOnce(modelKhongCon()).mockResolvedValueOnce(duocThat('tự tra cứu được'));

        const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', ...NHANH });

        expect(kq.text).toBe('tự tra cứu được');
        expect(kq.modelUsed).toBe('gemini-du-phong');
        expect(urlGoi(1)).toContain('models/gemini-du-phong:generateContent');
        expect(resolver).toHaveBeenCalledTimes(1);
      });

      it('quá tải 503 ×3 + resolver trả dự phòng → dự phòng cứu (đường Dashboard/Hộp thư/dịch gói/OCR/slot filler)', async () => {
        setGeminiFallbackModelResolver(async () => 'gemini-du-phong');
        global.fetch
          .mockResolvedValueOnce(quaTaiThat())
          .mockResolvedValueOnce(quaTaiThat())
          .mockResolvedValueOnce(quaTaiThat())
          .mockResolvedValueOnce(duocThat('dự phòng cứu'));

        const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', ...NHANH });

        expect(kq.text).toBe('dự phòng cứu');
        expect(global.fetch).toHaveBeenCalledTimes(4);
        expect(urlGoi(3)).toContain('models/gemini-du-phong:generateContent');
      });

      it('generateGeminiText (bản bọc) cũng không truyền → cũng tự tra', async () => {
        setGeminiFallbackModelResolver(async () => 'gemini-du-phong');
        global.fetch.mockResolvedValueOnce(modelKhongCon()).mockResolvedValueOnce(duocThat('qua bản text'));

        const kq = await generateGeminiText({ prompt: 'hi', model: 'gemini-chinh' });

        expect(kq.text).toBe('qua bản text');
        expect(kq.modelUsed).toBe('gemini-du-phong');
      });

      it('đường THÀNH CÔNG không tốn lượt tra nào (tra lười, chỉ khi model chính vừa lỗi)', async () => {
        const resolver = jest.fn().mockResolvedValue('gemini-du-phong');
        setGeminiFallbackModelResolver(resolver);
        global.fetch.mockResolvedValueOnce(duocThat());

        await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh' });

        expect(resolver).not.toHaveBeenCalled();
      });

      it('resolver trả đúng model chính → không thử lại bằng chính nó (fetch 3 lần, không phải 4)', async () => {
        setGeminiFallbackModelResolver(async () => 'gemini-chinh');
        global.fetch.mockImplementation(async () => quaTaiThat());

        const err = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', ...NHANH }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      });

      it('resolver trả null (chưa chọn dự phòng) → hành vi cũ: quá tải ×3 → AI_PROVIDER_BUSY', async () => {
        setGeminiFallbackModelResolver(async () => null);
        global.fetch.mockImplementation(async () => quaTaiThat());

        const err = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', ...NHANH }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      });

      it('resolver NÉM lỗi (CSDL chập chờn) → coi như không có dự phòng, lỗi của khách vẫn là câu quá tải, không nổ lỗi khác', async () => {
        setGeminiFallbackModelResolver(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5433'); });
        global.fetch.mockImplementation(async () => quaTaiThat());

        const err = await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', ...NHANH }).catch((e) => e);

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
        expect(err.message).toBe(AI_PROVIDER_BUSY_MESSAGE);
      });

      it('resolver TREO → quá 3 giây thì bỏ, không kéo dài lỗi của khách', async () => {
        jest.useFakeTimers();
        try {
          setGeminiFallbackModelResolver(() => new Promise(() => {}));
          global.fetch.mockImplementation(async () => modelKhongCon());

          const pending = generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', ...NHANH }).catch((e) => e);
          await jest.advanceTimersByTimeAsync(3500);
          const err = await pending;

          expect(global.fetch).toHaveBeenCalledTimes(1);
          expect(err.geminiStatus).toBe(404);
        } finally {
          jest.useRealTimers();
        }
      });

      it('nơi gọi đã truyền `null` (đã tra, không có) → lõi KHÔNG tra lại; truyền chuỗi → cũng không tra', async () => {
        const resolver = jest.fn().mockResolvedValue('gemini-resolver');
        setGeminiFallbackModelResolver(resolver);
        global.fetch.mockImplementation(async () => modelKhongCon());

        await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: null, ...NHANH }).catch(() => {});
        await generateGeminiContent({ parts: [{ text: 'hi' }], model: 'gemini-chinh', fallbackModel: 'gemini-nha-goi', ...NHANH }).catch(() => {});

        expect(resolver).not.toHaveBeenCalled();
        expect(urlGoi(0)).toContain('models/gemini-chinh:generateContent');
        expect(global.fetch).toHaveBeenCalledTimes(3); // 1 (null) + 2 (chuỗi: chính rồi dự phòng của nơi gọi)
        expect(urlGoi(2)).toContain('models/gemini-nha-goi:generateContent');
      });
    });

    it('`apiKey` truyền vào thắng GEMINI_API_KEY chung và vẫn đi bằng header (khoá riêng của tư vấn trang chủ)', async () => {
      global.fetch.mockResolvedValueOnce(duocThat());

      await generateGeminiContent({ parts: [{ text: 'hi' }], apiKey: 'AIza-khoa-rieng-hero' });

      const [url, init] = global.fetch.mock.calls[0];
      expect(init.headers['x-goog-api-key']).toBe('AIza-khoa-rieng-hero');
      expect(url).not.toContain('key=');
    });

    it('`apiKey` trống → rơi về GEMINI_API_KEY chung', async () => {
      global.fetch.mockResolvedValueOnce(duocThat());

      await generateGeminiContent({ parts: [{ text: 'hi' }], apiKey: '   ' });

      expect(global.fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('AIza-khoa-bi-mat-123');
    });
  });
});
