import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * G1 — tài liệu kiến thức chatbot Studio (customChat.service): trần prompt, tìm bằng cosine, embedding, tên tệp.
 * Mock ở ranh giới (repository, embedding client, Gemini, ví AI); service thật.
 */
const mockRepo = {
  searchChunksByChatbot: jest.fn(),
  findChunkTexts: jest.fn(),
};
const mockEmbedText = jest.fn();
const mockEmbedTexts = jest.fn();
const resolveAllowedModel = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({ default: mockRepo }));
jest.unstable_mockModule('../../../utils/fileExtractor.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({ stripMarkdown: (t) => t }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage: () => ({}),
  isThinkingBudgetRejection: () => false,
  joinGeminiTextParts: () => '',
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
    return callSpy.mock.calls[0][0][0].text;
  } finally {
    callSpy.mockRestore();
  }
}

beforeEach(() => {
  mockRepo.searchChunksByChatbot.mockReset();
  mockRepo.findChunkTexts.mockReset().mockResolvedValue([]);
  mockEmbedText.mockReset().mockResolvedValue(QUERY_VECTOR);
  mockEmbedTexts.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('customChat.chat — trần prompt (A P0-3: đoạn 219.902 ký tự → ~94k token/câu)', () => {
  it('đoạn 219.902 ký tự trong tài liệu cũ → prompt gửi lên Gemini nhỏ (< 9.000 ký tự), không chứa nguyên đoạn', async () => {
    const prompt = await runChat({ chunks: [HUGE, 'Giờ mở cửa 8h-21h'] });

    expect(prompt.length).toBeLessThan(9000);
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
