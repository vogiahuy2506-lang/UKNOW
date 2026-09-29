/**
 * P5 buoc 5 - tai anh/tai lieu khach gui toi Telegram qua gateway. Gia ranh gioi: gateway (`wrap` boc `{ data }` —
 * ket qua tra DUNG hinh dang that `{ data: { buffer, fileName, mimeType, kind } }`) va kho chat
 * (`persistChatBlob` tra `_key`, `displayName`, `size`, `mime`, `type`). channelInboundMedia.service THAT chay.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDownload = jest.fn();
const mockPersist = jest.fn();

jest.unstable_mockModule('../telegramGateway.client.js', () => ({
  default: { downloadMedia: mockDownload },
}));
jest.unstable_mockModule('../chatAttachment.service.js', () => ({
  CHAT_ATTACHMENT_SOURCES: { INBOX_OUTBOUND: 'inbox_outbound' },
  persistChatBlob: mockPersist,
  presentAttachmentsForClient: (list) => list,
  promoteChatAttachments: jest.fn(),
}));

const { resolveTelegramInboundMedia } = await import('../telegramInboundMedia.service.js');
const { StorageQuotaExceededError } = await import('../../storage/storageQuota.service.js');

const account = { id: 7, id_user: 42, telegram_user_id: 9999 };
const photo = { kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: null };
const doc = { kind: 'document', fileName: 'bao-gia.pdf', mimeType: 'application/pdf', size: 1000 };
const parsedOf = (media, over = {}) => ({ media, chatId: '7777', messageId: 12, message: '', ...over });
const persisted = {
  _key: 'uploads/42/chat/1700000000_hinh-anh.jpg', displayName: 'hinh-anh.jpg', size: 3, mime: 'image/jpeg', type: 'image',
};

describe('resolveTelegramInboundMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDownload.mockResolvedValue({ data: { buffer: Buffer.from('abc'), fileName: null, mimeType: 'image/jpeg', kind: 'photo' } });
    mockPersist.mockResolvedValue(persisted);
  });

  it('anh KHONG caption: goi gateway dung (telegramUserId, chatId, messageId, maxBytes), luu vao kho cua CHU, noi dung = cho giu cho', async () => {
    const result = await resolveTelegramInboundMedia({ account, parsed: parsedOf(photo) });
    expect(mockDownload).toHaveBeenCalledWith(9999, '7777', 12, { maxBytes: 20 * 1024 * 1024 });
    expect(mockPersist).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: 42, originalName: 'hinh-anh.jpg', mimetype: 'image/jpeg', source: 'inbox_outbound',
    }));
    expect(result).toEqual({
      content: '[Hình ảnh]',
      attachments: [{ key: persisted._key, displayName: 'hinh-anh.jpg', size: 3, mime: 'image/jpeg', type: 'image' }],
      skipReason: null,
      kind: 'image',
    });
  });

  it('tai lieu co caption: noi dung = caption, kind file, ten tep tu metadata khi gateway khong tra', async () => {
    mockDownload.mockResolvedValue({ data: { buffer: Buffer.from('pdf'), fileName: null, mimeType: null, kind: 'document' } });
    mockPersist.mockResolvedValue({ ...persisted, _key: 'uploads/42/chat/x.pdf', displayName: 'bao-gia.pdf', mime: 'application/pdf', type: 'file' });
    const result = await resolveTelegramInboundMedia({ account, parsed: parsedOf(doc, { message: 'Bao gia thang 10' }) });
    expect(mockPersist.mock.calls[0][0]).toMatchObject({ originalName: 'bao-gia.pdf', mimetype: 'application/pdf' });
    expect(result.content).toBe('Bao gia thang 10');
    expect(result.kind).toBe('file');
    expect(result.attachments).toHaveLength(1);
  });

  it('khai bao lon hon 20 MB -> KHONG tai, too_large, chi giu cho giu cho kem ly do', async () => {
    const result = await resolveTelegramInboundMedia({
      account, parsed: parsedOf({ ...doc, size: 25 * 1024 * 1024 }),
    });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(result).toEqual({ content: '[Tệp] (quá 20 MB, không lưu)', attachments: [], skipReason: 'too_large', kind: 'file' });
  });

  it('gateway bao tooLarge (khai bao thieu, byte that lon) -> too_large, khong ghi kho', async () => {
    mockDownload.mockResolvedValue({ data: { buffer: null, tooLarge: true, kind: 'document' } });
    const result = await resolveTelegramInboundMedia({ account, parsed: parsedOf(doc) });
    expect(mockPersist).not.toHaveBeenCalled();
    expect(result.skipReason).toBe('too_large');
  });

  it('gateway loi / khong co buffer -> error, KHONG nem (tin van vao Hop thu)', async () => {
    mockDownload.mockRejectedValueOnce(new Error('downloadMedia: No active session'));
    expect((await resolveTelegramInboundMedia({ account, parsed: parsedOf(photo) })).skipReason).toBe('error');
    mockDownload.mockResolvedValueOnce({ data: { buffer: null, kind: null } });
    expect((await resolveTelegramInboundMedia({ account, parsed: parsedOf(photo) })).skipReason).toBe('error');
  });

  it('het dung luong luu tru -> quota, khong dinh kem', async () => {
    mockPersist.mockRejectedValue(new StorageQuotaExceededError('full'));
    const result = await resolveTelegramInboundMedia({ account, parsed: parsedOf(photo) });
    expect(result).toMatchObject({ attachments: [], skipReason: 'quota' });
    expect(result.content).toBe('[Hình ảnh] (hết dung lượng lưu trữ, không lưu)');
  });

  it('thieu messageId -> error, khong goi gateway', async () => {
    const result = await resolveTelegramInboundMedia({ account, parsed: parsedOf(photo, { messageId: null }) });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(result.skipReason).toBe('error');
  });
});
