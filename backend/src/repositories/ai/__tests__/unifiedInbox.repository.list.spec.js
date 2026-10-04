/**
 * H-06 (chọn TRANG trước, tính chi tiết sau), H-13 (chip Cá nhân/Nhóm/Chưa đọc chạy phía server),
 * H-33 (tìm không phân biệt dấu), H-08/H-30 (tin cuối trả mã loại, không viết cứng tiếng Việt).
 * Kết quả trên Postgres thật: backend/tests/integration/inboxHopThu.test.js.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const repo = (await import('../unifiedInbox.repository.js')).default;

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [] });
});

const sqlOf = async (filters = {}) => {
  await repo.getConversations(1, { accessibleZaloAccountIds: null, limit: 20, offset: 0, ...filters });
  return db.query.mock.calls[0];
};

describe('getConversations — chọn trang trước (H-06)', () => {
  it('mỗi bảng lấy limit+offset hội thoại mới nhất theo cột last_message_at, rồi gộp và cắt đúng trang', async () => {
    const [sql, params] = await sqlOf({ limit: 20, offset: 40 });

    const candidates = sql.slice(sql.indexOf('WITH candidates AS'), sql.indexOf('page AS ('));
    expect(candidates.match(/LIMIT \(\$2::int \+ \$3::int\)/g)).toHaveLength(3);
    expect(candidates.match(/ORDER BY COALESCE\([a-z]+\.last_message_at, [a-z]+\.started_at\) DESC NULLS LAST, [a-z]+\.id DESC/g)).toHaveLength(3);
    expect(sql).toMatch(/page AS \(\s*SELECT conversation_type, id, sort_at\s+FROM candidates\s+ORDER BY sort_at DESC NULLS LAST, id DESC, conversation_type\s+LIMIT \$2 OFFSET \$3/);
    expect(params.slice(0, 3)).toEqual([1, 20, 40]);
  });

  it('phần tốn kém (tin cuối, số chưa đọc, LATERAL zalo_groups) chỉ nằm SAU bước chọn trang, không nằm trong candidates', async () => {
    const [sql] = await sqlOf();

    const candidates = sql.slice(sql.indexOf('WITH candidates AS'), sql.indexOf('page AS ('));
    const afterPage = sql.slice(sql.indexOf('page AS ('));
    for (const expensive of ['LATERAL', 'zalo_groups', 'COUNT(*)', 'role = \'visitor\' AND is_read = false', 'last_message_at_override']) {
      expect(candidates).not.toContain(expensive);
    }
    expect(afterPage).toContain('zalo_groups');
    expect(afterPage).toContain('COUNT(*)');
    expect(sql).not.toContain('last_message_at_override');
  });

  it('tin cuối trả mã loại (không còn nhãn tiếng Việt viết cứng trong SQL)', async () => {
    const [sql] = await sqlOf();

    expect(sql).toMatch(/m\.attachments->0->>'type' AS attachment_type/);
    expect(sql).toMatch(/m\.metadata->>'msg_type_raw' AS raw_type/);
    expect(sql).toMatch(/m\.metadata->>'sender_name' AS sender_name/);
    for (const hardCoded of ['Hình ảnh', 'Sticker', 'Tệp đính kèm']) {
      expect(sql).not.toContain(hardCoded);
    }
  });

  it('ánh xạ dòng về camelCase gồm các trường xem trước mới', async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 5, conversation_type: 'zalo_personal', channel: 'zalo_personal', visitor_name: 'Hải',
        visitor_info: { is_group: true, group_id: 'g1' }, external_id: 'group_g1', status: 'active',
        started_at: '2026-10-01T00:00:00.000Z', last_message_at: '2026-10-04T01:00:00.000Z',
        last_message: '{"href":"https://x"}', last_attachment_type: null, last_raw_type: 'chat.photo',
        last_sender_name: 'Hải', last_role: 'visitor', unread_count: '3', group_name_override: 'Nhóm RD',
      }],
    });

    const [row] = await repo.getConversations(1, { accessibleZaloAccountIds: null, limit: 20, offset: 0 });

    expect(row).toMatchObject({
      lastMessageRawType: 'chat.photo',
      lastMessageAttachmentType: null,
      lastMessageSender: 'Hải',
      lastMessageRole: 'visitor',
      unreadCount: 3,
      lastMessageAt: '2026-10-04T01:00:00.000Z',
    });
  });
});

describe('getConversations — chip lọc phía server (H-13, C1)', () => {
  it('kind=personal loại nhóm ở cả 3 nhánh; kind=group chỉ lấy nhóm', async () => {
    const [personal] = await sqlOf({ kind: 'personal' });
    expect(personal.match(/NOT \(COALESCE\((cc|zp|wc)\.visitor_info->>'is_group', 'false'\) = 'true'\)/g)).toHaveLength(3);

    db.query.mockClear();
    const [group] = await sqlOf({ kind: 'group' });
    expect(group.match(/AND COALESCE\((cc|zp|wc)\.visitor_info->>'is_group', 'false'\) = 'true'/g)).toHaveLength(3);
    expect(group).not.toMatch(/NOT \(COALESCE/);
  });

  it('kind lạ bị bỏ qua (allowlist), không lọt vào SQL', async () => {
    const [sql] = await sqlOf({ kind: "x'; DROP TABLE users; --" });

    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/is_group/);
  });

  it('unreadOnly: EXISTS tin khách chưa đọc ở từng nhánh; không bật thì không có', async () => {
    const [on] = await sqlOf({ unreadOnly: true });
    expect(on.match(/EXISTS \(\s*SELECT 1 FROM (channel|zalo_personal|webchat)_messages um/g)).toHaveLength(3);

    db.query.mockClear();
    const [off] = await sqlOf({});
    expect(off).not.toMatch(/ um\b/);
  });

  it('getConversationsCount áp cùng bộ lọc (tổng khớp danh sách)', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '7' }] });

    const total = await repo.getConversationsCount(1, { accessibleZaloAccountIds: null, kind: 'personal', unreadOnly: true });

    expect(total).toBe(7);
    const [sql] = db.query.mock.calls[0];
    expect(sql.match(/NOT \(COALESCE/g)).toHaveLength(3);
    expect(sql.match(/EXISTS \(/g)).toHaveLength(3);
  });
});

describe('getConversations — tìm không phân biệt dấu (H-33)', () => {
  it('"Nguyễn" và "nguyen" cùng ra mẫu %nguyen%, bind bằng tham số', async () => {
    const [, p1] = await sqlOf({ search: 'Nguyễn' });
    db.query.mockClear();
    const [, p2] = await sqlOf({ search: 'NGUYEN' });

    expect(p1[3]).toBe('%nguyen%');
    expect(p2[3]).toBe('%nguyen%');
  });

  it('ký tự đại diện LIKE trong từ khoá bị thoát: "100%" không khớp mọi thứ', async () => {
    const [, params] = await sqlOf({ search: '100%_x' });

    expect(params[3]).toBe('%100\\%\\_x%');
  });
});

describe('getAvailableChannels (H-12)', () => {
  it('trả kênh theo thứ tự hiển thị cố định, bỏ kênh lạ và Facebook', async () => {
    db.query.mockResolvedValue({
      rows: [{ channel: 'telegram' }, { channel: 'facebook' }, { channel: 'zalo_personal' }, { channel: 'web' }, { channel: 'x' }],
    });

    const channels = await repo.getAvailableChannels(1, { accessibleZaloAccountIds: null });

    expect(channels).toEqual(['web', 'zalo_personal', 'telegram']);
    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual([1]);
    expect(sql).not.toMatch(/'facebook'/);
  });
});

describe('markAllAsRead — mỗi câu UPDATE chỉ nhận đúng tham số nó dùng', () => {
  const maxPlaceholder = (sql) => Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));

  it('số tham số khớp số placeholder ở cả 3 câu (Postgres báo lỗi nếu thừa/thiếu)', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });

    const result = await repo.markAllAsRead(1, { zaloAccountId: '7', search: 'Nguyễn', date: 'week', kind: 'personal' });

    expect(result.updatedMessages).toBe(3);
    expect(db.query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of db.query.mock.calls) {
      expect(params).toHaveLength(maxPlaceholder(sql));
    }
    // chỉ câu của Zalo mang tham số tài khoản
    const zalo = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE zalo_personal_messages'));
    expect(zalo[0]).toMatch(/zp\.id_zalo_setting = \$3/);
    const web = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE webchat_messages'));
    expect(web[0]).not.toMatch(/id_zalo_setting/);
  });

  it('tab kênh khoá nhánh nào thì KHÔNG chạy UPDATE của nhánh đó', async () => {
    db.query.mockResolvedValue({ rowCount: 2 });

    const result = await repo.markAllAsRead(1, { channel: 'web' });

    expect(result.updatedMessages).toBe(2);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/UPDATE webchat_messages/);

    db.query.mockClear();
    await repo.markAllAsRead(1, { channel: 'telegram' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/UPDATE channel_messages/);
    expect(db.query.mock.calls[0][0]).toMatch(/ch\.channel = \$3/);
  });

  it('chỉ đánh dấu tin KHÁCH chưa đọc, luôn gắn user', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });

    await repo.markAllAsRead(5, {});

    for (const [sql, params] of db.query.mock.calls) {
      expect(sql).toMatch(/role = 'visitor' AND [a-z]+\.is_read = false/);
      expect(sql).toMatch(/id_user = \$1/);
      expect(params[0]).toBe(5);
    }
  });
});
