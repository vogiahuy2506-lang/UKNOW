import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17 Việc 2 — các hàm công tắc "tự động đồng ý lời mời kết bạn" của
 * zaloSetting.repository. Kiểm câu SQL và tham số (DB thật chỉ có ở integration); điều quan trọng cần ghim:
 *  - chủ chỉ sửa nick CỦA MÌNH (AND id_user), super admin sửa mọi nick;
 *  - mọi RETURNING phục vụ `mapRow` đều trả cột mới, kẻo mapRow báo `false` sai sau khi lưu mức khác;
 *  - cron chỉ lấy nick bật công tắc VÀ đang kết nối, cùng điều kiện với zaloInbox.findActiveConnectedAccounts.
 */

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));
jest.unstable_mockModule('../../../utils/zaloCookieCrypto.util.js', () => ({
  decryptZaloCookieRow: (row) => row,
  encryptZaloCookie: (v) => v,
}));

const { default: repository } = await import('../zaloSetting.repository.js');

describe('zaloSetting.repository — tự động đồng ý kết bạn', () => {
  beforeEach(() => {
    query.mockReset();
  });

  describe('updateAutoAcceptFriendRequests', () => {
    it('chủ: UPDATE đúng cột, ràng buộc AND id_user, tham số [enabled, accountId, userId]', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 5, auto_accept_friend_requests: true }] });

      const row = await repository.updateAutoAcceptFriendRequests(5, false, 10, true);

      expect(row).toEqual({ id: 5, auto_accept_friend_requests: true });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/UPDATE\s+zalo_settings/i);
      expect(sql).toMatch(/SET\s+auto_accept_friend_requests\s*=\s*\$1/i);
      expect(sql).toMatch(/WHERE\s+id\s*=\s*\$2\s+AND id_user\s*=\s*\$3/i);
      expect(sql).toMatch(/RETURNING[\s\S]*auto_accept_friend_requests/i);
      expect(params).toEqual([true, 5, 10]);
    });

    it('super admin: KHÔNG ràng buộc id_user, tham số [enabled, accountId]', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

      await repository.updateAutoAcceptFriendRequests(5, true, 1, false);

      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toMatch(/id_user\s*=\s*\$3/i);
      expect(params).toEqual([false, 5]);
    });

    it('ép về boolean thật: giá trị không phải true tuyệt đối -> false (không ghi chuỗi/số vào cột BOOLEAN)', async () => {
      query.mockResolvedValue({ rows: [] });

      await repository.updateAutoAcceptFriendRequests(5, false, 10, 'true');
      await repository.updateAutoAcceptFriendRequests(5, false, 10, 1);

      expect(query.mock.calls[0][1][0]).toBe(false);
      expect(query.mock.calls[1][1][0]).toBe(false);
    });

    it('không tìm thấy nick (hoặc nick của người khác) -> null', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(repository.updateAutoAcceptFriendRequests(999, false, 10, true)).resolves.toBeNull();
    });
  });

  describe('mọi RETURNING / SELECT cấp cho mapRow đều có cột mới', () => {
    it('findAccountsList chọn zs.auto_accept_friend_requests', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await repository.findAccountsList(false, 10);
      expect(query.mock.calls[0][0]).toMatch(/zs\.auto_accept_friend_requests/);
    });

    it('updateSendLimit RETURNING có auto_accept_friend_requests', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await repository.updateSendLimit(5, false, 10, 50);
      expect(query.mock.calls[0][0]).toMatch(/RETURNING[\s\S]*auto_accept_friend_requests/i);
    });

    it('updateSendSpeed RETURNING có auto_accept_friend_requests', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await repository.updateSendSpeed(5, false, 10, 30000, 60000);
      expect(query.mock.calls[0][0]).toMatch(/RETURNING[\s\S]*auto_accept_friend_requests/i);
    });
  });

  describe('isAutoAcceptEnabled', () => {
    it('đọc đúng cột theo id; true chỉ khi cột là true', async () => {
      query.mockResolvedValueOnce({ rows: [{ auto_accept_friend_requests: true }] });
      await expect(repository.isAutoAcceptEnabled(5)).resolves.toBe(true);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/SELECT\s+auto_accept_friend_requests\s+FROM\s+zalo_settings\s+WHERE\s+id\s*=\s*\$1/i);
      expect(params).toEqual([5]);
    });

    it('cột false / nick không tồn tại -> false', async () => {
      query.mockResolvedValueOnce({ rows: [{ auto_accept_friend_requests: false }] });
      await expect(repository.isAutoAcceptEnabled(5)).resolves.toBe(false);
      query.mockResolvedValueOnce({ rows: [] });
      await expect(repository.isAutoAcceptEnabled(999)).resolves.toBe(false);
    });
  });

  describe('findAutoAcceptEnabledAccountIds', () => {
    it('chỉ nick bật công tắc VÀ is_active VÀ status connected (cùng điều kiện findActiveConnectedAccounts)', async () => {
      const rows = [{ id: 5, id_user: 10 }, { id: 6, id_user: 11 }];
      query.mockResolvedValueOnce({ rows });

      await expect(repository.findAutoAcceptEnabledAccountIds()).resolves.toEqual(rows);

      const [sql] = query.mock.calls[0];
      expect(sql).toMatch(/auto_accept_friend_requests\s*=\s*true/i);
      expect(sql).toMatch(/is_active\s*=\s*true/i);
      expect(sql).toMatch(/status\s*=\s*'connected'/i);
    });
  });
});
