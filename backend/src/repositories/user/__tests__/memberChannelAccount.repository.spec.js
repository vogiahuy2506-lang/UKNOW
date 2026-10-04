/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — ghim chuỗi SQL + trình tự giao dịch của memberChannelAccount.repository.
 * Phép thật trên Postgres ở tests/integration/zaloAccountAssignment.test.js.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = { query: jest.fn(), getClient: jest.fn() };
jest.unstable_mockModule('../../../config/database.js', () => ({ default: mockDb }));

const repo = await import('../memberChannelAccount.repository.js');

const norm = (sql) => String(sql).replace(/\s+/g, ' ');

describe('findAssignedZaloAccountIds', () => {
  beforeEach(() => mockDb.query.mockReset());

  it('JOIN zalo_settings theo account_ref VÀ id_user = owner_id (hàng trỏ sang chủ khác không cho thêm quyền)', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ id: '5' }, { id: '7' }] });
    const ids = await repo.findAssignedZaloAccountIds(10, 20);
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(norm(sql)).toMatch(/JOIN zalo_settings zs ON zs\.id::text = mca\.account_ref AND zs\.id_user = mca\.owner_id/);
    expect(norm(sql)).toMatch(/mca\.owner_id = \$1 AND mca\.employee_id = \$2 AND mca\.channel = \$3/);
    expect(params).toEqual([10, 20, 'zalo_personal']);
    expect(ids).toEqual([5, 7]);
  });

  it('KHÔNG nuốt lỗi CSDL (service quyết định fail-closed)', async () => {
    mockDb.query.mockRejectedValue(new Error('boom'));
    await expect(repo.findAssignedZaloAccountIds(10, 20)).rejects.toThrow('boom');
  });
});

describe('countAssignedEmployeesByZaloAccount', () => {
  beforeEach(() => mockDb.query.mockReset());

  it('đếm theo account_ref, JOIN zalo_settings cùng chủ; trả Map id → số', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ account_ref: '5', total: 2 }, { account_ref: '7', total: 1 }] });
    const counts = await repo.countAssignedEmployeesByZaloAccount([5, 6, 7]);
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(norm(sql)).toMatch(/JOIN zalo_settings zs ON zs\.id::text = mca\.account_ref AND zs\.id_user = mca\.owner_id/);
    expect(norm(sql)).toMatch(/mca\.channel = \$1 AND mca\.account_ref = ANY\(\$2::text\[\]\)/);
    expect(params).toEqual(['zalo_personal', ['5', '6', '7']]);
    expect(counts.get(5)).toBe(2);
    expect(counts.get(7)).toBe(1);
    expect(counts.has(6)).toBe(false);
  });

  it('danh sách rỗng → Map rỗng, không chạm CSDL', async () => {
    const counts = await repo.countAssignedEmployeesByZaloAccount([]);
    expect(counts.size).toBe(0);
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});

