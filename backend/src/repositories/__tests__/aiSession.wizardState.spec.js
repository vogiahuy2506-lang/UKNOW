import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { getSessionWizardState, updateWizardStateSections } = await import('../aiSession.repository.js');

describe('aiSession.repository — wizard_state', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('getSessionWizardState trả kèm message_count (đếm trong cùng câu SELECT)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, wizard_state: null, message_count: 4 }] });
    const row = await getSessionWizardState(5, 3);
    expect(row.message_count).toBe(4);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/COUNT\(\*\)::int FROM ai_chat_messages/);
    expect(sql).toMatch(/s\.id_user = \$2/);
    expect(params).toEqual([5, 3]);
  });

  it('updateWizardStateSections: stampFoldedCount đếm tin ngay trong câu UPDATE', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateWizardStateSections(5, 3, { meta: { lastGate: null }, stampFoldedCount: true });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/\{meta,foldedMessageCount\}/);
    expect(sql).toMatch(/SELECT COUNT\(\*\)::int FROM ai_chat_messages WHERE session_id = \$1/);
  });

  it('updateWizardStateSections: không có stampFoldedCount thì không đụng foldedMessageCount', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateWizardStateSections(5, 3, { meta: { lastGate: null } });
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/foldedMessageCount/);
  });
});
