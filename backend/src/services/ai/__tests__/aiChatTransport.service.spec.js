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
  isPdfFile: (name, type) => {
    const ext = (name || '').toLowerCase();
    const mime = String(type || '').toLowerCase();
    return ext.endsWith('.pdf') || mime === 'application/pdf';
  },
  PDF_INLINE_MAX_BYTES: 10 * 1024 * 1024,
  PDF_INLINE_BUDGET_BYTES: 15 * 1024 * 1024,
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

  describe('PR scan PDF in chat transport', () => {
    const fakeGeminiSuccess = () => {
      axiosPost.mockResolvedValueOnce({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [{ text: '{"type":"text","content":"OK"}' }],
              },
            },
          ],
        },
      });
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

      const postBody = axiosPost.mock.calls[0][1];
      const parts = postBody.contents[0].parts;
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

      const postBody = axiosPost.mock.calls[0][1];
      const parts = postBody.contents[0].parts;
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

      const postBody = axiosPost.mock.calls[0][1];
      const parts = postBody.contents[0].parts;
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

      const postBody = axiosPost.mock.calls[0][1];
      const parts = postBody.contents[0].parts;
      const inlineParts = parts.filter((p) => p.inlineData);
      expect(inlineParts).toHaveLength(1);
      expect(inlineParts[0].inlineData.mimeType).toBe('application/pdf');
      expect(inlineParts[0].inlineData.data).toBe(pdfBuf1.toString('base64'));

      const budgetPart = parts.find((p) => p.text && p.text.includes('hết ngân sách'));
      expect(budgetPart).toBeDefined();
      expect(budgetPart.text).toContain('scan2.pdf');
    });

    it('C5: readTempFileBuffer ném lỗi fs có /app/ -> part text \'đã hết hạn hoặc không đọc được\', không chứa /app/, axiosPost vẫn được gọi', async () => {
      fakeGeminiSuccess();
      readTempFileBuffer.mockRejectedValueOnce(new Error("ENOENT: open '/app/temp_uploads/x.pdf'"));

      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'Đọc file này' }],
        files: [{ tempId: 't5', originalName: 'expired.pdf', contentType: 'application/pdf' }],
        userId: 101,
      });

      expect(axiosPost).toHaveBeenCalled();
      const postBody = axiosPost.mock.calls[0][1];
      const parts = postBody.contents[0].parts;
      const errorPart = parts.find((p) => p.text && p.text.includes('đã hết hạn hoặc không đọc được'));
      expect(errorPart).toBeDefined();
      expect(errorPart.text).not.toContain('/app/');
    });
  });
});
