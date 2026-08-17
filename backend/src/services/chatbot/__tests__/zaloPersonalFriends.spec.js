import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import zaloPersonalSyncService from '../zaloPersonalSync.service.js';
import db from '../../../config/database.js';

describe('zaloPersonalSync.service friends sync and query (PR-B)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persistFriends normalizes diverse UID shapes and batch inserts into zalo_friends', async () => {
    const querySpy = jest.spyOn(db, 'query').mockResolvedValue({ rowCount: 2 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const rawFriends = [
      { userId: '12345', displayName: 'Nguyen Van A', phoneNumber: '0901234567', avatar: 'https://avatar.url/1' },
      { zuid: '67890', zalo_name: 'Tran B', mobile: '0912345678' },
      { profile: { uid: '11223' }, name: 'Le C' },
      { id: '' }, // empty friend id should be skipped
    ];

    const persisted = await zaloPersonalSyncService.persistFriends(10, rawFriends);

    expect(persisted).toBe(3);
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO zalo_friends'),
      expect.arrayContaining([10, '12345', 'Nguyen Van A', '0901234567', 'https://avatar.url/1', '67890', 'Tran B', '0912345678', '11223', 'Le C'])
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('persistFriends skipped 1/4 items'),
      expect.any(Array)
    );
  });

  it('persistFriends dedupes duplicate UIDs within the same batch (last one wins, no Postgres ON CONFLICT error)', async () => {
    const querySpy = jest.spyOn(db, 'query').mockResolvedValue({ rowCount: 1 });

    const rawFriends = [
      { userId: '12345', displayName: 'Nguyen Van A (page 1)', phoneNumber: '0901234567' },
      { userId: '12345', displayName: 'Nguyen Van A (page 2)', phoneNumber: '0901234567' },
    ];

    const persisted = await zaloPersonalSyncService.persistFriends(10, rawFriends);

    expect(persisted).toBe(1);
    expect(querySpy).toHaveBeenCalledTimes(1);
    const [sql, params] = querySpy.mock.calls[0];
    expect(sql).toContain('INSERT INTO zalo_friends');
    // Only one occurrence of the friendId in the flattened params — proves the
    // batch has a single VALUES row for it, not two (which Postgres rejects).
    expect(params.filter((p) => p === '12345')).toHaveLength(1);
    expect(params).toContain('Nguyen Van A (page 2)');
  });

  it('listFriends verifies account ownership and returns paginated list', async () => {
    jest.spyOn(db, 'query').mockImplementation(async (sql, params) => {
      if (sql.includes('FROM zalo_settings')) {
        return { rows: [{ id: 10, name: 'Zalo Account 1' }] };
      }
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ total: 1 }] };
      }
      if (sql.includes('SELECT id, friend_id')) {
        return {
          rows: [
            { id: 1, friend_id: '12345', display_name: 'Nguyen Van A', phone: '0901234567', avatar_url: null },
          ],
        };
      }
      if (sql.includes('MAX(synced_at)')) {
        return { rows: [{ last_synced_at: '2026-08-17T00:00:00Z' }] };
      }
      return { rows: [] };
    });

    const result = await zaloPersonalSyncService.listFriends({
      accountId: 10,
      userId: 1,
      search: 'Nguyen',
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].display_name).toBe('Nguyen Van A');
    expect(result.lastSyncedAt).toBe('2026-08-17T00:00:00Z');
  });

  it('listFriends throws 404 when user does not own the zalo account', async () => {
    jest.spyOn(db, 'query').mockResolvedValue({ rows: [] });

    await expect(
      zaloPersonalSyncService.listFriends({ accountId: 999, userId: 1 })
    ).rejects.toThrow('Không tìm thấy tài khoản Zalo hoặc không có quyền truy cập');
  });
});
