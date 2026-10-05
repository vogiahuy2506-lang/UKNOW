import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setAiCallObserver } from '../../../utils/aiCallObserver.util.js';

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;
const API_KEY = 'AIza-khoa-bi-mat-tro-ly';

const parseAiJson = jest.fn((text) => JSON.parse(text));
const reserve = jest.fn(async () => ({ maxOutputTokens: 8192 }));
const record = jest.fn(async () => {});
const resolveFallbackModel = jest.fn(async () => null);

jest.unstable_mockModule('../../../utils/aiJsonParse.util.js', () => ({
  parseAiJson,
}));

const readTempFileBuffer = jest.fn();
const readFileBufferByKey = jest.fn();
const extractTextFromBuffer = jest.fn();

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer,
    readFileBufferByKey,
  },
}));

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer,
}));

jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts: jest.fn(),
}));

jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve: (...args) => reserve(...args),
    record: (...args) => record(...args),
    resolveFallbackModel: (...args) => resolveFallbackModel(...args),
  },
}));

jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));

// geminiClient.util.js KHÔNG mock: lõi thật chạy, chỉ `fetch` (ranh giới với Google) được giả bằng `Response` thật.
const { runChat, ASSISTANT_TIMEOUT_MS } = await import('../aiChatTransport.service.js');

/** Phản hồi HTTP THẬT như Google trả (status, header, thân JSON). */
const googleReply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const USAGE = { promptTokenCount: 10, candidatesTokenCount: 8192, totalTokenCount: 8202 };
const googleOk = (text, { finishReason = 'STOP', usage = USAGE } = {}) => googleReply(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason, index: 0 }],
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
const requestBody = (callIndex = 0) => JSON.parse(global.fetch.mock.calls[callIndex][1].body);

