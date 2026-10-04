/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — mọi truy vấn Hộp thư chạm hội thoại / tin Zalo cá nhân đều lọc theo
 * `accessibleZaloAccountIds`: `null` = chủ / super admin (không lọc, SQL và tham số y như cũ), mảng = nhân viên (chỉ tài
 * khoản được giao), mọi giá trị khác (thiếu / sai kiểu) = [] — HỎNG THÌ CHẶN.
 * (Kết quả trên Postgres thật: backend/tests/integration/inboxAccountAssignment.test.js.)
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const { default: repo } = await import('../unifiedInbox.repository.js');

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [] });
});

const ANY_SCOPE = /zp\.id_zalo_setting = ANY\(\$(\d+)::bigint\[\]\)/;

describe('getConversations / getConversationsCount — nhánh Zalo lọc theo tài khoản được giao', () => {
  it('nhân viên: mảng id vào tham số (không nối chuỗi), CHỈ nhánh zalo_personal có điều kiện', async () => {
    await repo.getConversations(1, { limit: 20, offset: 0, accessibleZaloAccountIds: [5, 9] });

    const [sql, params] = db.query.mock.calls[0];
    const match = sql.match(ANY_SCOPE);
    expect(match).not.toBeNull();
    expect(params[Number(match[1]) - 1]).toEqual([5, 9]);
    // Đúng MỘT chỗ trong câu (nhánh candidates của zalo_personal); channel / web không bị đụng.
    expect(sql.match(/ANY\(\$\d+::bigint\[\]\)/g)).toHaveLength(1);
    expect(sql).not.toContain('5, 9');
  });

  it('nhân viên chưa được giao gì ([]) → vẫn là điều kiện ANY với mảng rỗng (không thấy hội thoại Zalo nào), KHÔNG bỏ lọc', async () => {
    await repo.getConversations(1, { limit: 20, offset: 0, accessibleZaloAccountIds: [] });

    const [sql, params] = db.query.mock.calls[0];
    const match = sql.match(ANY_SCOPE);
    expect(match).not.toBeNull();
    expect(params[Number(match[1]) - 1]).toEqual([]);
  });

  it('CHỦ (null): SQL và tham số y như cũ — không có ANY, không tham số thừa', async () => {
    await repo.getConversations(1, { limit: 20, offset: 0, accessibleZaloAccountIds: null });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/ANY\(\$\d+::bigint\[\]\)/);
    expect(params).toEqual([1, 20, 0]);
  });

  it('HỎNG THÌ CHẶN: thiếu tham số / sai kiểu (undefined, chuỗi) → coi như [] chứ KHÔNG bỏ lọc', async () => {
    for (const bad of [undefined, 'null', 5, {}]) {
      db.query.mockClear();
      await repo.getConversations(1, { limit: 20, offset: 0, accessibleZaloAccountIds: bad });
      const [sql, params] = db.query.mock.calls[0];
      const match = sql.match(ANY_SCOPE);
      expect(match).not.toBeNull();
      expect(params[Number(match[1]) - 1]).toEqual([]);
    }
    db.query.mockClear();
    await repo.getConversations(1, { limit: 20, offset: 0 });
    expect(db.query.mock.calls[0][0]).toMatch(ANY_SCOPE);
  });

  it('id rác trong mảng bị loại, không phá câu lệnh', async () => {
    await repo.getConversations(1, { limit: 20, offset: 0, accessibleZaloAccountIds: [5, '7', 'abc', -1, 0, 1.5, null, 5] });

    const [sql, params] = db.query.mock.calls[0];
    const match = sql.match(ANY_SCOPE);
    expect(params[Number(match[1]) - 1]).toEqual([5, 7]);
  });

  it('zaloAccountId nhân viên gửi lên là AND với phạm vi được giao (id không được giao → rỗng, không lộ gì)', async () => {
    await repo.getConversations(1, { limit: 20, offset: 0, zaloAccountId: '77', accessibleZaloAccountIds: [5] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zp\.id_zalo_setting = \$4 AND zp\.id_zalo_setting = ANY\(\$5::bigint\[\]\)/);
    expect(params.slice(3)).toEqual([77, [5]]);
  });

  it('đếm tổng dùng CÙNG phạm vi với danh sách (không lệch nhau)', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '2' }] });
    await repo.getConversationsCount(1, { zaloAccountId: '5', accessibleZaloAccountIds: [5, 9] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zp\.id_zalo_setting = \$2 AND zp\.id_zalo_setting = ANY\(\$3::bigint\[\]\)/);
    expect(params).toEqual([1, 5, [5, 9]]);
    expect(sql.match(/ANY\(\$\d+::bigint\[\]\)/g)).toHaveLength(1);
  });

  it('đếm tổng cho CHỦ không có điều kiện phạm vi', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '2' }] });
    await repo.getConversationsCount(1, { accessibleZaloAccountIds: null });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/ANY\(\$\d+::bigint\[\]\)/);
    expect(params).toEqual([1]);
  });
});

