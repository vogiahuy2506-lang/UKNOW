import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { saveMessages } = await import('../aiSession.repository.js');

describe('saveMessages user files', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rowCount: 2, rows: [] });
  });

  it('có userFiles → $8 là JSON { files }', async () => {
    const files = [
      { tempId: 't1', originalName: 'a.pdf', contentType: 'application/pdf', size: 12 },
    ];
    await saveMessages(9, 3, 'xem file', { content: 'ok', type: 'text', data: null }, files);

    expect(mockQuery).toHaveBeenCalled();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('$8::jsonb');
    expect(sql).toMatch(/WHERE EXISTS \(SELECT 1 FROM ai_chat_sessions WHERE id = \$1 AND id_user = \$2\)/);
    expect(params[7]).toBe(JSON.stringify({ files }));
    expect(params).toHaveLength(8);
  });

  it('không truyền userFiles (4 args) → $8 null', async () => {
    await saveMessages(9, 3, 'hello', { content: 'hi', type: 'text', data: { x: 1 } });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[7]).toBeNull();
    expect(params[5]).toBe(JSON.stringify({ x: 1 }));
  });

  it('userFiles rỗng → $8 null', async () => {
    await saveMessages(9, 3, 'hello', { content: 'hi' }, []);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[7]).toBeNull();
  });
});
