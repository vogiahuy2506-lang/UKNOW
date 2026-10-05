import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 3(a) (embedding): mỗi lần gọi embedding THẬT tới Google báo ĐÚNG MỘT sự kiện cho sổ bền (ok / busy / error / timeout);
 * kết quả lấy từ bộ nhớ đệm KHÔNG phải lần gọi nên không có sự kiện; người quan sát hỏng không làm hỏng lượt.
 * Google được giả lập ở RANH GIỚI fetch với đúng hình dạng phản hồi thật.
 */
jest.unstable_mockModule('../../services/ai/aiUsageMeter.service.js', () => ({
  default: { record: jest.fn(async () => undefined) },
}));

const { embedText } = await import('../embeddingClient.util.js');
const { setAiCallObserver } = await import('../aiCallObserver.util.js');

const okReply = () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => '',
  json: async () => ({ embedding: { values: Array(768).fill(0.01) }, usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 } }),
});
const errReply = (status) => ({
  ok: false,
  status,
  headers: { get: () => null },
  text: async () => '{"error":{"message":"x"}}',
  json: async () => ({}),
});

let seq = 0;
const uniq = (label) => `${label} #${Date.now()}-${(seq += 1)}`;

describe('embedding báo sự kiện cho sổ bền', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalBase = process.env.EMBEDDING_RETRY_BASE_MS;
  let events;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.EMBEDDING_RETRY_BASE_MS = '1';
    global.fetch = jest.fn(async () => okReply());
    events = [];
    setAiCallObserver((event) => { events.push(event); });
  });

  afterEach(() => {
    setAiCallObserver(null);
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.EMBEDDING_RETRY_BASE_MS;
    else process.env.EMBEDDING_RETRY_BASE_MS = originalBase;
  });

  it('gọi thành công → một sự kiện ok, feature + model + chủ; lần hỏi lại cùng câu (bộ nhớ đệm) KHÔNG thêm sự kiện', async () => {
    const text = uniq('xin chào');
    await embedText(text, { userId: 5, feature: 'embedding_rag_query', taskType: 'RETRIEVAL_QUERY' });
    await embedText(text, { userId: 5, feature: 'embedding_rag_query', taskType: 'RETRIEVAL_QUERY' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'embedding', feature: 'embedding_rag_query', outcome: 'ok', ownerUserId: 5, httpStatus: null,
    });
    expect(events[0].model).toBeTruthy();
  });

  it('429 sau hết lần thử lại → MỘT sự kiện busy (không phải một sự kiện mỗi lần thử), mã HTTP thật', async () => {
    global.fetch = jest.fn(async () => errReply(429));
    await expect(embedText(uniq('quá tải'), { userId: 5, feature: 'embedding_help' })).rejects.toMatchObject({ upstreamStatus: 429 });
    expect(global.fetch).toHaveBeenCalledTimes(4); // 1 lần đầu + 3 lần thử lại
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'busy', httpStatus: 429, errorCode: 'EMBEDDING_429', feature: 'embedding_help' });
  });

  it('400 (đầu vào sai) → error, không thử lại', async () => {
    global.fetch = jest.fn(async () => errReply(400));
    await expect(embedText(uniq('sai'), { userId: 5 })).rejects.toMatchObject({ upstreamStatus: 400 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'error', httpStatus: 400, errorCode: 'EMBEDDING_400', feature: 'embedding' });
  });

  it('đứt mạng / hết giờ 20 giây → timeout nếu là TimeoutError, còn lại error', async () => {
    global.fetch = jest.fn(async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); });
    await expect(embedText(uniq('hết giờ'), { userId: 5 })).rejects.toMatchObject({ status: 503 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'timeout', errorCode: 'EMBEDDING_TIMEOUT' });

    events.length = 0;
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(embedText(uniq('đứt mạng'), { userId: 5 })).rejects.toMatchObject({ status: 503 });
    expect(events[0]).toMatchObject({ outcome: 'error' });
  });

  it('người quan sát ném lỗi → vector vẫn trả về', async () => {
    setAiCallObserver(() => { throw new Error('quan sát hỏng'); });
    const vector = await embedText(uniq('vẫn chạy'), { userId: 5 });
    expect(vector).toHaveLength(768);
  });
});
