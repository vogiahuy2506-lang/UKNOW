/**
 * P5 buoc 5 - nhan anh/tep khach gui (Telegram/WhatsApp): luu vao kho chat cua chu, cho giu cho cho AI, tran 20 MB,
 * ly do bo qua. Ranh gioi gia: `chatAttachment.service` (persistChatBlob tra DUNG hinh dang that: `_key`, `displayName`,
 * `size`, `mime`, `type`) — validateFile that khong chay o day (da co spec rieng), nen ca "dinh dang la" mo phong bang
 * httpError 400 giong validateFile nem.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPersist = jest.fn();
const mockPromote = jest.fn();

jest.unstable_mockModule('../chatAttachment.service.js', () => ({
  CHAT_ATTACHMENT_SOURCES: { WEB: 'chatbot_web', STUDIO: 'chatbot_studio', ASSISTANT: 'ai_assistant', INBOX_OUTBOUND: 'inbox_outbound' },
  persistChatBlob: mockPersist,
  promoteChatAttachments: mockPromote,
  presentAttachmentsForClient: (list) => list.map((a) => ({ type: a.type, url: `signed:${a.key}`, name: a.displayName })),
}));

const {
  INBOUND_MEDIA_MAX_BYTES,
  INBOUND_MEDIA_PLACEHOLDERS,
  buildInboundMediaContent,
  defaultInboundFileName,
  presentInboundAttachments,
  promoteInboundAttachments,
  storeInboundMedia,
} = await import('../channelInboundMedia.service.js');
const { StorageQuotaExceededError } = await import('../../storage/storageQuota.service.js');

const persisted = {
  _key: 'uploads/42/chat/1700000000_hinh-anh.jpg',
  displayName: 'hinh-anh.jpg',
  size: 3,
  mime: 'image/jpeg',
  type: 'image',
};

describe('buildInboundMediaContent', () => {
  it('caption thang; khong caption -> cho giu cho theo loai', () => {
    expect(buildInboundMediaContent({ caption: '  Xem giup  ', kind: 'image' })).toBe('Xem giup');
    expect(buildInboundMediaContent({ caption: '', kind: 'image' })).toBe('[Hình ảnh]');
    expect(buildInboundMediaContent({ caption: null, kind: 'file' })).toBe('[Tệp]');
    expect(INBOUND_MEDIA_PLACEHOLDERS).toEqual({ image: '[Hình ảnh]', file: '[Tệp]' });
  });

  it('khong luu duoc -> cho giu cho kem ly do (khong mat tin cua khach)', () => {
    expect(buildInboundMediaContent({ kind: 'file', skipReason: 'too_large' })).toBe('[Tệp] (quá 20 MB, không lưu)');
    expect(buildInboundMediaContent({ kind: 'image', skipReason: 'quota' })).toBe('[Hình ảnh] (hết dung lượng lưu trữ, không lưu)');
    expect(buildInboundMediaContent({ kind: 'file', skipReason: 'unsupported' })).toContain('định dạng không hỗ trợ');
    // co caption thi caption THANG, ly do chi nam o metadata.
    expect(buildInboundMediaContent({ caption: 'Bao gia', kind: 'file', skipReason: 'too_large' })).toBe('Bao gia');
  });

  it('ten mac dinh khi nen tang khong cung cap ten', () => {
    expect(defaultInboundFileName('image', 'image/jpeg')).toBe('hinh-anh.jpg');
    expect(defaultInboundFileName('image', 'image/png')).toBe('hinh-anh.png');
    expect(defaultInboundFileName('file', 'application/pdf')).toBe('tep.pdf');
  });
});

describe('storeInboundMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockPersist.mockResolvedValue(persisted);
    mockPromote.mockResolvedValue(undefined);
  });

  it('tran 20 MB ghim dung', () => {
    expect(INBOUND_MEDIA_MAX_BYTES).toBe(20 * 1024 * 1024);
  });

  it('luu vao kho chat CUA CHU (nhan inbox_outbound) va tra dung dang attachments cua Hop thu', async () => {
    const result = await storeInboundMedia({
      ownerUserId: 42, buffer: Buffer.from('abc'), fileName: 'anh.jpg', mimeType: 'image/jpeg', kind: 'image',
    });
    expect(mockPersist).toHaveBeenCalledWith({
      buffer: Buffer.from('abc'),
      originalName: 'anh.jpg',
      mimetype: 'image/jpeg',
      ownerUserId: 42,
      source: 'inbox_outbound',
    });
    expect(result).toEqual({
      attachment: { key: persisted._key, displayName: 'hinh-anh.jpg', size: 3, mime: 'image/jpeg', type: 'image' },
      skipReason: null,
    });
  });

  it('khong co ten -> dung ten mac dinh (persistChatBlob can duoi tep)', async () => {
    await storeInboundMedia({ ownerUserId: 42, buffer: Buffer.from('abc'), mimeType: 'image/png', kind: 'image' });
    expect(mockPersist.mock.calls[0][0].originalName).toBe('hinh-anh.png');
  });

  it('QUA 20 MB -> bo qua too_large, KHONG ghi kho', async () => {
    const big = Buffer.alloc(INBOUND_MEDIA_MAX_BYTES + 1);
    const result = await storeInboundMedia({ ownerUserId: 42, buffer: big, fileName: 'a.pdf', kind: 'file' });
    expect(result).toEqual({ attachment: null, skipReason: 'too_large' });
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('dung 20 MB van luu', async () => {
    const edge = Buffer.alloc(INBOUND_MEDIA_MAX_BYTES);
    const result = await storeInboundMedia({ ownerUserId: 42, buffer: edge, fileName: 'a.pdf', kind: 'file' });
    expect(result.skipReason).toBeNull();
    expect(mockPersist).toHaveBeenCalledTimes(1);
  });

  it('buffer rong/khong phai Buffer -> error, khong nem', async () => {
    expect(await storeInboundMedia({ ownerUserId: 42, buffer: Buffer.alloc(0), kind: 'file' }))
      .toEqual({ attachment: null, skipReason: 'error' });
    expect(await storeInboundMedia({ ownerUserId: 42, buffer: null, kind: 'file' }))
      .toEqual({ attachment: null, skipReason: 'error' });
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('phan loai loi luu: dinh dang la (400) / het dung luong / loi khac — khong nem', async () => {
    mockPersist.mockRejectedValueOnce(Object.assign(new Error('Định dạng file không được hỗ trợ'), { status: 400 }));
    expect((await storeInboundMedia({ ownerUserId: 42, buffer: Buffer.from('x'), fileName: 'a.zip', kind: 'file' })).skipReason)
      .toBe('unsupported');

    mockPersist.mockRejectedValueOnce(new StorageQuotaExceededError('het dung luong'));
    expect((await storeInboundMedia({ ownerUserId: 42, buffer: Buffer.from('x'), fileName: 'a.pdf', kind: 'file' })).skipReason)
      .toBe('quota');

    mockPersist.mockRejectedValueOnce(new Error('disk full'));
    expect((await storeInboundMedia({ ownerUserId: 42, buffer: Buffer.from('x'), fileName: 'a.pdf', kind: 'file' })).skipReason)
      .toBe('error');
  });
});

describe('promote / present', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('promote: doi tep tu temp sang active theo khoa; danh sach rong thi khong lam gi; loi khong nem', async () => {
    await promoteInboundAttachments([{ key: 'uploads/42/chat/a.jpg', size: 3 }]);
    expect(mockPromote).toHaveBeenCalledWith([{ key: 'uploads/42/chat/a.jpg' }]);

    mockPromote.mockClear();
    await promoteInboundAttachments([]);
    await promoteInboundAttachments(undefined);
    expect(mockPromote).not.toHaveBeenCalled();

    mockPromote.mockRejectedValueOnce(new Error('db down'));
    await expect(promoteInboundAttachments([{ key: 'k' }])).resolves.toBeUndefined();
  });

  it('presentInboundAttachments: dung presentAttachmentsForClient (khong lo khoa)', () => {
    const out = presentInboundAttachments([{ key: 'uploads/42/chat/a.jpg', type: 'image', displayName: 'a.jpg' }]);
    expect(out).toEqual([{ type: 'image', url: 'signed:uploads/42/chat/a.jpg', name: 'a.jpg' }]);
    expect(JSON.stringify(out)).not.toContain('"key"');
  });
});
