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
const getSessionStringMock = jest.fn();
jest.unstable_mockModule('../../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({
  default: {
    getAccountById: getAccountByIdMock,
    getSessionString: getSessionStringMock,
    listOpenConversationsForAccount: listOpenConversationsForAccountMock,
  },
}));

const { classifyTelegramSendError, telegramChannelAdapter, buildTelegramPolicyFromEnv } = await import('../telegram.campaignChannel.js');
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

  it('lỗi phiên hỏng "First argument to DataView constructor must be an ArrayBuffer" -> auth (dừng node, không đốt danh sách)', async () => {
    sendMessageMock.mockReset();
    sendMessageMock.mockRejectedValue(
      telegramTransportError('sendMessage: MtProtoTelegramClient.sendMessage failed: First argument to DataView constructor must be an ArrayBuffer')
    );
    const rejection = telegramChannelAdapter.sendOne({ account: { telegramUserId: 555 }, recipientKey: '123', text: 'x' });
    await expect(rejection).rejects.toBeInstanceOf(ChannelSendError);
    await expect(rejection).rejects.toMatchObject({ category: 'auth' });
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

// PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 3 — nguồn 'telegram_conversations' phải gắn
// vars.ten = display_name để nội dung tin dùng {{ten}} render đúng tên khách.
describe('telegram.campaignChannel.resolveRecipients — nguồn "telegram_conversations" gắn vars.ten', () => {
  it('vars.ten = display_name khi có tên; chuỗi rỗng khi không có', async () => {
    listOpenConversationsForAccountMock.mockReset();
    listOpenConversationsForAccountMock.mockResolvedValue([
      { external_id: '111', display_name: 'Nguyễn Văn A' },
      { external_id: '-222', display_name: null },
    ]);

    const recipients = await telegramChannelAdapter.resolveRecipients({
      rows: [],
      config: { recipientSource: 'telegram_conversations' },
      account: { accountId: 5 },
    });

    expect(listOpenConversationsForAccountMock).toHaveBeenCalledWith(5);
    expect(recipients).toEqual([
      { recipientKey: '111', display: 'Nguyễn Văn A', vars: { ten: 'Nguyễn Văn A' } },
      { recipientKey: '-222', display: '-222', vars: { ten: '' } },
    ]);
  });
});

describe('telegram.campaignChannel — review PR-6: chốt chủ + giờ 0', () => {
  it('resolveAccount không có chủ (null/0) → throw TELEGRAM_ACCOUNT_NOT_READY, KHÔNG tra repo', async () => {
    getAccountByIdMock.mockReset();
    getAccountByIdMock.mockResolvedValue({ id: 7, id_user: 99, telegram_user_id: '555' });
    for (const owner of [null, undefined, 0, '']) {
      // eslint-disable-next-line no-await-in-loop
      await expect(telegramChannelAdapter.resolveAccount({ workspaceOwnerId: owner, config: { telegramAccountId: 7 }, node: { id: 1 } }))
        .rejects.toMatchObject({ code: 'TELEGRAM_ACCOUNT_NOT_READY' });
    }
    expect(getAccountByIdMock).not.toHaveBeenCalled();
  });

  it('checkReadiness không có chủ → throw TELEGRAM_ACCOUNT_NOT_READY, KHÔNG tra repo', async () => {
    getAccountByIdMock.mockReset();
    getAccountByIdMock.mockResolvedValue({ id: 7, id_user: 99, is_active: true });
    await expect(telegramChannelAdapter.checkReadiness({ userId: null, node: { id: 1, config: { telegramAccountId: 7 } } }))
      .rejects.toMatchObject({ code: 'TELEGRAM_ACCOUNT_NOT_READY' });
    expect(getAccountByIdMock).not.toHaveBeenCalled();
  });

  it('TELEGRAM_OUTBOUND_QUIET_HOURS_END=0 → endHour 0 (nửa đêm hợp lệ); ngoài 0..23 → mặc định', () => {
    const saved = { s: process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START, e: process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END };
    try {
      process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START = '22';
      process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END = '0';
      expect(buildTelegramPolicyFromEnv().quietHours).toEqual({ startHour: 22, endHour: 0 });
      process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START = '24';
      process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END = 'abc';
      expect(buildTelegramPolicyFromEnv().quietHours).toEqual({ startHour: 23, endHour: 6 });
    } finally {
      if (saved.s === undefined) delete process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START; else process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START = saved.s;
      if (saved.e === undefined) delete process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END; else process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END = saved.e;
    }
  });
});

describe('telegram.campaignChannel.checkReadiness — phiên phải còn khoá đăng nhập', () => {
  const input = { userId: 99, node: { id: 1, config: { telegramAccountId: 7 } } };
  const setup = (blob) => {
    getAccountByIdMock.mockReset();
    getSessionStringMock.mockReset();
    getAccountByIdMock.mockResolvedValue({ id: 7, id_user: 99, is_active: true, telegram_user_id: '555' });
    getSessionStringMock.mockResolvedValue(blob);
  };

  it('blob có authKeys.permanent >= 1 khoá -> qua', async () => {
    setup({ kv: {}, authKeys: { permanent: { 2: { 0: 1 } }, temp: {} } });
    await expect(telegramChannelAdapter.checkReadiness(input)).resolves.toBeUndefined();
    expect(getSessionStringMock).toHaveBeenCalledWith('555');
  });

  it('blob null -> TELEGRAM_ACCOUNT_NOT_READY, thông điệp nhắc đăng nhập lại', async () => {
    setup(null);
    await expect(telegramChannelAdapter.checkReadiness(input)).rejects.toMatchObject({
      code: 'TELEGRAM_ACCOUNT_NOT_READY',
      message: expect.stringContaining('đăng nhập lại Telegram'),
    });
  });

  it('blob có kv nhưng không có authKeys (dạng hỏng trên production) -> TELEGRAM_ACCOUNT_NOT_READY', async () => {
    setup({ kv: { 0: 1, 1: 2 } });
    await expect(telegramChannelAdapter.checkReadiness(input)).rejects.toMatchObject({ code: 'TELEGRAM_ACCOUNT_NOT_READY' });
  });

  it('authKeys.permanent rỗng -> TELEGRAM_ACCOUNT_NOT_READY', async () => {
    setup({ kv: {}, authKeys: { permanent: {}, temp: {} } });
    await expect(telegramChannelAdapter.checkReadiness(input)).rejects.toMatchObject({ code: 'TELEGRAM_ACCOUNT_NOT_READY' });
  });
});

describe('telegram.campaignChannel.checkReadiness — PLAN_TELEGRAM_0_NGUOI_NHAN: chặn sớm khi không có người nhận', () => {
  const goodSession = { kv: {}, authKeys: { permanent: { 2: { 0: 1 } }, temp: {} } };
  const nodeWith = (config) => ({ userId: 99, node: { id: 1, config: { telegramAccountId: 7, ...config } } });
  const setup = () => {
    getAccountByIdMock.mockReset();
    getSessionStringMock.mockReset();
    listOpenConversationsForAccountMock.mockReset();
    getAccountByIdMock.mockResolvedValue({ id: 7, id_user: 99, is_active: true, telegram_user_id: '555' });
    getSessionStringMock.mockResolvedValue(goodSession);
  };

  it('nguồn hội thoại + tài khoản 0 hội thoại mở -> TELEGRAM_NO_RECIPIENTS, câu tiếng Việt gợi ý "Nhập chat id"', async () => {
    setup();
    listOpenConversationsForAccountMock.mockResolvedValue([]);
    await expect(
      telegramChannelAdapter.checkReadiness(nodeWith({ recipientSource: 'telegram_conversations' }))
    ).rejects.toMatchObject({
      code: 'TELEGRAM_NO_RECIPIENTS',
      message: expect.stringContaining("chưa có hội thoại nào đang mở"),
    });
    expect(listOpenConversationsForAccountMock).toHaveBeenCalledWith(7);
  });

  it('nguồn hội thoại + có >= 1 hội thoại mở -> qua', async () => {
    setup();
    listOpenConversationsForAccountMock.mockResolvedValue([{ external_id: '123', display_name: 'A' }]);
    await expect(
      telegramChannelAdapter.checkReadiness(nodeWith({ recipientSource: 'telegram_conversations' }))
    ).resolves.toBeUndefined();
  });

  it.each([
    ['toàn chữ', 'abc\nxyz, @user'],
    ['chuỗi rỗng', ''],
    ['mảng rỗng', []],
  ])('nguồn manual, recipientKeys %s -> TELEGRAM_NO_RECIPIENTS', async (_label, recipientKeys) => {
    setup();
    await expect(
      telegramChannelAdapter.checkReadiness(nodeWith({ recipientSource: 'manual', recipientKeys }))
    ).rejects.toMatchObject({ code: 'TELEGRAM_NO_RECIPIENTS', message: expect.stringContaining('chat id') });
    expect(listOpenConversationsForAccountMock).not.toHaveBeenCalled();
  });

  it('nguồn manual, có ít nhất một chat id hợp lệ (lẫn rác) -> qua', async () => {
    setup();
    await expect(
      telegramChannelAdapter.checkReadiness(nodeWith({ recipientSource: 'manual', recipientKeys: 'abc\n-1001234567890' }))
    ).resolves.toBeUndefined();
  });

  it('nguồn khác (node/mặc định) -> không tra hội thoại, qua (lưới nằm ở bộ chạy)', async () => {
    setup();
    await expect(telegramChannelAdapter.checkReadiness(nodeWith({}))).resolves.toBeUndefined();
    expect(listOpenConversationsForAccountMock).not.toHaveBeenCalled();
  });
});
