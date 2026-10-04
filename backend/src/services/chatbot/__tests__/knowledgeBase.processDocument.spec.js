import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-12 + EXTRA-A1 — KB kênh (`kb_documents` / `kb_chunks`): xử lý tài liệu.
 *
 * Bản cũ: embed lỗi bị nuốt (`console.warn` + vector null) rồi tài liệu vẫn `ready` — tìm kiếm chỉ đọc đoạn CÓ vector nên tài liệu
 * đó không bao giờ được dùng mà chủ không hay biết; và dùng bộ chia đoạn riêng 500 ký tự thay vì `kbChunker.util.js`.
 *
 * Mock ở ranh giới: repository, embedding client, hàng đợi, khoá hạn mức. Service + kbChunker chạy thật.
 */
const client = { tag: 'tx' };
const repository = {
  findDocumentById: jest.fn(),
  updateDocumentStatus: jest.fn(),
  deleteChunksByDocId: jest.fn(),
  insertChunksBatched: jest.fn(),
  findById: jest.fn(),
};
const embedTexts = jest.fn();
const withKbQuotaLock = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/knowledgeBase.repository.js', () => ({ default: repository }));
jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({ embedTexts: (...args) => embedTexts(...args) }));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../queue/kbDocumentQueue.service.js', () => ({ default: { enqueueProcessDocument: jest.fn() } }));
jest.unstable_mockModule('../../storage/kbQuota.service.js', () => ({
  countExtractedChars: (text) => Array.from(String(text || '')).length,
  withKbQuotaLock: (...args) => withKbQuotaLock(...args),
}));

const { default: knowledgeBaseService, KB_EMBEDDING_FAILED_MESSAGE } = await import('../knowledgeBase.service.js');

const SENTENCE = 'Trà Sen Tây Hồ được ướp thủ công từ sen bách diệp, hương thơm dịu và vị ngọt hậu rất đặc trưng.';
// ~7.700 ký tự, KHÔNG có dòng trống: bộ chia cũ (500 ký tự) ra ~17 đoạn ≤ 500; kbChunker ra ~7 đoạn dài hơn hẳn.
const LONG_TEXT = Array.from({ length: 80 }, (_, i) => `${SENTENCE} (${i})`).join(' ');

const vectorsFor = (texts) => texts.map(() => [0.1, 0.2, 0.3]);

function arrangeDocument({ status = 'queued', text = LONG_TEXT, previous = null } = {}) {
  const current = previous || { id: 9, id_kb: 7, status, title: 'Bảng giá', content_text: text, extracted_chars: 0, chunk_count: 0, error_message: null };
  repository.findDocumentById.mockResolvedValue(current);
  repository.updateDocumentStatus.mockImplementation(async (_id, _owner, patch) => ({ ...current, ...patch }));
  return current;
}

const statusUpdates = () => repository.updateDocumentStatus.mock.calls.map((call) => call[2]);

