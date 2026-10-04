/**
 * H-03 — số chưa đọc = số HỘI THOẠI 1-1 có tin chưa đọc trong phạm vi đang xem (không đếm tin, không tính nhóm,
 * không tính tài khoản Zalo hết phiên).  H-14 — "Hôm nay" tính theo ngày lịch Việt Nam.
 * (Câu SQL thật được kiểm trên Postgres ở backend/tests/integration/inboxHopThu.test.js.)
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const { default: repo, dateRangeStart } = await import('../unifiedInbox.repository.js');

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [{ total_unread: '29' }] });
});

describe('getUnreadConversationCount (H-03)', () => {
  it('đếm hội thoại bằng EXISTS tin khách chưa đọc, KHÔNG đếm số tin', async () => {
    const total = await repo.getUnreadConversationCount(1, { accessibleZaloAccountIds: null });

    expect(total).toBe(29);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/EXISTS \(\s*SELECT 1 FROM zalo_personal_messages zpm\s+WHERE zpm\.id_conversation = zp\.id AND zpm\.role = 'visitor' AND zpm\.is_read = false/);
    expect(sql).not.toMatch(/COUNT\(\*\) FROM zalo_personal_messages/);
    expect(sql).not.toMatch(/COUNT\(\*\) FROM webchat_messages/);
    expect(params).toEqual([1]);
  });

  it('không tính nhóm Zalo và chỉ tính tài khoản Zalo đang kết nối (C1, C6)', async () => {
    await repo.getUnreadConversationCount(1, { accessibleZaloAccountIds: null });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/zs\.status = 'connected'/);
    expect(sql).toMatch(/NOT \(COALESCE\(zp\.visitor_info->>'is_group', 'false'\) = 'true'\)/);
    // kết nối kênh đã tắt (Telegram/WhatsApp hết phiên) cũng không tính
    expect(sql).toMatch(/ch\.is_active = true/);
  });

  it('theo phạm vi: tab kênh + tài khoản Zalo đi vào tham số, không nối chuỗi', async () => {
    await repo.getUnreadConversationCount(7, { accessibleZaloAccountIds: null, channel: 'zalo_personal', zaloAccountId: '103' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zp\.id_zalo_setting = \$2/);
    expect(params).toEqual([7, 103]);
    // tab Zalo: nhánh channel + web bị khoá
    expect(sql.match(/AND 1=0/g)?.length).toBe(2);
  });

  it('tab Web chat: chỉ nhánh web được tính', async () => {
    await repo.getUnreadConversationCount(7, { accessibleZaloAccountIds: null, channel: 'web' });

    const [sql] = db.query.mock.calls[0];
    expect(sql.match(/AND 1=0/g)?.length).toBe(2);
  });

  it('tab Telegram: nhánh channel lọc theo ch.channel = $2 (tham số)', async () => {
    await repo.getUnreadConversationCount(7, { accessibleZaloAccountIds: null, channel: 'telegram' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/ch\.channel = \$2/);
    expect(params).toEqual([7, 'telegram']);
  });

  it('zaloAccountId rác không phá câu lệnh', async () => {
    await repo.getUnreadConversationCount(7, { accessibleZaloAccountIds: null, zaloAccountId: "1; DROP TABLE users" });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/DROP TABLE/);
    // parseInt('1; DROP…') = 1 → vẫn là một SỐ được bind, không phải chuỗi tự do
    expect(params).toEqual([7, 1]);
  });
});

describe('dateRangeStart (H-14)', () => {
  it('"today" bắt đầu lúc 00:00 giờ VN (= 17:00 UTC hôm trước), kể cả khi tiến trình chạy UTC', () => {
    // 09:00 giờ VN ngày 04/10 = 02:00 UTC cùng ngày. Bản cũ (giờ tiến trình = UTC) cho 00:00 UTC = 07:00 VN.
    const start = dateRangeStart('today', new Date('2026-10-04T02:00:00.000Z'));

    expect(start.toISOString()).toBe('2026-10-03T17:00:00.000Z');
  });

  it('trước 7 giờ sáng giờ VN, "Hôm nay" KHÔNG kéo cả chiều hôm qua vào', () => {
    // 03:30 giờ VN ngày 05/10 = 20:30 UTC ngày 04/10.
    const start = dateRangeStart('today', new Date('2026-10-04T20:30:00.000Z'));

    expect(start.toISOString()).toBe('2026-10-04T17:00:00.000Z');
  });

  it('sát nửa đêm giờ VN vẫn đúng ngày (23:59 VN ngày 04/10)', () => {
    const start = dateRangeStart('today', new Date('2026-10-04T16:59:00.000Z'));

    expect(start.toISOString()).toBe('2026-10-03T17:00:00.000Z');
  });

  it('7 ngày / 30 ngày là cửa sổ trượt từ lúc này; giá trị lạ → null', () => {
    const now = new Date('2026-10-04T02:00:00.000Z');

    expect(dateRangeStart('week', now).toISOString()).toBe('2026-09-27T02:00:00.000Z');
    expect(dateRangeStart('month', now).toISOString()).toBe('2026-09-04T02:00:00.000Z');
    expect(dateRangeStart('abc', now)).toBeNull();
  });
});
