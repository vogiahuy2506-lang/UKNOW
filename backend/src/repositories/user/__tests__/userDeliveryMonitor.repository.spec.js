/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — ghim các quyết định nằm TRONG câu SQL của trang Giám sát gửi tin mà
 * test mock DB không thấy được. Kết quả thật của từng câu do tests/integration/userDeliveryMonitor*.test.js kiểm trên
 * DB thật (kể cả cột naive như production); ở đây chỉ chặn hồi quy văn bản SQL: mất `::timestamptz`, đổi phạm vi chủ,
 * chép lại biểu thức "đang chờ" thay vì dùng chung với admin.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));

const { default: repository } = await import('../userDeliveryMonitor.repository.js');
const { runDeferredReasonSql, runDeferredUntilSql } = await import('../../../utils/runDeferMetadataSql.util.js');

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
});

describe('listRecentRuns', () => {
  it('startedAt đi qua ::timestamptz (cột production là timestamp naive giờ VN; thiếu thì lượt sau 17:00 hiện sang ngày hôm sau)', async () => {
    await repository.listRecentRuns({ ownerId: 39, limit: 10 });
    expect(flat(mockQuery.mock.calls[0][0])).toContain('cr.started_at::timestamptz AS started_at');
  });

  it('phạm vi COALESCE(workspace_owner_id, id_user) = chủ; mới nhất trước; tham số [chủ, giới hạn]', async () => {
    await repository.listRecentRuns({ ownerId: 39, limit: 10 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(flat(sql)).toContain('WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1');
    expect(flat(sql)).toContain('ORDER BY cr.started_at DESC, cr.id DESC LIMIT $2');
    expect(params).toEqual([39, 10]);
  });

  it('mốc "chờ tới khi nào / vì sao" dùng CHUNG biểu thức với admin (util), không chép lại', async () => {
    await repository.listRecentRuns({ ownerId: 39, limit: 10 });
    const sql = flat(mockQuery.mock.calls[0][0]);
    expect(sql).toContain(`${runDeferredUntilSql('cr')} AS deferred_until`);
    expect(sql).toContain(`${runDeferredReasonSql('cr')} AS deferred_reason`);
  });

  it("cờ bộ đếm đáng tin so created_at với mốc 26/09/2026 20:36 giờ VN, và đọc emailRateLimitAt", async () => {
    await repository.listRecentRuns({ ownerId: 39, limit: 10 });
    const sql = flat(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("(cr.created_at >= TIMESTAMP '2026-09-26 20:36:00') AS counters_reliable");
    expect(sql).toContain("cr.run_metadata->>'emailRateLimitAt' AS email_rate_limit_at");
  });

  it('không dùng bộ đếm campaign_runs làm số tin: chỉ lấy total_recipients (mẫu số "cần gửi"), không successful_sends / failed_sends', async () => {
    await repository.listRecentRuns({ ownerId: 39, limit: 10 });
    const sql = flat(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('cr.total_recipients');
    expect(sql).not.toMatch(/successful_sends|failed_sends|skipped_sends|customer_journey|campaign_executions/);
  });
});

describe('listRunningRuns', () => {
  it('mọi lượt running của chủ (không LIMIT), cùng phạm vi và cùng biểu thức chờ', async () => {
    await repository.listRunningRuns({ ownerId: 39 });
    const [sql, params] = mockQuery.mock.calls[0];
    const text = flat(sql);
    expect(text).toContain('WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1');
    expect(text).toContain("AND cr.status = 'running'");
    expect(text).not.toMatch(/LIMIT/);
    expect(text).toContain(`${runDeferredUntilSql('cr')} AS deferred_until`);
    expect(params).toEqual([39]);
  });
});

describe('findOwnedRun', () => {
  it('chỉ trả lượt CỦA chủ (id lượt VÀ phạm vi chủ trong cùng WHERE); trả null khi không có', async () => {
    expect(await repository.findOwnedRun({ ownerId: 39, runId: 406 })).toBeNull();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(flat(sql)).toContain('WHERE cr.id = $1 AND COALESCE(c.workspace_owner_id, c.id_user) = $2');
    expect(params).toEqual([406, 39]);
  });

  it('trả dòng đầu tiên kèm recipient_audit', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: '406', recipient_audit: { sourceRows: 6 } }] });
    expect(await repository.findOwnedRun({ ownerId: 39, runId: 406 })).toEqual({ id: '406', recipient_audit: { sourceRows: 6 } });
  });
});

describe('lỗi truy vấn KHÔNG bị nuốt (khác safeQuery: cột sai phải nổ, không thành số 0 im lặng)', () => {
  it.each([
    ['listRecentRuns', () => repository.listRecentRuns({ ownerId: 1, limit: 10 })],
    ['listRunningRuns', () => repository.listRunningRuns({ ownerId: 1 })],
    ['findOwnedRun', () => repository.findOwnedRun({ ownerId: 1, runId: 2 })],
  ])('%s ném lại lỗi cột không tồn tại (42703)', async (_ten, call) => {
    mockQuery.mockRejectedValue(Object.assign(new Error('column does not exist'), { code: '42703' }));
    await expect(call()).rejects.toMatchObject({ code: '42703' });
  });
});
