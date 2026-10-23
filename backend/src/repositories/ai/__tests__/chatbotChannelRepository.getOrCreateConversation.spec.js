/**
 * chatbotChannel.repository — getOrCreateConversation chịu tải đồng thời.
 *
 * Bối cảnh: webhook TikTok xử lý event background (không await — xem
 * `tiktokBusinessWebhook.controller.js` `handle()`), và khách mới hay nhắn nhiều tin
 * gần như cùng lúc. Với SELECT-then-INSERT thuần, N request cùng thấy "chưa có hội
 * thoại" rồi cùng INSERT → đụng UNIQUE(id_channel, external_id) của migration 044.
 * Nếu lỗi 23505 nổi lên thì cả tin bị mất. Cần đọc lại hội thoại vừa tạo.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: chatbotChannelRepository } = await import('../chatbotChannel.repository.js');

const PARAMS = {
  chatbotId: 7,
  channelId: 21,
  externalId: 'visitor-open-id-1',
  source: 'tiktok_business',
};

describe('chatbotChannel.repository.getOrCreateConversation', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('Hội thoại đang active → trả về, KHÔNG insert', async () => {
    const existing = { id: 100, id_chatbot: 7, id_channel: 21 };
    query.mockResolvedValueOnce({ rows: [existing] });

    await expect(chatbotChannelRepository.getOrCreateConversation(PARAMS)).resolves.toBe(existing);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toMatch(/SELECT \* FROM chatbot_conversations/i);
  });

  it('Chưa có → INSERT và trả hội thoại mới', async () => {
    const created = { id: 101, id_chatbot: 7, id_channel: 21 };
    query
      .mockResolvedValueOnce({ rows: [] })   // SELECT: không có
      .mockResolvedValueOnce({ rows: [created] }); // INSERT ... RETURNING

    await expect(chatbotChannelRepository.getOrCreateConversation(PARAMS)).resolves.toBe(created);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toMatch(/INSERT INTO chatbot_conversations/i);
    // channel_type lưu 'tiktok_business' (source.replace('_oa','') không đổi gì)
    expect(query.mock.calls[1][1]).toEqual([7, 21, 'tiktok_business', 'visitor-open-id-1', 'tiktok_business']);
  });

  it('Race: INSERT đụng unique_violation (23505) → đọc lại hội thoại vừa tạo, KHÔNG ném lỗi', async () => {
    const winner = { id: 102, id_chatbot: 7, id_channel: 21 };
    const uniqueErr = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    query
      .mockResolvedValueOnce({ rows: [] })      // SELECT: request này chưa thấy
      .mockRejectedValueOnce(uniqueErr)        // INSERT: request song song đã tạo trước
      .mockResolvedValueOnce({ rows: [winner] }); // đọc lại

    await expect(chatbotChannelRepository.getOrCreateConversation(PARAMS)).resolves.toBe(winner);
    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[2][0])).toMatch(/SELECT \* FROM chatbot_conversations/i);
    // Truy vấn đọc lại KHÔNG lọc status: index UNIQUE không có status nên hội thoại
    // vừa tạo (active) là hàng khớp duy nhất, lọc status chỉ làm mất nó.
    expect(String(query.mock.calls[2][0])).not.toMatch(/status/i);
  });

  it('Lỗi DB khác 23505 → ném lên (không nuốt nhầm lỗi hạ tầng)', async () => {
    const otherErr = Object.assign(new Error('connection terminated'), { code: '57P01' });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(otherErr);

    await expect(chatbotChannelRepository.getOrCreateConversation(PARAMS)).rejects.toThrow('connection terminated');
    expect(query).toHaveBeenCalledTimes(2);
  });
});