/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — truy vấn tài khoản Zalo liên quan "Đăng xuất":
 * markAccountLoggedOut ghi đúng cột (xoá cookie, KHÔNG đụng is_active / is_default / zalo_user_id); các truy vấn "hệ thống tự đổi
 * trạng thái" và khớp theo tên KHÔNG được chạm tài khoản logged_out.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

// Mã hoá cookie cần SMTP_SECRET_KEY; test này chỉ kiểm hình dạng SQL nên cho đi thẳng.
jest.unstable_mockModule('../../../utils/zaloCookieCrypto.util.js', () => ({
  decryptZaloCookieRow: (row) => row,
  decryptZaloCookieRows: (rows) => rows,
  encryptZaloCookie: (value) => value,
}));

const db = (await import('../../../config/database.js')).default;
const { default: repo } = await import('../zaloSetting.repository.js');

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [{ id: 7, id_user: 12, display_name: 'Shop', is_default: true }] });
});

describe('markAccountLoggedOut', () => {
  it('đặt status=logged_out + xoá cookie + dọn bộ đếm khôi phục; KHÔNG chạm is_active / is_default / zalo_user_id', async () => {
    const row = await repo.markAccountLoggedOut(7, false, 12);

    const [sql, params] = db.query.mock.calls[0];
    const text = flat(sql);
    expect(text).toMatch(/^UPDATE zalo_settings SET status = 'logged_out', cookie_text = NULL, restore_fail_count = 0, first_restore_fail_at = NULL, last_restore_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = \$1 AND id_user = \$2 RETURNING id, id_user, display_name, is_default$/);
    expect(text).not.toMatch(/is_active\s*=/);
    expect(text).not.toMatch(/is_default\s*=/);
    expect(text).not.toMatch(/zalo_user_id\s*=/);
    expect(text).not.toMatch(/DELETE/i);
    expect(params).toEqual([7, 12]);
    expect(row).toEqual({ id: 7, id_user: 12, display_name: 'Shop', is_default: true });
  });

  it('super admin (isAdmin) không ràng id_user; không có dòng → null', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const row = await repo.markAccountLoggedOut(7, true, 12);

    const [sql, params] = db.query.mock.calls[0];
    expect(flat(sql)).not.toMatch(/id_user = \$2/);
    expect(params).toEqual([7]);
    expect(row).toBeNull();
  });
});

describe('truy vấn không được mở lại / lọt tài khoản logged_out', () => {
  it('markAccountDisconnected: bỏ qua logged_out (hệ thống không tự đổi lựa chọn của người dùng)', async () => {
    await repo.markAccountDisconnected(12, 7);
    expect(flat(db.query.mock.calls[0][0])).toContain("COALESCE(zalo_settings.status, '') <> 'logged_out'");
  });

  it('findByDisplayName: bỏ qua logged_out (khớp theo tên không được gắn lại hội thoại đang ẩn cho Zalo khác)', async () => {
    await repo.findByDisplayName(12, 'Shop');
    const [sql, params] = db.query.mock.calls[0];
    expect(flat(sql)).toContain("COALESCE(zalo_settings.status, '') <> 'logged_out'");
    expect(params).toEqual([12, 'Shop']);
  });

  it('findAccountForRestore: trả cả cột status để controller trả 409', async () => {
    await repo.findAccountForRestore(7, false, 12);
    expect(flat(db.query.mock.calls[0][0])).toMatch(/SELECT id, id_user, display_name, cookie_text, is_active, zalo_user_id, status FROM zalo_settings/);
  });

  it('findActiveConnectedAccountsByUser: không trả tài khoản logged_out (banner "cần đăng nhập lại" không nhắc tới)', async () => {
    await repo.findActiveConnectedAccountsByUser(12, null);
    expect(flat(db.query.mock.calls[0][0])).toContain("COALESCE(zs.status, '') <> 'logged_out'");
  });

  it('findAccountsList (trang Cài đặt Zalo) GIỮ NGUYÊN: vẫn liệt kê tài khoản logged_out để quét QR lại', async () => {
    await repo.findAccountsList(false, 12, null);
    expect(db.query.mock.calls[0][0]).not.toMatch(/logged_out/);
  });

  it('updateQrConnectedById đưa về connected — đường DUY NHẤT mở lại hội thoại (không bị chặn bởi logged_out)', async () => {
    await repo.updateQrConnectedById(7, { displayName: 'x', zaloName: '', zaloPhone: '', cookieText: 'c' }, new Date());
    const text = flat(db.query.mock.calls[0][0]);
    expect(text).toContain("status = 'connected'");
    expect(text).not.toMatch(/logged_out/);
  });
});
