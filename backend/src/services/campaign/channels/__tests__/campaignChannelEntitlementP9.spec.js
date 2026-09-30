/**
 * P9 — bộ chạy kênh: gói của chủ workspace không có kênh (trần 0) thì preflight (`checkReadiness`) và lúc chạy
 * (`resolveAccount`) đều ném CHANNEL_NOT_IN_PLAN — TRƯỚC khi tra tài khoản/khoá. Có quyền -> đi tiếp như cũ.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const assertChannelEntitledMock = jest.fn();
jest.unstable_mockModule('../../channelEntitlement.service.js', () => ({
  assertChannelEntitled: assertChannelEntitledMock,
}));

const getAccountByIdMock = jest.fn();
jest.unstable_mockModule('../../../chatbot/telegramGateway.client.js', () => ({
  default: { isConfigured: jest.fn(() => true), sendMessage: jest.fn() },
}));
jest.unstable_mockModule('../../../chatbot/inProcChannelGateway/stubCheck.js', () => ({
  isStubOnly: jest.fn(() => false),
}));
jest.unstable_mockModule('../../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({
  default: {
    getAccountById: getAccountByIdMock,
    getSessionString: jest.fn(),
    listOpenConversationsForAccount: jest.fn(),
  },
}));
jest.unstable_mockModule('../../../chatbot/whatsappBaileys.service.js', () => ({
  getSession: jest.fn(() => ({ status: 'open', userName: 'WA' })),
  listPersistedSessions: jest.fn(),
  checkNumberExists: jest.fn(),
  sendMessage: jest.fn(),
}));
jest.unstable_mockModule('../../../../repositories/chatbot/whatsappCampaignConversation.repository.js', () => ({
  default: { listOpenWhatsAppConversationsForSession: jest.fn(), countOpenConversationsBySessionKeys: jest.fn() },
  extractPhoneFromExternalId: (id) => String(id ?? ''),
}));
const resourceIsLockedMock = jest.fn(async () => false);
jest.unstable_mockModule('../../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: resourceIsLockedMock,
  whatsappSessionIsLocked: jest.fn(async () => false),
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'khoá',
}));

const { telegramChannelAdapter } = await import('../telegram.campaignChannel.js');
const { whatsappChannelAdapter } = await import('../whatsapp.campaignChannel.js');

function notInPlan() {
  const err = new Error('Gói của bạn không có kênh');
  err.code = 'CHANNEL_NOT_IN_PLAN';
  err.status = 403;
  return err;
}

describe('kênh adapter — P9 quyền kênh theo gói', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assertChannelEntitledMock.mockResolvedValue(undefined);
    getAccountByIdMock.mockResolvedValue({ id: 9, telegram_user_id: 5, is_active: true, username: 'tg' });
  });

  it('Telegram checkReadiness: trần 0 -> CHANNEL_NOT_IN_PLAN, không tra tài khoản', async () => {
    assertChannelEntitledMock.mockRejectedValue(notInPlan());
    await expect(telegramChannelAdapter.checkReadiness({ userId: 4, node: { id: 'n', config: { telegramAccountId: 9 } } }))
      .rejects.toMatchObject({ code: 'CHANNEL_NOT_IN_PLAN' });
    expect(assertChannelEntitledMock).toHaveBeenCalledWith({ channel: 'telegram', ownerUserId: 4 });
    expect(getAccountByIdMock).not.toHaveBeenCalled();
  });

  it('Telegram resolveAccount: trần 0 -> CHANNEL_NOT_IN_PLAN; có quyền -> trả tài khoản', async () => {
    assertChannelEntitledMock.mockRejectedValueOnce(notInPlan());
    await expect(telegramChannelAdapter.resolveAccount({ workspaceOwnerId: 4, config: { telegramAccountId: 9 } }))
      .rejects.toMatchObject({ code: 'CHANNEL_NOT_IN_PLAN' });
    await expect(telegramChannelAdapter.resolveAccount({ workspaceOwnerId: 4, config: { telegramAccountId: 9 } }))
      .resolves.toMatchObject({ accountId: 9 });
  });

  it('WhatsApp checkReadiness + resolveAccount: trần 0 -> CHANNEL_NOT_IN_PLAN', async () => {
    assertChannelEntitledMock.mockRejectedValue(notInPlan());
    await expect(whatsappChannelAdapter.checkReadiness({ userId: 4, node: { id: 'n', config: { whatsappSessionKey: '4-abc' } } }))
      .rejects.toMatchObject({ code: 'CHANNEL_NOT_IN_PLAN' });
    await expect(whatsappChannelAdapter.resolveAccount({ workspaceOwnerId: 4, config: { whatsappSessionKey: '4-abc' } }))
      .rejects.toMatchObject({ code: 'CHANNEL_NOT_IN_PLAN' });
    expect(assertChannelEntitledMock).toHaveBeenCalledWith({ channel: 'whatsapp', ownerUserId: 4 });
  });

  it('WhatsApp resolveAccount: có quyền -> trả phiên', async () => {
    await expect(whatsappChannelAdapter.resolveAccount({ workspaceOwnerId: 4, config: { whatsappSessionKey: '4-abc' } }))
      .resolves.toMatchObject({ sessionKey: '4-abc' });
  });
});
