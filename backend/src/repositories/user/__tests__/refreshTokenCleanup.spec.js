import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { deleteExpiredRefreshTokens } = await import('../user.repository.js');

describe('deleteExpiredRefreshTokens', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
  });

  it('mặc định giữ 30 ngày và xoá theo lô 5000', async () => {
    mockQuery.mockResolvedValue({ rowCount: 12, rows: [] });

    const deleted = await deleteExpiredRefreshTokens();

    expect(deleted).toBe(12);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/DELETE FROM refresh_tokens/);
    expect(params).toEqual(['30', 5000]);
  });

  it('lọc theo expires_at, KHÔNG lọc theo is_revoked', async () => {
    await deleteExpiredRefreshTokens();

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/expires_at\s*<\s*NOW\(\)/);
    expect(sql).not.toMatch(/is_revoked/);
  });

  it('xoá có LIMIT để không khoá bảng quá lâu ở lần chạy đầu', async () => {
    await deleteExpiredRefreshTokens(30, 100);

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/LIMIT \$2/);
    expect(mockQuery.mock.calls[0][1]).toEqual(['30', 100]);
  });

  it('giá trị không hợp lệ rơi về mặc định thay vì tạo SQL hỏng', async () => {
    await deleteExpiredRefreshTokens(-5, 0);

    expect(mockQuery.mock.calls[0][1]).toEqual(['30', 5000]);
  });

  it('trả 0 khi không có dòng nào để xoá', async () => {
    mockQuery.mockResolvedValue({ rowCount: null, rows: [] });

    await expect(deleteExpiredRefreshTokens()).resolves.toBe(0);
  });
});
