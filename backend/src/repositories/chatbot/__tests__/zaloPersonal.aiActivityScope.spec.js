/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — báo cáo hoạt động AI + "Bật lại AI hàng loạt" của Hộp thư chỉ chạm hội thoại
 * của tài khoản Zalo được giao khi người thao tác là nhân viên. null = chủ / super admin; thiếu = chặn.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const { default: repo } = await import('../zaloPersonal.repository.js');

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('getAiActivityReport', () => {
  it('nhân viên: c.id_zalo_setting = ANY(phạm vi), mảng là tham số cuối', async () => {
    await repo.getAiActivityReport({ userId: 100, startIso: 'a', endIso: 'b', accessibleZaloAccountIds: [5, 9] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/c\.id_zalo_setting = ANY\(\$4::bigint\[\]\)/);
    expect(params).toEqual([100, 'a', 'b', [5, 9]]);
  });

  it('AND với accountId đang chọn', async () => {
    await repo.getAiActivityReport({ userId: 100, startIso: 'a', endIso: 'b', accountId: 7, accessibleZaloAccountIds: [5] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/c\.id_zalo_setting = \$4/);
    expect(sql).toMatch(/c\.id_zalo_setting = ANY\(\$5::bigint\[\]\)/);
    expect(params).toEqual([100, 'a', 'b', 7, [5]]);
  });

  it('CHỦ (null): không có ANY, 3 tham số như cũ; thiếu phạm vi → chặn', async () => {
    await repo.getAiActivityReport({ userId: 100, startIso: 'a', endIso: 'b', accessibleZaloAccountIds: null });
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(db.query.mock.calls[0][1]).toEqual([100, 'a', 'b']);

    db.query.mockClear();
    await repo.getAiActivityReport({ userId: 100, startIso: 'a', endIso: 'b' });
    expect(db.query.mock.calls[0][0]).toMatch(/c\.id_zalo_setting = ANY\(\$4::bigint\[\]\)/);
    expect(db.query.mock.calls[0][1]).toEqual([100, 'a', 'b', []]);
  });
});

describe('bulkResumeAiPaused — "Bật lại AI hàng loạt"', () => {
  it('nhân viên: UPDATE chỉ hội thoại của tài khoản được giao', async () => {
    await repo.bulkResumeAiPaused(100, { accessibleZaloAccountIds: [5] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/WHERE id_user = \$1 AND ai_paused = true AND ai_paused_at IS NOT NULL AND id_zalo_setting = ANY\(\$2::bigint\[\]\)/);
    expect(params).toEqual([100, [5]]);
  });

  it('CHỦ (null): UPDATE y như cũ (mọi tài khoản); thiếu phạm vi → mảng rỗng, không bật gì', async () => {
    await repo.bulkResumeAiPaused(100, { accessibleZaloAccountIds: null });
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(db.query.mock.calls[0][1]).toEqual([100]);

    db.query.mockClear();
    await repo.bulkResumeAiPaused(100);
    expect(db.query.mock.calls[0][1]).toEqual([100, []]);
  });
});

describe('countStaleAiPausedConversations', () => {
  beforeEach(() => {
    db.query.mockResolvedValue({ rows: [{ count: 2 }] });
  });

  it('nhân viên: chỉ đếm hội thoại của tài khoản được giao; $2 vẫn là số giờ', async () => {
    await expect(repo.countStaleAiPausedConversations(100, 24, { accessibleZaloAccountIds: [5] })).resolves.toBe(2);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/id_zalo_setting = ANY\(\$3::bigint\[\]\)/);
    expect(params).toEqual([100, '24', [5]]);
  });

  it('CHỦ (null): không điều kiện phạm vi', async () => {
    await repo.countStaleAiPausedConversations(100, 24, { accessibleZaloAccountIds: null });

    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(db.query.mock.calls[0][1]).toEqual([100, '24']);
  });
});
