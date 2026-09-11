import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-1 (xác thực SĐT bằng OTP) — verification.repository.js, nhánh OTP theo SĐT.
 * Xem _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4.3.
 */

const query = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query },
}));

const { default: repository } = await import('../verification.repository.js');

describe('verification.repository — OTP theo SĐT', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('createPhoneCode INSERT đúng type=phone_otp, không đụng nhánh email', async () => {
    query.mockResolvedValue({ rows: [{ id: 1 }] });

    await repository.createPhoneCode({ phone: '0912345678', userId: 10, code: '123456', expiresInMinutes: 5 });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO verification_codes/i);
    expect(sql).toMatch(/'phone_otp'/);
    expect(sql).not.toMatch(/LOWER\(email\)/i);
    expect(params).toEqual(['0912345678', 10, '123456', 5]);
  });

  it('findValidPhoneCode khoá theo phone + userId + code + type=phone_otp, chưa dùng, chưa hết hạn', async () => {
    query.mockResolvedValue({ rows: [{ id: 1 }] });

    await repository.findValidPhoneCode({ phone: '0912345678', userId: 10, code: '123456' });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/phone = \$1/);
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/code = \$3/);
    expect(sql).toMatch(/type = 'phone_otp'/);
    expect(sql).toMatch(/is_used = FALSE/);
    expect(sql).toMatch(/expires_at > NOW\(\)/);
    expect(params).toEqual(['0912345678', 10, '123456']);
  });

  it('getPhoneSendCooldown mặc định 60s, độc lập với getSendCooldown(email)', async () => {
    query.mockResolvedValue({ rows: [{ retry_after: 45 }] });

    const result = await repository.getPhoneSendCooldown('0912345678');

    expect(result).toEqual({ blocked: true, retryAfterSec: 45 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/phone = \$1/);
    expect(sql).toMatch(/type = 'phone_otp'/);
    expect(sql).not.toMatch(/email/i);
    expect(params).toEqual(['0912345678', 60]);
  });

  it('getPhoneSendCooldown không có bản ghi nào → blocked=false', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await repository.getPhoneSendCooldown('0912345678');

    expect(result).toEqual({ blocked: false });
  });

  it('bumpAttempts UPDATE attempts = attempts + 1, trả attempts mới', async () => {
    query.mockResolvedValue({ rows: [{ attempts: 3 }] });

    const attempts = await repository.bumpAttempts(1);

    expect(attempts).toBe(3);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/attempts = attempts \+ 1/);
    expect(params).toEqual([1]);
  });

  it('bumpAttempts không tìm thấy row → trả null', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await repository.bumpAttempts(999)).toBeNull();
  });

  it('markUnusedPhoneCodesAsUsed chỉ đụng type=phone_otp của đúng (phone, userId)', async () => {
    query.mockResolvedValue({ rows: [] });

    await repository.markUnusedPhoneCodesAsUsed('0912345678', 10);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/phone = \$1/);
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/type = 'phone_otp'/);
    expect(sql).toMatch(/is_used = FALSE/);
    expect(params).toEqual(['0912345678', 10]);
  });

  it('countPhoneCodesLast24h đếm theo phone trong 24h — trần 5/số/ngày', async () => {
    query.mockResolvedValue({ rows: [{ n: 3 }] });
    const n = await repository.countPhoneCodesLast24h('0912345678');
    expect(n).toBe(3);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/phone = \$1/);
    expect(sql).toMatch(/INTERVAL '24 hours'/);
    expect(params).toEqual(['0912345678']);
  });

  it('countUserPhoneCodesLast24h đếm theo userId trong 24h — trần 5/user/ngày', async () => {
    query.mockResolvedValue({ rows: [{ n: 2 }] });
    const n = await repository.countUserPhoneCodesLast24h(10);
    expect(n).toBe(2);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/user_id = \$1/);
    expect(params).toEqual([10]);
  });

  it('countAllPhoneCodesLast24h đếm toàn hệ thống, không tham số — trần PHONE_OTP_DAILY_CAP', async () => {
    query.mockResolvedValue({ rows: [{ n: 120 }] });
    const n = await repository.countAllPhoneCodesLast24h();
    expect(n).toBe(120);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/type = 'phone_otp'/);
    expect(sql).not.toMatch(/WHERE phone|WHERE user_id/);
    expect(params).toBeUndefined();
  });

  it('findLatestActivePhoneCode lấy đúng bản ghi mới nhất còn hiệu lực', async () => {
    query.mockResolvedValue({ rows: [{ id: 7 }] });
    const row = await repository.findLatestActivePhoneCode({ phone: '0912345678', userId: 10 });
    expect(row).toEqual({ id: 7 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(sql).toMatch(/LIMIT 1/);
    expect(params).toEqual(['0912345678', 10]);
  });
});
