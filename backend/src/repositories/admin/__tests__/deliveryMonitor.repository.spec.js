/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — ghim các quyết định nằm TRONG câu SQL của trang Giám sát gửi tin của ADMIN
 * mà test mock DB không thấy được. Kết quả thật của từng câu do tests/integration/adminDeliveryMonitor*.test.js kiểm trên
 * DB thật (kể cả cột naive như production); ở đây chỉ chặn hồi quy văn bản SQL: mất `::timestamptz`, đổi phạm vi chủ,
 * chép lại biểu thức "đang chờ" thay vì dùng chung, đọc bộ đếm campaign_runs làm số tin.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));

const { default: repository } = await import('../deliveryMonitor.repository.js');
const { runDeferredReasonSql, runDeferredUntilLatestSql } = await import('../../../utils/runDeferMetadataSql.util.js');

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();
const ALL = { ownerId: null, excludeOwnerIds: [39, 116] };
const ONE = { ownerId: 5, excludeOwnerIds: [] };
const NONE = { ownerId: null, excludeOwnerIds: [] };

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
});

describe('phạm vi chủ của lượt chạy: COALESCE(workspace_owner_id, id_user)', () => {
  it.each([
    ['listRunningRuns', (scope) => repository.listRunningRuns({ scope })],
    ['listRecentRuns', (scope) => repository.listRecentRuns({ scope, limit: 20 })],
    ['countFailedRuns', (scope) => repository.countFailedRuns({ scope, window: { fromDate: '2026-09-01', toDate: '2026-09-30' } })],
  ])('%s: một chủ = `=`, toàn hệ thống trừ nội bộ = NOT COALESCE(… = ANY(…), FALSE), không loại = không điều kiện', async (_name, call) => {
    await call(ONE);
    expect(flat(mockQuery.mock.calls[0][0])).toContain('COALESCE(c.workspace_owner_id, c.id_user) = $');
    await call(ALL);
    const sql = flat(mockQuery.mock.calls[1][0]);
    expect(sql).toMatch(/NOT COALESCE\(COALESCE\(c\.workspace_owner_id, c\.id_user\) = ANY\(\$\d+::bigint\[\]\), FALSE\)/);
    expect(mockQuery.mock.calls[1][1]).toContainEqual([39, 116]);
    await call(NONE);
    const open = flat(mockQuery.mock.calls[2][0]);
    expect(open).not.toContain('ANY(');
    expect(open).toMatch(/AND TRUE|WHERE TRUE/);
  });
});

