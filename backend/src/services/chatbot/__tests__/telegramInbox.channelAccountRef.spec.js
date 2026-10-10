/**
 * PLAN_GIAO_TK_TG_WA PR-H3 — Hộp thư Telegram: payload SSE mang `channelAccountRef` (= telegram_accounts.id) để `clientMayReceive`
 * lọc theo việc giao; các hàm trả hội thoại Hộp thư mang `channel_external_id` để chỗ gọi phát đúng ref.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockBroadcast = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));
jest.unstable_mockModule('../../sse.service.js', () => ({ default: { broadcast: mockBroadcast } }));

const {
  broadcastTelegramInbox,
  ensureTelegramInboxConversation,
  findTelegramInboxConversation,
} = await import('../telegramInbox.service.js');

const ACCOUNT = { id: 7, id_user: 3, first_name: 'Shop', username: 'shop' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('broadcastTelegramInbox', () => {
  it('payload mang channelAccountRef (chuỗi) lấy từ hội thoại; kênh vẫn là telegram', () => {
    broadcastTelegramInbox({ ownerUserId: 3, conversation: { id: 11, channel_external_id: 7 }, role: 'visitor', message: 'hi' });
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    const [owner, event, data] = mockBroadcast.mock.calls[0];
    expect(owner).toBe('3');
    expect(event).toBe('inbox:new_message');
    expect(data).toMatchObject({ conversationId: 11, channel: 'telegram', channelAccountRef: '7' });
  });

  it('thiếu channel_external_id → channelAccountRef null (SSE sẽ KHÔNG gửi cho nhân viên — hỏng thì chặn)', () => {
    broadcastTelegramInbox({ ownerUserId: 3, conversation: { id: 11 }, role: 'agent', message: 'x' });
    expect(mockBroadcast.mock.calls[0][2].channelAccountRef).toBeNull();
  });
});

describe('hội thoại Hộp thư mang channel_external_id = id tài khoản', () => {
  it('ensureTelegramInboxConversation: hội thoại có sẵn, hội thoại mới và nhánh đua (23505) đều trả channel_external_id', async () => {
    // Có sẵn
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // connection
      .mockResolvedValueOnce({ rows: [{ id: 5, id_channel: 100, id_user: 3, visitor_name: 'A', visitor_info: {} }] }); // select
    const existing = await ensureTelegramInboxConversation({ account: ACCOUNT, chatId: 9, displayName: 'A' });
    expect(existing.channel_external_id).toBe('7');

    // Mới
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 100 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 6, id_channel: 100, id_user: 3, visitor_name: 'B' }] });
    const created = await ensureTelegramInboxConversation({ account: ACCOUNT, chatId: 10, displayName: 'B' });
    expect(created).toMatchObject({ id: 6, channel_external_id: '7' });

    // Đua (unique violation) → chọn lại
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 100 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
      .mockResolvedValueOnce({ rows: [{ id: 7, id_channel: 100, visitor_name: 'C' }] });
    const raced = await ensureTelegramInboxConversation({ account: ACCOUNT, chatId: 11, displayName: 'C' });
    expect(raced).toMatchObject({ id: 7, channel_external_id: '7' });
  });

  it('findTelegramInboxConversation chọn thêm ch.external_channel_id AS channel_external_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, channel_external_id: '7' }] });
    const row = await findTelegramInboxConversation(ACCOUNT, 9);
    expect(row.channel_external_id).toBe('7');
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/ch\.external_channel_id AS channel_external_id/);
  });
});
