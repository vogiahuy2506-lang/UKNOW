/**
 * Adapter Hộp thư Telegram (P1 PLAN_TG_WA_DAY_DU): adapter Hộp thư THẬT + `telegram.adapter` THẬT chạy,
 * chỉ giả ranh giới: gateway (trả ĐÚNG hình dạng thật `{ data: { messageId } }` — `wrap` của
 * telegramGateway.client.js bọc `{ data }`), repo tài khoản, repo kết nối kênh và DB.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGatewaySend = jest.fn();
const mockGatewaySendMedia = jest.fn();
const mockPrepare = jest.fn();
const mockGetAccountById = jest.fn();
const mockTouchActivity = jest.fn();
const mockGetTelegramAccountId = jest.fn();
const mockDbQuery = jest.fn();

jest.unstable_mockModule('../../telegramGateway.client.js', () => ({
  default: { sendMessage: mockGatewaySend, sendMedia: mockGatewaySendMedia },
}));
// Buoc doc tep tu kho (tra dung hinh dang `{ data, filename, metadata }`).
jest.unstable_mockModule('../../../campaign/campaignZaloSender.service.js', () => ({
  default: { prepareZaloAttachmentSources: mockPrepare },
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

const { default: adapter } = await import('../telegramInbox.adapter.js');
const { buildTelegramInboxExternalId, parseTelegramInboxExternalId } = await import('../../telegramInbox.service.js');

describe('telegramInbox.adapter — trả lời tay từ Hộp thư', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTelegramAccountId.mockResolvedValue(7);
    mockGetAccountById.mockResolvedValue({ id: 7, id_user: 42, telegram_user_id: 9999, is_active: true });
    mockGatewaySend.mockResolvedValue({ data: { messageId: 4242 } });
    mockGatewaySendMedia.mockResolvedValue({ data: { messageId: 4243 } });
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

  // P5 — Hộp thư GỬI được ảnh/tài liệu (trước đây trả lỗi "chưa gửi được tệp").
  describe('tệp đính kèm (P5)', () => {
    const file = (filename) => ({ data: Buffer.from('x'), filename, metadata: { totalSize: 1 } });
    const attachments = [{ key: 'uploads/42/chat/a.jpg' }, { key: 'uploads/42/chat/bao-gia.pdf' }];

    it('có tệp → gửi text rồi ảnh rồi tài liệu qua gateway; KHÔNG trả lỗi "chưa gửi được tệp"', async () => {
      mockPrepare.mockResolvedValue([file('bao-gia.pdf'), file('a.jpg')]);
      const result = await adapter.sendReply({
        channelId: 31,
        externalId: buildTelegramInboxExternalId(7, '7777'),
        message: 'Xem ảnh',
        attachments,
        userId: 42,
      });

      expect(result).toEqual({ success: true, messageId: '4242', provider: 'telegram' });
      expect(mockPrepare).toHaveBeenCalledWith(attachments, { ownerUserId: 42, cache: undefined });
      expect(mockGatewaySend).toHaveBeenCalledWith(9999, 7777, 'Xem ảnh');
      expect(mockGatewaySendMedia.mock.calls.map((c) => [c[2].kind, c[2].fileName])).toEqual([
        ['photo', 'a.jpg'],
        ['document', 'bao-gia.pdf'],
      ]);
    });

    it('chỉ có tệp (không chữ) → không gửi tin chữ, không tạo dòng bảng cũ rỗng', async () => {
      mockPrepare.mockResolvedValue([file('a.jpg')]);
      const result = await adapter.sendReply({
        channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: '', attachments: [attachments[0]], userId: 42,
      });
      expect(result).toMatchObject({ success: true, messageId: '4243' });
      expect(mockGatewaySend).not.toHaveBeenCalled();
      expect(mockDbQuery.mock.calls.some(([sql]) => /INSERT INTO telegram_personal_messages/i.test(sql))).toBe(false);
    });

    it('ảnh lỗi sau khi chữ đã tới → success:false, kèm id tin đã tới (Hộp thư đánh dấu failed để thử lại)', async () => {
      mockPrepare.mockResolvedValue([file('a.jpg')]);
      mockGatewaySendMedia.mockRejectedValue(new Error('sendMedia: MtProtoTelegramClient.sendMedia failed: IMAGE_PROCESS_FAILED'));
      const result = await adapter.sendReply({
        channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'Xem ảnh', attachments: [attachments[0]], userId: 42,
      });
      expect(result.success).toBe(false);
      expect(result.messageId).toBe('4242');
      expect(result.error).toMatch(/IMAGE_PROCESS_FAILED/);
    });

    it('tệp không đọc được / không thuộc chủ → success:false, KHÔNG gửi phần chữ', async () => {
      mockPrepare.mockResolvedValue([]);
      const result = await adapter.sendReply({
        channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'x', attachments: [attachments[0]], userId: 42,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/tệp đính kèm/);
      expect(mockGatewaySend).not.toHaveBeenCalled();
    });
  });

  it('P6 — tài khoản bị khoá do vượt hạn mức gói: success:false kèm câu khoá, KHÔNG gọi gateway, không ghi bảng cũ', async () => {
    mockDbQuery.mockImplementation(async (sql, params) => {
      if (/FROM topup_locked_resources/i.test(sql)) {
        return { rows: params?.[0] === 'telegram_accounts' && Number(params?.[1]) === 7 ? [{ '?column?': 1 }] : [] };
      }
      return { rows: [] };
    });
    const result = await adapter.sendReply({
      channelId: 31, externalId: buildTelegramInboxExternalId(7, '7777'), message: 'Chào bạn', userId: 42,
    });
    expect(result).toMatchObject({ success: false, provider: 'telegram', error: expect.stringContaining('bị khoá') });
    expect(mockGatewaySend).not.toHaveBeenCalled();
    expect(mockDbQuery.mock.calls.find(([sql]) => /INSERT INTO telegram_personal_messages/i.test(sql))).toBeUndefined();
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
