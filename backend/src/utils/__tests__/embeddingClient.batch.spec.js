import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * G1.5 — embedding client: song song ≤ 5, thử lại 429/5xx, cắt đầu vào, taskType.
 * Google được giả lập ở RANH GIỚI fetch với đúng hình dạng phản hồi thật ({ ok, status, headers, text(), json() }).
 */
const mockRecord = jest.fn();
jest.unstable_mockModule('../../services/ai/aiUsageMeter.service.js', () => ({
  default: { record: mockRecord },
}));

const {
  embedText, embedTexts, EMBEDDING_CONCURRENCY, EMBEDDING_MAX_INPUT_CHARS,
} = await import('../embeddingClient.util.js');

const okReply = () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => '',
  json: async () => ({
    embedding: { values: Array(768).fill(0.01) },
    usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
  }),
});
const errReply = (status, body = '{"error":{"message":"busy"}}', headers = {}) => ({
  ok: false,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => body,
  json: async () => JSON.parse(body),
});

let seq = 0;
const uniq = (label) => `${label} #${Date.now()}-${(seq += 1)}`;
const bodyOf = (call) => JSON.parse(call[1].body);

const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const originalBase = process.env.EMBEDDING_RETRY_BASE_MS;

beforeEach(() => {
  mockRecord.mockReset().mockResolvedValue(undefined);
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.EMBEDDING_RETRY_BASE_MS = '1';
  global.fetch = jest.fn(async () => okReply());
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.EMBEDDING_RETRY_BASE_MS;
  else process.env.EMBEDDING_RETRY_BASE_MS = originalBase;
});

