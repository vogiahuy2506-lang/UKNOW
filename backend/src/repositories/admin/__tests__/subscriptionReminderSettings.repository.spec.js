import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { findSettings, saveSettings } = await import('../subscriptionReminderSettings.repository.js');

describe('subscriptionReminderSettings.repository', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('findSettings SELECT đúng bảng, không tham số', async () => {
    const row = { days_before: [7, 3], updated_by: null, updated_at: null };
    query.mockResolvedValueOnce({ rows: [row] });

    const result = await findSettings();

    expect(result).toEqual(row);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/FROM\s+subscription_reminder_settings/i);
  });

  it('findSettings trả null khi không có dòng (không throw) — ví dụ bảng vừa bị truncate ở test', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(findSettings()).resolves.toBeNull();
  });

  // Dòng seed (id=TRUE) có FK tới users(id) nên bị TRUNCATE ... CASCADE của
  // tests/integration/helpers/db.js xoá theo mà không tự gieo lại — UPSERT là bắt buộc, không
  // phải chọn phong cách. UPDATE thuần sẽ ảnh hưởng 0 dòng trong tình huống đó.
  it('saveSettings dùng INSERT ... ON CONFLICT (id) DO UPDATE, không phải UPDATE thuần', async () => {
    const returned = { days_before: [10, 5], updated_by: 9, updated_at: '2026-09-13T00:00:00.000Z' };
    query.mockResolvedValueOnce({ rows: [returned] });

    const result = await saveSettings({ daysBefore: [10, 5], updatedBy: 9 });

    expect(result).toEqual(returned);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO subscription_reminder_settings/i);
    expect(sql).toMatch(/ON CONFLICT\s*\(id\)\s*DO UPDATE/i);
    expect(params).toEqual([[10, 5], 9]);
  });

  it('dùng queryable truyền vào (transaction client) thay vì db mặc định', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ days_before: [7, 3] }] }) };

    await findSettings(client);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });
});
