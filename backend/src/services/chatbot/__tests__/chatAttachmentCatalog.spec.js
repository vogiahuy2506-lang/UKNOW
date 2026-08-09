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

jest.unstable_mockModule('fs', () => ({
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    unlink: mockUnlink,
    rm: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer: jest.fn(async () => 'enough text content here for extraction'),
}));

const {
  persistChatBlob,
  storeChatFile,
  CHAT_ATTACHMENT_SOURCES,
} = await import('../chatAttachment.service.js');

describe('persistChatBlob / storeChatFile catalog', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    mockMkdir.mockReset().mockResolvedValue(undefined);
    mockWriteFile.mockReset().mockResolvedValue(undefined);
    mockBuildUrl.mockClear();
    mockSanitize.mockClear();
    mockResolveAbs.mockClear();
  });

  it('persistChatBlob inserts chat_attachments with storage_key and expires_at', async () => {
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
    expect(ttlMs).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThan(91 * 24 * 60 * 60 * 1000);
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

  it('catalog insert failure is fail-soft (still returns file)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const buf = Buffer.from('%PDF-1.4 hello');
    const result = await persistChatBlob({
      buffer: buf,
      originalName: 'a.pdf',
      mimetype: 'application/pdf',
      ownerUserId: 1,
      source: 'ai_assistant',
    });
    expect(result._key).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
