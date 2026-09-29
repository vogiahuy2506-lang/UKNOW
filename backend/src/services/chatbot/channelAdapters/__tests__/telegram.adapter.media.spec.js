/**
 * P5 - `telegram.adapter.sendReply` co tep dinh kem. Adapter + util gui media THAT chay; chi gia ranh gioi:
 * gateway (tra ĐÚNG hinh dang that `{ data: { messageId } }` — `wrap` cua telegramGateway.client.js boc `{ data }`),
 * repo tai khoan, va buoc doc tep tu kho (campaignZaloSender.prepareZaloAttachmentSources — tra `{data, filename, metadata}`).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSendMessage = jest.fn();
const mockSendMedia = jest.fn();
const mockGetAccountById = jest.fn();
const mockTouchActivity = jest.fn();
const mockPrepare = jest.fn();

jest.unstable_mockModule('../../telegramGateway.client.js', () => ({
  default: { sendMessage: mockSendMessage, sendMedia: mockSendMedia },
}));
jest.unstable_mockModule('../../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({
  default: { getAccountById: mockGetAccountById, touchActivity: mockTouchActivity },
}));
jest.unstable_mockModule('../../../campaign/campaignZaloSender.service.js', () => ({
  default: { prepareZaloAttachmentSources: mockPrepare },
}));

const { default: adapter } = await import('../telegram.adapter.js');

const source = (filename, size = 10) => ({ data: Buffer.alloc(size, 1), filename, metadata: { totalSize: size } });

describe('telegram.adapter.sendReply — dinh kem (P5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccountById.mockResolvedValue({ id: 7, id_user: 42, telegram_user_id: 9999, is_active: true });
    let seq = 100;
    mockSendMessage.mockImplementation(async () => ({ data: { messageId: (seq += 1) } }));
    mockSendMedia.mockImplementation(async () => ({ data: { messageId: (seq += 1) } }));
  });

  it('text -> anh (photo) -> tai lieu (document), dung payload gateway va loc tep theo CHU', async () => {
    mockPrepare.mockResolvedValue([source('bao-gia.pdf'), source('a.jpg')]);
    const attachments = [{ key: 'uploads/42/bao-gia.pdf' }, { key: 'uploads/42/a.jpg' }];

    const result = await adapter.sendReply({
      userId: 42, channelId: 7, externalId: '-1001', message: 'Xem bao gia', attachments,
    });

    expect(mockPrepare).toHaveBeenCalledWith(attachments, { ownerUserId: 42, cache: undefined });
    expect(mockSendMessage).toHaveBeenCalledWith(9999, -1001, 'Xem bao gia');
    expect(mockSendMedia).toHaveBeenCalledTimes(2);
    expect(mockSendMedia.mock.calls[0]).toEqual([
      9999, -1001,
      { buffer: expect.any(Buffer), fileName: 'a.jpg', mimeType: 'image/jpeg', kind: 'photo' },
    ]);
    expect(mockSendMedia.mock.calls[1]).toEqual([
      9999, -1001,
      { buffer: expect.any(Buffer), fileName: 'bao-gia.pdf', mimeType: 'application/pdf', kind: 'document' },
    ]);
    expect(result).toMatchObject({ success: true, messageId: '101' });
    expect(result.messageIds).toEqual(['101', '102', '103']);
  });

  it('gif gui nhu tai lieu (khong ep thanh anh tinh)', async () => {
    mockPrepare.mockResolvedValue([source('vui.gif')]);
    await adapter.sendReply({ userId: 42, channelId: 7, externalId: '5', message: 'hi', attachments: [{ key: 'uploads/42/vui.gif' }] });
    expect(mockSendMedia.mock.calls[0][2]).toMatchObject({ kind: 'document', mimeType: 'image/gif' });
  });

  it('tep khong doc duoc / khong thuoc chu (prepare tra it hon) -> NEM, khong gui phan text', async () => {
    mockPrepare.mockResolvedValue([]);
    await expect(adapter.sendReply({
      userId: 42, channelId: 7, externalId: '5', message: 'hi', attachments: [{ key: 'uploads/99/x.pdf' }],
    })).rejects.toThrow(/tệp đính kèm/);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  it('anh loi SAU khi text da toi -> success:false partial kem messageId tin da gui (khong ne loi)', async () => {
    mockPrepare.mockResolvedValue([source('a.jpg')]);
    mockSendMedia.mockRejectedValue(new Error('sendMedia: MtProtoTelegramClient.sendMedia failed: IMAGE_PROCESS_FAILED'));
    const result = await adapter.sendReply({
      userId: 42, channelId: 7, externalId: '5', message: 'hi', attachments: [{ key: 'uploads/42/a.jpg' }],
    });
    expect(result).toMatchObject({ success: false, partial: true, messageId: '101' });
    expect(result.error).toMatch(/IMAGE_PROCESS_FAILED/);
  });

  it('vuot gioi han so anh -> nem truoc khi gui bat cu thu gi', async () => {
    mockPrepare.mockResolvedValue(Array.from({ length: 6 }, (_, i) => source(`a${i}.jpg`)));
    await expect(adapter.sendReply({
      userId: 42, channelId: 7, externalId: '5', message: 'hi',
      attachments: Array.from({ length: 6 }, (_, i) => ({ key: `uploads/42/a${i}.jpg` })),
    })).rejects.toThrow(/ảnh/);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('khong co tep -> duong cu (1 tin text), khong dong toi kho tep', async () => {
    const result = await adapter.sendReply({ userId: 42, channelId: 7, externalId: '5', message: 'hi' });
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, messageId: 101 });
  });
});

describe('telegram.adapter.parseWebhookEvent — media chiều vào (P5)', () => {
  const base = { telegram_user_id: 9999, sender_id: 8888, chat_id: 7777, message_id: 12, text: '' };

  it('nhận media photo/document (chỉ metadata), chuẩn hoá kiểu', () => {
    expect(adapter.parseWebhookEvent({ ...base, media: { kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: null } }).media)
      .toEqual({ kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: null });
    expect(adapter.parseWebhookEvent({ ...base, media: { kind: 'document', fileName: 'a.pdf', mimeType: 'application/pdf', size: '2048' } }).media)
      .toEqual({ kind: 'document', fileName: 'a.pdf', mimeType: 'application/pdf', size: 2048 });
  });

  it('kiểu lạ (sticker/voice/...) hoặc thiếu -> media null (bỏ như cũ)', () => {
    expect(adapter.parseWebhookEvent({ ...base, media: { kind: 'sticker' } }).media).toBeNull();
    expect(adapter.parseWebhookEvent({ ...base, media: 'photo' }).media).toBeNull();
    expect(adapter.parseWebhookEvent(base).media).toBeNull();
  });

  it('không làm mất các trường cũ (messageId, chatId, isOutgoing)', () => {
    const parsed = adapter.parseWebhookEvent({ ...base, is_outgoing: true, media: { kind: 'photo' } });
    expect(parsed).toMatchObject({ messageId: 12, chatId: '7777', senderId: '8888', isOutgoing: true });
  });
});
