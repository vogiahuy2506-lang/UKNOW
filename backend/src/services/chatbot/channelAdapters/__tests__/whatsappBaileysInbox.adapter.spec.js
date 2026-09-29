/**
 * P5 - Hop thu WhatsApp (Baileys) gui duoc tep dinh kem. Adapter Hop thu + adapter WhatsApp + util that;
 * gia ranh gioi: repo ket noi kenh (tra session key), module Baileys, buoc doc tep tu kho.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetBaileysSessionKey = jest.fn();
const mockSendMessage = jest.fn();
const mockSendMedia = jest.fn();
const mockSendImage = jest.fn();
const mockPrepare = jest.fn();

jest.unstable_mockModule('../../../../repositories/ai/channelConnections.repository.js', () => ({
  default: { getBaileysSessionKey: mockGetBaileysSessionKey },
}));
// P6 — cổng khoá sau hạ gói: mặc định KHÔNG khoá; ca riêng bật khoá.
const mockSessionIsLocked = jest.fn();
jest.unstable_mockModule('../../../../utils/topupLockGate.util.js', () => ({
  whatsappSessionIsLocked: mockSessionIsLocked,
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'Tài khoản đang bị khoá do vượt hạn mức gói — nâng gói hoặc mua thêm slot để mở khoá.',
}));
jest.unstable_mockModule('../../whatsappBaileys.service.js', () => ({
  sendMessage: mockSendMessage,
  sendMedia: mockSendMedia,
  sendImage: mockSendImage,
}));
jest.unstable_mockModule('../../../campaign/campaignZaloSender.service.js', () => ({
  default: { prepareZaloAttachmentSources: mockPrepare },
}));
jest.unstable_mockModule('../../../../repositories/ai/chatbotChannel.repository.js', () => ({ default: {} }));

const { default: adapter } = await import('../whatsappBaileysInbox.adapter.js');
const inboxModule = await import('../whatsappBaileysInbox.adapter.js');

const file = (filename) => ({ data: Buffer.from('x'), filename, metadata: { totalSize: 1 } });
const EXTERNAL_ID = 'baileys:42-abc:55:84912345678';

describe('whatsappBaileysInbox.adapter — tep dinh kem (P5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionIsLocked.mockResolvedValue(false);
    mockGetBaileysSessionKey.mockResolvedValue('42-abc');
    let seq = 0;
    const next = async () => ({ key: { id: `WA${(seq += 1)}` } });
    mockSendMessage.mockImplementation(next);
    mockSendImage.mockImplementation(next);
    mockSendMedia.mockImplementation(next);
  });

  it('khong con export ATTACHMENTS_UNSUPPORTED_ERROR (kenh da ho tro tep)', () => {
    expect(inboxModule.ATTACHMENTS_UNSUPPORTED_ERROR).toBeUndefined();
  });

  it('co tep -> gui text + anh + tai lieu, loc tep theo chu, tra messageId dau', async () => {
    mockPrepare.mockResolvedValue([file('bao-gia.pdf'), file('a.jpg')]);
    const attachments = [{ key: 'uploads/42/chat/a.jpg' }, { key: 'uploads/42/chat/bao-gia.pdf' }];
    const result = await adapter.sendReply({
      channelId: 31, externalId: EXTERNAL_ID, message: 'Xem giup', attachments, userId: 42,
    });
    expect(mockGetBaileysSessionKey).toHaveBeenCalledWith(31, 42);
    expect(mockPrepare).toHaveBeenCalledWith(attachments, { ownerUserId: 42, cache: undefined });
    expect(mockSendMessage).toHaveBeenCalledWith('42-abc', '84912345678', 'Xem giup');
    expect(mockSendImage).toHaveBeenCalledWith('42-abc', '84912345678', expect.any(Buffer), 'image/jpeg');
    expect(mockSendMedia).toHaveBeenCalledWith(
      '42-abc', '84912345678', expect.any(Buffer), 'application/pdf', 'bao-gia.pdf'
    );
    expect(result).toMatchObject({ success: true, messageId: 'WA1', provider: 'baileys' });
  });

  it('chi tep (khong chu) -> khong gui tin chu', async () => {
    mockPrepare.mockResolvedValue([file('a.jpg')]);
    const result = await adapter.sendReply({
      channelId: 31, externalId: EXTERNAL_ID, message: '', attachments: [{ key: 'uploads/42/chat/a.jpg' }], userId: 42,
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, messageId: 'WA1' });
  });

  it('khong co tep -> van gui 1 tin chu nhu cu', async () => {
    const result = await adapter.sendReply({ channelId: 31, externalId: EXTERNAL_ID, message: 'hi', userId: 42 });
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, messageId: 'WA1' });
  });

  it('khong tim thay phien cua hoi thoai -> success:false, khong gui', async () => {
    mockGetBaileysSessionKey.mockResolvedValue(null);
    const result = await adapter.sendReply({
      channelId: 31, externalId: EXTERNAL_ID, message: 'x', attachments: [{ key: 'k' }], userId: 42,
    });
    expect(result.success).toBe(false);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('whatsappBaileysInbox.adapter — P6 phiên bị khoá do vượt hạn mức gói', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBaileysSessionKey.mockResolvedValue('42-abc');
  });

  it('phiên bị khoá -> success:false kèm câu khoá, KHÔNG gọi sendMessage/sendImage/sendMedia, tra đúng sessionKey', async () => {
    mockSessionIsLocked.mockResolvedValue(true);
    const result = await adapter.sendReply({
      channelId: 31, externalId: EXTERNAL_ID, message: 'Chào', attachments: [{ key: 'uploads/42/chat/a.jpg' }], userId: 42,
    });
    expect(mockSessionIsLocked).toHaveBeenCalledWith('42-abc');
    expect(result).toMatchObject({ success: false, provider: 'baileys', error: expect.stringContaining('bị khoá') });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendImage).not.toHaveBeenCalled();
    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(mockPrepare).not.toHaveBeenCalled();
  });
});
