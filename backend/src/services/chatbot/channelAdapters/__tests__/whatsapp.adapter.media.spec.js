/**
 * P5 - WhatsApp (Baileys) gui anh/tai lieu. Adapter + util that; gia ranh gioi: module Baileys (ham gui tra `key.id`
 * dung hinh dang Baileys) va buoc doc tep tu kho.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSendMessage = jest.fn();
const mockSendMedia = jest.fn();
const mockSendImage = jest.fn();
const mockPrepare = jest.fn();

jest.unstable_mockModule('../../whatsappBaileys.service.js', () => ({
  sendMessage: mockSendMessage,
  sendMedia: mockSendMedia,
  sendImage: mockSendImage,
}));
jest.unstable_mockModule('../../../campaign/campaignZaloSender.service.js', () => ({
  default: { prepareZaloAttachmentSources: mockPrepare },
}));
jest.unstable_mockModule('../../../../repositories/ai/chatbotChannel.repository.js', () => ({
  default: {},
}));

const { default: adapter, sendWhatsAppBaileysMessageWithMedia } = await import('../whatsapp.adapter.js');

const source = (filename, size = 10) => ({ data: Buffer.alloc(size, 1), filename, metadata: { totalSize: size } });

describe('whatsapp.adapter — Baileys gui anh/tai lieu (P5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let seq = 0;
    const next = async () => ({ key: { id: `WA${(seq += 1)}` } });
    mockSendMessage.mockImplementation(next);
    mockSendImage.mockImplementation(next);
    mockSendMedia.mockImplementation(next);
  });

  it('text -> anh (sendImage {mimetype}) -> tai lieu (sendMedia {mimetype, fileName})', async () => {
    const result = await sendWhatsAppBaileysMessageWithMedia({
      sessionKey: '1-abc',
      phone: '84912345678',
      text: 'Xin chao',
      sources: [source('bao-gia.pdf'), source('a.webp')],
    });
    expect(mockSendMessage).toHaveBeenCalledWith('1-abc', '84912345678', 'Xin chao');
    expect(mockSendImage).toHaveBeenCalledWith('1-abc', '84912345678', expect.any(Buffer), 'image/webp');
    expect(mockSendMedia).toHaveBeenCalledWith(
      '1-abc', '84912345678', expect.any(Buffer), 'application/pdf', 'bao-gia.pdf'
    );
    expect(result.messageIds).toEqual(['WA1', 'WA2', 'WA3']);
    expect(result.firstMessageId).toBe('WA1');
  });

  it('gif la tai lieu (gifPlayback can video) — khong di duong {image}', async () => {
    await sendWhatsAppBaileysMessageWithMedia({
      sessionKey: '1-abc', phone: '84912345678', text: 'x', sources: [source('vui.gif')],
    });
    expect(mockSendImage).not.toHaveBeenCalled();
    expect(mockSendMedia).toHaveBeenCalledWith('1-abc', '84912345678', expect.any(Buffer), 'image/gif', 'vui.gif');
  });

  it('sendReply (Hop thu) co tep: loc theo chu userId, tra messageId dau', async () => {
    mockPrepare.mockResolvedValue([source('a.jpg')]);
    const attachments = [{ key: 'uploads/42/chat/a.jpg' }];
    const result = await adapter.sendReply({
      channelId: '42-abc', externalId: '84912345678', message: 'Anh day', attachments, userId: 42,
    });
    expect(mockPrepare).toHaveBeenCalledWith(attachments, { ownerUserId: 42, cache: undefined });
    expect(mockSendImage).toHaveBeenCalledWith('42-abc', '84912345678', expect.any(Buffer), 'image/jpeg');
    expect(result).toMatchObject({ success: true, messageId: 'WA1', provider: 'baileys' });
  });

  it('sendReply: tep khong doc duoc -> success:false, khong gui gi', async () => {
    mockPrepare.mockResolvedValue([]);
    const result = await adapter.sendReply({
      channelId: '42-abc', externalId: '84912345678', message: 'x',
      attachments: [{ key: 'uploads/99/chat/a.jpg' }], userId: 42,
    });
    expect(result.success).toBe(false);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendImage).not.toHaveBeenCalled();
  });

  it('sendReply: tai lieu loi sau khi text toi -> partial, khong ne loi', async () => {
    mockPrepare.mockResolvedValue([source('a.pdf')]);
    mockSendMedia.mockRejectedValue(new Error('rate-overlimit'));
    const result = await adapter.sendReply({
      channelId: '42-abc', externalId: '84912345678', message: 'x',
      attachments: [{ key: 'uploads/42/chat/a.pdf' }], userId: 42,
    });
    expect(result).toMatchObject({ success: false, partial: true, messageId: 'WA1' });
    expect(result.error).toMatch(/rate-overlimit/);
  });

  it('sendReply khong co tep: van 1 tin text nhu cu', async () => {
    const result = await adapter.sendReply({ channelId: '42-abc', externalId: '84912345678', message: 'hi' });
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, messageId: 'WA1' });
  });
});