describe('replaceZaloAccountAssignments', () => {
  let client;
  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    mockDb.getClient.mockReset();
    mockDb.getClient.mockResolvedValue(client);
  });

  function script({ owned = [], before = [] }) {
    client.query.mockImplementation(async (sql) => {
      const s = norm(sql);
      if (s.startsWith('SELECT id FROM zalo_settings')) return { rows: owned.map((id) => ({ id })) };
      if (s.includes('FROM member_channel_accounts mca')) return { rows: before.map((id) => ({ id })) };
      return { rows: [] };
    });
  }
  const sqls = () => client.query.mock.calls.map(([s]) => norm(s));

  it('chỉ nhận id thuộc chủ (id chủ khác bị loại), xoá phần dư, chèn phần mới, bump user_members.updated_at, COMMIT', async () => {
    script({ owned: [5, 6], before: [5, 9] });
    const result = await repo.replaceZaloAccountAssignments({ ownerId: 10, employeeId: 20, accountIds: [5, 6, 777], actorUserId: 10 });

    const ownedCall = client.query.mock.calls.find(([s]) => norm(s).startsWith('SELECT id FROM zalo_settings'));
    expect(norm(ownedCall[0])).toMatch(/WHERE id_user = \$1 AND id = ANY\(\$2::bigint\[\]\)/);
    expect(ownedCall[1]).toEqual([10, [5, 6, 777]]);

    const del = client.query.mock.calls.find(([s]) => norm(s).startsWith('DELETE FROM member_channel_accounts'));
    expect(norm(del[0])).toMatch(/account_ref <> ALL\(\$4::text\[\]\)/);
    expect(del[1]).toEqual([10, 20, 'zalo_personal', ['5', '6']]);

    const ins = client.query.mock.calls.find(([s]) => norm(s).startsWith('INSERT INTO member_channel_accounts'));
    expect(norm(ins[0])).toMatch(/'assigned'/);
    expect(norm(ins[0])).toMatch(/ON CONFLICT \(owner_id, employee_id, channel, account_ref\) DO NOTHING/);
    expect(ins[1]).toEqual([10, 20, 'zalo_personal', ['5', '6'], 10]);

    expect(sqls()).toContain('UPDATE user_members SET updated_at = CURRENT_TIMESTAMP WHERE owner_id = $1 AND employee_id = $2');
    expect(sqls()[0]).toBe('BEGIN');
    expect(sqls().at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(result).toEqual({ before: [5, 9], after: [5, 6] });
  });

  it('danh sách rỗng: gỡ hết (xoá với mảng rỗng), không chèn, vẫn bump updated_at', async () => {
    script({ owned: [], before: [5] });
    const result = await repo.replaceZaloAccountAssignments({ ownerId: 10, employeeId: 20, accountIds: [], actorUserId: 10 });

    const del = client.query.mock.calls.find(([s]) => norm(s).startsWith('DELETE FROM member_channel_accounts'));
    expect(del[1]).toEqual([10, 20, 'zalo_personal', []]);
    expect(sqls().some((s) => s.startsWith('INSERT INTO member_channel_accounts'))).toBe(false);
    expect(sqls().some((s) => s.startsWith('UPDATE user_members'))).toBe(true);
    expect(result).toEqual({ before: [5], after: [] });
  });

  it('id rác (chữ, số âm, trùng) bị lọc trước khi hỏi CSDL', async () => {
    script({ owned: [5] });
    await repo.replaceZaloAccountAssignments({ ownerId: 10, employeeId: 20, accountIds: ['5', 5, 'abc', -3, 0, null], actorUserId: 10 });
    const ownedCall = client.query.mock.calls.find(([s]) => norm(s).startsWith('SELECT id FROM zalo_settings'));
    expect(ownedCall[1]).toEqual([10, [5]]);
  });

  it('lỗi giữa chừng → ROLLBACK, không COMMIT, trả client về pool', async () => {
    client.query.mockImplementation(async (sql) => {
      if (norm(sql).startsWith('DELETE FROM member_channel_accounts')) throw new Error('boom');
      return { rows: [] };
    });
    await expect(repo.replaceZaloAccountAssignments({ ownerId: 10, employeeId: 20, accountIds: [], actorUserId: 10 })).rejects.toThrow('boom');
    expect(sqls()).toContain('ROLLBACK');
    expect(sqls()).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('insertSelfLoginZaloAssignment', () => {
  beforeEach(() => mockDb.query.mockReset());

  it('chèn nguồn self_login, created_by = chính nhân viên, ON CONFLICT DO NOTHING; bump updated_at; dùng đúng queryable truyền vào', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await repo.insertSelfLoginZaloAssignment({ ownerId: 10, employeeId: 20, accountId: 88 }, client);

    const [sql, params] = client.query.mock.calls[0];
    expect(norm(sql)).toMatch(/VALUES \(\$1, \$2, \$3, \$4, 'self_login', \$2\) ON CONFLICT .* DO NOTHING/);
    expect(params).toEqual([10, 20, 'zalo_personal', '88']);
    expect(norm(client.query.mock.calls[1][0])).toMatch(/UPDATE user_members SET updated_at/);
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});

describe('deleteAssignmentsForEmployee', () => {
  beforeEach(() => mockDb.query.mockReset());

  it('xoá mọi kênh của nhân viên trong không gian của chủ', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    await repo.deleteAssignmentsForEmployee(10, 20);
    expect(norm(mockDb.query.mock.calls[0][0])).toBe('DELETE FROM member_channel_accounts WHERE owner_id = $1 AND employee_id = $2');
    expect(mockDb.query.mock.calls[0][1]).toEqual([10, 20]);
  });
});
