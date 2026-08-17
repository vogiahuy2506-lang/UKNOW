import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockBuildUrl = jest.fn((key, opts = {}) => `/file/token-for-${key}${opts.preview ? '?p=1' : ''}`);
const mockSanitize = jest.fn((name) => String(name || 'file').replace(/\.[^.]+$/, '').replace(/[^\w.-]/g, '_') || 'file');
const mockResolveAbs = jest.fn((key) => `/abs/${key}`);
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    sanitizeFileBaseName: mockSanitize,
    resolveAbsolutePathFromKey: mockResolveAbs,
    buildDownloadUrlByKey: mockBuildUrl,
    readTempFileBuffer: jest.fn(async () => Buffer.from('%PDF-1.4 test')),
    deleteTempFileById: jest.fn(async () => true),
  },
}));

const mockPut = jest.fn(async () => {});
const mockGetBuffer = jest.fn(async () => Buffer.from('mock buffer'));

jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => ({
    put: mockPut,
    getBuffer: mockGetBuffer,
    exists: jest.fn(async () => true),
    delete: jest.fn(async () => {}),
  }),
}));

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer: jest.fn(async () => 'enough text content here for extraction'),
}));

const mockRegisterStorage = jest.fn(async () => ({ id: 77 }));
jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  getPhysicalSize: jest.fn(async () => 123),
  registerWrittenStorageObject: mockRegisterStorage,
  markDeletedAfterUnlink: jest.fn(async () => null),
}));

const {
  persistChatBlob,
  storeChatFile,
  deleteChatAttachment,
  promoteChatAttachments,
  CHAT_ATTACHMENT_SOURCES,
} = await import('../chatAttachment.service.js');

describe('persistChatBlob / storeChatFile catalog', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    mockPut.mockReset().mockResolvedValue(undefined);
    mockGetBuffer.mockReset().mockResolvedValue(Buffer.from('mock buffer'));
    mockBuildUrl.mockClear();
    mockSanitize.mockClear();
    mockResolveAbs.mockClear();
  });

  it('persistChatBlob inserts chat_attachments with storage_key and 24h temp expires_at', async () => {
    const buf = Buffer.from('%PDF-1.4 hello');
    const result = await persistChatBlob({
      buffer: buf,
      originalName: 'report.pdf',
      mimetype: 'application/pdf',
      ownerUserId: 42,
      source: CHAT_ATTACHMENT_SOURCES.WEB,
    });

    expect(result._key).toMatch(/^uploads\/42\/chat\//);
    expect(mockQuery).toHaveBeenCalled();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO chat_attachments/i);
    expect(sql).toMatch(/ON CONFLICT \(storage_key\) DO NOTHING/);
    expect(params[0]).toBe(42);
    expect(params[1]).toBe('chatbot_web');
    expect(params[2]).toBe(result._key);
    expect(params[7]).toBeInstanceOf(Date);
    const ttlMs = params[7].getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThan(25 * 60 * 60 * 1000);

    expect(mockRegisterStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'temp',
        ownerUserId: 42,
      })
    );
  });

  it('storeChatFile with bind.sid uses chatbot_web source', async () => {
    const buf = Buffer.from('%PDF-1.4 hello');
    await storeChatFile({
      buffer: buf,
      originalName: 'a.pdf',
      mimetype: 'application/pdf',
      ownerUserId: 7,
      chatbotId: 9,
      bind: { sid: 'sess-1' },
    });
    expect(mockQuery.mock.calls[0][1][1]).toBe('chatbot_web');
  });

  it('storeChatFile with bind.uid uses chatbot_studio source', async () => {
    const buf = Buffer.from('%PDF-1.4 hello');
    await storeChatFile({
      buffer: buf,
      originalName: 'a.pdf',
      mimetype: 'application/pdf',
      ownerUserId: 7,
      chatbotId: 9,
      bind: { uid: 7 },
    });
    expect(mockQuery.mock.calls[0][1][1]).toBe('chatbot_studio');
  });

  it('catalog insert failure removes the ledger-backed physical object', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const buf = Buffer.from('%PDF-1.4 hello');
    await expect(persistChatBlob({
      buffer: buf,
      originalName: 'a.pdf',
      mimetype: 'application/pdf',
      ownerUserId: 1,
      source: 'ai_assistant',
    })).rejects.toThrow('db down');
  });

  describe('promoteChatAttachments', () => {
    it('promotes storage objects from temp to active with 90d TTL', async () => {
      await promoteChatAttachments([{ key: 'uploads/42/chat/test.pdf' }]);
      expect(mockQuery).toHaveBeenCalled();
      const calls = mockQuery.mock.calls;
      const updateStorage = calls.find(([sql]) => sql.includes('UPDATE storage_objects'));
      expect(updateStorage).toBeDefined();
      expect(updateStorage[0]).toMatch(/SET state = 'active'/);
      expect(updateStorage[1][0]).toBe('uploads/42/chat/test.pdf');
    });
  });

  describe('deleteChatAttachment', () => {
    it('throws 409 if file is already referenced by a message', async () => {
      // Mock db.query so isKeyReferenced returns a row
      mockQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }], rowCount: 1 });
      const stored = await storeChatFile({
        buffer: Buffer.from('%PDF-1.4 hello'),
        originalName: 'a.pdf',
        mimetype: 'application/pdf',
        ownerUserId: 7,
        chatbotId: 9,
        bind: { uid: 7 },
      });

      mockQuery.mockReset();
      // isKeyReferenced query returns 1 row (referenced)
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 });

      await expect(
        deleteChatAttachment({
          ref: stored.ref,
          chatbotId: 9,
          bind: { uid: 7 },
          ownerUserId: 7,
        })
      ).rejects.toThrow(/đã được gửi trong tin nhắn/);
    });
  });
});
