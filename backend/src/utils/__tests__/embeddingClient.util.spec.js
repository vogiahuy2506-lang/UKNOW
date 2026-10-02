import {
  afterEach, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

const mockRecord = jest.fn();
jest.unstable_mockModule('../../services/ai/aiUsageMeter.service.js', () => ({
  default: { record: mockRecord },
}));

const { extractEmbeddingUsage, embedText, embedTexts } = await import('../embeddingClient.util.js');

describe('extractEmbeddingUsage', () => {
  it('maps usageMetadata token counts', () => {
    expect(extractEmbeddingUsage({
      usageMetadata: { promptTokenCount: 12, totalTokenCount: 12 },
    })).toEqual({ promptTokens: 12, outputTokens: 0, totalTokens: 12 });
  });

  it('estimates from billableCharacterCount when tokens missing', () => {
    expect(extractEmbeddingUsage({
      usageMetadata: { billableCharacterCount: 40 },
    })).toEqual({ promptTokens: 10, outputTokens: 0, totalTokens: 10 });
  });

  it('falls back to text length estimate', () => {
    expect(extractEmbeddingUsage({}, 20)).toEqual({ promptTokens: 5, outputTokens: 0, totalTokens: 5 });
  });
});

/**
 * PLAN_GOP_MAU_TIN_MEDIA_VA_VIEC_LE_2026-10-03, PR-L / L2 - embedding KHONG co chu (cau hoi tro giup cua khach chua dang nhap, cron
 * nap lai bai huong dan) van phai ghi usage voi id_user NULL: Google tinh tien nhung ban cu `return` som khi thieu userId.
 * Gemini duoc gia lap bang global.fetch; DB duoc mock o aiUsageMeter (SQL that + id_user NULL that: aiUsageMissingCallsPr12.test.js).
 */
describe('embedText / embedTexts - ghi usage embedding, ke ca khi KHONG co userId', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.EMBEDDING_MODEL;
  // Bo nho dem embedding gom theo van ban: moi ca dung van ban rieng de khong trung nhau.
  let seq = 0;
  const uniqueText = (label) => `${label} #${Date.now()}-${(seq += 1)}`;

  const embedReply = () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      embedding: { values: Array(768).fill(0.01) },
      usageMetadata: { promptTokenCount: 12, totalTokenCount: 12 },
    }),
  });

  beforeEach(() => {
    mockRecord.mockReset();
    mockRecord.mockResolvedValue(undefined);
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.EMBEDDING_MODEL;
    global.fetch = jest.fn(async () => embedReply());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.EMBEDDING_MODEL;
    else process.env.EMBEDDING_MODEL = originalModel;
  });

  it('khach chua dang nhap (khong userId, feature embedding_help): ghi 1 dong voi chu = null, token that, model that, kind embedding', async () => {
    await embedText(uniqueText('lam sao gui zalo'), { feature: 'embedding_help' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith(
      null,
      { promptTokens: 12, outputTokens: 0, totalTokens: 12 },
      { feature: 'embedding_help', model: 'gemini-embedding-001', kind: 'embedding' },
    );
  });

  it('userId = null (nhu searchHelpChunks truyen xuong) cung ghi voi chu = null', async () => {
    await embedText(uniqueText('gia goi'), { userId: null, feature: 'embedding_help' });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toBeNull();
  });

  it('CO userId: giu nguyen hanh vi cu - ghi cho chu do', async () => {
    await embedText(uniqueText('tim bai'), { userId: 42, feature: 'embedding_rag_query' });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith(
      42,
      { promptTokens: 12, outputTokens: 0, totalTokens: 12 },
      { feature: 'embedding_rag_query', model: 'gemini-embedding-001', kind: 'embedding' },
    );
  });

  it('model lay tu EMBEDDING_MODEL khi co dat (khong ghi cung ten model)', async () => {
    process.env.EMBEDDING_MODEL = 'gemini-embedding-9';
    await embedText(uniqueText('model khac'), { feature: 'embedding_help' });
    expect(mockRecord.mock.calls[0][2]).toMatchObject({ model: 'gemini-embedding-9' });
  });

  it('cache trung (cung cau hoi lan 2): khong goi Google nen KHONG ghi them dong nao', async () => {
    const text = uniqueText('cau hoi lap lai');
    await embedText(text, { feature: 'embedding_help' });
    await embedText(text, { feature: 'embedding_help' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('Google khong tra token (usageMetadata rong, van ban rong): khong ghi dong 0 token', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ embedding: { values: Array(768).fill(0.01) } }),
    }));
    await embedText('', { feature: 'embedding_help' });
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('embedTexts (nap bai huong dan khong co chu, vd cron): moi doan ghi 1 dong voi chu = null', async () => {
    await embedTexts([uniqueText('doan 1'), uniqueText('doan 2')], { feature: 'embedding_help' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    mockRecord.mock.calls.forEach(([owner, usage, meta]) => {
      expect(owner).toBeNull();
      expect(usage.totalTokens).toBe(12);
      expect(meta).toMatchObject({ feature: 'embedding_help', kind: 'embedding' });
    });
  });
});
