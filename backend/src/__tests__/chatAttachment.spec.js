import { describe, it, expect, jest, beforeEach, afterEach, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import moduleLib from 'module';

process.env.JWT_SECRET = 'test-chat-attachment-secret';

const mockPdfParse = jest.fn().mockImplementation(async (buffer, options = {}) => {
  const pages = typeof options.max === 'number' && options.max > 0 ? options.max : 100;
  return { text: `PDF text for ${pages} pages from ${buffer.length} bytes` };
});

const actualCreateRequire = moduleLib.createRequire;
jest.spyOn(moduleLib, 'createRequire').mockImplementation((metaUrl) => {
  return (id) => {
    if (id === 'pdf-parse') return mockPdfParse;
    return actualCreateRequire(metaUrl)(id);
  };
});

// storeChatFile → persistChatBlob ghi row chat_attachments qua db.query. Unit test
// KHÔNG có Postgres (nhất là CI) → INSERT thật treo tới timeout 5s. Mock db để insert
// trả ngay; test này chỉ kiểm đường dẫn key + file trên đĩa, không kiểm row DB.
jest.unstable_mockModule('../config/database.js', () => ({
  default: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
}));

jest.unstable_mockModule('../services/storage/storageObject.service.js', () => ({
  getPhysicalSize: jest.fn(async () => 1),
  registerWrittenStorageObject: jest.fn(async () => ({ id: 1 })),
  markDeletedAfterUnlink: jest.fn(async () => null),
  ensureTrackedTempStorageObject: jest.fn(async () => ({ id: 1 })),
  promoteTempStorageObjects: jest.fn(async () => [{ id: 1 }]),
  promoteTempStorageObject: jest.fn(async () => ({ id: 1 })),
}));

const {
  signChatAttachmentRef,
  resolveChatAttachmentRef,
} = await import('../utils/chatAttachmentRef.js');

const chatAttachment = await import('../services/chatbot/chatAttachment.service.js');
const {
  validateFile,
  storeChatFile,
  enrichAttachmentsForStorage,
  presentAttachmentsForClient,
  buildAiParts,
  MAX_FILES_PER_MESSAGE,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  TEXT_PER_FILE_CHARS,
  TEXT_BUDGET_CHARS,
} = chatAttachment;

const { extractTextFromBuffer } = await import('../utils/fileParser.util.js');

const TEST_USER = 91001;
const uploadsChatDir = path.resolve(process.cwd(), 'uploads', String(TEST_USER), 'chat');

function pdfBuffer() {
  return Buffer.from('%PDF-1.4 fake content for tests');
}

function zipMagicBuffer() {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
}

function pngBuffer() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
}

async function cleanup() {
  try {
    await fs.rm(path.resolve(process.cwd(), 'uploads', String(TEST_USER)), { recursive: true, force: true });
  } catch { /* ignore */ }
}

