/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — xoá hội thoại Zalo cá nhân.
 *
 * Lỗi có sẵn (bản đồ GIAO_TK_ZALO_BAN_DO mục 2): bản cũ XOÁ HẾT TIN theo id hội thoại rồi mới kiểm chủ ở câu xoá hội thoại —
 * gọi với id hội thoại của người khác thì tin vẫn mất còn hội thoại thì còn. Nay: một giao dịch, khoá + kiểm chủ (và tài khoản
 * Zalo được giao khi người thao tác là nhân viên) TRƯỚC, không khớp thì không xoá gì.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockRelease = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    query: jest.fn(),
    getClient: jest.fn(async () => ({ query: mockClientQuery, release: mockRelease })),
  },
}));

const { default: repo } = await import('../zaloPersonal.repository.js');

const statements = () => mockClientQuery.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim());

beforeEach(() => {
  mockClientQuery.mockReset();
  mockRelease.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('zaloPersonalRepository.deleteConversation', () => {
  it('khớp chủ + tài khoản được giao → BEGIN, khoá dòng, xoá tin, xoá hội thoại, COMMIT (đúng thứ tự); trả true', async () => {
    mockClientQuery.mockImplementation(async (sql) => (/SELECT id FROM zalo_personal_conversations/.test(sql) ? { rows: [{ id: 5 }] } : { rows: [], rowCount: 1 }));

    await expect(repo.deleteConversation(5, 100, { accessibleZaloAccountIds: [9] })).resolves.toBe(true);

    const sqls = statements();
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toMatch(/^SELECT id FROM zalo_personal_conversations WHERE id = \$1 AND id_user = \$2 AND id_zalo_setting = ANY\(\$3::bigint\[\]\) FOR UPDATE$/);
    expect(mockClientQuery.mock.calls[1][1]).toEqual([5, 100, [9]]);
    expect(sqls[2]).toMatch(/^DELETE FROM zalo_personal_messages WHERE id_conversation = \$1$/);
    expect(sqls[3]).toMatch(/^DELETE FROM zalo_personal_conversations WHERE id = \$1 AND id_user = \$2$/);
    expect(sqls[4]).toBe('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG khớp (hội thoại của người khác / tài khoản chưa giao) → ROLLBACK, KHÔNG xoá tin, KHÔNG xoá hội thoại; trả false', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(repo.deleteConversation(5, 100, { accessibleZaloAccountIds: [1] })).resolves.toBe(false);

    const sqls = statements();
    expect(sqls).toEqual([
      'BEGIN',
      expect.stringMatching(/^SELECT id FROM zalo_personal_conversations/),
      'ROLLBACK',
    ]);
    expect(sqls.some((sql) => /^DELETE/.test(sql))).toBe(false);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('CHỦ (null): kiểm chủ như cũ, KHÔNG có điều kiện tài khoản; thiếu phạm vi → chặn (ANY với mảng rỗng)', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await repo.deleteConversation(5, 100, { accessibleZaloAccountIds: null });
    expect(statements()[1]).not.toMatch(/ANY\(/);
    expect(mockClientQuery.mock.calls[1][1]).toEqual([5, 100]);

    mockClientQuery.mockClear();
    await repo.deleteConversation(5, 100, {});
    expect(statements()[1]).toMatch(/id_zalo_setting = ANY\(\$3::bigint\[\]\)/);
    expect(mockClientQuery.mock.calls[1][1]).toEqual([5, 100, []]);

    mockClientQuery.mockClear();
    await repo.deleteConversation(5, 100);
    expect(mockClientQuery.mock.calls[1][1]).toEqual([5, 100, []]);
  });

  it('lỗi giữa chừng → ROLLBACK, trả client về pool, ném lại lỗi (không xoá nửa vời)', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (/SELECT id FROM zalo_personal_conversations/.test(sql)) return { rows: [{ id: 5 }] };
      if (/^\s*DELETE FROM zalo_personal_messages/.test(sql)) throw new Error('lock timeout');
      return { rows: [], rowCount: 0 };
    });

    await expect(repo.deleteConversation(5, 100, { accessibleZaloAccountIds: null })).rejects.toThrow('lock timeout');

    const sqls = statements();
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
