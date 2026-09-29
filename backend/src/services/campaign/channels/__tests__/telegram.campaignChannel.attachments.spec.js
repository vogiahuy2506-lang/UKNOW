/**
 * P5 - node send_telegram gui kem anh/tai lieu. Adapter chien dich + adapter chatbot + util that; gia ranh gioi:
 * gateway (hinh dang that `{ data: { messageId } }`), repo tai khoan, buoc doc tep (prepareZaloAttachmentSources).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const sendMessageMock = jest.fn();
const sendMediaMock = jest.fn();
const isConfiguredMock = jest.fn();
const isStubOnlyMock = jest.fn();
jest.unstable_mockModule('../../../chatbot/telegramGateway.client.js', () => ({
  default: {
    isConfigured: isConfiguredMock,
    sendMessage: sendMessageMock,
    sendMedia: sendMediaMock,
  },
}));
jest.unstable_mockModule('../../../chatbot/inProcChannelGateway/stubCheck.js', () => ({
  isStubOnly: isStubOnlyMock,
}));
const getAccountByIdMock = jest.fn();
jest.unstable_mockModule('../../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({
  default: {
    getAccountById: getAccountByIdMock,
    getSessionString: jest.fn(),
    listOpenConversationsForAccount: jest.fn(),
    touchActivity: jest.fn(),
  },
}));
const prepareMock = jest.fn();
jest.unstable_mockModule('../../campaignZaloSender.service.js', () => ({
  default: { prepareZaloAttachmentSources: prepareMock },
}));

const { telegramChannelAdapter } = await import('../telegram.campaignChannel.js');
const { ChannelSendError } = await import('../../campaignChannelRegistry.service.js');

const source = (filename, size = 10) => ({ data: Buffer.alloc(size, 1), filename, metadata: { totalSize: size } });

describe('telegram.campaignChannel — dinh kem (P5)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    isConfiguredMock.mockReturnValue(true);
    isStubOnlyMock.mockReturnValue(false);
    getAccountByIdMock.mockResolvedValue({
      id: 7, telegram_user_id: 555, username: 'shop', is_active: true,
    });
    let seq = 0;
    sendMessageMock.mockImplementation(async () => ({ data: { messageId: (seq += 1) } }));
    sendMediaMock.mockImplementation(async () => ({ data: { messageId: (seq += 1) } }));
  });

  it('resolveAccount mang chu + dinh kem tung buoc (runner khong phai truyen them)', async () => {
    const account = await telegramChannelAdapter.resolveAccount({
      workspaceOwnerId: 42,
      config: {
        telegramAccountId: 7,
        steps: [{ message: 'a', attachments: [{ key: 'uploads/42/a.pdf' }] }, { message: 'b' }],
      },
      node: { id: 1 },
    });
    expect(account.ownerUserId).toBe(42);
    expect(account.stepAttachments).toEqual([[{ key: 'uploads/42/a.pdf' }], []]);
    expect(account.attachmentCache).toBeInstanceOf(Map);
  });

  it('sendOne buoc co dinh kem: text -> anh -> tai lieu; loc tep theo chu; cache dung chung', async () => {
    prepareMock.mockResolvedValue([source('bao-gia.pdf'), source('a.png')]);
    const account = await telegramChannelAdapter.resolveAccount({
      workspaceOwnerId: 42,
      config: {
        telegramAccountId: 7,
        steps: [{ message: 'x', attachments: [{ key: 'uploads/42/bao-gia.pdf' }, { key: 'uploads/42/a.png' }] }],
      },
      node: { id: 1 },
    });
    const result = await telegramChannelAdapter.sendOne({
      account, recipientKey: '123', text: 'Chao An', stepIndex: 1,
    });

    expect(prepareMock).toHaveBeenCalledWith(
      [{ key: 'uploads/42/bao-gia.pdf' }, { key: 'uploads/42/a.png' }],
      { ownerUserId: 42, cache: account.attachmentCache }
    );
    expect(sendMessageMock).toHaveBeenCalledWith(555, 123, 'Chao An');
    expect(sendMediaMock.mock.calls.map((c) => c[2].kind)).toEqual(['photo', 'document']);
    expect(result).toMatchObject({ messageId: '1', sentCount: 3 });
    expect(result.partialError).toBeUndefined();
  });

  it('buoc KHONG co dinh kem -> duong cu (1 tin text), khong dong toi kho tep', async () => {
    const account = await telegramChannelAdapter.resolveAccount({
      workspaceOwnerId: 42,
      config: { telegramAccountId: 7, steps: [{ message: 'x' }] },
      node: { id: 1 },
    });
    const result = await telegramChannelAdapter.sendOne({ account, recipientKey: '123', text: 'hi', stepIndex: 1 });
    expect(prepareMock).not.toHaveBeenCalled();
    expect(sendMediaMock).not.toHaveBeenCalled();
    expect(result).toEqual({ messageId: 1 });
  });

  it('gui nhanh: `attachments` truyen thang THANG dinh kem theo buoc', async () => {
    prepareMock.mockResolvedValue([source('a.jpg')]);
    await telegramChannelAdapter.sendOne({
      account: { telegramUserId: 555, ownerUserId: 42, stepAttachments: [[{ key: 'uploads/42/khac.pdf' }]] },
      recipientKey: '123',
      text: 'hi',
      stepIndex: 1,
      attachments: [{ key: 'uploads/42/quick-send/a.jpg' }],
    });
    expect(prepareMock).toHaveBeenCalledWith([{ key: 'uploads/42/quick-send/a.jpg' }], expect.objectContaining({ ownerUserId: 42 }));
  });

  it('anh loi SAU khi text da toi -> khong nem (nguoi nhan da nhan tin), tra partialError + messageId tin dau', async () => {
    prepareMock.mockResolvedValue([source('a.jpg')]);
    sendMediaMock.mockRejectedValue(new Error('sendMedia: MtProtoTelegramClient.sendMedia failed: IMAGE_PROCESS_FAILED'));
    const result = await telegramChannelAdapter.sendOne({
      account: { telegramUserId: 555, ownerUserId: 42 },
      recipientKey: '123', text: 'hi', attachments: [{ key: 'uploads/42/a.jpg' }],
    });
    expect(result.messageId).toBe('1');
    expect(result.partialError).toMatch(/IMAGE_PROCESS_FAILED/);
  });

  it('text loi (FLOOD_WAIT) -> ChannelSendError rate_limit + retryAfterMs, khong gui tep', async () => {
    prepareMock.mockResolvedValue([source('a.jpg')]);
    sendMessageMock.mockRejectedValue(
      new Error('sendMessage: MtProtoTelegramClient.sendMessage failed: Telegram API error 420: FLOOD_WAIT_120')
    );
    const rejection = telegramChannelAdapter.sendOne({
      account: { telegramUserId: 555, ownerUserId: 42 },
      recipientKey: '123', text: 'hi', attachments: [{ key: 'uploads/42/a.jpg' }],
    });
    await expect(rejection).rejects.toBeInstanceOf(ChannelSendError);
    await expect(rejection).rejects.toMatchObject({ category: 'rate_limit', retryAfterMs: 120000 });
    expect(sendMediaMock).not.toHaveBeenCalled();
  });

  it('upload timeout cua mtcute ("sendMedia timeout") duoc coi la transient (thu lai), khong phai hard', async () => {
    prepareMock.mockResolvedValue([source('a.jpg')]);
    sendMessageMock.mockRejectedValue(new Error('MtProtoTelegramClient.sendMedia failed: mtcute sendMedia timeout (60s)'));
    await expect(telegramChannelAdapter.sendOne({
      account: { telegramUserId: 555, ownerUserId: 42 },
      recipientKey: '123', text: 'hi', attachments: [{ key: 'uploads/42/a.jpg' }],
    })).rejects.toMatchObject({ category: 'transient' });
  });

  it('vuot gioi han so anh -> ChannelSendError hard truoc khi gui gi', async () => {
    prepareMock.mockResolvedValue(Array.from({ length: 6 }, (_, i) => source(`a${i}.jpg`)));
    await expect(telegramChannelAdapter.sendOne({
      account: { telegramUserId: 555, ownerUserId: 42 },
      recipientKey: '123', text: 'hi', attachments: Array.from({ length: 6 }, (_, i) => ({ key: `uploads/42/a${i}.jpg` })),
    })).rejects.toMatchObject({ category: 'hard' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('checkReadiness bao SOM (TELEGRAM_ATTACHMENT_LIMIT) khi mot buoc vuot gioi han so tai lieu', async () => {
    const repo = (await import('../../../../repositories/chatbot/chatbotTelegram.repository.js')).default;
    repo.getSessionString.mockResolvedValue({ authKeys: { permanent: { 2: 'k' } } });
    const attachments = Array.from({ length: 4 }, (_, i) => ({ key: `uploads/42/d${i}.pdf`, size: 10 }));
    await expect(telegramChannelAdapter.checkReadiness({
      userId: 42,
      node: { id: 3, config: { telegramAccountId: 7, recipientSource: 'node', steps: [{ message: 'x', attachments }] } },
    })).rejects.toMatchObject({ code: 'TELEGRAM_ATTACHMENT_LIMIT' });
  });

  it('checkReadiness qua khi dinh kem trong gioi han', async () => {
    const repo = (await import('../../../../repositories/chatbot/chatbotTelegram.repository.js')).default;
    repo.getSessionString.mockResolvedValue({ authKeys: { permanent: { 2: 'k' } } });
    await expect(telegramChannelAdapter.checkReadiness({
      userId: 42,
      node: { id: 3, config: { telegramAccountId: 7, recipientSource: 'node', steps: [{ message: 'x', attachments: [{ key: 'uploads/42/a.pdf', size: 10 }] }] } },
    })).resolves.toBeUndefined();
  });
});
