import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 (D-15): một cửa ghi sổ bền các lần gọi AI. Ghim ba bất biến của `recordAiCallEvent`:
 *  1. KHÔNG BAO GIỜ làm hỏng lượt AI (repository từ chối / ném đồng bộ → vẫn trả lời hứa thường, đếm vào bộ đếm RAM);
 *  2. KHÔNG chặn đường nóng khi CSDL chậm (không chờ repository; quá trần số lần ghi đang bay thì bỏ + đếm);
 *  3. KHÔNG ghi nội dung / PII vào meta.
 * Ranh giới giả lập: repository (`insertEvent`). Phần còn lại là mã thật.
 */
const insertEvent = jest.fn();
jest.unstable_mockModule('../../../repositories/ai/aiCallEvent.repository.js', () => ({ insertEvent }));

const {
  recordAiCallEvent,
  normalizeAiCallEvent,
  sanitizeMeta,
  isAiCallEventsEnabled,
  getAiCallEventStats,
  resetAiCallEventStatsForTest,
  AI_CALL_LAYER,
  AI_CALL_OUTCOME,
} = await import('../aiCallEvents.service.js');

describe('aiCallEvents.service', () => {
  const originalFlag = process.env.AI_CALL_EVENTS_ENABLED;
  let errorSpy;

  beforeEach(() => {
    process.env.AI_CALL_EVENTS_ENABLED = 'true';
    insertEvent.mockReset().mockResolvedValue(undefined);
    resetAiCallEventStatsForTest();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (originalFlag === undefined) delete process.env.AI_CALL_EVENTS_ENABLED;
    else process.env.AI_CALL_EVENTS_ENABLED = originalFlag;
  });

  describe('ghi một sự kiện', () => {
    it('ghi đúng một dòng đã chuẩn hoá và trả true', async () => {
      const ok = await recordAiCallEvent({
        layer: AI_CALL_LAYER.GEMINI,
        feature: 'chatbot_reply',
        model: 'gemini-2.5-flash',
        outcome: AI_CALL_OUTCOME.FALLBACK_OK,
        httpStatus: 503,
        errorCode: 'AI_PROVIDER_BUSY',
        durationMs: 1234.4,
        ownerUserId: '7',
        actorUserId: 9,
        meta: { fallbackUsed: true, primaryModel: 'gemini-x', attempts: 2 },
      });
      expect(ok).toBe(true);
      expect(insertEvent).toHaveBeenCalledTimes(1);
      expect(insertEvent).toHaveBeenCalledWith({
        ownerUserId: 7,
        actorUserId: 9,
        layer: 'gemini',
        feature: 'chatbot_reply',
        model: 'gemini-2.5-flash',
        outcome: 'fallback_ok',
        httpStatus: 503,
        errorCode: 'AI_PROVIDER_BUSY',
        durationMs: 1234,
        meta: { fallbackUsed: true, primaryModel: 'gemini-x', attempts: 2 },
      });
      expect(getAiCallEventStats()).toMatchObject({ written: 1, writeFailed: 0, dropped: 0 });
    });

    it('tắt bằng AI_CALL_EVENTS_ENABLED=false: không chạm repository', async () => {
      process.env.AI_CALL_EVENTS_ENABLED = 'false';
      expect(await recordAiCallEvent({ feature: 'x', outcome: 'ok' })).toBe(false);
      expect(insertEvent).not.toHaveBeenCalled();
    });

    it('mặc định: bật ngoài môi trường test, tắt trong NODE_ENV=test (test đơn vị không tự chạm CSDL)', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.AI_CALL_EVENTS_ENABLED;
      try {
        process.env.NODE_ENV = 'production';
        expect(isAiCallEventsEnabled()).toBe(true);
        process.env.NODE_ENV = 'test';
        expect(isAiCallEventsEnabled()).toBe(false);
        process.env.AI_CALL_EVENTS_ENABLED = 'true';
        expect(isAiCallEventsEnabled()).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('KHÔNG làm hỏng lượt AI', () => {
    it('repository từ chối: lời hứa vẫn thành công (false), đếm writeFailed, in đúng một dòng log', async () => {
      insertEvent.mockRejectedValue(new Error('DB sập'));
      await expect(recordAiCallEvent({ feature: 'x', outcome: 'ok' })).resolves.toBe(false);
      await expect(recordAiCallEvent({ feature: 'x', outcome: 'ok' })).resolves.toBe(false);
      expect(getAiCallEventStats()).toMatchObject({ written: 0, writeFailed: 2 });
      // Throttle: hai lần hỏng liên tiếp chỉ ồn MỘT dòng (CSDL sập không được làm mỗi lượt AI in một dòng).
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).toContain('DB sập');
    });

    it('repository ném ĐỒNG BỘ: không lọt ra nơi gọi', async () => {
      insertEvent.mockImplementation(() => { throw new Error('ném đồng bộ'); });
      let result;
      expect(() => { result = recordAiCallEvent({ feature: 'x', outcome: 'ok' }); }).not.toThrow();
      await expect(result).resolves.toBe(false);
      expect(getAiCallEventStats().writeFailed).toBe(1);
    });

    it('đầu vào rác (undefined, chuỗi) không ném', async () => {
      await expect(recordAiCallEvent()).resolves.toBe(true);
      await expect(recordAiCallEvent(null)).resolves.toBe(true);
      expect(insertEvent.mock.calls[0][0]).toMatchObject({ feature: 'unknown', outcome: 'error', layer: 'gemini' });
    });
  });

  describe('KHÔNG chặn đường nóng khi CSDL chậm', () => {
    it('gọi trả về NGAY dù repository chưa xong; quá trần số lần ghi đang bay thì bỏ + đếm dropped', async () => {
      insertEvent.mockReturnValue(new Promise(() => {})); // CSDL treo mãi
      const pending = [];
      for (let i = 0; i < 205; i += 1) pending.push(recordAiCallEvent({ feature: 'x', outcome: 'ok' }));
      // 200 lần đầu đã vào "đang bay"; 5 lần sau bị bỏ ngay (lời hứa của chúng xong liền, không treo theo CSDL).
      const settled = await Promise.race([
        Promise.all(pending.slice(200)),
        new Promise((resolve) => { setTimeout(() => resolve('treo'), 200); }),
      ]);
      expect(settled).toEqual([false, false, false, false, false]);
      expect(insertEvent).toHaveBeenCalledTimes(200);
      expect(getAiCallEventStats()).toMatchObject({ dropped: 5, inFlight: 200 });
    });
  });

  describe('chuẩn hoá', () => {
    it('outcome lạ → error; layer lạ → gemini; feature rỗng/lạ ký tự → unknown / làm sạch', () => {
      expect(normalizeAiCallEvent({ outcome: 'weird', layer: 'nope', feature: '' })).toMatchObject({
        outcome: 'error', layer: 'gemini', feature: 'unknown',
      });
      expect(normalizeAiCallEvent({ feature: 'a b/c', outcome: 'ok' }).feature).toBe('a_b_c');
      expect(normalizeAiCallEvent({ feature: 'x'.repeat(100), outcome: 'ok' }).feature).toHaveLength(60);
    });

    it('mã HTTP ngoài 100–599, thời gian âm, id không phải số nguyên dương → null', () => {
      expect(normalizeAiCallEvent({ outcome: 'ok', httpStatus: 0, durationMs: -5, ownerUserId: 0, actorUserId: 'abc' }))
        .toMatchObject({ httpStatus: null, durationMs: null, ownerUserId: null, actorUserId: null });
      expect(normalizeAiCallEvent({ outcome: 'error', httpStatus: 429, durationMs: 0 }))
        .toMatchObject({ httpStatus: 429, durationMs: 0 });
    });
  });

  describe('meta KHÔNG mang nội dung / PII', () => {
    it('giữ số, cờ, mã/id/tên model; mảng phẳng ngắn', () => {
      expect(sanitizeMeta({
        chatbotId: 12, channel: 'zalo_personal', ragChunks: 3, topSimilarity: 0.82, outcome: 'answered',
        fallbackUsed: true, primaryModel: 'gemini-2.5-flash', unsafeKinds: ['script', 'event'],
      })).toEqual({
        chatbotId: 12, channel: 'zalo_personal', ragChunks: 3, topSimilarity: 0.82, outcome: 'answered',
        fallbackUsed: true, primaryModel: 'gemini-2.5-flash', unsafeKinds: ['script', 'event'],
      });
    });

    it('loại câu chữ, tiếng Việt có dấu, email, chuỗi dài, object lồng — và ghi số khoá bị loại vào droppedMeta', () => {
      const out = sanitizeMeta({
        prompt: 'Viết cho tôi một trang landing bán khoá học',
        reply: 'Xin chào anh Nguyễn',
        email: 'khach@example.com',
        long: 'a'.repeat(200),
        nested: { a: 1 },
        listWithSentence: ['ok', 'có dấu cách'],
        'bad key': 1,
        count: 5,
        nothing: null,
      });
      expect(out).toEqual({ count: 5, droppedMeta: 7 });
      expect(JSON.stringify(out)).not.toMatch(/landing|Nguy|example/);
    });

    it('số vô hạn / NaN bị loại; meta không phải object → {}', () => {
      expect(sanitizeMeta({ a: Infinity, b: NaN, c: 1 })).toEqual({ c: 1, droppedMeta: 2 });
      expect(sanitizeMeta('chuỗi')).toEqual({});
      expect(sanitizeMeta(['x'])).toEqual({});
      expect(sanitizeMeta(null)).toEqual({});
    });

    it('trần số khoá', () => {
      const big = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
      const out = sanitizeMeta(big);
      expect(Object.keys(out).filter((k) => k !== 'droppedMeta')).toHaveLength(24);
      expect(out.droppedMeta).toBe(16);
    });

    it('recordAiCallEvent ép meta trước khi ghi (nơi gọi lỡ truyền nội dung thì KHÔNG xuống CSDL)', async () => {
      await recordAiCallEvent({ feature: 'x', outcome: 'ok', meta: { reply: 'Xin chào anh Nguyễn Văn A', tokens: 10 } });
      expect(insertEvent.mock.calls[0][0].meta).toEqual({ tokens: 10, droppedMeta: 1 });
    });
  });
});
