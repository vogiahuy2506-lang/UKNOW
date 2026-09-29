/**
 * P8b — adapter WhatsApp với NGUỒN NHÓM (`whatsapp_groups`): người nhận là jid `@g.us`, KHÔNG chuẩn hoá SĐT, KHÔNG dò số
 * (`checkNumberExists`). Mock whatsappBaileys.service.js + repo hội thoại (không chạm DB/mạng).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getSessionMock = jest.fn();
const checkNumberExistsMock = jest.fn();
const sendMessageMock = jest.fn();
jest.unstable_mockModule('../../../chatbot/whatsappBaileys.service.js', () => ({
  getSession: getSessionMock,
  listPersistedSessions: jest.fn(),
  checkNumberExists: checkNumberExistsMock,
  sendMessage: sendMessageMock,
}));

jest.unstable_mockModule('../../../../repositories/chatbot/whatsappCampaignConversation.repository.js', () => ({
  default: {
    listOpenWhatsAppConversationsForSession: jest.fn(),
    countOpenConversationsBySessionKeys: jest.fn(),
  },
  extractPhoneFromExternalId: (externalId) => String(externalId ?? '').split(':').pop(),
}));

jest.unstable_mockModule('../../../../utils/topupLockGate.util.js', () => ({
  whatsappSessionIsLocked: jest.fn(async () => false),
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'khoá',
}));

const { whatsappChannelAdapter, isWhatsAppGroupJid } = await import('../whatsapp.campaignChannel.js');

const GROUP = '120363012345678901@g.us';
const OLD_GROUP = '84912345678-1600000000@g.us';
const node = (config) => ({ id: 7, config: { whatsappSessionKey: '40-default', ...config } });

beforeEach(() => {
  jest.resetAllMocks();
  getSessionMock.mockReturnValue({ sessionKey: '40-default', status: 'open', userName: 'Phúc' });
});

describe('isWhatsAppGroupJid', () => {
  it.each([GROUP, OLD_GROUP, ` ${GROUP} `])('%s -> true', (v) => expect(isWhatsAppGroupJid(v)).toBe(true));
  it.each(['84912345678', '84912345678@s.whatsapp.net', 'abc@g.us', '@g.us', '', null, undefined])(
    '%s -> false',
    (v) => expect(isWhatsAppGroupJid(v)).toBe(false)
  );
});

describe('sendOne — nhóm', () => {
  const account = { sessionKey: '40-default' };

  it('gửi thẳng jid nhóm: KHÔNG chuẩn hoá SĐT, KHÔNG gọi checkNumberExists', async () => {
    sendMessageMock.mockResolvedValue({ key: { id: 'G1' } });
    await expect(
      whatsappChannelAdapter.sendOne({ account, recipientKey: GROUP, text: 'chào cả nhóm' })
    ).resolves.toEqual({ messageId: 'G1' });
    expect(checkNumberExistsMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith('40-default', GROUP, 'chào cả nhóm');
  });

  it('jid nhóm kiểu cũ (<sđt>-<thời gian>@g.us) cũng gửi nguyên vẹn', async () => {
    sendMessageMock.mockResolvedValue({ key: { id: 'G2' } });
    await whatsappChannelAdapter.sendOne({ account, recipientKey: OLD_GROUP, text: 'x' });
    expect(checkNumberExistsMock).not.toHaveBeenCalled();
    expect(sendMessageMock.mock.calls[0][1]).toBe(OLD_GROUP);
  });

  it('số điện thoại thường vẫn dò số trước khi gửi (không phá hành vi cũ)', async () => {
    checkNumberExistsMock.mockResolvedValue(true);
    sendMessageMock.mockResolvedValue({ key: { id: 'P1' } });
    await whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'x' });
    expect(checkNumberExistsMock).toHaveBeenCalledWith('40-default', '84912345678');
  });
});

describe('resolveRecipients — nguồn whatsapp_groups', () => {
  const account = { sessionKey: '40-default' };
  const config = { recipientSource: 'whatsapp_groups' };

  it('giữ nguyên jid, display, gắn isGroup; bỏ phần tử không phải jid nhóm; khử trùng', async () => {
    const result = await whatsappChannelAdapter.resolveRecipients({
      rows: [
        { recipientKey: GROUP, display: 'Khách VIP' },
        { recipientKey: GROUP, display: 'trùng' },
        { recipientKey: '0912345678', display: 'SĐT không phải nhóm' },
        { recipientKey: OLD_GROUP },
      ],
      config,
      account,
    });
    expect(result).toEqual([
      { recipientKey: GROUP, display: 'Khách VIP', vars: {}, isGroup: true },
      { recipientKey: OLD_GROUP, display: OLD_GROUP, vars: {}, isGroup: true },
    ]);
  });
});

describe('checkReadiness — nguồn whatsapp_groups', () => {
  it('chưa chọn nhóm hợp lệ nào -> WHATSAPP_NO_RECIPIENTS; có ít nhất 1 -> qua', async () => {
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'whatsapp_groups', recipientKeys: [] }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_NO_RECIPIENTS' });
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'whatsapp_groups', recipientKeys: [{ recipientKey: '0912345678' }] }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_NO_RECIPIENTS' });
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'whatsapp_groups', recipientKeys: [{ recipientKey: GROUP, display: 'A' }] }) })
    ).resolves.toBeUndefined();
  });
});
