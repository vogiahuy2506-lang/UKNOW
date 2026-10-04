import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * G1 — tài liệu kiến thức chatbot Studio (customChat.service): trần prompt, tìm bằng cosine, embedding, tên tệp.
 * Mock ở ranh giới (repository, embedding client, Gemini, ví AI); service thật.
 */
const mockRepo = {
  searchChunksByChatbot: jest.fn(),
  findChunkTexts: jest.fn(),
  findDocumentBySource: jest.fn(),
  findDocumentById: jest.fn(),
  upsertProcessingDocument: jest.fn(),
  replaceChunks: jest.fn(),
  markReady: jest.fn(),
  markError: jest.fn(),
  restoreDocument: jest.fn(),
};
const mockExtract = jest.fn();
const mockEmbedText = jest.fn();
const mockEmbedTexts = jest.fn();
const resolveAllowedModel = jest.fn();

// customChat.service đọc hồ sơ + sản phẩm của chủ (widget/trang /chat) — mock ở ranh giới, mặc định không có hồ sơ.
const mockFormattedProfile = jest.fn(async () => '');
jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({ default: mockRepo }));
jest.unstable_mockModule('../businessProfile.service.js', () => ({ default: { getFormattedProfileForPrompt: (...args) => mockFormattedProfile(...args) } }));
jest.unstable_mockModule('../../../utils/fileExtractor.util.js', () => ({ extractTextFromBuffer: (...args) => mockExtract(...args) }));
jest.unstable_mockModule('../../storage/kbQuota.service.js', () => ({
  countExtractedChars: (text) => String(text).length,
  withKbQuotaLock: async (_ownerId, fn) => fn({ client: { tag: 'tx' }, assertDelta: jest.fn() }),
}));
jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({ stripMarkdown: (t) => t }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage: () => ({}),
  isThinkingBudgetRejection: () => false,
  joinGeminiTextParts: () => '',
  // customChat.service gọi lõi dùng chung từ G2 (03/10/2026) — mock thiếu export này thì cả spec không nạp được.
  generateGeminiContent: jest.fn(),
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: (...args) => resolveAllowedModel(...args),
}));
jest.unstable_mockModule('../../chatbot/chatAttachment.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({
  embedText: (...args) => mockEmbedText(...args),
  embedTexts: (...args) => mockEmbedTexts(...args),
}));

const { default: svc } = await import('../customChat.service.js');

const HUGE = 'X'.repeat(219902);
const QUERY_VECTOR = [0.1, 0.2, 0.3];

/** `searchChunks` được thế bằng `chunks` (đã xếp theo độ liên quan) để đo riêng bước dựng prompt; null = chạy searchChunks thật. */
async function runChat({ history = [{ role: 'user', content: 'mấy giờ mở cửa?' }], chunks = null } = {}) {
  resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
  const meter = (await import('../aiUsageMeter.service.js')).default;
  meter.reserve = jest.fn().mockResolvedValue({ maxOutputTokens: 100 });
  meter.record = jest.fn().mockResolvedValue(undefined);
  const chatAttachment = (await import('../../chatbot/chatAttachment.service.js')).default;
  chatAttachment.buildAiPartsFromHistory = jest.fn().mockResolvedValue([]);
  const callSpy = jest.spyOn(svc, 'callGeminiWithRetry').mockResolvedValue({ text: 'ok', usage: {} });
  if (chunks) jest.spyOn(svc, 'searchChunks').mockResolvedValue(chunks);
  try {
    await svc.chat({ history, chatbotId: 17, userId: 90, systemInstruction: 'Bạn là trợ lý của shop.', temperature: 0.7, maxTokens: 100 });
    // A P2-5: khung + tài liệu + hồ sơ nằm ở systemInstruction (không còn một lượt văn bản duy nhất).
    return callSpy.mock.calls[0][1].systemInstruction.parts[0].text;
  } finally {
    callSpy.mockRestore();
  }
}

