import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * SQL của 3 repository thông báo. Ghim các mệnh đề QUAN TRỌNG (dedupe, chủ sở hữu, một câu cho cả nhóm) — hành vi trên DB thật
 * nằm ở tests/integration/userNotifications.test.js.
 */
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { default: userNotificationRepository } = await import('../userNotification.repository.js');
const { default: notificationPreferenceRepository } = await import('../notificationPreference.repository.js');
const { default: notificationEventSettingRepository } = await import('../notificationEventSetting.repository.js');

describe('userNotification.repository', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('insertMany: MỘT câu INSERT … SELECT unnest, ON CONFLICT (user_id, dedupe_key) DO NOTHING, trả id người vừa được chèn', async () => {
    mockQuery.mockResolvedValue({ rows: [{ user_id: '1' }, { user_id: '3' }] });

    const inserted = await userNotificationRepository.insertMany({
      userIds: [1, 2, 3],
      eventType: 'campaign_run_failed',
      title: 'T',
      message: 'M',
      metadata: { a: 1 },
      dedupeKey: 'run:1:failed',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO user_notifications');
    expect(sql).toContain('unnest($1::bigint[])');
    expect(sql).toContain('ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING');
    expect(sql).toContain('RETURNING user_id');
    // Chỉ chèn cho tài khoản còn dùng được, id không tồn tại không làm hỏng cả lô.
    expect(sql).toContain("JOIN users us ON us.id = t.uid AND us.status IN ('active', 'pending_activation')");
    expect(params[0]).toEqual([1, 2, 3]);
    expect(params[8]).toBe(JSON.stringify({ a: 1 }));
    expect(params[10]).toBe('run:1:failed');
    expect(inserted).toEqual([1, 3]);
  });

  it('markRead: chỉ chạm dòng của CHÍNH người dùng (id + user_id), giữ read_at cũ nếu đã đọc', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const row = await userNotificationRepository.markRead('55', 9);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE id = $1 AND user_id = $2');
    expect(sql).toContain('COALESCE(read_at, NOW())');
    expect(params).toEqual(['55', 9]);
    expect(row).toBeNull();
  });

  it('markAllRead: chỉ dòng chưa đọc của người dùng, trả rowCount', async () => {
    mockQuery.mockResolvedValue({ rowCount: 4 });
    expect(await userNotificationRepository.markAllRead(9)).toBe(4);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1 AND read_at IS NULL');
    expect(params).toEqual([9]);
  });

  it('list: lọc user_id, thêm read_at IS NULL khi unreadOnly, phân trang offset = (page-1)*limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '1' }] })
      .mockResolvedValueOnce({ rows: [{ total: 42 }] });

    const result = await userNotificationRepository.list({ userId: 9, page: 3, limit: 10, unreadOnly: true });

    const [listSql, listParams] = mockQuery.mock.calls[0];
    expect(listSql).toContain('user_id = $1 AND read_at IS NULL');
    expect(listSql).toContain('ORDER BY created_at DESC, id DESC');
    expect(listParams).toEqual([9, 10, 20]);
    expect(mockQuery.mock.calls[1][0]).toContain('read_at IS NULL');
    expect(result).toEqual({ rows: [{ id: '1' }], total: 42 });
  });

  it('list không unreadOnly → không có mệnh đề read_at', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await userNotificationRepository.list({ userId: 9, page: 1, limit: 20 });
    expect(mockQuery.mock.calls[0][0]).not.toContain('read_at IS NULL');
  });

  it('deleteExpired: đã đọc quá N ngày (tính từ read_at) + chưa đọc quá M ngày (tính từ created_at), hai câu riêng', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 5 }).mockResolvedValueOnce({ rowCount: 2 });

    const result = await userNotificationRepository.deleteExpired({ readDays: 90, unreadDays: 180 });

    expect(mockQuery.mock.calls[0][0]).toContain('read_at IS NOT NULL AND read_at <');
    expect(mockQuery.mock.calls[0][1]).toEqual([90]);
    expect(mockQuery.mock.calls[1][0]).toContain('read_at IS NULL AND created_at <');
    expect(mockQuery.mock.calls[1][1]).toEqual([180]);
    expect(result).toEqual({ readDeleted: 5, unreadDeleted: 2 });
  });

  it('findEmailContacts: chỉ tài khoản active có email; rỗng thì không chạm DB', async () => {
    expect(await userNotificationRepository.findEmailContacts([])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();

    mockQuery.mockResolvedValue({ rows: [{ id: '4', email: ' a@x.vn ', full_name: null }] });
    expect(await userNotificationRepository.findEmailContacts([4])).toEqual([{ id: 4, email: 'a@x.vn', fullName: null }]);
    expect(mockQuery.mock.calls[0][0]).toContain("status = 'active'");
  });

  it('listActiveAdminIds: role admin + active', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: '1' }, { id: '2' }] });
    expect(await userNotificationRepository.listActiveAdminIds()).toEqual([1, 2]);
    expect(mockQuery.mock.calls[0][0]).toContain("role = 'admin' AND status = 'active'");
  });
});

describe('notificationPreference.repository', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('listEmailDisabledUserIds: email_enabled = false trong nhóm id; nhóm rỗng không chạm DB', async () => {
    expect((await notificationPreferenceRepository.listEmailDisabledUserIds('campaign_run_failed', [])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();

    mockQuery.mockResolvedValue({ rows: [{ user_id: '2' }] });
    const disabled = await notificationPreferenceRepository.listEmailDisabledUserIds('campaign_run_failed', [1, 2]);
    expect(disabled).toEqual(new Set([2]));
    expect(mockQuery.mock.calls[0][0]).toContain('email_enabled = false');
    expect(mockQuery.mock.calls[0][1]).toEqual(['campaign_run_failed', [1, 2]]);
  });

  it('upsert: ON CONFLICT (user_id, event_type) DO UPDATE', async () => {
    mockQuery.mockResolvedValue({});
    await notificationPreferenceRepository.upsert(9, 'campaign_run_failed', false);
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (user_id, event_type)');
    expect(mockQuery.mock.calls[0][1]).toEqual([9, 'campaign_run_failed', false]);
  });

  it('listByUser → Map eventType → boolean', async () => {
    mockQuery.mockResolvedValue({ rows: [{ event_type: 'a', email_enabled: false }, { event_type: 'b', email_enabled: true }] });
    expect(await notificationPreferenceRepository.listByUser(9)).toEqual(new Map([['a', false], ['b', true]]));
  });
});

describe('notificationEventSetting.repository', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('listAll map sang camelCase', async () => {
    const updatedAt = new Date('2026-10-10T00:00:00Z');
    mockQuery.mockResolvedValue({
      rows: [{
        event_type: 'campaign_run_failed', in_app_enabled: true, email_enabled: false,
        user_can_disable_email: true, updated_by: '3', updated_at: updatedAt,
      }],
    });
    expect(await notificationEventSettingRepository.listAll()).toEqual([{
      eventType: 'campaign_run_failed', inAppEnabled: true, emailEnabled: false,
      userCanDisableEmail: true, updatedBy: 3, updatedAt,
    }]);
  });

  it('upsert: ON CONFLICT (event_type) DO UPDATE kèm updated_by', async () => {
    mockQuery.mockResolvedValue({});
    await notificationEventSettingRepository.upsert({
      eventType: 'campaign_run_failed', inAppEnabled: true, emailEnabled: false, userCanDisableEmail: true, updatedBy: 3,
    });
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (event_type)');
    expect(mockQuery.mock.calls[0][1]).toEqual(['campaign_run_failed', true, false, true, 3]);
  });
});