describe('knowledgeBase.processDocument — embed lỗi KHÔNG còn thành tài liệu "ready" không vector (D-12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withKbQuotaLock.mockImplementation(async (_owner, mutation) => mutation({ client, usage: {}, assertDelta: jest.fn() }));
    repository.deleteChunksByDocId.mockResolvedValue(undefined);
    repository.insertChunksBatched.mockResolvedValue(undefined);
    embedTexts.mockImplementation(async (texts) => vectorsFor(texts));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('embed hỏng → ném EMBEDDING_FAILED 503 câu tiếng Việt, tài liệu `error` kèm lý do, KHÔNG lưu đoạn nào, KHÔNG `ready`', async () => {
    arrangeDocument();
    embedTexts.mockRejectedValue(new Error('Embedding API lỗi (429): quota exceeded'));

    const error = await knowledgeBaseService.processDocument(9, 7, 42).catch((e) => e);

    expect(error.status).toBe(503);
    expect(error.code).toBe('EMBEDDING_FAILED');
    expect(error.message).toBe(KB_EMBEDDING_FAILED_MESSAGE);
    expect(error.message).not.toMatch(/quota|429|Embedding API/);
    expect(repository.insertChunksBatched).not.toHaveBeenCalled();
    const updates = statusUpdates();
    expect(updates.some((patch) => patch.status === 'ready')).toBe(false);
    expect(updates.at(-1)).toMatchObject({ status: 'error', error_message: KB_EMBEDDING_FAILED_MESSAGE, chunk_count: 0 });
  });

  it('embed trả vector THIẾU (có phần tử null) → vẫn là lỗi, không lưu đoạn không vector', async () => {
    arrangeDocument();
    embedTexts.mockImplementation(async (texts) => texts.map((_, i) => (i === 1 ? null : [0.1, 0.2])));

    await expect(knowledgeBaseService.processDocument(9, 7, 42)).rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });

    expect(repository.insertChunksBatched).not.toHaveBeenCalled();
    expect(statusUpdates().some((patch) => patch.status === 'ready')).toBe(false);
  });

  it('embed trả ÍT vector hơn số đoạn → lỗi', async () => {
    arrangeDocument();
    embedTexts.mockImplementation(async (texts) => vectorsFor(texts).slice(0, -1));

    await expect(knowledgeBaseService.processDocument(9, 7, 42)).rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });

    expect(repository.insertChunksBatched).not.toHaveBeenCalled();
  });

  it('xử lý LẠI tài liệu đã `ready` mà embed hỏng → khôi phục bản cũ (còn dùng được), không để tài liệu hỏng', async () => {
    const previous = arrangeDocument({
      previous: { id: 9, id_kb: 7, status: 'ready', title: 'Bảng giá', content_text: LONG_TEXT, extracted_chars: 7700, chunk_count: 7, error_message: null },
    });
    embedTexts.mockRejectedValue(new Error('Embedding API lỗi (503)'));

    await expect(knowledgeBaseService.processDocument(9, 7, 42)).rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });

    expect(repository.insertChunksBatched).not.toHaveBeenCalled();
    expect(repository.deleteChunksByDocId).not.toHaveBeenCalled();
    expect(statusUpdates().at(-1)).toMatchObject({ status: 'ready', chunk_count: previous.chunk_count });
    expect(statusUpdates().some((patch) => patch.status === 'error')).toBe(false);
  });

  it('embed thành công → đoạn nào cũng CÓ vector, tài liệu `ready` với đúng số đoạn', async () => {
    arrangeDocument();

    const result = await knowledgeBaseService.processDocument(9, 7, 42);

    const stored = repository.insertChunksBatched.mock.calls[0][3];
    expect(stored.length).toBeGreaterThan(1);
    expect(stored.every((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0)).toBe(true);
    expect(result).toMatchObject({ docId: 9, chunkCount: stored.length, status: 'ready' });
    expect(statusUpdates().at(-1)).toMatchObject({ status: 'ready', chunk_count: stored.length });
  });
});

describe('knowledgeBase.processDocument — dùng kbChunker.util.js, không còn bộ chia 500 ký tự riêng (EXTRA-A1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withKbQuotaLock.mockImplementation(async (_owner, mutation) => mutation({ client, usage: {}, assertDelta: jest.fn() }));
    embedTexts.mockImplementation(async (texts) => vectorsFor(texts));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('đoạn dài ~1.100 ký tự, cứng ≤ 1.500 (bộ chia cũ cho ≤ 500) và chồng lấn giữa các đoạn', async () => {
    arrangeDocument();

    await knowledgeBaseService.processDocument(9, 7, 42);

    const lengths = repository.insertChunksBatched.mock.calls[0][3].map((chunk) => chunk.text.length);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(1500);
    expect(Math.max(...lengths)).toBeGreaterThan(900);
    // Số đoạn nhỏ hơn hẳn ~16 đoạn của bộ chia 500 ký tự.
    expect(lengths.length).toBeLessThan(12);
  });

  it('cấu hình cũ của KB (chunk_size 500, chế độ sentence) không còn thu nhỏ đoạn', async () => {
    arrangeDocument();

    await knowledgeBaseService.processDocument(9, 7, 42, { chunkSize: 500, chunkingMode: 'sentence' });

    const lengths = repository.insertChunksBatched.mock.calls[0][3].map((chunk) => chunk.text.length);
    expect(Math.max(...lengths)).toBeGreaterThan(900);
  });
});