describe('markAllAsRead — "đánh dấu tất cả đã đọc" không chạm tin của tài khoản chưa giao', () => {
  it('nhân viên: UPDATE bảng Zalo có ANY(phạm vi); UPDATE channel / web KHÔNG nhận tham số thừa', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    await repo.markAllAsRead(1, { accessibleZaloAccountIds: [5] });

    const calls = db.query.mock.calls;
    expect(calls).toHaveLength(3);
    const zaloCall = calls.find(([sql]) => /UPDATE zalo_personal_messages/.test(sql));
    expect(zaloCall[0]).toMatch(/zp\.id_zalo_setting = ANY\(\$3::bigint\[\]\)/);
    expect(zaloCall[1]).toEqual([1, expect.any(String), [5]]);
    for (const [sql, params] of calls.filter(([s]) => !/zalo_personal_messages/.test(s))) {
      expect(sql).not.toMatch(/ANY\(\$\d+::bigint\[\]\)/);
      expect(params).toHaveLength(2);
    }
  });

  it('nhân viên + tab "web": nhánh Zalo bị khoá bởi gate nên không có UPDATE Zalo nào', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    await repo.markAllAsRead(1, { channel: 'web', accessibleZaloAccountIds: [5] });

    expect(db.query.mock.calls.some(([sql]) => /UPDATE zalo_personal_messages/.test(sql))).toBe(false);
  });

  it('CHỦ (null): UPDATE Zalo y như cũ, 2 tham số', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    await repo.markAllAsRead(1, { accessibleZaloAccountIds: null });

    const zaloCall = db.query.mock.calls.find(([sql]) => /UPDATE zalo_personal_messages/.test(sql));
    expect(zaloCall[0]).not.toMatch(/ANY\(\$\d+::bigint\[\]\)/);
    expect(zaloCall[1]).toHaveLength(2);
  });

  it('HỎNG THÌ CHẶN: thiếu phạm vi → UPDATE Zalo vẫn có ANY với mảng rỗng', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    await repo.markAllAsRead(1, {});

    const zaloCall = db.query.mock.calls.find(([sql]) => /UPDATE zalo_personal_messages/.test(sql));
    expect(zaloCall[0]).toMatch(/zp\.id_zalo_setting = ANY\(\$3::bigint\[\]\)/);
    expect(zaloCall[1][2]).toEqual([]);
  });
});

describe('getUnreadConversationCount', () => {
  beforeEach(() => {
    db.query.mockResolvedValue({ rows: [{ total_unread: '3' }] });
  });

  it('nhân viên: chỉ đếm hội thoại của tài khoản được giao, AND với zaloAccountId đang chọn', async () => {
    await repo.getUnreadConversationCount(1, { zaloAccountId: '5', accessibleZaloAccountIds: [5, 9] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zp\.id_zalo_setting = \$2 AND zp\.id_zalo_setting = ANY\(\$3::bigint\[\]\)/);
    expect(params).toEqual([1, 5, [5, 9]]);
  });

  it('CHỦ (null): không điều kiện phạm vi; thiếu → chặn', async () => {
    await repo.getUnreadConversationCount(1, { accessibleZaloAccountIds: null });
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(\$\d+::bigint\[\]\)/);
    expect(db.query.mock.calls[0][1]).toEqual([1]);

    db.query.mockClear();
    await repo.getUnreadConversationCount(1, {});
    expect(db.query.mock.calls[0][0]).toMatch(/zp\.id_zalo_setting = ANY\(\$2::bigint\[\]\)/);
    expect(db.query.mock.calls[0][1]).toEqual([1, []]);
  });
});

describe('getAvailableChannels — tab Zalo cá nhân chỉ khi nhân viên được giao tài khoản', () => {
  it('nhân viên: điều kiện tồn tại tài khoản / hội thoại Zalo đều gắn ANY(phạm vi); tham số $2 là mảng', async () => {
    db.query.mockResolvedValue({ rows: [{ channel: 'zalo_personal' }] });
    const channels = await repo.getAvailableChannels(1, { accessibleZaloAccountIds: [5] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/FROM zalo_settings WHERE id_user = \$1 AND is_active = true AND id = ANY\(\$2::bigint\[\]\)/);
    expect(sql).toMatch(/FROM zalo_personal_conversations WHERE id_user = \$1 AND id_zalo_setting = ANY\(\$2::bigint\[\]\)/);
    expect(params).toEqual([1, [5]]);
    expect(channels).toEqual(['zalo_personal']);
  });

  it('CHỦ (null): câu lệnh và tham số y như cũ', async () => {
    await repo.getAvailableChannels(1, { accessibleZaloAccountIds: null });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/ANY\(\$2::bigint\[\]\)/);
    expect(params).toEqual([1]);
  });

  it('HỎNG THÌ CHẶN: thiếu phạm vi → ANY với mảng rỗng', async () => {
    await repo.getAvailableChannels(1);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/id = ANY\(\$2::bigint\[\]\)/);
    expect(params).toEqual([1, []]);
  });
});

