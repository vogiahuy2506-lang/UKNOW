/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — các truy vấn tài khoản của đồng bộ Hộp thư (sync / contacts / chat-history /
 * trạng thái): nhân viên chỉ chọn được tài khoản được giao, và THIẾU accountId thì chỉ "tự lấy tài khoản đang kết nối đầu tiên"
 * TRONG phạm vi được giao (không còn lấy tài khoản bất kỳ của chủ).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const { default: repo } = await import('../zaloSetting.repository.js');

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [] });
});

describe.each([
  ['findConnectedAccountForSync'],
  ['findConnectedAccountSummaryForSync'],
])('%s', (method) => {
  it('accountId tường minh + nhân viên: AND z.id = ANY(phạm vi); id ngoài phạm vi không khớp dòng nào', async () => {
    await repo[method](100, 77, [5, 9]);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zs\.id = \$3 AND zs\.id_user = \$1/);
    expect(sql).toMatch(/zs\.id = ANY\(\$2::bigint\[\]\)/);
    expect(params).toEqual([100, [5, 9], 77]);
  });

  it('THIẾU accountId + nhân viên: chọn tài khoản đang kết nối đầu tiên NHƯNG chỉ trong phạm vi được giao', async () => {
    await repo[method](100, null, [5, 9]);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zs\.id_user = \$1 AND zs\.is_active = true AND zs\.status = 'connected' AND zs\.id = ANY\(\$2::bigint\[\]\)/);
    expect(sql).toMatch(/ORDER BY zs\.id ASC\s+LIMIT 1/);
    expect(params).toEqual([100, [5, 9]]);
  });

  it('nhân viên chưa được giao gì ([]) hoặc thiếu phạm vi: vẫn lọc với mảng rỗng, không tự lấy tài khoản nào của chủ', async () => {
    await repo[method](100, null, []);
    expect(db.query.mock.calls[0][1]).toEqual([100, []]);

    db.query.mockClear();
    await repo[method](100, null);
    expect(db.query.mock.calls[0][0]).toMatch(/ANY\(\$2::bigint\[\]\)/);
    expect(db.query.mock.calls[0][1]).toEqual([100, []]);
  });

  it('CHỦ (null): như cũ — tường minh theo id + chủ; thiếu accountId lấy tài khoản kết nối đầu tiên, không có ANY', async () => {
    await repo[method](100, 77, null);
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(db.query.mock.calls[0][1]).toEqual([100, 77]);

    db.query.mockClear();
    await repo[method](100, null, null);
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(db.query.mock.calls[0][0]).toMatch(/ORDER BY zs\.id ASC\s+LIMIT 1/);
    expect(db.query.mock.calls[0][1]).toEqual([100]);
  });
});

describe('findActiveConnectedAccountsByUser — ô chọn tài khoản + trạng thái của Hộp thư', () => {
  it('nhân viên chỉ thấy tài khoản được giao', async () => {
    await repo.findActiveConnectedAccountsByUser(100, [5]);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zs\.id_user = \$1 AND zs\.is_active = true AND zs\.id = ANY\(\$2::bigint\[\]\)/);
    expect(params).toEqual([100, [5]]);
  });

  it('CHỦ (null): mọi tài khoản đang bật như cũ; thiếu phạm vi → chặn', async () => {
    await repo.findActiveConnectedAccountsByUser(100, null);
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(db.query.mock.calls[0][1]).toEqual([100]);

    db.query.mockClear();
    await repo.findActiveConnectedAccountsByUser(100);
    expect(db.query.mock.calls[0][1]).toEqual([100, []]);
  });
});
