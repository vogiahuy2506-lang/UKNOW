/**
 * Hoạt động nhóm — cột `aiCreditsThisMonth` (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-2 mục 4).
 *
 * Câu SQL phải khoá `ul.id_user = $1` (chủ đang xem). Thiếu điều kiện đó thì nhân viên làm cho 2 chủ (production: user 162
 * thuộc chủ 1 và 12), hoặc dùng AI trong không gian riêng của mình, bị cộng lẫn vào bảng của chủ. File này chỉ ghim
 * CHUỖI SQL (nhanh, chạy trong bộ unit); phép cộng thật trên Postgres ở tests/integration/aiCreditUsedPerCycle.test.js.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = { query: jest.fn(), getClient: jest.fn() };

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockDb,
}));

const { findTeamOverview } = await import('../employee.repository.js');

const overviewSql = () => String(mockDb.query.mock.calls[0][0]).replace(/\s+/g, ' ');

describe('findTeamOverview - aiCreditsThisMonth chi tinh luot AI trong vi cua chu', () => {
  beforeEach(() => {
    mockDb.query.mockReset();
    mockDb.query.mockResolvedValue({ rows: [] });
  });

  it('truy van con aiCreditsThisMonth khoa ul.id_user = $1 canh ul.actor_user_id = u.id', async () => {
    await findTeamOverview(1);
    const sql = overviewSql();
    const subselect = sql.slice(sql.indexOf('FROM usage_logs ul'), sql.indexOf('"aiCreditsThisMonth"'));
    expect(subselect).toMatch(/ul\.id_user = \$1/);
    expect(subselect).toMatch(/ul\.actor_user_id = u\.id/);
    expect(subselect).toMatch(/ul\.resource_type = 'ai_credit'/);
  });

  it('$1 la chu; loc theo mot nhan vien them $2 thi $1 van la chu', async () => {
    await findTeamOverview(1, { employeeId: 162 });
    expect(mockDb.query.mock.calls[0][1]).toEqual([1, 162]);
    expect(overviewSql()).toMatch(/ul\.id_user = \$1/);
    expect(overviewSql()).toMatch(/um\.employee_id = \$2/);
  });
});
