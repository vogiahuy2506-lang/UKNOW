/**
 * H-01 — khung đọc phân trang theo (created_at, id), có hasMore; đánh dấu đọc chỉ phần đã tải.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const repo = (await import('../unifiedInbox.repository.js')).default;

const row = (id, extra = {}) => ({
  id,
  id_conversation: 5,
  role: 'visitor',
  content: `tin ${id}`,
  attachments: null,
  is_read: false,
  created_at: new Date(2026, 9, 4, 10, 0, id),
  metadata: null,
  ...extra,
});

beforeEach(() => {
  db.query.mockReset();
});

describe('unifiedInbox.repository.getMessages (H-01)', () => {
  it('không có before: lấy limit+1 dòng mới nhất, trả cũ→mới và hasMore=false khi hết tin', async () => {
    db.query.mockResolvedValue({ rows: [row(3), row(2), row(1)] });

    const result = await repo.getMessages(5, 'zalo_personal', { limit: 50 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/FROM zalo_personal_messages/);
    expect(sql).toMatch(/ORDER BY created_at DESC, id DESC/);
    expect(sql).not.toMatch(/created_at, id\) </);
    expect(params).toEqual([5, 51]);
    expect(result.hasMore).toBe(false);
    expect(result.messages.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('còn dòng thứ limit+1 → hasMore=true và dòng thừa bị cắt (không trả cho FE)', async () => {
    const rows = [row(4), row(3), row(2)]; // limit=2 → 3 dòng về = còn tin cũ hơn
    db.query.mockResolvedValue({ rows });

    const result = await repo.getMessages(5, 'webchat', { limit: 2 });

    expect(db.query.mock.calls[0][0]).toMatch(/FROM webchat_messages/);
    expect(result.hasMore).toBe(true);
    expect(result.messages.map((m) => m.id)).toEqual([3, 4]);
  });

  it('có before: khoá (created_at, id) lấy từ chính tin đó và bị giới hạn trong hội thoại; id nằm ở tham số, không nối chuỗi', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await repo.getMessages(5, 'zalo_personal', { limit: 50, beforeId: 777 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/\(created_at, id\) < \(\s*SELECT created_at, id FROM zalo_personal_messages WHERE id = \$3 AND id_conversation = \$1\s*\)/);
    expect(sql).not.toMatch(/id < \$3/);
    expect(params).toEqual([5, 51, 777]);
  });

  it('trần limit 200 và sàn 1; loại hội thoại lạ không bao giờ ghép tên bảng từ input', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await repo.getMessages(5, 'channel', { limit: 999999 });
    expect(db.query.mock.calls[0][1][1]).toBe(201);

    db.query.mockClear();
    await repo.getMessages(5, "x'; DROP TABLE users; --", { limit: 0 });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).toMatch(/FROM webchat_messages/);
    expect(params[1]).toBe(51);
  });
});

describe('unifiedInbox.repository.markAsRead (H-01)', () => {
  it('không fromMessageId: đánh dấu hết (hành vi cũ cho client cũ) rồi đếm tin còn lại', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 0 }] });

    const result = await repo.markAsRead(5, 'zalo_personal');

    const [updateSql, updateParams] = db.query.mock.calls[0];
    expect(updateSql).toMatch(/UPDATE zalo_personal_messages SET is_read = true/);
    expect(updateSql).not.toMatch(/created_at, id\) >=/);
    expect(updateParams).toHaveLength(2);
    expect(result).toEqual({ remainingUnread: 0 });
  });

  it('có fromMessageId: CHỈ đánh dấu từ tin đó trở về sau, tin cũ hơn chưa tải giữ chưa đọc; trả số còn lại', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 67 }] });

    const result = await repo.markAsRead(5, 'zalo_personal', { fromMessageId: 900 });

    const [updateSql, updateParams] = db.query.mock.calls[0];
    expect(updateSql).toMatch(/\(created_at, id\) >= \(\s*SELECT created_at, id FROM zalo_personal_messages WHERE id = \$3 AND id_conversation = \$1\s*\)/);
    expect(updateSql).toMatch(/role = 'visitor' AND is_read = false/);
    expect(updateParams[0]).toBe(5);
    expect(updateParams[2]).toBe(900);
    expect(result).toEqual({ remainingUnread: 67 });
  });
});
