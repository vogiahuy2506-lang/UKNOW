import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// PLAN_VA_TRO_LY_AI_2026-09-28 PR-2 mục 5 — help_unanswered.reason (migration 259). SQL phải
// ghi cột reason, không lặng lẽ bỏ qua tham số thứ 4.
const mockQuery = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { insertUnanswered } = await import('../helpArticle.repository.js');

describe('helpArticle.repository insertUnanswered — cột reason', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });
  });

  it('SQL ghi đủ 4 cột (question, user_id, top_similarity, reason)', async () => {
    await insertUnanswered({ question: 'câu hỏi', userId: 5, topSimilarity: 0.4, reason: 'low_similarity' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO help_unanswered (question, user_id, top_similarity, reason)');
    expect(params).toEqual(['câu hỏi', 5, 0.4, 'low_similarity']);
  });

  it('reason mặc định null khi không truyền (tương thích 2 nhánh no_chunks cũ đã có reason riêng)', async () => {
    await insertUnanswered({ question: 'câu hỏi', userId: 5, topSimilarity: 0.4 });

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual(['câu hỏi', 5, 0.4, null]);
  });
});
