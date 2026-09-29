import { describe, it, expect, jest } from '@jest/globals';

// Không đụng CSDL thật: truyền `queryable` giả để đọc câu SQL repo sinh ra.
const { default: chatbotContactAlertRepository } = await import('../chatbotContactAlert.repository.js');

function fakeQueryable() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }) };
}

describe('chatbotContactAlert.repository — quét tin khách để bắt liên hệ', () => {
  // P1 (PLAN_TG_WA_DAY_DU): nhóm Telegram cũng nằm trong channel_conversations (visitor_info.is_group=true).
  // Tin trò chuyện trong nhóm không phải khách để lại liên hệ → nguồn 'channel' phải loại nhóm khỏi quét
  // (review 29/09: đột biến bỏ điều kiện này lọt qua mọi test).
  it("nguồn 'channel' loại hội thoại nhóm (visitor_info.is_group) khỏi quét", async () => {
    const q = fakeQueryable();
    await chatbotContactAlertRepository.fetchVisitorMessagesAfter('channel', 10, 50, q);

    expect(q.query).toHaveBeenCalledTimes(1);
    const [sql, params] = q.query.mock.calls[0];
    expect(sql).toMatch(/FROM channel_messages m/);
    expect(sql).toMatch(/visitor_info->>'is_group'/);
    expect(sql).toMatch(/<> 'true'/);
    expect(sql).toMatch(/m\.role = 'visitor'/);
    expect(params).toEqual([10, 50]);
  });

  it("nguồn 'web' không có điều kiện nhóm (webchat không có nhóm)", async () => {
    const q = fakeQueryable();
    await chatbotContactAlertRepository.fetchVisitorMessagesAfter('web', 0, 500, q);

    const [sql] = q.query.mock.calls[0];
    expect(sql).toMatch(/FROM webchat_messages m/);
    expect(sql).not.toMatch(/is_group/);
  });
});