beforeEach(() => {
  mockRepo.searchChunksByChatbot.mockReset();
  mockRepo.findChunkTexts.mockReset().mockResolvedValue([]);
  mockEmbedText.mockReset().mockResolvedValue(QUERY_VECTOR);
  mockEmbedTexts.mockReset();
  mockExtract.mockReset();
  for (const fn of [
    mockRepo.findDocumentBySource, mockRepo.findDocumentById, mockRepo.upsertProcessingDocument,
    mockRepo.replaceChunks, mockRepo.markReady, mockRepo.markError, mockRepo.restoreDocument,
  ]) fn.mockReset();
  mockRepo.findDocumentBySource.mockResolvedValue(null);
  mockRepo.upsertProcessingDocument.mockResolvedValue({ id: 501 });
  mockRepo.findDocumentById.mockResolvedValue({ id: 501 });
  mockRepo.replaceChunks.mockResolvedValue(undefined);
  mockRepo.markReady.mockResolvedValue({ id: 501 });
  mockRepo.markError.mockResolvedValue(undefined);
  mockRepo.restoreDocument.mockResolvedValue(undefined);
  process.env.GEMINI_API_KEY = 'test-key';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('customChat.chat — trần prompt (A P0-3: đoạn 219.902 ký tự → ~94k token/câu)', () => {
  it('đoạn 219.902 ký tự trong tài liệu cũ → prompt gửi lên Gemini nhỏ (< 14.000 ký tự gồm khung chung ~6k), không chứa nguyên đoạn', async () => {
    const prompt = await runChat({ chunks: [HUGE, 'Giờ mở cửa 8h-21h'] });

    // Ngưỡng cũ 9.000 tính khi web chưa dùng khung chung (A P2-5 thêm ~6k khung); 219.902 ký tự thì vẫn cách xa.
    expect(prompt.length).toBeLessThan(14000);
    expect(prompt).toContain('Tài liệu tham khảo từ Knowledge Base:');
    expect(prompt).not.toContain('X'.repeat(1600));
    expect(prompt).toContain('Giờ mở cửa 8h-21h');
  });

  it('5 đoạn × 3.000 ký tự → phần tài liệu trong prompt ≤ 6.000 ký tự chữ', async () => {
    const prompt = await runChat({ chunks: ['A', 'B', 'C', 'D', 'E'].map((c) => `${c} `.repeat(1500)) });

    const docLines = prompt.split('\n').filter((line) => /^- [A-E] /.test(line));
    expect(docLines.length).toBeGreaterThan(0);
    expect(docLines.reduce((sum, line) => sum + line.length - 2, 0)).toBeLessThanOrEqual(6000);
    for (const line of docLines) expect(line.length - 2).toBeLessThanOrEqual(1500);
  });
});

describe('customChat.searchChunks — widget/trang công khai/Chat thử tìm bằng cosine như đường kênh (A P1-3, D-17)', () => {
  const hit = (text, similarity = 0.7) => ({ chunk_text: text, chunk_index: 0, source: 'a.docx', similarity });

  it('embed câu hỏi bằng RETRIEVAL_QUERY rồi gọi searchChunksByChatbot (đoạn cosine cao nhất), KHÔNG chấm từ khoá', async () => {
    mockRepo.searchChunksByChatbot.mockResolvedValue([hit('Chính sách đổi trả 7 ngày'), hit('Bảo hành 12 tháng', 0.5)]);

    const out = await svc.searchChunks({ chatbotId: 17, userId: 90, query: 'đổi trả thế nào' });

    expect(out).toEqual(['Chính sách đổi trả 7 ngày', 'Bảo hành 12 tháng']);
    expect(mockEmbedText).toHaveBeenCalledWith('đổi trả thế nào', expect.objectContaining({
      userId: 90,
      feature: 'embedding_rag_query',
      taskType: 'RETRIEVAL_QUERY',
    }));
    expect(mockRepo.searchChunksByChatbot).toHaveBeenCalledWith(
      17, 90, QUERY_VECTOR, { limit: 5, minSimilarity: 0.3 },
    );
    expect(mockRepo.findChunkTexts).not.toHaveBeenCalled();
  });

  it('đoạn khổng lồ chứa mọi từ khoá KHÔNG còn thắng: kết quả là đoạn cosine chọn, không phải đoạn từ-khoá-nhiều-nhất', async () => {
    mockRepo.searchChunksByChatbot.mockResolvedValue([hit('Giờ mở cửa 8h-21h')]);
    // Nếu code còn rơi về từ khoá thì đoạn này (chứa đủ từ) sẽ thắng.
    mockRepo.findChunkTexts.mockResolvedValue([`mở cửa giờ bao nhiêu ${'x '.repeat(50000)}`]);

    const out = await svc.searchChunks({ chatbotId: 17, userId: 90, query: 'giờ mở cửa bao nhiêu' });

    expect(out).toEqual(['Giờ mở cửa 8h-21h']);
  });

  it('cosine không có đoạn nào đủ giống → CHỈ tìm từ khoá trong đoạn chưa có embedding (onlyWithoutEmbedding)', async () => {
    mockRepo.searchChunksByChatbot.mockResolvedValue([]);
    mockRepo.findChunkTexts.mockResolvedValue(['Địa chỉ cửa hàng: 12 Lê Lợi', 'Số điện thoại 0909']);

    const out = await svc.searchChunks({ chatbotId: 17, userId: 90, query: 'địa chỉ cửa hàng ở đâu' });

    expect(out).toEqual(['Địa chỉ cửa hàng: 12 Lê Lợi']);
    expect(mockRepo.findChunkTexts).toHaveBeenCalledWith({ chatbotId: 17, userId: 90, onlyWithoutEmbedding: true });
  });

  it('embed câu hỏi lỗi (Google 503/hết khoá) → dự phòng từ khoá trên MỌI đoạn, không ném lỗi, không gọi cosine', async () => {
    mockEmbedText.mockRejectedValue(new Error('Embedding API lỗi (503)'));
    mockRepo.findChunkTexts.mockResolvedValue(['Giá gói Pro 499.000đ', 'Chính sách bảo hành']);

    const out = await svc.searchChunks({ chatbotId: 17, userId: 90, query: 'giá gói pro' });

    expect(out).toEqual(['Giá gói Pro 499.000đ']);
    expect(mockRepo.searchChunksByChatbot).not.toHaveBeenCalled();
    expect(mockRepo.findChunkTexts).toHaveBeenCalledWith({ chatbotId: 17, userId: 90 });
  });

  it('chạy trọn đường chat(): đoạn cosine được đưa vào prompt (không rơi về từ khoá)', async () => {
    mockRepo.searchChunksByChatbot.mockResolvedValue([hit('Giờ mở cửa 8h-21h')]);

    const prompt = await runChat();

    expect(prompt).toContain('- Giờ mở cửa 8h-21h');
    expect(mockRepo.findChunkTexts).not.toHaveBeenCalled();
  });
});

describe('customChat.chat — hồ sơ doanh nghiệp + sản phẩm của chủ vào prompt (widget nhúng, trang /chat)', () => {
  it('prompt chứa khối hồ sơ có tên + giá sản phẩm đang bán, lấy theo chủ chatbot (userId)', async () => {
    mockFormattedProfile.mockResolvedValue(
      '=== HỒ SƠ DOANH NGHIỆP (đầy đủ) ===\n- Sản phẩm / dịch vụ:\n1. Khoá học AI thực chiến — 500k\n=== HẾT HỒ SƠ ==='
    );

    const prompt = await runChat({ chunks: ['Giờ mở cửa 8h-21h'] });

    // Prompt CHATBOT: không có dòng Logo URL (A P2-6).
    expect(mockFormattedProfile).toHaveBeenCalledWith(90, { includeLogo: false });
    expect(prompt).toContain('Khoá học AI thực chiến — 500k');
    expect(prompt).toContain('- Giờ mở cửa 8h-21h');
  });

  it('đọc hồ sơ ném lỗi → vẫn trả lời, prompt không có khối hồ sơ', async () => {
    mockFormattedProfile.mockRejectedValue(new Error('DB down'));

    const prompt = await runChat({ chunks: ['Giờ mở cửa 8h-21h'] });

    expect(prompt).toContain('- Giờ mở cửa 8h-21h');
    expect(prompt).not.toContain('HỒ SƠ DOANH NGHIỆP');
  });
});

const originalApiKey = process.env.GEMINI_API_KEY;
afterAll(() => {
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
});

describe('customChat.generateEmbeddings — hỏng thì ném lỗi, không âm thầm "ready" không vector (A P2-8, D-12, D-24)', () => {
  const chunks = ['Đoạn một về giá.', 'Đoạn hai về bảo hành.'];
  const vectors = [[0.1, 0.2], [0.3, 0.4]];

  it('embed THẲNG văn bản đoạn — không còn tiền tố "[chỉ số] " — kèm userId và feature đúng', async () => {
    mockEmbedTexts.mockResolvedValue(vectors);

    const out = await svc.generateEmbeddings(chunks, 90);

    expect(out).toEqual(vectors);
    expect(mockEmbedTexts).toHaveBeenCalledWith(chunks, { userId: 90, feature: 'embedding_custom_chat_doc' });
    for (const text of mockEmbedTexts.mock.calls[0][0]) expect(text).not.toMatch(/^\[\d+\] /);
  });

  it('embedTexts bị từ chối (429 hết lần thử) → generateEmbeddings NÉM lỗi tiếng Việt mã EMBEDDING_FAILED/503 (đã await, catch không còn chết)', async () => {
    mockEmbedTexts.mockRejectedValue(Object.assign(new Error('Embedding API lỗi (429): {"error":"quota"}'), { status: 503 }));

    const error = await svc.generateEmbeddings(chunks, 90).catch((e) => e);

    expect(error.status).toBe(503);
    expect(error.code).toBe('EMBEDDING_FAILED');
    expect(error.message).toMatch(/^Không tạo được chỉ mục tìm kiếm cho tài liệu/);
    // Lỗi gốc bằng tiếng Anh/JSON của Google KHÔNG lộ ra thông điệp người dùng thấy.
    expect(error.message).not.toMatch(/429|quota|Embedding API/);
    expect(error.cause.message).toMatch(/429/);
  });

  it('thiếu vector (số vector ≠ số đoạn, hoặc có vector rỗng) → coi là lỗi, không trả nửa vời', async () => {
    mockEmbedTexts.mockResolvedValue([[0.1, 0.2]]);
    await expect(svc.generateEmbeddings(chunks, 90)).rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });

    mockEmbedTexts.mockResolvedValue([[0.1, 0.2], []]);
    await expect(svc.generateEmbeddings(chunks, 90)).rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });
  });

  it('môi trường không có GEMINI_API_KEY (dev) → [] (chế độ từ khoá), không gọi embed', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(svc.generateEmbeddings(chunks, 90)).resolves.toEqual([]);
    expect(mockEmbedTexts).not.toHaveBeenCalled();
  });
});

