import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { saveAssistantMessageReturningId } = await import('../aiSession.repository.js');

/**
 * PR-9: lượt chat trả ý định sinh landing đã lưu tin user (kèm tệp) → route sinh chỉ thêm MỘT tin assistant (thẻ landing_page) và cần
 * id tin đó để vòng tự sửa đếm trần lượt theo tin.
 */
describe('saveAssistantMessageReturningId', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('chỉ chèn MỘT tin assistant, gác bằng quyền sở hữu phiên, trả id tin vừa lưu', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: '4242' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const out = await saveAssistantMessageReturningId(55, 7, { content: 'Đã tạo', type: 'landing_page', data: { title: 'T', html: '<p/>' } });

    expect(out).toEqual({ assistantMessageId: 4242 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO ai_chat_messages/);
    expect(sql).toMatch(/'assistant'/);
    expect(sql).not.toMatch(/'user'/);
    expect(sql).toMatch(/WHERE EXISTS \(SELECT 1 FROM ai_chat_sessions WHERE id = \$1 AND id_user = \$2\)/);
    expect(sql).toMatch(/RETURNING id/);
    expect(params).toEqual([55, 7, 'Đã tạo', 'landing_page', JSON.stringify({ title: 'T', html: '<p/>' })]);
    // cập nhật updated_at của phiên
    expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE ai_chat_sessions SET updated_at/);
  });

  it('phiên không tồn tại / không thuộc người này (rowCount 0) → null, không cập nhật updated_at', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const out = await saveAssistantMessageReturningId(55, 999, { content: 'x', type: 'landing_page', data: {} });
    expect(out).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('data null → tham số JSON là null', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: 1 }] });
    await saveAssistantMessageReturningId(1, 1, { content: 'c', type: 'text' });
    expect(mockQuery.mock.calls[0][1][4]).toBeNull();
  });
});