describe('listRunningRuns', () => {
  it('MỌI lượt running (không LIMIT, không lọc ngày bắt đầu); mốc chờ = GREATEST an toàn của bốn khoá, dùng CHUNG util', async () => {
    await repository.listRunningRuns({ scope: ALL });
    const sql = flat(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("cr.status = 'running'");
    expect(sql).not.toMatch(/\sLIMIT\s|cr\.started_at/); // `emailRateLimitAt` chứa chữ "Limit" nên không so không phân biệt hoa thường
    expect(sql).toContain(flat(runDeferredUntilLatestSql('cr')));
    expect(sql).toContain(`${runDeferredReasonSql('cr')} AS deferred_reason`);
    expect(sql).toContain("cr.run_metadata->>'emailRateLimitAt' AS email_rate_limit_at");
    // Mốc trả ra là chuỗi ISO UTC dựng ở SQL (không parse ở JS từ Date của node-pg).
    expect(sql).toContain(`AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
  });
});

describe('listRecentRuns', () => {
  it('startedAt đi qua ::timestamptz; mới nhất trước; giới hạn là tham số cuối; kèm chủ và cờ bộ đếm đáng tin', async () => {
    await repository.listRecentRuns({ scope: ALL, limit: 20 });
    const [sql, params] = mockQuery.mock.calls[0];
    const text = flat(sql);
    expect(text).toContain('cr.started_at::timestamptz AS started_at');
    expect(text).toMatch(/ORDER BY cr\.started_at DESC, cr\.id DESC LIMIT \$2$/);
    expect(params).toEqual([[39, 116], 20]);
    expect(text).toContain("(cr.created_at >= TIMESTAMP '2026-09-26 20:36:00') AS counters_reliable");
    expect(text).toContain('COALESCE(c.workspace_owner_id, c.id_user) AS owner_id');
  });

  it('KHÔNG dùng bộ đếm campaign_runs làm số tin (chỉ total_recipients làm mẫu số "cần gửi"), không journey / nhật ký node', async () => {
    await repository.listRecentRuns({ scope: ALL, limit: 20 });
    const sql = flat(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('cr.total_recipients');
    expect(sql).not.toMatch(/successful_sends|failed_sends|skipped_sends|customer_journey|campaign_executions/);
  });
});

describe('countFailedRuns', () => {
  it('lượt `failed` kết thúc trong khoảng NGÀY VN (completed_at, thiếu thì started_at), hết ngày cuối', async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: 3 }] });
    const count = await repository.countFailedRuns({ scope: ALL, window: { fromDate: '2026-09-24', toDate: '2026-09-30' } });
    expect(count).toBe(3);
    const [sql, params] = mockQuery.mock.calls[0];
    const text = flat(sql);
    expect(text).toContain("cr.status = 'failed'");
    expect(text).toContain('COALESCE(cr.completed_at, cr.started_at) >= $1::date');
    expect(text).toContain('COALESCE(cr.completed_at, cr.started_at) < ($2::date + 1)');
    expect(params.slice(0, 2)).toEqual(['2026-09-24', '2026-09-30']);
  });
});

describe('countOpenAlertRules / countStrangerBlocked / findOwners', () => {
  it('cảnh báo đang mở đếm LUẬT (DISTINCT rule_id) trên sự kiện chưa xử lý — không đếm sự kiện', async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: 2 }] });
    expect(await repository.countOpenAlertRules()).toBe(2);
    const sql = flat(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('COUNT(DISTINCT rule_id)');
    expect(sql).toContain('resolved = FALSE');
  });

  it('stranger_blocked: đúng lý do, trong khoảng ngày VN, phạm vi theo id_user của bảng số không liên hệ được', async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: 4 }] });
    expect(await repository.countStrangerBlocked({ scope: ALL, window: { fromDate: '2026-09-30', toDate: '2026-09-30' } })).toBe(4);
    const text = flat(mockQuery.mock.calls[0][0]);
    expect(text).toContain("zup.reason = 'stranger_blocked'");
    expect(text).toContain('zup.updated_at >= $1::date');
    expect(text).toContain('zup.updated_at < ($2::date + 1)');
    expect(text).toMatch(/NOT COALESCE\(zup\.id_user = ANY\(\$3::bigint\[\]\), FALSE\)/);
  });

  it('findOwners: danh sách rỗng không chạm DB; có id thì tra bảng users', async () => {
    expect(await repository.findOwners([])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockResolvedValue({ rows: [{ id: '5', username: 'a', full_name: null }] });
    expect(await repository.findOwners([5])).toEqual([{ id: '5', username: 'a', full_name: null }]);
    expect(flat(mockQuery.mock.calls[0][0])).toContain('FROM users');
  });
});

describe('lỗi truy vấn KHÔNG bị nuốt (khác safeQuery: cột sai phải nổ, không thành số 0 im lặng)', () => {
  it.each([
    ['listRunningRuns', () => repository.listRunningRuns({ scope: ALL })],
    ['listRecentRuns', () => repository.listRecentRuns({ scope: ALL, limit: 20 })],
    ['countFailedRuns', () => repository.countFailedRuns({ scope: ALL, window: { fromDate: '2026-09-30', toDate: '2026-09-30' } })],
    ['countOpenAlertRules', () => repository.countOpenAlertRules()],
    ['countStrangerBlocked', () => repository.countStrangerBlocked({ scope: ALL, window: { fromDate: '2026-09-30', toDate: '2026-09-30' } })],
    ['findOwners', () => repository.findOwners([5])],
  ])('%s ném lại lỗi cột không tồn tại (42703)', async (_name, call) => {
    mockQuery.mockRejectedValue(Object.assign(new Error('column "x" does not exist'), { code: '42703' }));
    await expect(call()).rejects.toMatchObject({ code: '42703' });
  });

  it('safeQuery (dùng cho tín hiệu silent-drop) vẫn nuốt lỗi thiếu cột như trước', async () => {
    mockQuery.mockRejectedValue(Object.assign(new Error('x'), { code: '42703' }));
    expect(await repository.safeQuery('SELECT 1', [], ['fallback'])).toEqual(['fallback']);
    mockQuery.mockRejectedValue(Object.assign(new Error('x'), { code: '23505' }));
    await expect(repository.safeQuery('SELECT 1')).rejects.toMatchObject({ code: '23505' });
  });
});
