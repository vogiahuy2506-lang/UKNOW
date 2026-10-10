import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDeleteExpired = jest.fn();
jest.unstable_mockModule('../../../repositories/notification/userNotification.repository.js', () => ({
  default: { deleteExpired: mockDeleteExpired },
}));

const { cleanupUserNotifications } = await import('../userNotificationCleanup.service.js');

describe('cleanupUserNotifications', () => {
  beforeEach(() => {
    mockDeleteExpired.mockReset();
    mockDeleteExpired.mockResolvedValue({ readDeleted: 3, unreadDeleted: 1 });
    delete process.env.NOTIFICATION_RETENTION_READ_DAYS;
    delete process.env.NOTIFICATION_RETENTION_UNREAD_DAYS;
  });

  afterEach(() => {
    delete process.env.NOTIFICATION_RETENTION_READ_DAYS;
    delete process.env.NOTIFICATION_RETENTION_UNREAD_DAYS;
  });

  it('mặc định: đã đọc > 90 ngày, chưa đọc > 180 ngày', async () => {
    const result = await cleanupUserNotifications();
    expect(mockDeleteExpired).toHaveBeenCalledWith({ readDays: 90, unreadDays: 180 });
    expect(result).toEqual({ readDeleted: 3, unreadDeleted: 1, readDays: 90, unreadDays: 180 });
  });

  it('đổi ngưỡng bằng env NOTIFICATION_RETENTION_READ_DAYS / _UNREAD_DAYS', async () => {
    process.env.NOTIFICATION_RETENTION_READ_DAYS = '30';
    process.env.NOTIFICATION_RETENTION_UNREAD_DAYS = '60';
    await cleanupUserNotifications();
    expect(mockDeleteExpired).toHaveBeenCalledWith({ readDays: 30, unreadDays: 60 });
  });

  it('env rác / âm / 0 → rơi về mặc định (không bao giờ xoá mọi thứ vì cấu hình sai)', async () => {
    process.env.NOTIFICATION_RETENTION_READ_DAYS = '0';
    process.env.NOTIFICATION_RETENTION_UNREAD_DAYS = 'abc';
    await cleanupUserNotifications();
    expect(mockDeleteExpired).toHaveBeenCalledWith({ readDays: 90, unreadDays: 180 });

    process.env.NOTIFICATION_RETENTION_READ_DAYS = '-5';
    await cleanupUserNotifications();
    expect(mockDeleteExpired).toHaveBeenLastCalledWith({ readDays: 90, unreadDays: 180 });
  });
});
