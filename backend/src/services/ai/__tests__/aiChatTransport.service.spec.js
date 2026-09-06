import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn(() => ({ promptTokens: 10, outputTokens: 8192, totalTokens: 8202 }));
const parseAiJson = jest.fn((text) => JSON.parse(text));
const reserve = jest.fn(async () => ({ maxOutputTokens: 8192 }));
const record = jest.fn(async () => {});

jest.unstable_mockModule('axios', () => ({
  default: {
    post: axiosPost,
  },
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
}));

jest.unstable_mockModule('../../../utils/aiJsonParse.util.js', () => ({
  parseAiJson,
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer: jest.fn(),
}));

jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts: jest.fn(),
}));

jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve,
    record,
  },
}));

jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));

const { runChat } = await import('../aiChatTransport.service.js');

describe('aiChatTransport.service', () => {
  beforeEach(() => {
    axiosPost.mockReset();
    extractGeminiUsage.mockClear();
    parseAiJson.mockClear();
    reserve.mockClear();
    record.mockClear();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('khi finishReason là MAX_TOKENS: ném lỗi thông điệp rõ ràng và không gọi parseAiJson', async () => {
    axiosPost.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            finishReason: 'MAX_TOKENS',
            content: {
              parts: [{ text: '{"type":"landing_page","content":"Đang tạo","data":{"html":"<div' }],
            },
          },
        ],
      },
    });

    await expect(
      runChat({
        systemPrompt: 'sys prompt',
        history: [{ role: 'user', content: 'Tạo landing page thật dài' }],
        userId: 101,
      })
    ).rejects.toThrow('AI trả lời quá dài bị cắt, hãy rút ngắn yêu cầu.');

    expect(parseAiJson).not.toHaveBeenCalled();
  });

  it('khi response bình thường: gọi parseAiJson và ghi nhận usage', async () => {
    axiosPost.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: '{"type":"text","content":"Chào bạn"}' }],
            },
          },
        ],
      },
    });

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
      expect.objectContaining({ feature: 'smart_chat' })
    );
  });
});