describe('chatAttachment', () => {
  afterEach(cleanup);
  afterAll(cleanup);

  describe('validateFile', () => {
    it('uses the same 100MB limit for images and documents', () => {
      expect(MAX_IMAGE_BYTES).toBe(100 * 1024 * 1024);
      expect(MAX_IMAGE_BYTES).toBe(MAX_FILE_BYTES);
    });

    it('accepts pdf with correct mime and magic', () => {
      const result = validateFile({
        buffer: pdfBuffer(),
        originalName: 'report.pdf',
        mimetype: 'application/pdf',
      });
      expect(result.kind).toBe('doc');
      expect(result.ext).toBe('.pdf');
    });

    it('rejects pdf whose magic is PK (zip)', () => {
      expect(() => validateFile({
        buffer: zipMagicBuffer(),
        originalName: 'report.pdf',
        mimetype: 'application/pdf',
      })).toThrow(/không khớp/i);
    });

    it('rejects exe renamed to pdf', () => {
      expect(() => validateFile({
        buffer: Buffer.from('MZ\x90\x00fake-exe'),
        originalName: 'virus.pdf',
        mimetype: 'application/pdf',
      })).toThrow(/không khớp/i);
    });

    it('rejects .doc with clear message about .docx', () => {
      expect(() => validateFile({
        buffer: Buffer.from('anything'),
        originalName: 'old.doc',
        mimetype: 'application/msword',
      })).toThrow(/docx/i);
    });

    it('accepts pptx with correct mime and magic', () => {
      const result = validateFile({
        buffer: zipMagicBuffer(),
        originalName: 'slides.pptx',
        mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      expect(result.kind).toBe('doc');
      expect(result.ext).toBe('.pptx');
    });

    it('rejects .ppt with clear message about .pptx', () => {
      expect(() => validateFile({
        buffer: Buffer.from('anything'),
        originalName: 'old.ppt',
        mimetype: 'application/vnd.ms-powerpoint',
      })).toThrow(/pptx/i);
    });

    it('rejects svg', () => {
      expect(() => validateFile({
        buffer: Buffer.from('<svg></svg>'),
        originalName: 'x.svg',
        mimetype: 'image/svg+xml',
      })).toThrow(/SVG/i);
    });

    it('rejects file over 100MB', () => {
      const big = Buffer.alloc(101 * 1024 * 1024, 0x25);
      big[0] = 0x25; big[1] = 0x50; big[2] = 0x44; big[3] = 0x46;
      expect(() => validateFile({
        buffer: big,
        originalName: 'big.pdf',
        mimetype: 'application/pdf',
      })).toThrow(/dung lượng/i);
    });
  });

  describe('storeChatFile path safety', () => {
    it('keeps key under uploads/<userId>/chat/ even with traversal name', async () => {
      const stored = await storeChatFile({
        buffer: pdfBuffer(),
        originalName: '../../etc/passwd.pdf',
        mimetype: 'application/pdf',
        ownerUserId: TEST_USER,
        chatbotId: 7,
        bind: { uid: TEST_USER },
      });
      expect(stored._key).toMatch(new RegExp(`^uploads/${TEST_USER}/chat/`));
      expect(stored._key).not.toContain('..');
      expect(stored.ref).toBeTruthy();
      expect(stored.type).toBe('file');
    });
  });

  describe('ref HMAC', () => {
    it('blocks ref from chatbot A on chatbot B', () => {
      const ref = signChatAttachmentRef('uploads/1/chat/a.pdf', { chatbotId: 1, uid: 9 });
      expect(() => resolveChatAttachmentRef(ref, { chatbotId: 2, uid: 9 })).toThrow(/chatbot/i);
    });

    it('blocks expired ref', () => {
      const ref = signChatAttachmentRef('uploads/1/chat/a.pdf', { chatbotId: 1, uid: 9 }, { ttlMs: -1000 });
      expect(() => resolveChatAttachmentRef(ref, { chatbotId: 1, uid: 9 })).toThrow(/hết hạn/i);
    });

    it('blocks tampered ref', () => {
      const ref = signChatAttachmentRef('uploads/1/chat/a.pdf', { chatbotId: 1, uid: 9 });
      const tampered = `${ref.slice(0, -2)}xx`;
      expect(() => resolveChatAttachmentRef(tampered, { chatbotId: 1, uid: 9 })).toThrow();
    });

    it('signRef then resolveRef round-trips', () => {
      const key = 'uploads/5/chat/doc.pdf';
      const ref = signChatAttachmentRef(key, { chatbotId: 3, uid: 5 });
      const data = resolveChatAttachmentRef(ref, { chatbotId: 3, uid: 5 });
      expect(data.sk).toBe(key);
    });
  });

  describe('enrich / present', () => {
    it('ignores bare key in body and only accepts ref', () => {
      const key = 'uploads/1/chat/secret.pdf';
      const result = enrichAttachmentsForStorage(
        [{ type: 'file', name: 'x.pdf', key, url: '/x' }],
        { chatbotId: 1, uid: 1 }
      );
      expect(result).toEqual([]);
    });

    it('rejects 4th file', () => {
      const refs = [];
      for (let i = 0; i < 4; i += 1) {
        refs.push({
          type: 'file',
          name: `f${i}.pdf`,
          ref: signChatAttachmentRef(`uploads/1/chat/f${i}.pdf`, { chatbotId: 1, uid: 1 }),
        });
      }
      expect(() => enrichAttachmentsForStorage(refs, { chatbotId: 1, uid: 1 })).toThrow(/Tối đa/);
      expect(MAX_FILES_PER_MESSAGE).toBe(3);
    });

    it('DB shape has key without ref; client shape has ref without key', () => {
      const key = 'uploads/1/chat/a.pdf';
      const ref = signChatAttachmentRef(key, { chatbotId: 1, uid: 1 });
      const stored = enrichAttachmentsForStorage(
        [{ type: 'file', name: 'a.pdf', size: 10, mime: 'application/pdf', url: 'http://x', ref }],
        { chatbotId: 1, uid: 1 }
      );
      expect(stored[0].key).toBe(key);
      expect(stored[0].ref).toBeUndefined();

      const presented = presentAttachmentsForClient(stored, { chatbotId: 1, uid: 1 });
      expect(presented[0].ref).toBeTruthy();
      expect(presented[0].key).toBeUndefined();
    });

    it('never stores client-supplied url (XSS / javascript:)', () => {
      const key = 'uploads/1/chat/a.pdf';
      const ref = signChatAttachmentRef(key, { chatbotId: 1, uid: 1 });
      const stored = enrichAttachmentsForStorage(
        [{
          type: 'file',
          name: 'evil.pdf',
          size: 10,
          mime: 'text/html',
          url: 'javascript:alert(document.cookie)',
          ref,
        }],
        { chatbotId: 1, uid: 1 }
      );
      expect(stored[0].url).not.toMatch(/javascript:/i);
      expect(stored[0].url).toContain('/file/');
      expect(stored[0].mime).toBe('application/pdf');
      expect(stored[0].name).toBe('a.pdf');
    });

    it('keeps sanitized displayName from client for UI', () => {
      const key = 'uploads/1/chat/175_B_o.pdf';
      const ref = signChatAttachmentRef(key, { chatbotId: 1, uid: 1 });
      const stored = enrichAttachmentsForStorage(
        [{ type: 'file', displayName: 'Báo cáo tháng 8.pdf', ref }],
        { chatbotId: 1, uid: 1 }
      );
      expect(stored[0].displayName).toBe('Báo cáo tháng 8.pdf');
      expect(stored[0].key).toBe(key);
      const presented = presentAttachmentsForClient(stored, { chatbotId: 1, uid: 1 });
      expect(presented[0].displayName).toBe('Báo cáo tháng 8.pdf');
      expect(presented[0].key).toBeUndefined();
    });

    it('passes through channel attachments without key (no crash)', () => {
      const presented = presentAttachmentsForClient(
        [{ type: 'image', url: 'https://cdn.example/zalo.jpg', name: 'ảnh' }],
        { includeRef: false }
      );
      expect(presented[0].url).toBe('https://cdn.example/zalo.jpg');
      expect(presented[0].key).toBeUndefined();
      expect(presented[0].ref).toBeUndefined();
    });
  });

  describe('buildAiParts', () => {
    beforeEach(async () => {
      await fs.mkdir(uploadsChatDir, { recursive: true });
    });

    it('ignores client-supplied key without ref (IDOR)', async () => {
      const victimKey = `uploads/${TEST_USER}/chat/secret.pdf`;
      const abs = path.resolve(process.cwd(), victimKey);
      await fs.writeFile(abs, 'x');
      await fs.writeFile(`${abs}.txt`, 'BI MAT CUA CHU KHAC');

      const { parts } = await buildAiParts({
        attachments: [{ type: 'file', name: 'x.pdf', key: victimKey }],
        budgetChars: TEXT_BUDGET_CHARS,
        isLatestTurn: false,
        resolveBind: { chatbotId: 1, uid: 1 },
      });
      expect(parts).toEqual([]);
    });

    it('ignores image key without ref (no base64 leak)', async () => {
      const victimKey = `uploads/${TEST_USER}/chat/pic.png`;
      await fs.writeFile(path.resolve(process.cwd(), victimKey), pngBuffer());
      const { parts } = await buildAiParts({
        attachments: [{ type: 'image', mime: 'image/png', key: victimKey }],
        isLatestTurn: true,
        resolveBind: { chatbotId: 1, uid: TEST_USER },
      });
      expect(parts.some((p) => p.inline_data)).toBe(false);
      expect(parts).toEqual([]);
    });

    it('keeps newest docs within 12000 char budget', async () => {
      const attachments = [];
      for (let i = 0; i < 3; i += 1) {
        const key = `uploads/${TEST_USER}/chat/doc${i}.pdf`;
        const abs = path.resolve(process.cwd(), key);
        await fs.writeFile(abs, 'x');
        await fs.writeFile(`${abs}.txt`, 'A'.repeat(TEXT_PER_FILE_CHARS));
        attachments.push({
          type: 'file',
          name: `doc${i}.pdf`,
          ref: signChatAttachmentRef(key, { chatbotId: 7, uid: TEST_USER }),
        });
      }
      const { parts, budgetUsed } = await buildAiParts({
        attachments,
        budgetChars: TEXT_BUDGET_CHARS,
        isLatestTurn: false,
        resolveBind: { chatbotId: 7, uid: TEST_USER },
      });
      expect(budgetUsed).toBeLessThanOrEqual(TEXT_BUDGET_CHARS);
      expect(parts.some((p) => p.text?.includes('doc2.pdf'))).toBe(true);
      expect(parts.length).toBeGreaterThan(0);
    });

    it('old images become text placeholders, not inline_data', async () => {
      const key = `uploads/${TEST_USER}/chat/pic.png`;
      await fs.writeFile(path.resolve(process.cwd(), key), pngBuffer());
      const ref = signChatAttachmentRef(key, { chatbotId: 7, uid: TEST_USER });
      const { parts } = await buildAiParts({
        attachments: [{ type: 'image', name: 'pic.png', mime: 'image/png', ref }],
        isLatestTurn: false,
        resolveBind: { chatbotId: 7, uid: TEST_USER },
      });
      expect(parts.some((p) => p.inline_data)).toBe(false);
      expect(parts.some((p) => p.text?.includes('[Ảnh đã gửi:'))).toBe(true);
    });
  });

  describe('fileParser options', () => {
    it('passes max:0 by default so KB path unchanged', async () => {
      mockPdfParse.mockClear();
      await extractTextFromBuffer(pdfBuffer(), 'a.pdf', 'application/pdf');
      expect(mockPdfParse).toHaveBeenCalled();
      const opts = mockPdfParse.mock.calls[0][1];
      expect(opts.max).toBe(0);
    });
  });
});