describe('embedTexts — giới hạn song song (A P2-8, D-12: Promise.all bắn đồng loạt → 429)', () => {
  it(`60 đoạn khác nhau → không bao giờ quá ${EMBEDDING_CONCURRENCY} lời gọi cùng lúc, vẫn đủ 60 vector đúng thứ tự`, async () => {
    expect(EMBEDDING_CONCURRENCY).toBe(5);
    let inFlight = 0;
    let maxInFlight = 0;
    global.fetch = jest.fn(async (url, init) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 3));
      inFlight -= 1;
      const marker = Number(/@(\d+)/.exec(JSON.parse(init.body).content.parts[0].text)[1]);
      return {
        ...okReply(),
        json: async () => ({ embedding: { values: Array(768).fill(marker) }, usageMetadata: { totalTokenCount: 10 } }),
      };
    });

    const run = uniq('song song');
    const texts = Array.from({ length: 60 }, (_, i) => `${run} đoạn @${i}`);
    const vectors = await embedTexts(texts, { feature: 'embedding_custom_chat_doc' });

    expect(global.fetch).toHaveBeenCalledTimes(60);
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(vectors).toHaveLength(60);
    vectors.forEach((vector, i) => expect(vector[0]).toBe(i));
  });

  it('văn bản trùng nhau trong lô chỉ embed MỘT lần (nhưng mọi vị trí đều có vector)', async () => {
    const a = uniq('trùng');
    const b = uniq('khác');
    const vectors = await embedTexts([a, b, a, a], { feature: 'embedding_custom_chat_doc' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(vectors).toHaveLength(4);
    vectors.forEach((vector) => expect(vector).toHaveLength(768));
    expect(vectors[0]).toBe(vectors[2]);
  });

  it('một đoạn lỗi hẳn → cả lô ném lỗi VÀ ngừng bắn thêm lời gọi (không đốt tiền cho lô đã hỏng)', async () => {
    global.fetch = jest.fn(async () => errReply(503));

    const texts = Array.from({ length: 40 }, (_, i) => `${uniq('lỗi hàng loạt')}-${i}`);
    await expect(embedTexts(texts, { feature: 'embedding_custom_chat_doc' })).rejects.toThrow(/Embedding API lỗi \(503\)/);

    // 5 luồng × (1 lần đầu + 3 lần thử lại) = 20; 40 đoạn × 4 = 160 nếu không dừng.
    expect(global.fetch.mock.calls.length).toBeLessThanOrEqual(5 * 4);
  });

  it('lô rỗng → [] và không gọi Google', async () => {
    await expect(embedTexts([], { feature: 'embedding_custom_chat_doc' })).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('embedText — thử lại 429/5xx có nghỉ', () => {
  it('429 rồi 200 → thành công ở lần thử lại thứ nhất', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(errReply(429))
      .mockResolvedValueOnce(okReply());

    const vector = await embedText(uniq('429'), { feature: 'embedding_custom_chat_doc' });

    expect(vector).toHaveLength(768);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Chỉ lời gọi thành công mới ghi token (lần 429 không tốn token).
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('503, 500, 200 → thành công ở lần thử lại thứ hai', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(errReply(503))
      .mockResolvedValueOnce(errReply(500))
      .mockResolvedValueOnce(okReply());

    await expect(embedText(uniq('5xx'), { feature: 'embedding_custom_chat_doc' })).resolves.toHaveLength(768);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('đứt mạng (fetch ném lỗi) rồi 200 → thử lại và thành công', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okReply());

    await expect(embedText(uniq('mạng'), { feature: 'embedding_custom_chat_doc' })).resolves.toHaveLength(768);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('429 mãi → ném lỗi sau 1 + 3 lần thử, kèm mã 503 và upstreamStatus 429', async () => {
    global.fetch = jest.fn(async () => errReply(429));

    const error = await embedText(uniq('429 mãi'), { feature: 'embedding_custom_chat_doc' }).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/Embedding API lỗi \(429\)/);
    expect(error.status).toBe(503);
    expect(error.upstreamStatus).toBe(429);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('400 (đầu vào sai) KHÔNG thử lại', async () => {
    global.fetch = jest.fn(async () => errReply(400));

    await expect(embedText(uniq('400'), { feature: 'embedding_custom_chat_doc' })).rejects.toThrow(/Embedding API lỗi \(400\)/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('đứt mạng mãi → ném lỗi có chữ "không phản hồi" sau 1 + 3 lần', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); });

    await expect(embedText(uniq('mạng mãi'), { feature: 'embedding_custom_chat_doc' })).rejects.toThrow(/không phản hồi/);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

describe('embedText — đầu vào ≤ 2.048 token và taskType (D-24)', () => {
  it(`văn bản 50.000 ký tự → chỉ gửi ${EMBEDDING_MAX_INPUT_CHARS} ký tự đầu`, async () => {
    expect(EMBEDDING_MAX_INPUT_CHARS).toBe(6000);
    await embedText(`${uniq('dài')} ${'a'.repeat(50000)}`, { feature: 'embedding_custom_chat_doc' });

    const sent = bodyOf(global.fetch.mock.calls[0]).content.parts[0].text;
    expect(sent).toHaveLength(6000);
  });

  it('không cắt giữa cặp surrogate khi trần rơi vào giữa emoji', async () => {
    for (const prefix of ['', 'a']) {
      global.fetch.mockClear();
      await embedText(`${prefix}${'😀'.repeat(6000)}`, { feature: `embedding_surrogate_${prefix || 'none'}` });
      const sent = bodyOf(global.fetch.mock.calls[0]).content.parts[0].text;
      expect(sent.length).toBeLessThanOrEqual(6000);
      expect(sent.isWellFormed()).toBe(true);
    }
  });

  it('mặc định task_type = RETRIEVAL_DOCUMENT (tài liệu)', async () => {
    await embedText(uniq('tài liệu'), { feature: 'embedding_custom_chat_doc' });
    expect(bodyOf(global.fetch.mock.calls[0]).task_type).toBe('RETRIEVAL_DOCUMENT');
  });

  it("taskType 'RETRIEVAL_QUERY' (câu hỏi) được gửi lên Google", async () => {
    await embedText(uniq('câu hỏi'), { feature: 'embedding_rag_query', taskType: 'RETRIEVAL_QUERY' });
    expect(bodyOf(global.fetch.mock.calls[0]).task_type).toBe('RETRIEVAL_QUERY');
  });

  it('taskType lạ → rơi về RETRIEVAL_DOCUMENT (không gửi giá trị rác cho Google)', async () => {
    await embedText(uniq('lạ'), { feature: 'embedding_rag_query', taskType: 'NOT_A_TASK' });
    expect(bodyOf(global.fetch.mock.calls[0]).task_type).toBe('RETRIEVAL_DOCUMENT');
  });

  it('cùng văn bản + cùng feature nhưng khác taskType là HAI vector: bộ nhớ đệm không trả nhầm bản DOCUMENT cho câu hỏi', async () => {
    const text = uniq('đệm');
    await embedText(text, { feature: 'embedding_rag_query' });
    await embedText(text, { feature: 'embedding_rag_query', taskType: 'RETRIEVAL_QUERY' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Lần nữa mỗi loại → trúng đệm.
    await embedText(text, { feature: 'embedding_rag_query' });
    await embedText(text, { feature: 'embedding_rag_query', taskType: 'RETRIEVAL_QUERY' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('embedTexts cũng truyền taskType', async () => {
    await embedTexts([uniq('lô 1'), uniq('lô 2')], { feature: 'embedding_x', taskType: 'RETRIEVAL_QUERY' });
    global.fetch.mock.calls.forEach((call) => expect(bodyOf(call).task_type).toBe('RETRIEVAL_QUERY'));
  });
});