describe('customChat — nạp tài liệu: chia đoạn ≤ 1.500 + embedding hỏng → status error', () => {
  it('văn bản 200k ký tự KHÔNG xuống dòng → mọi đoạn lưu vào DB ≤ 1.500, mỗi đoạn có vector tương ứng, markReady với đúng số đoạn', async () => {
    mockEmbedTexts.mockImplementation(async (texts) => texts.map(() => [0.5, 0.5]));
    const text = Array.from({ length: 3000 }, (_, i) => `Câu số ${i} nói về sản phẩm Trà Sen Tây Hồ, giá ${i * 1000} đồng một hộp.`).join(' ');

    const result = await svc.addTextDocument({ chatbotId: 17, userId: 90, title: 'Bảng giá', content: text });

    const saved = mockRepo.replaceChunks.mock.calls[0][0];
    expect(saved.chunks.length).toBeGreaterThan(100);
    expect(Math.max(...saved.chunks.map((c) => c.length))).toBeLessThanOrEqual(1500);
    expect(saved.embeddings).toHaveLength(saved.chunks.length);
    expect(mockRepo.markReady).toHaveBeenCalledWith(501, saved.chunks.length, expect.anything());
    expect(result.chunks).toBe(saved.chunks.length);
  });

  it('tên tệp tải lên bị multer đọc thành mojibake → lưu đúng tên UTF-8 ở source_key, title và source của đoạn (A P3-1)', async () => {
    mockExtract.mockResolvedValue('Nội dung hồ sơ chuyên gia, đủ dài để tạo đoạn tài liệu.');
    mockEmbedTexts.mockImplementation(async (texts) => texts.map(() => [0.5, 0.5]));
    const proper = 'Profile chuyên gia Nguyễn.pdf';

    await svc.uploadDocument({
      chatbotId: 17,
      userId: 90,
      file: { originalname: Buffer.from(proper, 'utf8').toString('latin1'), buffer: Buffer.from('%PDF-1.4') },
    });

    expect(mockExtract.mock.calls[0][1]).toBe(proper);
    expect(mockRepo.findDocumentBySource).toHaveBeenCalledWith(17, 90, proper, expect.anything(), { forUpdate: true });
    expect(mockRepo.upsertProcessingDocument).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: proper, title: proper }),
      expect.anything(),
    );
    expect(mockRepo.replaceChunks.mock.calls[0][0].source).toBe(proper);
  });

  it('embedding hỏng + tài liệu MỚI → markError với lý do tiếng Việt, KHÔNG replaceChunks, KHÔNG markReady, lỗi 503 đến người gọi', async () => {
    mockEmbedTexts.mockRejectedValue(new Error('Embedding API lỗi (429)'));

    const error = await svc.addTextDocument({ chatbotId: 17, userId: 90, title: 'Tài liệu', content: 'Nội dung đủ dài để tạo đoạn.' }).catch((e) => e);

    expect(error.status).toBe(503);
    expect(mockRepo.markError).toHaveBeenCalledTimes(1);
    expect(mockRepo.markError.mock.calls[0][0]).toBe(501);
    expect(mockRepo.markError.mock.calls[0][1]).toMatch(/^Không tạo được chỉ mục tìm kiếm cho tài liệu/);
    expect(mockRepo.replaceChunks).not.toHaveBeenCalled();
    expect(mockRepo.markReady).not.toHaveBeenCalled();
  });

  it('embedding hỏng khi NẠP LẠI tài liệu đã có → khôi phục bản cũ (còn dùng được), không để tài liệu hỏng', async () => {
    const previous = { id: 501, status: 'ready', chunk_count: 3, extracted_chars: 100 };
    mockRepo.findDocumentBySource.mockResolvedValue(previous);
    mockEmbedTexts.mockRejectedValue(new Error('Embedding API lỗi (503)'));

    await expect(svc.addTextDocument({ chatbotId: 17, userId: 90, title: 'Tài liệu', content: 'Nội dung mới đủ dài.' }))
      .rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });

    expect(mockRepo.restoreDocument).toHaveBeenCalledWith(previous, expect.anything());
    expect(mockRepo.markError).not.toHaveBeenCalled();
    expect(mockRepo.replaceChunks).not.toHaveBeenCalled();
  });
});
