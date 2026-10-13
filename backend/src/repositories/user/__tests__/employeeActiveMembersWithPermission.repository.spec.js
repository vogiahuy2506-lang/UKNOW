/**
 * `listActiveMemberIdsWithPermission` — tiêu chí "nhân viên hiệu lực của workspace có quyền X" (chuông bài nộp biểu mẫu, PR-8c).
 * Phép lọc thật trên Postgres ở tests/integration/formSubmissionBell.test.js; file này ghim CHUỖI SQL vì mỗi điều kiện đều là một dòng của
 * `resolveUserContext` (auth.middleware.js) mà một lần sửa "gọn hơn" dễ làm rơi mất: rơi `accepted_at` = báo cho người chưa chấp nhận lời mời;
 * đổi `->` thành `->>` = nhận nhầm chuỗi "true"; rơi khoá `topup_locked_resources` = báo cho người đã bị khoá khỏi workspace.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = { query: jest.fn(), getClient: jest.fn() };

jest.unstable_mockModule('../../../config/database.js', () => ({ default: mockDb }));

const { listActiveMemberIdsWithPermission } = await import('../employee.repository.js');

const lastSql = () => String(mockDb.query.mock.calls[0][0]).replace(/\s+/g, ' ');

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [] });
});

describe('listActiveMemberIdsWithPermission', () => {
  it('khoá quyền đi qua THAM SỐ $2, KHÔNG ghép vào chuỗi SQL (chống chèn SQL qua tên quyền)', async () => {
    const hostile = "forms' OR '1'='1";
    await listActiveMemberIdsWithPermission(7, hostile);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query.mock.calls[0][1]).toEqual([7, hostile]);
    expect(lastSql()).not.toContain(hostile);
    expect(lastSql()).not.toContain('forms');
    expect(lastSql()).toMatch(/um\.permissions -> \$2::text/);
  });

  it('quyền phải bật ĐÚNG boolean true (`->` so với jsonb), không dùng `->>` vốn nhận cả chuỗi "true"', async () => {
    await listActiveMemberIdsWithPermission(7, 'forms');
    expect(lastSql()).toMatch(/\(um\.permissions -> \$2::text\) = 'true'::jsonb/);
    expect(lastSql()).not.toContain('->>');
  });

  it('chỉ nhân viên của ĐÚNG chủ, đang active, đã chấp nhận lời mời — như resolveUserContext', async () => {
    await listActiveMemberIdsWithPermission(7, 'forms');
    const sql = lastSql();
    expect(sql).toMatch(/um\.owner_id = \$1/);
    expect(sql).toMatch(/um\.status = 'active'/);
    expect(sql).toMatch(/um\.accepted_at IS NOT NULL/);
  });

  it('tài khoản nhân viên phải còn dùng được (cùng tập trạng thái với authMiddleware) và không bị khoá do hạ gói', async () => {
    await listActiveMemberIdsWithPermission(7, 'forms');
    const sql = lastSql();
    expect(sql).toMatch(/JOIN users u ON u\.id = um\.employee_id/);
    expect(sql).toMatch(/u\.status IN \('active', 'pending_activation'\)/);
    expect(sql).toMatch(/NOT EXISTS \( SELECT 1 FROM topup_locked_resources tlr WHERE tlr\.user_id = um\.owner_id AND tlr\.resource_key = 'employees' AND tlr\.resource_id = um\.id \)/);
  });

  it('trả mảng id số, theo thứ tự repository trả về', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ employeeId: '11' }, { employeeId: 12 }] });
    await expect(listActiveMemberIdsWithPermission('7', 'forms')).resolves.toEqual([11, 12]);
    expect(mockDb.query.mock.calls[0][1]).toEqual([7, 'forms']);
  });

  it('tham số không hợp lệ → mảng rỗng và KHÔNG chạm DB', async () => {
    await expect(listActiveMemberIdsWithPermission(null, 'forms')).resolves.toEqual([]);
    await expect(listActiveMemberIdsWithPermission('abc', 'forms')).resolves.toEqual([]);
    await expect(listActiveMemberIdsWithPermission(0, 'forms')).resolves.toEqual([]);
    await expect(listActiveMemberIdsWithPermission(7, '')).resolves.toEqual([]);
    await expect(listActiveMemberIdsWithPermission(7, '   ')).resolves.toEqual([]);
    await expect(listActiveMemberIdsWithPermission(7, undefined)).resolves.toEqual([]);
    await expect(listActiveMemberIdsWithPermission(7, 42)).resolves.toEqual([]);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('lỗi DB được ném ra cho người gọi (service chuông mới là nơi nuốt lỗi)', async () => {
    mockDb.query.mockRejectedValue(new Error('DB sập'));
    await expect(listActiveMemberIdsWithPermission(7, 'forms')).rejects.toThrow('DB sập');
  });
});
