import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { saveMessagesReturningIds, saveMessages, getLandingPageMessage, getSessionMessages } =
  await import('../aiSession.repository.js');

describe('saveMessagesReturningIds (plan landing tự kiểm 10.1)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('cùng SQL ghi cặp user + assistant, gate ownership, thêm RETURNING id, role', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 2, rows: [{ id: '501', role: 'user' }, { id: '502', role: 'assistant' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await saveMessagesReturningIds(9, 3, 'tạo trang', { content: 'ok', type: 'landing_page', data: { html: '<p/>' } });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO ai_chat_messages/);
    expect(sql).toMatch(/WHERE EXISTS \(SELECT 1 FROM ai_chat_sessions WHERE id = \$1 AND id_user = \$2\)/);
    expect(sql).toMatch(/RETURNING id, role/);
    expect(params).toHaveLength(8);
    expect(params[4]).toBe('landing_page');
    expect(params[5]).toBe(JSON.stringify({ html: '<p/>' }));
    // và cập nhật updated_at của session như saveMessages
    expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE ai_chat_sessions SET updated_at = NOW\(\)/);
  });

  it('trả { userMessageId, assistantMessageId } dạng SỐ (pg trả BIGSERIAL là chuỗi), khớp theo role', async () => {
    // thứ tự hàng không được bảo đảm → phải khớp theo role, không theo vị trí
    mockQuery
      .mockResolvedValueOnce({ rowCount: 2, rows: [{ id: '502', role: 'assistant' }, { id: '501', role: 'user' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await expect(
      saveMessagesReturningIds(9, 3, 'x', { content: 'y', type: 'landing_page' }),
    ).resolves.toEqual({ userMessageId: 501, assistantMessageId: 502 });
  });

  it('không ghi được (session không thuộc user) → null, không cập nhật session', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(saveMessagesReturningIds(9, 3, 'x', { content: 'y' })).resolves.toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('saveMessages KHÔNG đổi: vẫn trả boolean, SQL không có RETURNING', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2, rows: [] });
    await expect(saveMessages(9, 3, 'x', { content: 'y' })).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/RETURNING/);
  });
});

describe('getLandingPageMessage', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('có messageId → lọc theo id, gate ownership qua JOIN session, chỉ type landing_page', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: '77', data: { html: '<p/>', autoLayoutFixCount: 1 } }] });
    const msg = await getLandingPageMessage(9, 3, '77');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN ai_chat_sessions s ON s\.id = m\.session_id/);
    expect(sql).toMatch(/s\.id_user = \$2/);
    expect(sql).toMatch(/m\.type = 'landing_page'/);
    expect(sql).toMatch(/AND m\.id = \$3/);
    expect(params).toEqual([9, 3, 77]);
    expect(msg).toEqual({ id: 77, data: { html: '<p/>', autoLayoutFixCount: 1 } });
  });

  it.each([[null], [undefined], [0], [-3], ['abc'], [1.5]])(
    'messageId=%s → tin landing_page MỚI NHẤT của phiên (cùng luật nhánh null của updateLandingPageMessage)',
    async (messageId) => {
      mockQuery.mockResolvedValue({ rows: [{ id: 5, data: {} }] });
      await getLandingPageMessage(9, 3, messageId);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).not.toMatch(/m\.id = \$3/);
      expect(sql).toMatch(/ORDER BY m\.id DESC\s+LIMIT 1/);
      expect(params).toEqual([9, 3]);
    },
  );

  it('không có hàng → null; data null → {}', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(getLandingPageMessage(9, 3, null)).resolves.toBeNull();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '8', data: null }] });
    await expect(getLandingPageMessage(9, 3, null)).resolves.toEqual({ id: 8, data: {} });
  });
});

describe('getSessionMessages trả id', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('SELECT có id và trả id dạng số — frontend đọc msg.id để gửi messageId khi sửa', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 9, wizard_state: null }] })
      .mockResolvedValueOnce({
        rows: [
          { id: '11', role: 'user', content: 'a', type: null, data: null, missing_fields: null },
          { id: '12', role: 'assistant', content: 'b', type: 'landing_page', data: { html: '<p/>' }, missing_fields: null },
        ],
      });
    const result = await getSessionMessages(9, 3);
    expect(mockQuery.mock.calls[1][0]).toMatch(/SELECT id, role, content, type, data, missing_fields/);
    expect(result.messages.map((m) => m.id)).toEqual([11, 12]);
    expect(result.messages[1]).toMatchObject({ role: 'assistant', type: 'landing_page', data: { html: '<p/>' } });
  });
});
