/**
 * Adapter Hộp thư Telegram (P1 PLAN_TG_WA_DAY_DU): adapter Hộp thư THẬT + `telegram.adapter` THẬT chạy,
 * chỉ giả ranh giới: gateway (trả ĐÚNG hình dạng thật `{ data: { messageId } }` — `wrap` của
 * telegramGateway.client.js bọc `{ data }`), repo tài khoản, repo kết nối kênh và DB.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGatewaySend = jest.fn();
const mockGetAccountById = jest.fn();
const mockTouchActivity = jest.fn();
const mockGetTelegramAccountId = jest.fn();
const mockDbQuery = jest.fn();

jest.unstable_mockModule('../../telegramGateway.client.js', () => ({
  default: { sendMessage: mockGatewaySend },
}));
jest.unstable_mockModule('../../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({
  default: { getAccountById: mockGetAccountById, touchActivity: mockTouchActivity },
}));
jest.unstable_mockModule('../../../../repositories/ai/channelConnections.repository.js', () => ({
  default: { getTelegramAccountId: mockGetTelegramAccountId },
}));
jest.unstable_mockModule('../../../../config/database.js', () => ({
  default: { query: mockDbQuery },
}));
jest.unstable_mockModule('../../../sse.service.js', () => ({
  default: { broadcast: jest.fn() },
}));

const { default: adapter, ATTACHMENTS_UNSUPPORTED_ERROR } = await import('../telegramInbox.adapter.js');
const { buildTelegramInboxExternalId, parseTelegramInboxExternalId } = await import('../../telegramInbox.service.js');

describe('telegramInbox.adapter — trả lời tay từ Hộp thư', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTelegramAccountId.mockResolvedValue(7);
    mockGetAccountById.mockResolvedValue({ id: 7, id_user: 42, telegram_user_id: 9999, is_active: true });
    mockGatewaySend.mockResolvedValue({ data: { messageId: 4242 } });
    mockDbQuery.mockImplementation(async (sql) => {
      if (/SELECT id FROM telegram_personal_conversations/i.test(sql)) return { rows: [{ id: 101 }] };
      if (/INSERT INTO telegram_personal_messages/i.test(sql)) return { rows: [{ id: 888 }] };
      return { rows: [] };
    });
  });

  it('gửi đúng (tài khoản Telegram, chatId, nội dung) qua gateway và trả messageId THẬT bóc từ {data}', async () => {
    const externalId = buildTelegramInboxExternalId(7, '7777');
    const result = await adapter.sendReply({ channelId: 31, externalId, message: 'Chào bạn', userId: 42 });

    expect(mockGetTelegramAccountId).toHaveBeenCalledWith(31, 42);
    expect(mockGetAccountById).toHaveBeenCalledWith(7, { userId: 42 });
    expect(mockGatewaySend).toHaveBeenCalledTimes(1);
    expect(mockGatewaySend).toHaveBeenCalledWith(9999, 7777, 'Chào bạn');
    expect(result).toMatchObject({ success: true, messageId: 4242 });
  });

  it('chatId nhóm âm (-100…) giữ nguyên dấu khi tách khỏi chuỗi ghép và khi gửi', async () => {
    const externalId = buildTelegramInboxExternalId(7, '-1001234567890');
    expect(parseTelegramInboxExternalId(externalId)).toEqual({ accountId: 7, chatId: '-1001234567890' });
    await adapter.sendReply({ channelId: 31, externalId, message: 'Hi', userId: 42 });
    expect(mockGatewaySend).toHaveBeenCalledWith(9999, -1001234567890, 'Hi');
  });

  it('ghi song song dòng agent vào telegram_personal_messages (bảng cũ) kèm id tin Telegram', async () => {
    await adapter.sendReply({
      channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'Chào bạn', userId: 42,
    });
    const insert = mockDbQuery.mock.calls.find(([sql]) => /INSERT INTO telegram_personal_messages/i.test(sql));
    expect(insert).toBeDefined();
    expect(insert[1][0]).toBe(101); // hội thoại cũ đang mở
    expect(insert[1][2]).toBe('4242'); // external_message_id
    expect(insert[1][3]).toBe('Chào bạn');
  });

  it('có tệp đính kèm → success:false kèm câu giải thích, không gọi gateway', async () => {
    const result = await adapter.sendReply({
      channelId: 31,
      externalId: buildTelegramInboxExternalId(7, '7777'),
      message: 'Xem ảnh',
      attachments: [{ url: 'https://x/y.png', name: 'y.png' }],
      userId: 42,
    });
    expect(result).toMatchObject({ success: false, error: ATTACHMENTS_UNSUPPORTED_ERROR });
    expect(mockGatewaySend).not.toHaveBeenCalled();
  });

  it('external_id không phải dạng telegram:<tài khoản>:<chat> → success:false, không gọi gateway', async () => {
    const result = await adapter.sendReply({ channelId: 31, externalId: '7777', message: 'x', userId: 42 });
    expect(result.success).toBe(false);
    expect(mockGatewaySend).not.toHaveBeenCalled();
  });

  it('kết nối kênh không thuộc user / không phải Telegram (repo trả null) → success:false, không gọi gateway', async () => {
    mockGetTelegramAccountId.mockResolvedValue(null);
    const result = await adapter.sendReply({
      channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'x', userId: 42,
    });
    expect(result.success).toBe(false);
    expect(mockGatewaySend).not.toHaveBeenCalled();
  });

  it('tài khoản trong external_id lệch tài khoản của kết nối → success:false (không gửi nhầm phiên)', async () => {
    mockGetTelegramAccountId.mockResolvedValue(8);
    const result = await adapter.sendReply({
      channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'x', userId: 42,
    });
    expect(result.success).toBe(false);
    expect(mockGatewaySend).not.toHaveBeenCalled();
  });

  it('gateway lỗi → success:false với thông điệp lỗi (Hộp thư đánh dấu failed, cho thử lại), không ném', async () => {
    mockGatewaySend.mockRejectedValue(new Error('sendMessage: cannot reach Telegram DC'));
    const result = await adapter.sendReply({
      channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'x', userId: 42,
    });
    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/cannot reach Telegram DC/);
  });

  it('tài khoản đã ngừng hoạt động → success:false', async () => {
    mockGetAccountById.mockResolvedValue({ id: 7, id_user: 42, telegram_user_id: 9999, is_active: false });
    const result = await adapter.sendReply({
      channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'x', userId: 42,
    });
    expect(result.success).toBe(false);
    expect(mockGatewaySend).not.toHaveBeenCalled();
  });
});
