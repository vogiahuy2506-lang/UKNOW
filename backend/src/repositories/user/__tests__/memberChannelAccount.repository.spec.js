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

// ─── PR-H1: Telegram + WhatsApp Baileys ─────────────────────────────────────────────────────────────────────────────

describe('isWhatsAppSessionKeyOfOwner', () => {
  it('chỉ nhận khoá "<idChủ>-<khoá an toàn>"; sai chủ / sai ký tự / thiếu phần sau → false', () => {
    expect(repo.isWhatsAppSessionKeyOfOwner(10, '10-default')).toBe(true);
    expect(repo.isWhatsAppSessionKeyOfOwner(10, '10-shop_2')).toBe(true);
    expect(repo.isWhatsAppSessionKeyOfOwner(10, '11-default')).toBe(false);
    expect(repo.isWhatsAppSessionKeyOfOwner(10, '100-default')).toBe(false); // "10" không phải tiền tố "10-"
    expect(repo.isWhatsAppSessionKeyOfOwner(10, '10-')).toBe(false);
    expect(repo.isWhatsAppSessionKeyOfOwner(10, '10-a b')).toBe(false);
    expect(repo.isWhatsAppSessionKeyOfOwner(10, '10-a%')).toBe(false);
    expect(repo.isWhatsAppSessionKeyOfOwner(0, '0-a')).toBe(false);
  });
});

describe('findAssignedTelegramAccountRefs / findAssignedWhatsAppSessionKeys', () => {
  beforeEach(() => mockDb.query.mockReset());

  it('Telegram: JOIN telegram_accounts theo account_ref VÀ id_user = owner_id; trả id dạng chuỗi', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ id: 3 }, { id: 4 }] });
    const refs = await repo.findAssignedTelegramAccountRefs(10, 20);
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(norm(sql)).toMatch(/JOIN telegram_accounts ta ON ta\.id::text = mca\.account_ref AND ta\.id_user = mca\.owner_id/);
    expect(norm(sql)).toMatch(/mca\.owner_id = \$1 AND mca\.employee_id = \$2 AND mca\.channel = \$3/);
    expect(params).toEqual([10, 20, 'telegram']);
    expect(refs).toEqual(['3', '4']);
  });

  it('WhatsApp: ép tiền tố chủ (account_ref LIKE owner_id || "-%") — hàng trỏ sang khoá chủ khác không cho thêm quyền', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ account_ref: '10-default' }] });
    const refs = await repo.findAssignedWhatsAppSessionKeys(10, 20);
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(norm(sql)).toMatch(/mca\.account_ref LIKE \(mca\.owner_id::text \|\| '-%'\)/);
    expect(params).toEqual([10, 20, 'whatsapp_baileys']);
    expect(refs).toEqual(['10-default']);
  });

  it('KHÔNG nuốt lỗi CSDL (service quyết định fail-closed)', async () => {
    mockDb.query.mockRejectedValue(new Error('boom'));
    await expect(repo.findAssignedTelegramAccountRefs(10, 20)).rejects.toThrow('boom');
    await expect(repo.findAssignedWhatsAppSessionKeys(10, 20)).rejects.toThrow('boom');
  });
});

