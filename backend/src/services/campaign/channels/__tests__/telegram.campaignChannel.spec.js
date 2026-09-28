/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-6 — unit test cho các hàm THUẦN của
 * telegram.campaignChannel.js (không chạm DB/mạng — mock telegramGateway.client.js + stubCheck).
 */
import { describe, it, expect, jest } from '@jest/globals';

const sendMessageMock = jest.fn();
jest.unstable_mockModule('../../../chatbot/telegramGateway.client.js', () => ({
  default: {
    isConfigured: jest.fn(() => true),
    sendMessage: sendMessageMock,
  },
}));

jest.unstable_mockModule('../../../chatbot/inProcChannelGateway/stubCheck.js', () => ({
  isStubOnly: jest.fn(() => false),
}));

const getAccountByIdMock = jest.fn();
const listOpenConversationsForAccountMock = jest.fn();
jest.unstable_mockModule('../../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({
  default: {
    getAccountById: getAccountByIdMock,
    listOpenConversationsForAccount: listOpenConversationsForAccountMock,
  },
}));

const { classifyTelegramSendError, telegramChannelAdapter } = await import('../telegram.campaignChannel.js');
const { ChannelSendError } = await import('../../campaignChannelRegistry.service.js');

/**
 * Mọi lỗi transport Telegram thật (mtProtoTelegramClient.js/stub/telegramGateway.client.js's
 * guard()) đều mang `.status = 503` BẤT KỂ nguyên nhân — dùng helper này để test không âm thầm
 * "quên" field đó rồi để lọt đột biến "phân loại theo status 503" (status không phân biệt được gì,
 * phải parse message).
 */
function telegramTransportError(message) {
  const err = new Error(message);
  err.status = 503;
  return err;
}

describe('telegram.campaignChannel — classifyTelegramSendError (bảng phân loại lỗi)', () => {
  it('ChannelSendError có sẵn category -> trả nguyên category, không phân loại lại', () => {
    const err = new ChannelSendError('rate_limit', 'đã có category');
    expect(classifyTelegramSendError(err)).toBe('rate_limit');
  });

  it('FLOOD_WAIT bị bọc 2 lớp (sendMessage: MtProtoTelegramClient.sendMessage failed: Telegram API error 420: FLOOD_WAIT_1800) -> rate_limit', () => {
    const err = telegramTransportError(
      'sendMessage: MtProtoTelegramClient.sendMessage failed: Telegram API error 420: FLOOD_WAIT_1800'
    );
    expect(classifyTelegramSendError(err)).toBe('rate_limit');
  });

  it('SLOWMODE_WAIT bọc 1 lớp -> rate_limit', () => {
    const err = telegramTransportError('MtProtoTelegramClient.sendMessage failed: SLOWMODE_WAIT_30');
    expect(classifyTelegramSendError(err)).toBe('rate_limit');
  });

  it('FLOOD_PREMIUM_WAIT trần (không bọc) -> rate_limit', () => {
    expect(classifyTelegramSendError(telegramTransportError('FLOOD_PREMIUM_WAIT_60'))).toBe('rate_limit');
  });

  it('"…failed: PEER_ID_INVALID" -> hard', () => {
    expect(
      classifyTelegramSendError(telegramTransportError('MtProtoTelegramClient.sendMessage failed: Telegram API error 400: PEER_ID_INVALID'))
    ).toBe('hard');
  });

  it.each([
    ['USER_IS_BLOCKED', 'hard'],
    ['INPUT_USER_DEACTIVATED', 'hard'],
    ['CHAT_WRITE_FORBIDDEN', 'hard'],
    ['USER_PRIVACY_RESTRICTED', 'hard'],
    ['USER_BANNED_IN_CHANNEL', 'hard'],
    ['AUTH_KEY_UNREGISTERED', 'auth'],
    ['SESSION_REVOKED', 'auth'],
    ['AUTH_KEY_DUPLICATED', 'auth'],
    ['USER_DEACTIVATED_BAN', 'auth'],
  ])('"%s" -> %s', (code, expected) => {
    expect(
      classifyTelegramSendError(telegramTransportError(`MtProtoTelegramClient.sendMessage failed: Telegram API error 401: ${code}`))
    ).toBe(expected);
  });

  it('"called before connect()" -> auth', () => {
    expect(
      classifyTelegramSendError(telegramTransportError('MtProtoTelegramClient.sendMessage called before connect()'))
    ).toBe('auth');
  });

  it('"mtcute sendText timeout (20s)" bọc -> transient', () => {
    expect(
      classifyTelegramSendError(telegramTransportError('MtProtoTelegramClient.sendMessage failed: mtcute sendText timeout (20s)'))
    ).toBe('transient');
  });

  it.each(['ECONNRESET', 'ETIMEDOUT'])('lỗi mạng %s -> transient', (code) => {
    expect(classifyTelegramSendError(new Error(`read ${code}`))).toBe('transient');
  });

  it('lỗi 503 stub ("Telegram transport not implemented") -> not_configured, KHÔNG phải rate_limit/hard', () => {
    const category = classifyTelegramSendError(
      telegramTransportError('sendMessage: MtProtoTelegramClient.sendMessage failed: Telegram transport not implemented')
    );
    expect(category).toBe('not_configured');
    expect(category).not.toBe('rate_limit');
    expect(category).not.toBe('hard');
  });

  it('guard "gateway is not configured" -> not_configured', () => {
    expect(
      classifyTelegramSendError(telegramTransportError('Telegram gateway is not configured on the backend'))
    ).toBe('not_configured');
  });

  it('"No active session for telegram_user_id=..." -> not_configured', () => {
    expect(
      classifyTelegramSendError(telegramTransportError('sendMessage: No active session for telegram_user_id=123'))
    ).toBe('not_configured');
  });

  it('lỗi lạ chưa liệt kê -> hard (mặc định)', () => {
    expect(classifyTelegramSendError(new Error('một lỗi hoàn toàn mới chưa từng thấy'))).toBe('hard');
  });
});

describe('telegram.campaignChannel.resolveRecipients — lọc chat id (nguồn "rows")', () => {
  it('chat id có ký tự chữ ("0901234567abc") bị loại; số âm ("-1001234") được nhận', async () => {
    const rows = [
      { recipientKey: '0901234567abc' },
      { recipientKey: '-1001234' },
      { recipientKey: '123456' },
      { recipientKey: '' },
    ];
    const recipients = await telegramChannelAdapter.resolveRecipients({ rows, config: {}, account: {} });
    expect(recipients.map((r) => r.recipientKey)).toEqual(['-1001234', '123456']);
  });
});