describe('Hộp gửi đi (outbox)', () => {
  it('danh sách + đếm: nhánh Zalo có zpc.id_zalo_setting = ANY(phạm vi) và tham số đánh số đúng sau bộ lọc tìm kiếm', async () => {
    await repo.getOutboxMessages(1, { search: 'an', limit: 20, offset: 0, accessibleZaloAccountIds: [5] });
    const [sql, params] = db.query.mock.calls[0];
    const match = sql.match(/zpc\.id_zalo_setting = ANY\(\$(\d+)::bigint\[\]\)/);
    expect(match).not.toBeNull();
    expect(params[Number(match[1]) - 1]).toEqual([5]);
    expect(sql.match(/ANY\(\$\d+::bigint\[\]\)/g)).toHaveLength(1);

    db.query.mockClear();
    db.query.mockResolvedValue({ rows: [{ total: '0' }] });
    await repo.getOutboxMessagesCount(1, { search: 'an', accessibleZaloAccountIds: [5] });
    const [countSql, countParams] = db.query.mock.calls[0];
    const countMatch = countSql.match(/zpc\.id_zalo_setting = ANY\(\$(\d+)::bigint\[\]\)/);
    expect(countMatch).not.toBeNull();
    expect(countParams[Number(countMatch[1]) - 1]).toEqual([5]);
  });

  it('CHỦ (null): không điều kiện phạm vi; thiếu → chặn', async () => {
    await repo.getOutboxMessages(1, { limit: 20, offset: 0, accessibleZaloAccountIds: null });
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(\$\d+::bigint\[\]\)/);
    expect(db.query.mock.calls[0][1]).toEqual([1, 20, 0]);

    db.query.mockClear();
    await repo.getOutboxMessages(1, { limit: 20, offset: 0 });
    expect(db.query.mock.calls[0][0]).toMatch(/zpc\.id_zalo_setting = ANY\(\$4::bigint\[\]\)/);
    expect(db.query.mock.calls[0][1]).toEqual([1, 20, 0, []]);
  });

  it('thống kê theo kênh: tin gửi / đã đọc của Zalo chỉ tính tài khoản được giao; kênh khác giữ nguyên', async () => {
    await repo.getOutboxStatsByChannel(1, { accessibleZaloAccountIds: [5] });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql.match(/zpc\.id_zalo_setting = ANY\(\$2::bigint\[\]\)/g)).toHaveLength(2);
    expect(params).toEqual([1, [5]]);

    db.query.mockClear();
    await repo.getOutboxStatsByChannel(1, { accessibleZaloAccountIds: null });
    expect(db.query.mock.calls[0][0]).not.toMatch(/ANY\(\$2::bigint\[\]\)/);
    expect(db.query.mock.calls[0][1]).toEqual([1]);
  });

  it('chi tiết một tin gửi đi: truy vấn bảng Zalo có phạm vi; tin của tài khoản khác không khớp → rơi xuống "không tìm thấy"', async () => {
    const found = await repo.getOutboxMessageById(1, 99, { accessibleZaloAccountIds: [5] });

    expect(found).toBeNull();
    const zaloCall = db.query.mock.calls.find(([sql]) => /FROM zalo_personal_messages zpm/.test(sql));
    expect(zaloCall[0]).toMatch(/zpc\.id_zalo_setting = ANY\(\$3::bigint\[\]\)/);
    expect(zaloCall[1]).toEqual([99, 1, [5]]);

    db.query.mockClear();
    await repo.getOutboxMessageById(1, 99, { accessibleZaloAccountIds: null });
    const ownerZaloCall = db.query.mock.calls.find(([sql]) => /FROM zalo_personal_messages zpm/.test(sql));
    expect(ownerZaloCall[0]).not.toMatch(/ANY\(\$\d+::bigint\[\]\)/);
    expect(ownerZaloCall[1]).toEqual([99, 1]);
  });
});

describe('findAgentMessageForRetry — mang theo tài khoản của hội thoại để dịch vụ kiểm', () => {
  it('SELECT có id_zalo_setting của HỘI THOẠI (conversation_id_zalo_setting) bên cạnh của tin', async () => {
    await repo.findAgentMessageForRetry(1, 42, 'zalo_personal');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/zpm\.id_zalo_setting/);
    expect(sql).toMatch(/zp\.id_zalo_setting AS conversation_id_zalo_setting/);
  });
});