/** Chạy hết đồng hồ giả (nghỉ giữa các lượt thử lại, hạn 120 giây) rồi trả kết quả, KHÔNG để lời hứa treo. */
async function settle(promise, advanceMs = 130_000) {
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

describe('aiChatTransport.service', () => {
  let consoleSpies;

  beforeEach(() => {
    jest.useFakeTimers();
    parseAiJson.mockClear();
    reserve.mockClear();
    record.mockClear();
    resolveFallbackModel.mockReset();
    resolveFallbackModel.mockResolvedValue(null);
    readTempFileBuffer.mockReset();
    readFileBufferByKey.mockReset();
    extractTextFromBuffer.mockReset();
    global.fetch = jest.fn();
    process.env.GEMINI_API_KEY = API_KEY;
    consoleSpies = ['log', 'warn', 'error'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleSpies.forEach((spy) => spy.mockRestore());
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('khi finishReason là MAX_TOKENS: ném lỗi thông điệp rõ ràng, không gọi parseAiJson, VẪN ghi token', async () => {
    global.fetch.mockResolvedValueOnce(googleOk(
      '{"type":"landing_page","content":"Đang tạo","data":{"html":"<div',
      { finishReason: 'MAX_TOKENS' },
    ));

    await expect(
      runChat({
        systemPrompt: 'sys prompt',
        history: [{ role: 'user', content: 'Tạo landing page thật dài' }],
        userId: 101,
      })
    ).rejects.toThrow('AI trả lời quá dài bị cắt, hãy rút ngắn yêu cầu.');

    expect(parseAiJson).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(101, expect.objectContaining({ totalTokens: 8202 }), expect.objectContaining({ feature: 'smart_chat' }));
  });

  it('D-28: log câu trả lời chỉ ghi độ dài + finishReason + model, KHÔNG in nội dung (tên/SĐT/email khách trong câu trả lời không vào log)', async () => {
    const reply = JSON.stringify({
      type: 'text',
      content: 'Danh sách: Nguyễn Văn Bí Mật, 0912345678, bi.mat.khach@example.test — đã xếp lịch gửi.',
      missing_fields: [],
      data: null,
    });
    global.fetch.mockResolvedValueOnce(googleOk(reply));

    await runChat({
      systemPrompt: 'sys prompt',
      history: [{ role: 'user', content: 'Tóm tắt danh sách khách' }],
      userId: 101,
    });

    // Mọi dòng log (log/warn/error, mọi đối số) gộp lại.
    const logged = consoleSpies.flatMap((spy) => spy.mock.calls).map((args) => args.map((a) => String(a)).join(' ')).join('\n');
    expect(logged).not.toContain('Nguyễn Văn Bí Mật');
    expect(logged).not.toContain('0912345678');
    expect(logged).not.toContain('bi.mat.khach@example.test');
    expect(logged).not.toContain('first 500 chars');
    // Vẫn đủ để dò sự cố: độ dài thật + mã kết thúc + model.
    expect(logged).toContain(`[AI Chat] Gemini response (${reply.length} chars, finishReason=STOP, model=gemini-2.5-flash)`);
  });

  describe('D-23 — feature + người bấm thật (viết chỉ dẫn chatbot không còn ghi chung smart_chat theo người bấm)', () => {
    afterEach(() => setAiCallObserver(null));

    it('runChat nhận feature + actorUserId: sổ token ghi đúng feature, actorUserId trong metadata, token tính cho userId (= CHỦ); sổ lỗi bền cũng nhận feature/chủ/actor', async () => {
      const events = [];
      setAiCallObserver((event) => { events.push(event); });
      global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"Bạn là trợ lý."}'));

      await runChat({
        systemPrompt: 'sys prompt',
        history: [{ role: 'user', content: 'Viết chỉ dẫn' }],
        userId: 101, // CHỦ workspace
        actorUserId: 55, // nhân viên bấm
        feature: 'ai_generate_system_instruction',
      });

      expect(record).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ totalTokens: 8202 }),
        { feature: 'ai_generate_system_instruction', model: 'gemini-2.5-flash', actorUserId: 55 },
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ feature: 'ai_generate_system_instruction', ownerUserId: 101, actorUserId: 55, outcome: 'ok' });
    });

    it('không truyền feature/actor (trợ lý chiến dịch) → vẫn smart_chat và KHÔNG thêm actorUserId (hình dạng cũ không đổi)', async () => {
      const events = [];
      setAiCallObserver((event) => { events.push(event); });
      global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"Chào bạn"}'));

      await runChat({ systemPrompt: 'sys', history: [{ role: 'user', content: 'Xin chào' }], userId: 101 });

      expect(record).toHaveBeenCalledWith(101, expect.anything(), { feature: 'smart_chat', model: 'gemini-2.5-flash' });
      expect(events[0]).toMatchObject({ feature: 'smart_chat', ownerUserId: 101, actorUserId: null });
    });
  });

  it('khi response bình thường: gọi parseAiJson và ghi nhận usage', async () => {
    global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"Chào bạn"}'));

    const res = await runChat({
      systemPrompt: 'sys prompt',
      history: [{ role: 'user', content: 'Xin chào' }],
      userId: 101,
    });

    expect(res).toEqual({ type: 'text', content: 'Chào bạn' });
    expect(parseAiJson).toHaveBeenCalledWith('{"type":"text","content":"Chào bạn"}');
    expect(record).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ totalTokens: 8202 }),
      { feature: 'smart_chat', model: 'gemini-2.5-flash' }
    );
  });

  describe('giữ nguyên cách gọi Google của trợ lý (JSON mode, thinking mặc định, timeout)', () => {
    it('JSON mode + nhiệt độ 0.7 + KHÔNG gửi thinkingConfig/topP; hội thoại nhiều lượt giữ nguyên, assistant → model', async () => {
      global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"ok"}'));

      await runChat({
        systemPrompt: 'sys prompt',
        history: [
          { role: 'user', content: 'Xin chào' },
          { role: 'assistant', content: 'Chào bạn' },
          { role: 'user', content: 'Tạo chiến dịch' },
        ],
        userId: 101,
      });

      const body = requestBody();
      expect(body.generationConfig).toEqual({
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 8192,
      });
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys prompt' }] });
      expect(body.contents.map((c) => `${c.role}:${c.parts[0].text}`)).toEqual([
        'user:Xin chào', 'model:Chào bạn', 'user:Tạo chiến dịch',
      ]);
    });

    it('khoá API đi bằng header x-goog-api-key, KHÔNG nằm trong URL', async () => {
      global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"ok"}'));

      await runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 });

      const [url, init] = global.fetch.mock.calls[0];
      expect(url).not.toContain('key=');
      expect(url).not.toContain(API_KEY);
      expect(init.headers['x-goog-api-key']).toBe(API_KEY);
    });

    it('lọc thought parts khỏi câu trả lời trước khi parse JSON', async () => {
      global.fetch.mockResolvedValueOnce(googleReply(200, {
        candidates: [{
          content: { parts: [{ text: 'tôi đang suy nghĩ…', thought: true }, { text: '{"type":"text","content":"Xong"}' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: USAGE,
      }));

      const res = await runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 });

      expect(res).toEqual({ type: 'text', content: 'Xong' });
      expect(parseAiJson).toHaveBeenCalledWith('{"type":"text","content":"Xong"}');
    });
  });

  describe('Google quá tải / lỗi (G2.3) — thử lại, model dự phòng, câu lỗi tiếng Việt', () => {
    it('503 một lần rồi được → người dùng nhận kết quả, không thấy lỗi', async () => {
      global.fetch
        .mockResolvedValueOnce(googleOverloaded())
        .mockResolvedValueOnce(googleOk('{"type":"text","content":"qua rồi"}'));

      const res = await settle(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }));

      expect(res).toEqual({ type: 'text', content: 'qua rồi' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('model chính 503 ×3 → model DỰ PHÒNG trả lời; token ghi theo model dự phòng', async () => {
      resolveFallbackModel.mockResolvedValue('gemini-du-phong');
      global.fetch
        .mockResolvedValueOnce(googleOverloaded())
        .mockResolvedValueOnce(googleOverloaded())
        .mockResolvedValueOnce(googleOverloaded())
        .mockResolvedValueOnce(googleOk('{"type":"text","content":"dự phòng"}'));

      const res = await settle(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }));

      expect(res).toEqual({ type: 'text', content: 'dự phòng' });
      expect(global.fetch.mock.calls.map(([url]) => urlModel(url))).toEqual([
        'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-du-phong',
      ]);
      expect(record).toHaveBeenCalledWith(101, expect.anything(), { feature: 'smart_chat', model: 'gemini-du-phong' });
    });

    it('503 mãi (sự cố 24/09) → lỗi CÓ geminiStatus + câu tiếng Việt, KHÔNG còn chuỗi "Gemini API Error (" hay JSON Google', async () => {
      global.fetch.mockImplementation(async () => googleOverloaded());

      const err = await settle(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }).catch((e) => e));

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(err.geminiStatus).toBe(503);
      expect(err.code).toBe('AI_PROVIDER_BUSY');
      expect(err.message).not.toContain('Gemini API Error (');
      expect(err.message).not.toMatch(/[{}]|UNAVAILABLE|high demand/);
      expect(record).not.toHaveBeenCalled();
    });

    it('400 của Google → KHÔNG thử lại, lỗi mang geminiStatus (controller đổi sang câu tiếng Việt), không còn "Gemini API Error ("', async () => {
      global.fetch.mockResolvedValue(googleReply(400, {
        error: { code: 400, message: 'Request payload size exceeds the limit', status: 'INVALID_ARGUMENT' },
      }));

      const err = await runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.geminiStatus).toBe(400);
      expect(err.message).not.toContain('Gemini API Error (');
    });

    it('Google treo → huỷ fetch THẬT, câu tiếng Việt (không còn "timeout of 120000ms exceeded"), không lộ khoá API', async () => {
      global.fetch = hangingFetch();

      const err = await settle(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }).catch((e) => e));

      expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(err.code).toBe('AI_TIMEOUT');
      expect(err.message).not.toMatch(/timeout of|aborted/i);
      // Bản axios cũ ném nguyên AxiosError (config.url có `?key=<khoá>`) rồi controller console.error ra log.
      expect(err.config).toBeUndefined();
      expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain(API_KEY);
    });

    // D-09: trợ lý chat là MỘT request đồng bộ; Cloudflare cắt /api ở 100 giây (524) trong khi server chạy tiếp và trừ credit. Trần tổng 85 giây.
    it('D-09: hằng trần tổng của lượt trợ lý là 85 giây (không phải 120 — Cloudflare cắt ở 100)', () => {
      expect(ASSISTANT_TIMEOUT_MS).toBe(85000);
      expect(ASSISTANT_TIMEOUT_MS).toBeLessThan(100000);
    });

    it('D-09: Google treo → bị huỷ ĐÚNG ở giây thứ 85 (84 giây vẫn đang chờ), lỗi AI_TIMEOUT tiếng Việt TRƯỚC mốc 100 giây của Cloudflare', async () => {
      global.fetch = hangingFetch();
      let settled = false;
      const pending = runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 })
        .catch((e) => e)
        .then((value) => { settled = true; return value; });

      await jest.advanceTimersByTimeAsync(84_000);
      expect(settled).toBe(false);
      expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(false);

      await jest.advanceTimersByTimeAsync(2_000); // tổng 86 giây > 85
      const err = await pending;
      expect(settled).toBe(true);
      expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1); // hết ngân sách tổng → không thử lại, không chuyển dự phòng
      expect(err.code).toBe('AI_TIMEOUT');
      expect(err.message).toBe('AI phản hồi quá lâu. Bạn vui lòng thử lại sau ít phút.');
      expect(record).not.toHaveBeenCalled();
    });

    it('tra model dự phòng lỗi → vẫn trả lời bằng model chính (resolveFallbackModel không bao giờ làm hỏng lượt)', async () => {
      resolveFallbackModel.mockResolvedValue(null);
      global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"ổn"}'));

      await expect(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }))
        .resolves.toEqual({ type: 'text', content: 'ổn' });
    });
  });

  describe('ghi token khi kết quả hỏng (D-07): Google đã tính tiền thì sổ phải có', () => {
    it('trả về chữ RỖNG (chỉ có thought) → ném "AI trả về kết quả rỗng." NHƯNG đã ghi token smart_chat', async () => {
      const order = [];
      record.mockImplementation(async () => { order.push('record'); });
      global.fetch.mockResolvedValueOnce(googleReply(200, {
        candidates: [{ content: { parts: [{ text: 'suy nghĩ', thought: true }] }, finishReason: 'STOP' }],
        usageMetadata: USAGE,
      }));

      await expect(
        runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 })
          .catch((error) => { order.push('throw'); throw error; })
      ).rejects.toThrow('AI trả về kết quả rỗng.');

      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(101, expect.objectContaining({ totalTokens: 8202 }), { feature: 'smart_chat', model: 'gemini-2.5-flash' });
      expect(order).toEqual(['record', 'throw']);
    });

    it('ghi sổ token hỏng (record ném) → trợ lý VẪN trả lời, không làm hỏng lượt', async () => {
      record.mockRejectedValueOnce(new Error('usage_logs insert failed'));
      global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"vẫn trả lời"}'));

      await expect(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }))
        .resolves.toEqual({ type: 'text', content: 'vẫn trả lời' });
    });

    it('prompt bị chặn (không có candidate, có blockReason) → "Yêu cầu bị chặn: SAFETY", không parseAiJson', async () => {
      global.fetch.mockResolvedValueOnce(googleReply(200, {
        promptFeedback: { blockReason: 'SAFETY' },
        usageMetadata: { promptTokenCount: 30, totalTokenCount: 30 },
      }));

      await expect(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }))
        .rejects.toThrow('Yêu cầu bị chặn: SAFETY');
      expect(parseAiJson).not.toHaveBeenCalled();
    });

    it('không có candidate và không rõ lý do → "AI không phản hồi, vui lòng thử lại."', async () => {
      global.fetch.mockResolvedValueOnce(googleReply(200, { usageMetadata: {} }));

      await expect(runChat({ systemPrompt: 's', history: [{ role: 'user', content: 'hi' }], userId: 101 }))
        .rejects.toThrow('AI không phản hồi, vui lòng thử lại.');
      // Google không báo token nào → usage toàn 0; aiUsageMeter.record thật tự bỏ qua totalTokens <= 0 (xem aiUsageMeter.service.spec).
      expect(record).toHaveBeenCalledWith(101, { promptTokens: 0, outputTokens: 0, totalTokens: 0 }, expect.anything());
    });
  });

  it('đính kèm tệp từ storage_key trong lịch sử hội thoại khi không còn tempId', async () => {
    readFileBufferByKey.mockResolvedValueOnce(Buffer.from('doc-content'));
    extractTextFromBuffer.mockResolvedValueOnce('Nội dung file Word từ storage');
    global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"Đã đọc file"}', { usage: USAGE }));

    const res = await runChat({
      systemPrompt: 'sys prompt',
      history: [
        {
          role: 'user',
          content: 'Xem file này nhé',
          files: [
            {
              originalName: 'yeu_cau.docx',
              contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              storage_key: 'uploads/101/chat/yeu_cau.docx',
            },
          ],
        },
      ],
      userId: 101,
    });

    expect(res).toEqual({ type: 'text', content: 'Đã đọc file' });
    expect(readFileBufferByKey).toHaveBeenCalledWith('uploads/101/chat/yeu_cau.docx');
    expect(extractTextFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'yeu_cau.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    const userParts = requestBody().contents[0].parts;
    const docPart = userParts.find((p) => p.text && p.text.includes('Nội dung file Word từ storage'));
    expect(docPart).toBeDefined();
  });

  describe('PR scan PDF in chat transport', () => {
    const fakeGeminiSuccess = () => {
      global.fetch.mockResolvedValueOnce(googleOk('{"type":"text","content":"OK"}'));
    };

    it('C1: PDF 1 KB, extractTextFromBuffer -> \'\' -> gửi inlineData PDF kèm text scan', async () => {
      fakeGeminiSuccess();
      const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 0x20)]);
      readTempFileBuffer.mockResolvedValueOnce(pdfBuf);
      extractTextFromBuffer.mockResolvedValueOnce('');

      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'Đọc file này' }],
        files: [{ tempId: 't1', originalName: 'scan_doc.pdf', contentType: 'application/pdf' }],
        userId: 101,
      });

      const parts = requestBody().contents[0].parts;
      const textScanPart = parts.find((p) => p.text && p.text.includes('scan_doc.pdf') && p.text.includes('scan'));
      expect(textScanPart).toBeDefined();

      const inlinePart = parts[parts.length - 1];
      expect(inlinePart.inlineData).toBeDefined();
      expect(inlinePart.inlineData.mimeType).toBe('application/pdf');
      expect(inlinePart.inlineData.data).toBe(pdfBuf.toString('base64'));
    });

    it('C2: PDF, trích ra \'Giá 299k\' -> không có inlineData nào, part text chứa Giá 299k (hồi quy)', async () => {
      fakeGeminiSuccess();
      const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 0x20)]);
      readTempFileBuffer.mockResolvedValueOnce(pdfBuf);
      extractTextFromBuffer.mockResolvedValueOnce('Giá 299k');

      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'Đọc file này' }],
        files: [{ tempId: 't2', originalName: 'co_chu.pdf', contentType: 'application/pdf' }],
        userId: 101,
      });

      const parts = requestBody().contents[0].parts;
      const hasInline = parts.some((p) => p.inlineData);
      expect(hasInline).toBe(false);

      const textPart = parts.find((p) => p.text && p.text.includes('Giá 299k'));
      expect(textPart).toBeDefined();
    });

    it('C3: PDF 11 MB, trích rỗng -> không inlineData, part text chứa \'vượt giới hạn\'', async () => {
      fakeGeminiSuccess();
      const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 0x20)]);
      readTempFileBuffer.mockResolvedValueOnce(pdfBuf);
      extractTextFromBuffer.mockResolvedValueOnce('');

      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'Đọc file này' }],
        files: [{ tempId: 't3', originalName: 'heavy_scan.pdf', contentType: 'application/pdf' }],
        userId: 101,
      });

      const parts = requestBody().contents[0].parts;
      const hasInline = parts.some((p) => p.inlineData);
      expect(hasInline).toBe(false);

      const textPart = parts.find((p) => p.text && p.text.includes('vượt giới hạn'));
      expect(textPart).toBeDefined();
    });

    it('C4: hai PDF 8 MB cùng tin, cả hai trích rỗng -> tệp 1 inline, tệp 2 chỉ text chứa \'hết ngân sách\'', async () => {
      fakeGeminiSuccess();
      const pdfBuf1 = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(8 * 1024 * 1024, 0x20)]);
      const pdfBuf2 = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(8 * 1024 * 1024, 0x20)]);
      readTempFileBuffer.mockResolvedValueOnce(pdfBuf1).mockResolvedValueOnce(pdfBuf2);
      extractTextFromBuffer.mockResolvedValueOnce('').mockResolvedValueOnce('');

      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'Đọc 2 file này' }],
        files: [
          { tempId: 't4_1', originalName: 'scan1.pdf', contentType: 'application/pdf' },
          { tempId: 't4_2', originalName: 'scan2.pdf', contentType: 'application/pdf' },
        ],
        userId: 101,
      });

      const parts = requestBody().contents[0].parts;
      const inlineParts = parts.filter((p) => p.inlineData);
      expect(inlineParts).toHaveLength(1);
      expect(inlineParts[0].inlineData.mimeType).toBe('application/pdf');
      expect(inlineParts[0].inlineData.data).toBe(pdfBuf1.toString('base64'));

      const budgetPart = parts.find((p) => p.text && p.text.includes('hết ngân sách'));
      expect(budgetPart).toBeDefined();
      expect(budgetPart.text).toContain('scan2.pdf');
    });

    it('C5: readTempFileBuffer ném lỗi fs có /app/ -> part text \'đã hết hạn hoặc không đọc được\', không chứa /app/, Gemini vẫn được gọi', async () => {
      fakeGeminiSuccess();
      readTempFileBuffer.mockRejectedValueOnce(new Error("ENOENT: open '/app/temp_uploads/x.pdf'"));

      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'Đọc file này' }],
        files: [{ tempId: 't5', originalName: 'expired.pdf', contentType: 'application/pdf' }],
        userId: 101,
      });

      expect(global.fetch).toHaveBeenCalled();
      const parts = requestBody().contents[0].parts;
      const errorPart = parts.find((p) => p.text && p.text.includes('đã hết hạn hoặc không đọc được'));
      expect(errorPart).toBeDefined();
      expect(errorPart.text).not.toContain('/app/');
    });
  });
});
