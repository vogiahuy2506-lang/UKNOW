/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — mọi câu UPDATE "hệ thống tự đổi trạng thái" phải bỏ qua tài khoản logged_out.
 *
 * Vì sao: `logged_out` là lựa chọn của NGƯỜI DÙNG. recordRestoreFailure (nhánh getConnectedApiOrSyncStatus khi chiến dịch dùng
 * nhầm tài khoản đã đăng xuất) sau ≥5 lần / 60 phút sẽ chuyển thành needs_reauth => hội thoại hiện lại mà chưa ai quét QR, và
 * tăng restore_fail_count làm cảnh báo mất kết nối bắn email. resetRestoreForRetry / markAccountConnected thì đặt thẳng 'connected'.
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
const { default: repo } = await import('../campaignZaloSender.repository.js');

const GUARD = "COALESCE(zalo_settings.status, '') <> 'logged_out'";
const flat = (sql) => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [] });
});

describe('campaignZaloSender.repository — bỏ qua tài khoản logged_out', () => {
  it('markAccountConnected (khôi phục thành công)', async () => {
    await repo.markAccountConnected({ accountId: 7, userId: 12, displayName: 'x', cookieText: 'c', now: new Date() });
    expect(flat(db.query.mock.calls[0][0])).toContain(`WHERE id = $4 AND id_user = $5 AND ${GUARD}`);
  });

  it('recordRestoreFailure (khôi phục thất bại)', async () => {
    await repo.recordRestoreFailure(7);
    expect(flat(db.query.mock.calls[0][0])).toContain(`WHERE id = $1 AND ${GUARD} RETURNING status`);
  });

  it('resetRestoreForRetry (nút "Thử khôi phục lại") — cả nhánh chủ lẫn super admin', async () => {
    await repo.resetRestoreForRetry(7, { userId: 12, isAdmin: false });
    expect(flat(db.query.mock.calls[0][0])).toContain(`WHERE id = $1 AND id_user = $2 AND ${GUARD} RETURNING`);

    db.query.mockClear();
    await repo.resetRestoreForRetry(7, { isAdmin: true });
    expect(flat(db.query.mock.calls[0][0])).toContain(`WHERE id = $1 AND ${GUARD} RETURNING`);
  });

  it('markAccountDisconnected / markAccountDisconnectedById (phiên Zalo bị đá mã 3000/3003, mất kết nối)', async () => {
    await repo.markAccountDisconnected(7, 12);
    expect(flat(db.query.mock.calls[0][0])).toContain(`WHERE id = $1 AND id_user = $2 AND ${GUARD}`);

    db.query.mockClear();
    await repo.markAccountDisconnectedById(7);
    expect(flat(db.query.mock.calls[0][0])).toContain(`WHERE id = $1 AND ${GUARD}`);
  });

  it('findConnectedAccountsNeedingRestore chỉ chọn status=connected có cookie (logged_out đã xoá cookie nên không bao giờ vào)', async () => {
    await repo.findConnectedAccountsNeedingRestore();
    const text = flat(db.query.mock.calls[0][0]);
    expect(text).toContain("status = 'connected'");
    expect(text).toContain("cookie_text IS NOT NULL");
  });
});