describe('replaceChannelAssignments — nhiều kênh một giao dịch, khoá vắng = giữ nguyên', () => {
  let client;
  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    mockDb.getClient.mockReset();
    mockDb.getClient.mockResolvedValue(client);
  });
  const sqls = () => client.query.mock.calls.map(([s]) => norm(s));

  function script({ tgOwned = [], tgBefore = [], waOwned = [], waBefore = [] } = {}) {
    client.query.mockImplementation(async (sql) => {
      const s = norm(sql);
      if (s.startsWith('SELECT id FROM telegram_accounts')) return { rows: tgOwned.map((id) => ({ id })) };
      if (s.startsWith('SELECT session_key FROM whatsapp_baileys_session_creds')) return { rows: waOwned.map((session_key) => ({ session_key })) };
      if (s.includes('JOIN telegram_accounts ta')) return { rows: tgBefore.map((id) => ({ id })) };
      if (s.includes("LIKE (mca.owner_id::text || '-%')")) return { rows: waBefore.map((account_ref) => ({ account_ref })) };
      return { rows: [] };
    });
  }

  it('chỉ gửi Telegram: KHÔNG chạm hàng Zalo / WhatsApp (không SELECT/DELETE/INSERT kênh khác), một BEGIN/COMMIT, một lần bump updated_at', async () => {
    script({ tgOwned: [3], tgBefore: ['4'] });
    const result = await repo.replaceChannelAssignments({ ownerId: 10, employeeId: 20, actorUserId: 10, telegramAccountIds: [3, 999] });

    expect(result).toEqual({ zalo: null, telegram: { before: ['4'], after: ['3'] }, whatsapp: null });
    const del = client.query.mock.calls.filter(([s]) => norm(s).startsWith('DELETE FROM member_channel_accounts'));
    expect(del).toHaveLength(1);
    expect(del[0][1]).toEqual([10, 20, 'telegram', ['3']]);
    const ins = client.query.mock.calls.find(([s]) => norm(s).startsWith('INSERT INTO member_channel_accounts'));
    expect(ins[1]).toEqual([10, 20, 'telegram', ['3'], 10]);
    expect(sqls().some((s) => s.includes('zalo_settings'))).toBe(false);
    expect(sqls().some((s) => s.includes('whatsapp_baileys_session_creds'))).toBe(false);
    expect(sqls().filter((s) => s.startsWith('UPDATE user_members'))).toHaveLength(1);
    expect(sqls()[0]).toBe('BEGIN');
    expect(sqls().at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('id Telegram được lọc theo CHỦ (WHERE id_user = $1); id rác bị loại trước khi hỏi CSDL', async () => {
    script({ tgOwned: [3] });
    await repo.replaceChannelAssignments({ ownerId: 10, employeeId: 20, actorUserId: 10, telegramAccountIds: ['3', 3, 'abc', -1, 0] });
    const owned = client.query.mock.calls.find(([s]) => norm(s).startsWith('SELECT id FROM telegram_accounts'));
    expect(norm(owned[0])).toMatch(/WHERE id_user = \$1 AND id = ANY\(\$2::bigint\[\]\)/);
    expect(owned[1]).toEqual([10, [3]]);
  });

  it('WhatsApp: khoá sai chủ / sai ký tự bị loại TRƯỚC khi hỏi CSDL; chỉ nhận khoá có dòng creds', async () => {
    script({ waOwned: ['10-default'] });
    const result = await repo.replaceChannelAssignments({
      ownerId: 10, employeeId: 20, actorUserId: 10, whatsappSessionKeys: ['10-default', '11-nguoi-khac', '10-a b', '10-khong-co-creds'],
    });
    const owned = client.query.mock.calls.find(([s]) => norm(s).startsWith('SELECT session_key FROM whatsapp_baileys_session_creds'));
    expect(owned[1]).toEqual([['10-default', '10-khong-co-creds']]);
    expect(result.whatsapp.after).toEqual(['10-default']);
    const del = client.query.mock.calls.find(([s]) => norm(s).startsWith('DELETE FROM member_channel_accounts'));
    expect(del[1]).toEqual([10, 20, 'whatsapp_baileys', ['10-default']]);
  });

  it('danh sách rỗng = gỡ hết kênh đó (xoá với mảng rỗng), không chèn', async () => {
    script({ tgBefore: ['3'] });
    const result = await repo.replaceChannelAssignments({ ownerId: 10, employeeId: 20, actorUserId: 10, telegramAccountIds: [] });
    const del = client.query.mock.calls.find(([s]) => norm(s).startsWith('DELETE FROM member_channel_accounts'));
    expect(del[1]).toEqual([10, 20, 'telegram', []]);
    expect(sqls().some((s) => s.startsWith('INSERT INTO member_channel_accounts'))).toBe(false);
    expect(result.telegram).toEqual({ before: ['3'], after: [] });
  });

  it('ba kênh cùng một giao dịch: Zalo dùng CHUNG client (không BEGIN/COMMIT riêng), lỗi giữa chừng → ROLLBACK cả ba', async () => {
    client.query.mockImplementation(async (sql) => {
      const s = norm(sql);
      if (s.startsWith('SELECT id FROM telegram_accounts')) throw new Error('boom');
      return { rows: [] };
    });
    await expect(repo.replaceChannelAssignments({
      ownerId: 10, employeeId: 20, actorUserId: 10, zaloAccountIds: [5], telegramAccountIds: [3], whatsappSessionKeys: [],
    })).rejects.toThrow('boom');
    expect(sqls().filter((s) => s === 'BEGIN')).toHaveLength(1);
    expect(sqls()).toContain('ROLLBACK');
    expect(sqls()).not.toContain('COMMIT');
    expect(mockDb.getClient).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalled();
  });
});

describe('insertSelfLoginChannelAssignment / deleteAssignmentsByRef', () => {
  beforeEach(() => mockDb.query.mockReset());

  it('Telegram: chèn self_login (created_by = nhân viên), bump updated_at, dùng đúng queryable truyền vào', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await repo.insertSelfLoginChannelAssignment({ ownerId: 10, employeeId: 20, channel: 'telegram', ref: 7 }, client);
    const calls = client.query.mock.calls;
    expect(calls).toHaveLength(2);
    expect(norm(calls[0][0])).toMatch(/VALUES \(\$1, \$2, \$3, \$4, 'self_login', \$2\) ON CONFLICT .* DO NOTHING/);
    expect(calls[0][1]).toEqual([10, 20, 'telegram', '7']);
    expect(norm(calls[1][0])).toMatch(/UPDATE user_members SET updated_at/);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('WhatsApp: xoá hàng cũ cùng khoá của MỌI nhân viên TRƯỚC khi chèn (khoá dùng lại sau khi xoá)', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await repo.insertSelfLoginChannelAssignment({ ownerId: 10, employeeId: 20, channel: 'whatsapp_baileys', ref: '10-default' }, client);
    const calls = client.query.mock.calls;
    expect(norm(calls[0][0])).toBe('DELETE FROM member_channel_accounts WHERE channel = $1 AND account_ref = $2');
    expect(calls[0][1]).toEqual(['whatsapp_baileys', '10-default']);
    expect(norm(calls[1][0])).toMatch(/^INSERT INTO member_channel_accounts/);
    expect(calls[1][1]).toEqual([10, 20, 'whatsapp_baileys', '10-default']);
  });

  it('deleteAssignmentsByRef: xoá theo (kênh, ref) cho mọi nhân viên', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    await repo.deleteAssignmentsByRef('whatsapp_baileys', '10-default');
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(norm(sql)).toBe('DELETE FROM member_channel_accounts WHERE channel = $1 AND account_ref = $2');
    expect(params).toEqual(['whatsapp_baileys', '10-default']);
  });
});

