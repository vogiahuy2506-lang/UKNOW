import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeT } from '../../../test/realI18n.js';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { openNotificationLink } from '../utils/openNotificationLink';
import { notificationPreferencesPath, notificationsPagePath } from '../utils/notificationPaths';

describe('openNotificationLink', () => {
  afterEach(() => vi.restoreAllMocks());

  it('đường dẫn nội bộ → navigate', () => {
    const navigate = vi.fn();
    expect(openNotificationLink('/app/delivery-monitor', navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/app/delivery-monitor');
  });

  it('http/https tuyệt đối → tab mới với noopener, không navigate', () => {
    const navigate = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(openNotificationLink('https://founderai.biz/huong-dan', navigate)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://founderai.biz/huong-dan', '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['//evil.example/phish'],
    ['/\\evil.example'],
    ['mailto:a@b.c'],
    ['   '],
    [''],
    [null],
    [undefined],
    [42],
  ])('link không an toàn %j → bỏ qua', (link) => {
    const navigate = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(openNotificationLink(link, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('formatRelativeTime', () => {
  const t = makeT(null, 'vi');
  const now = new Date('2026-10-10T12:00:00Z').getTime();
  const ago = (seconds) => new Date(now - seconds * 1000).toISOString();

  it.each([
    [10, 'Vừa xong'],
    [5 * 60, '5 phút trước'],
    [3 * 3600, '3 giờ trước'],
    [2 * 86400, '2 ngày trước'],
    [14 * 86400, '2 tuần trước'],
    [90 * 86400, '3 tháng trước'],
    [800 * 86400, '2 năm trước'],
  ])('%i giây trước → %s', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), t, now)).toBe(expected);
  });

  it('giá trị rỗng / sai → chuỗi rỗng; thời điểm tương lai (lệch đồng hồ) → "Vừa xong"', () => {
    expect(formatRelativeTime(null, t, now)).toBe('');
    expect(formatRelativeTime('không phải ngày', t, now)).toBe('');
    expect(formatRelativeTime(ago(-120), t, now)).toBe('Vừa xong');
  });
});

describe('notificationPaths', () => {
  it('người dùng → /app/*, super admin → /admin/* (ProtectedRoute đá admin khỏi /app)', () => {
    expect(notificationsPagePath({ role: 'user' })).toBe('/app/notifications');
    expect(notificationPreferencesPath({ role: 'user' })).toBe('/app/settings/notifications');
    expect(notificationsPagePath({ role: 'admin' })).toBe('/admin/notifications');
    expect(notificationPreferencesPath({ role: 'admin' })).toBe('/admin/settings/notifications');
    expect(notificationsPagePath(null)).toBe('/app/notifications');
  });
});
