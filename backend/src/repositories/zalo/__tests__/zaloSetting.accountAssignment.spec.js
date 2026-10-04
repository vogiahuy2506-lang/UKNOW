/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — ghim chuỗi SQL của hai chỗ zaloSetting.repository đổi:
 * findAccountsList lọc theo tài khoản được giao (nhân viên) và deleteAccount dọn việc giao đi cùng.
 * Phép lọc thật trên Postgres ở tests/integration/zaloAccountAssignment.test.js.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));
jest.unstable_mockModule('../../../utils/zaloCookieCrypto.util.js', () => ({
  decryptZaloCookieRow: (row) => row,
  encryptZaloCookie: (v) => v,
}));

const { default: repository } = await import('../zaloSetting.repository.js');

const sqlOf = (i = 0) => String(query.mock.calls[i][0]).replace(/\s+/g, ' ');

describe('zaloSetting.repository.findAccountsList — lọc theo việc giao', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it('chủ (accessibleIds = null): chỉ lọc theo id_user, KHÔNG có điều kiện tài khoản được giao', async () => {
    await repository.findAccountsList(false, 10, null);
    expect(sqlOf()).toMatch(/AND zs\.id_user = \$1/);
    expect(sqlOf()).not.toMatch(/zs\.id = ANY/);
    expect(query.mock.calls[0][1]).toEqual([10]);
  });

  it('gọi 2 tham số như cũ (chỗ gọi cũ) = như chủ', async () => {
    await repository.findAccountsList(false, 10);
    expect(sqlOf()).not.toMatch(/zs\.id = ANY/);
    expect(query.mock.calls[0][1]).toEqual([10]);
  });

  it('nhân viên: thêm AND zs.id = ANY($2) với đúng mảng id', async () => {
    await repository.findAccountsList(false, 10, [5, 7]);
    expect(sqlOf()).toMatch(/AND zs\.id_user = \$1/);
    expect(sqlOf()).toMatch(/AND zs\.id = ANY\(\$2::bigint\[\]\)/);
    expect(query.mock.calls[0][1]).toEqual([10, [5, 7]]);
  });

  it('nhân viên chưa được giao gì (mảng rỗng): VẪN thêm điều kiện (không rơi về "thấy hết")', async () => {
    await repository.findAccountsList(false, 10, []);
    expect(sqlOf()).toMatch(/AND zs\.id = ANY\(\$2::bigint\[\]\)/);
    expect(query.mock.calls[0][1]).toEqual([10, []]);
  });

  it('super admin (isAdmin, null): không lọc gì, tham số rỗng; có mảng thì đánh số $1', async () => {
    await repository.findAccountsList(true, 1, null);
    expect(sqlOf()).not.toMatch(/zs\.id_user = \$/);
    expect(query.mock.calls[0][1]).toEqual([]);

    query.mockClear();
    await repository.findAccountsList(true, 1, [3]);
    expect(sqlOf()).toMatch(/zs\.id = ANY\(\$1::bigint\[\]\)/);
    expect(query.mock.calls[0][1]).toEqual([[3]]);
  });

  it('truy vấn danh sách KHÔNG đọc bảng giao (bảng giao trục trặc không được làm hỏng danh sách của chủ)', async () => {
    await repository.findAccountsList(false, 10, null);
    expect(sqlOf()).not.toMatch(/member_channel_accounts/);
  });
});

describe('zaloSetting.repository.deleteAccount — dọn việc giao đi cùng', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ id: 5, id_user: 10, is_default: false }] });
  });

  it('một câu lệnh: xoá tài khoản + xoá member_channel_accounts theo account_ref', async () => {
    const deleted = await repository.deleteAccount(5, false, 10);
    expect(query).toHaveBeenCalledTimes(1);
    expect(sqlOf()).toMatch(/DELETE FROM zalo_settings WHERE id = \$1 AND id_user = \$2/);
    expect(sqlOf()).toMatch(/DELETE FROM member_channel_accounts WHERE channel = 'zalo_personal' AND account_ref IN \(SELECT id::text FROM deleted\)/);
    expect(query.mock.calls[0][1]).toEqual([5, 10]);
    expect(deleted).toEqual({ id: 5, id_user: 10, is_default: false });
  });

  it('super admin: không ràng id_user', async () => {
    await repository.deleteAccount(5, true, 1);
    expect(sqlOf()).not.toMatch(/id_user = \$2/);
    expect(query.mock.calls[0][1]).toEqual([5]);
  });

  it('không có hàng bị xoá → null', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(repository.deleteAccount(5, false, 10)).resolves.toBeNull();
  });
});
