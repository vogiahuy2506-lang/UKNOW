import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const client = {};
const repository = {
  findById: jest.fn(),
  createDocument: jest.fn(),
  findDocumentById: jest.fn(),
  updateDocumentStatus: jest.fn(),
  deleteChunksByDocId: jest.fn(),
  insertChunksBatched: jest.fn(),
};
const extractTextFromBuffer = jest.fn();
const withKbQuotaLock = jest.fn();
const countExtractedChars = jest.fn((text) => Array.from(String(text || '')).length);

jest.unstable_mockModule('../../../repositories/ai/knowledgeBase.repository.js', () => ({
  default: repository,
}));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer }));
jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({
  embedTexts: jest.fn(async (texts) => texts.map(() => null)),
}));
jest.unstable_mockModule('../../queue/kbDocumentQueue.service.js', () => ({
  default: { enqueueProcessDocument: jest.fn() },
}));
jest.unstable_mockModule('../../storage/kbQuota.service.js', () => ({
  countExtractedChars,
  withKbQuotaLock,
}));

const { default: knowledgeBaseService } = await import('../knowledgeBase.service.js');

describe('knowledgeBase.service PR-2-KB flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withKbQuotaLock.mockImplementation(async (_owner, mutation) => mutation({
      client,
      usage: {},
      assertDelta: jest.fn(),
    }));
    repository.findById.mockResolvedValue({ id: 7, id_user: 42 });
    repository.createDocument.mockImplementation(async (_kb, _owner, data) => ({ id: 9, ...data }));
  });

  it('extracts an uploaded file synchronously and catalogs full text before embedding', async () => {
    extractTextFromBuffer.mockResolvedValue('Nội dung tài liệu đầy đủ');
    const file = {
      buffer: Buffer.from('file'),
      originalname: 'guide.pdf',
      mimetype: 'application/pdf',
      size: 123,
    };

    const doc = await knowledgeBaseService.addFileDocument(7, 42, { title: 'Guide', file });

    expect(extractTextFromBuffer).toHaveBeenCalledWith(
      file.buffer, 'guide.pdf', 'application/pdf'
    );
    expect(repository.createDocument).toHaveBeenCalledWith(7, 42, expect.objectContaining({
      content_text: 'Nội dung tài liệu đầy đủ',
      extracted_chars: 24,
      source_type: 'file',
    }), client);
    expect(doc.content_text).toBe('Nội dung tài liệu đầy đủ');
  });

  it('claims both one document and its character delta under the owner lock', async () => {
    const assertDelta = jest.fn();
    withKbQuotaLock.mockImplementationOnce(async (_owner, mutation) => mutation({
      client,
      usage: {},
      assertDelta,
    }));

    await knowledgeBaseService.addDocument(7, 42, {
      title: 'Text',
      source_type: 'text',
      content_text: 'abc',
    });

    expect(withKbQuotaLock).toHaveBeenCalledWith(42, expect.any(Function));
    expect(assertDelta).toHaveBeenCalledWith({ documentDelta: 1, charDelta: 3 });
  });
});
