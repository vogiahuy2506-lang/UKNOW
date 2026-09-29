/**
 * P5 - node send_whatsapp gui kem anh/tai lieu. Adapter chien dich + adapter WhatsApp + util that; gia ranh gioi:
 * module Baileys (ham gui tra `key.id`), repo hoi thoai, buoc doc tep (prepareZaloAttachmentSources).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getSessionMock = jest.fn();
const checkNumberExistsMock = jest.fn();
const sendMessageMock = jest.fn();
const sendImageMock = jest.fn();
const sendMediaMock = jest.fn();
jest.unstable_mockModule('../../../chatbot/whatsappBaileys.service.js', () => ({
  getSession: getSessionMock,
  listPersistedSessions: jest.fn(),
  checkNumberExists: checkNumberExistsMock,
  sendMessage: sendMessageMock,
  sendImage: sendImageMock,
  sendMedia: sendMediaMock,
}));
jest.unstable_mockModule('../../../../repositories/chatbot/whatsappCampaignConversation.repository.js', () => ({
  default: { listOpenWhatsAppConversationsForSession: jest.fn(), countOpenConversationsBySessionKeys: jest.fn() },
  extractPhoneFromExternalId: (externalId) => String(externalId ?? '').split(':').pop(),
}));
jest.unstable_mockModule('../../../../repositories/ai/chatbotChannel.repository.js', () => ({ default: {} }));
const prepareMock = jest.fn();
jest.unstable_mockModule('../../campaignZaloSender.service.js', () => ({
  default: { prepareZaloAttachmentSources: prepareMock },
}));

// Review 30/09 (CI đỏ 1596841c): P6 thêm kiểm khoá (resourceIsLocked/whatsappSessionIsLocked → CSDL thật) vào
// checkReadiness/resolveAccount; spec này chỉ thử đính kèm nên giả lập cổng khoá (tái hiện: DB_HOST=127.0.0.1 DB_PORT=5999).
jest.unstable_mockModule('../../../../utils/topupLockGate.util.js', () => ({
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'Tài khoản đang bị khoá do vượt hạn mức gói',
  resourceIsLocked: jest.fn().mockResolvedValue(false),
  whatsappSessionIsLocked: jest.fn().mockResolvedValue(false),
  lockedChannelAccountRefs: jest.fn().mockResolvedValue([]),
  getLandingLockBySlug: jest.fn().mockResolvedValue(null),
  pausedLandingHtml: jest.fn(() => ''),
}));

const { whatsappChannelAdapter } = await import('../whatsapp.campaignChannel.js');

const source = (filename, size = 10) => ({ data: Buffer.alloc(size, 1), filename, metadata: { totalSize: size } });

describe('whatsapp.campaignChannel — dinh kem (P5)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getSessionMock.mockReturnValue({ sessionKey: '40-default', status: 'open', userName: 'Phuc' });
    checkNumberExistsMock.mockResolvedValue(true);
    let seq = 0;
    const next = async () => ({ key: { id: `WA${(seq += 1)}` } });
    sendMessageMock.mockImplementation(next);
    sendImageMock.mockImplementation(next);
    sendMediaMock.mockImplementation(next);
  });

  const resolve = () => whatsappChannelAdapter.resolveAccount({
    workspaceOwnerId: 40,
    config: {
      whatsappSessionKey: '40-default',
      steps: [{ message: 'x', attachments: [{ key: 'uploads/40/a.jpg' }, { key: 'uploads/40/bao-gia.pdf' }] }],
    },
    node: { id: 1 },
  });

  it('resolveAccount mang chu + dinh kem tung buoc', async () => {
    const account = await resolve();
    expect(account.ownerUserId).toBe(40);
    expect(account.stepAttachments).toEqual([[{ key: 'uploads/40/a.jpg' }, { key: 'uploads/40/bao-gia.pdf' }]]);
  });

  it('sendOne: kiem so -> text -> anh (image+mimetype) -> tai lieu (document+fileName); loc tep theo chu', async () => {
    prepareMock.mockResolvedValue([source('bao-gia.pdf'), source('a.jpg')]);
    const account = await resolve();
    const result = await whatsappChannelAdapter.sendOne({
      account, recipientKey: '84912345678', text: 'Chao An', stepIndex: 1,
    });
    expect(checkNumberExistsMock).toHaveBeenCalledWith('40-default', '84912345678');
    expect(prepareMock).toHaveBeenCalledWith(
      [{ key: 'uploads/40/a.jpg' }, { key: 'uploads/40/bao-gia.pdf' }],
      { ownerUserId: 40, cache: account.attachmentCache }
    );
    expect(sendMessageMock).toHaveBeenCalledWith('40-default', '84912345678', 'Chao An');
    expect(sendImageMock).toHaveBeenCalledWith('40-default', '84912345678', expect.any(Buffer), 'image/jpeg');
    expect(sendMediaMock).toHaveBeenCalledWith(
      '40-default', '84912345678', expect.any(Buffer), 'application/pdf', 'bao-gia.pdf'
    );
    expect(result).toMatchObject({ messageId: 'WA1', sentCount: 3 });
  });

  it('so KHONG dung WhatsApp -> hard, khong doc tep, khong gui', async () => {
    checkNumberExistsMock.mockResolvedValue(false);
    const account = await resolve();
    await expect(whatsappChannelAdapter.sendOne({
      account, recipientKey: '84912345678', text: 'x', stepIndex: 1,
    })).rejects.toMatchObject({ category: 'hard', message: 'Số không dùng WhatsApp' });
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('tai lieu loi SAU khi text da toi -> khong nem, tra partialError', async () => {
    prepareMock.mockResolvedValue([source('bao-gia.pdf')]);
    sendMediaMock.mockRejectedValue(new Error('rate-overlimit'));
    const result = await whatsappChannelAdapter.sendOne({
      account: { sessionKey: '40-default', ownerUserId: 40 },
      recipientKey: '84912345678', text: 'x', attachments: [{ key: 'uploads/40/bao-gia.pdf' }],
    });
    expect(result.messageId).toBe('WA1');
    expect(result.partialError).toBe('rate-overlimit');
  });

  it('vuot gioi han -> hard truoc khi gui text', async () => {
    prepareMock.mockResolvedValue(Array.from({ length: 4 }, (_, i) => source(`d${i}.pdf`)));
    await expect(whatsappChannelAdapter.sendOne({
      account: { sessionKey: '40-default', ownerUserId: 40 },
      recipientKey: '84912345678', text: 'x', attachments: Array.from({ length: 4 }, (_, i) => ({ key: `uploads/40/d${i}.pdf` })),
    })).rejects.toMatchObject({ category: 'hard' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('checkReadiness bao SOM khi mot buoc vuot gioi han so anh', async () => {
    const attachments = Array.from({ length: 6 }, (_, i) => ({ key: `uploads/40/a${i}.jpg`, size: 10 }));
    await expect(whatsappChannelAdapter.checkReadiness({
      userId: 40,
      node: {
        id: 3,
        config: { whatsappSessionKey: '40-default', recipientSource: 'node', steps: [{ message: 'x', attachments }] },
      },
    })).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY', message: expect.stringContaining('ảnh') });
  });
});
