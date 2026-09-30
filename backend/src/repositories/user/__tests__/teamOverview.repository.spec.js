/**
 * PR-7 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — ghim CHUỖI SQL của khối "Hoạt động nhóm" (nhanh, chạy trong bộ unit).
 * Phép đếm thật trên Postgres ở tests/integration/teamOverview.test.js; file này chỉ giữ những điều kiện mà một lần sửa
 * "gọn hơn" dễ làm rơi mất: khoá theo chủ, đếm theo LƯỢT running (không theo campaigns.status), khung kỳ, loại dòng bán
 * Marketplace, AT TIME ZONE cho cột giờ VN.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = { query: jest.fn(), getClient: jest.fn() };

jest.unstable_mockModule('../../../config/database.js', () => ({ default: mockDb }));

const repo = await import('../teamOverview.repository.js');

const lastSql = () => String(mockDb.query.mock.calls[0][0]).replace(/\s+/g, ' ');

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [] });
});

describe('findTeamMembers', () => {
  it('chỉ người ĐÃ chấp nhận của đúng chủ; lọc một người thêm $2 mà $1 vẫn là chủ', async () => {
    await repo.findTeamMembers(1);
    expect(lastSql()).toMatch(/um\.owner_id = \$1 AND um\.accepted_at IS NOT NULL/);
    expect(lastSql()).not.toMatch(/um\.employee_id = \$2/);
    mockDb.query.mockClear();
    await repo.findTeamMembers(1, { employeeId: 162 });
    expect(mockDb.query.mock.calls[0][1]).toEqual([1, 162]);
    expect(lastSql()).toMatch(/um\.employee_id = \$2/);
  });
});

describe('findRunningCampaignsByCreator', () => {
  it('đếm chiến dịch có LƯỢT running trong không gian của chủ — không đọc campaigns.status; người tạo = COALESCE(created_by, id_user)', async () => {
    await repo.findRunningCampaignsByCreator(1);
    const sql = lastSql();
    expect(sql).toMatch(/JOIN campaign_runs cr ON cr\.id_campaign = c\.id AND cr\.status = 'running'/);
    expect(sql).toMatch(/COALESCE\(c\.workspace_owner_id, c\.id_user\) = \$1/);
    expect(sql).toMatch(/COALESCE\(c\.created_by, c\.id_user\)/);
    expect(sql).not.toMatch(/c\.status/);
    expect(mockDb.query.mock.calls[0][1]).toEqual([1]);
  });

  it('"đang chờ" = MỌI lượt đang chạy đều có mốc hoãn còn ở tương lai, đọc đủ 4 khoá run_metadata', async () => {
    await repo.findRunningCampaignsByCreator(1);
    const sql = lastSql();
    expect(sql).toMatch(/bool_and\(/);
    for (const key of ['quotaDeferredUntil', 'zaloOutboundDeferredUntil', 'nonContinuousDeferredUntil', 'channelDeferredUntil']) {
      expect(sql).toContain(key);
    }
    expect(sql).toMatch(/> NOW\(\)/);
  });
});

describe('findAiCreditUsedByActor', () => {
  it('khoá ví của chủ (id_user = $1), khung [đầu kỳ, cuối kỳ), loại dòng bán Marketplace', async () => {
    const start = new Date('2026-09-10T00:00:00.000Z');
    const end = new Date('2026-10-10T00:00:00.000Z');
    await repo.findAiCreditUsedByActor(1, start, end);
    const sql = lastSql();
    expect(sql).toMatch(/ul\.id_user = \$1/);
    expect(sql).toMatch(/ul\.resource_type = 'ai_credit'/);
    expect(sql).toMatch(/ul\.created_at >= \$2 AND ul\.created_at < \$3/);
    expect(sql).toMatch(/COALESCE\(ul\.metadata->>'type', ''\) <> 'marketplace_sale'/);
    expect(sql).toMatch(/GROUP BY ul\.actor_user_id/);
    expect(mockDb.query.mock.calls[0][1]).toEqual([1, start, end]);
  });
});

describe('findLastActivityByActor', () => {
  it('không có ai → không truy vấn', async () => {
    expect(await repo.findLastActivityByActor(1, [])).toEqual([]);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('cột giờ VN (email / Zalo) đổi bằng AT TIME ZONE; mọi nguồn khoá theo chủ; AI loại dòng bán Marketplace', async () => {
    await repo.findLastActivityByActor(1, [21, 22]);
    const sql = lastSql();
    expect(sql.match(/AT TIME ZONE 'Asia\/Ho_Chi_Minh'/g)).toHaveLength(2); // email_messages + zalo_messages
    expect(sql).toMatch(/FROM email_messages m WHERE m\.workspace_owner_id = \$1 AND m\.actor_user_id = a\.actor_id/);
    expect(sql).toMatch(/FROM zalo_messages m WHERE m\.workspace_owner_id = \$1 AND m\.actor_user_id = a\.actor_id/);
    expect(sql).toMatch(/FROM campaign_channel_messages m WHERE m\.workspace_owner_id = \$1/);
    expect(sql).toMatch(/FROM audit_logs al WHERE al\.owner_id = \$1 AND al\.id_user = a\.actor_id/);
    expect(sql).toMatch(/FROM usage_logs ul WHERE ul\.id_user = \$1/);
    expect(sql).toMatch(/<> 'marketplace_sale'/);
    expect(sql).not.toMatch(/last_login/);
    expect(mockDb.query.mock.calls[0][1]).toEqual([1, [21, 22]]);
  });

  it('truyền queryable thì dùng nó thay pool', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ actor_id: '21', last_active_at: new Date('2026-01-15T11:00:00.000Z') }] }) };
    const rows = await repo.findLastActivityByActor(1, [21], client);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query).not.toHaveBeenCalled();
    expect(rows).toEqual([{ actorId: 21, lastActiveAt: new Date('2026-01-15T11:00:00.000Z') }]);
  });
});
