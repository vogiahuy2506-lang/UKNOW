import { describe, it, expect } from 'vitest';
import { isPathExcludedFromPlanLock, PLAN_LOCK_EXCLUDED_PATH_PREFIXES } from '../planLock.util';

describe('isPathExcludedFromPlanLock', () => {
  it.each([
    '/app/billing',
    '/app/billing/',
    '/app/billing/history',
    '/app/support',
    '/app/support/3',
    '/app/settings/notifications',
  ])('%s được loại trừ', (path) => {
    expect(isPathExcludedFromPlanLock(path)).toBe(true);
  });

  it.each([
    '/app',
    '/app/products',
    '/app/customers',
    '/app/settings/channels',
    '/app/notifications',
    '/app/billingx',
    '/app/supportx',
    '/app/settings/notificationsx',
    '/billing',
  ])('%s KHÔNG được loại trừ (ranh giới `/` + đúng tiền tố)', (path) => {
    expect(isPathExcludedFromPlanLock(path)).toBe(false);
  });

  it('đầu vào rỗng / không phải chuỗi → false', () => {
    expect(isPathExcludedFromPlanLock('')).toBe(false);
    expect(isPathExcludedFromPlanLock(undefined)).toBe(false);
    expect(isPathExcludedFromPlanLock(null)).toBe(false);
    expect(isPathExcludedFromPlanLock(42)).toBe(false);
  });

  it('danh sách khớp đúng ba tuyến đã đối chiếu với App.jsx (settings/profile không có route nên không có mặt)', () => {
    expect(PLAN_LOCK_EXCLUDED_PATH_PREFIXES).toEqual([
      '/app/billing',
      '/app/support',
      '/app/settings/notifications',
    ]);
  });
});
