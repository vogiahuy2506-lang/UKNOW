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

  it('đính kèm tệp từ storage_key trong lịch sử hội thoại khi không còn tempId', async () => {
    readFileBufferByKey.mockResolvedValueOnce(Buffer.from('doc-content'));
    extractTextFromBuffer.mockResolvedValueOnce('Nội dung file Word từ storage');

    axiosPost.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: '{"type":"text","content":"Đã đọc file"}' }],
            },
          },
        ],
      },
    });

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
    const postBody = axiosPost.mock.calls[0][1];
    const userParts = postBody.contents[0].parts;
    const docPart = userParts.find((p) => p.text && p.text.includes('Nội dung file Word từ storage'));
    expect(docPart).toBeDefined();
  });
});
