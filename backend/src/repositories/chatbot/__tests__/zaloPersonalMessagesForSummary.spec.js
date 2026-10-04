import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: zaloPersonalRepository } = await import('../zaloPersonal.repository.js');

/**
 * D-21 (PLAN_SUA_AI_DOT4 PR-3): `getMessagesForSummary` giới hạn NGAY trong SQL — trước đây không `LIMIT`, kéo mọi tin của cả
 * ngày (nguyên văn, dài bao nhiêu cũng được) về Node rồi mới `slice(-15)` bằng JS.
 *
 * Test này khoá HÌNH DẠNG câu SQL + thứ tự tham số. Câu SQL đã được chạy thử trên Postgres 16 thật (bảng tạm cùng cột):
 * 20 tin/hội thoại → còn 15 tin mới nhất, tin dài cắt đúng độ dài, tin user khác và ngoài ngày bị loại.
 */
describe('zaloPersonal.repository.getMessagesForSummary — giới hạn trong SQL', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ id_conversation: '1', role: 'visitor', content: 'x', source: null, created_at: new Date() }] });
  });

  it('không có hội thoại nào → [] và KHÔNG chạm DB', async () => {
    await expect(zaloPersonalRepository.getMessagesForSummary({ conversationIds: [], userId: 1, startIso: 'a', endIso: 'b' })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('SQL: cửa sổ ROW_NUMBER theo hội thoại (mới nhất trước), LEFT(content), lọc rn, sắp tin CŨ trước; tham số đúng thứ tự', async () => {
    await zaloPersonalRepository.getMessagesForSummary({
      conversationIds: [1, 2],
      userId: 7,
      startIso: '2026-10-02T17:00:00.000Z',
      endIso: '2026-10-03T17:00:00.000Z',
      limitPerConversation: 15,
      maxContentChars: 1000,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    const flat = sql.replace(/\s+/g, ' ');
    expect(flat).toContain('LEFT(content, $5::int) AS content');
    expect(flat).toContain('ROW_NUMBER() OVER (PARTITION BY id_conversation ORDER BY created_at DESC, id DESC) AS rn');
    expect(flat).toContain('WHERE rn <= $6::int');
    expect(flat).toContain('ORDER BY id_conversation, rn DESC');
    // Vẫn khoá theo chủ + danh sách hội thoại + khoảng ngày.
    expect(flat).toContain('WHERE id_user = $1');
    expect(flat).toContain('id_conversation = ANY($2::bigint[])');
    expect(flat).toContain('created_at >= $3 AND created_at < $4');
    expect(params).toEqual([7, [1, 2], '2026-10-02T17:00:00.000Z', '2026-10-03T17:00:00.000Z', 1000, 15]);
  });

  it('không truyền trần → mặc định 15 tin / 1.000 ký tự; giá trị rác/âm → rơi về mặc định hoặc tối thiểu 1, không bao giờ vô hạn', async () => {
    await zaloPersonalRepository.getMessagesForSummary({ conversationIds: [1], userId: 7, startIso: 'a', endIso: 'b' });
    expect(query.mock.calls[0][1].slice(4)).toEqual([1000, 15]);

    await zaloPersonalRepository.getMessagesForSummary({
      conversationIds: [1], userId: 7, startIso: 'a', endIso: 'b', limitPerConversation: 'abc', maxContentChars: -5,
    });
    expect(query.mock.calls[1][1].slice(4)).toEqual([1, 15]);
  });

  it('trả đúng các cột service đọc: id_conversation, role, content, source, created_at', async () => {
    const rows = await zaloPersonalRepository.getMessagesForSummary({ conversationIds: [1], userId: 7, startIso: 'a', endIso: 'b' });
    expect(Object.keys(rows[0])).toEqual(['id_conversation', 'role', 'content', 'source', 'created_at']);
    expect(query.mock.calls[0][0]).toMatch(/SELECT id_conversation, role, content, source, created_at\s+FROM \(/);
  });
});
