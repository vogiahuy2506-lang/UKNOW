import { describe, it, expect } from 'vitest';
import { getVoucherLifecycleStatus } from '../voucherStatus.util.js';

/**
 * PR-10 (C-21) — voucher đã quá hạn nhưng cờ isActive còn true (cron lưu trữ 00:30 chưa chạy/đã lỗi) phải
 * hiện "Hết hạn", không phải "Đang chạy". Cổng áp mã ở server đã chặn theo ends_at, nên nhãn "Đang chạy"
 * là nói sai với admin.
 */
const NOW = Date.parse('2026-09-30T05:00:00.000Z');

describe('getVoucherLifecycleStatus', () => {
  it('isActive=true nhưng endsAt đã qua → expired (trước đây trả active)', () => {
    expect(getVoucherLifecycleStatus({ isActive: true, endsAt: '2026-09-29T16:59:59.000Z' }, NOW)).toBe('expired');
  });

  it('isActive=true, endsAt còn hạn → active', () => {
    expect(getVoucherLifecycleStatus({ isActive: true, endsAt: '2026-10-15T00:00:00.000Z' }, NOW)).toBe('active');
  });

  it('isActive=true, không có endsAt (vô thời hạn) → active', () => {
    expect(getVoucherLifecycleStatus({ isActive: true, endsAt: null }, NOW)).toBe('active');
  });

  it('isActive=false + endsAt đã qua → expired (giữ nguyên)', () => {
    expect(getVoucherLifecycleStatus({ isActive: false, endsAt: '2026-09-01T00:00:00.000Z' }, NOW)).toBe('expired');
  });

  it('isActive=false + còn hạn hoặc không hạn → disabled (giữ nguyên)', () => {
    expect(getVoucherLifecycleStatus({ isActive: false, endsAt: '2026-12-01T00:00:00.000Z' }, NOW)).toBe('disabled');
    expect(getVoucherLifecycleStatus({ isActive: false, endsAt: null }, NOW)).toBe('disabled');
  });
});
