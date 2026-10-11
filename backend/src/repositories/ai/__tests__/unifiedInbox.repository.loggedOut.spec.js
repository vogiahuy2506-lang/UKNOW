/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — hội thoại / tin của tài khoản Zalo `logged_out` bị ẨN ở MỌI đường đọc của Hộp thư.
 * Hình dạng SQL ở đây; hành vi trên Postgres thật: backend/tests/integration/zaloLogoutAnHoiThoai.test.js.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const inbox = (await import('../unifiedInbox.repository.js')).default;
const alerts = (await import('../../chatbot/chatbotContactAlert.repository.js')).default;
const digest = (await import('../../chatbot/chatbotDigest.repository.js')).default;
const zaloPersonal = (await import('../../chatbot/zaloPersonal.repository.js')).default;

const OWNER_CHANNELS = { telegram: null, whatsapp_baileys: null };
const NOT_EXISTS = /NOT EXISTS \(\s*SELECT 1 FROM zalo_settings zs_lo\s+WHERE zs_lo\.id = (\w+)\.id_zalo_setting AND zs_lo\.status = 'logged_out'\s*\)/g;
const flat = (sql) => sql.replace(/\s+/g, ' ');
/** Các alias hội thoại đã được bọc NOT EXISTS logged_out trong câu SQL. */
const hiddenAliases = (sql) => [...sql.matchAll(NOT_EXISTS)].map((m) => m[1]);

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('danh sách / đếm / đọc hết / kênh', () => {
  it('getConversations: lọc ở giai đoạn CHỌN TRANG (candidates), không phải lọc muộn làm trang ngắn đi', async () => {
    await inbox.getConversations(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS, limit: 20, offset: 0 });
    const sql = db.query.mock.calls[0][0];

    const candidates = sql.slice(sql.indexOf('WITH candidates AS'), sql.indexOf('page AS ('));
    expect(hiddenAliases(candidates)).toEqual(['zp']);
    // Nhánh ngoài (sau khi đã chọn trang) KHÔNG cần lọc lại.
    expect(hiddenAliases(sql.slice(sql.indexOf('page AS (')))).toEqual([]);
  });

  it('getConversationsCount lọc y hệt danh sách', async () => {
    await inbox.getConversationsCount(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zp']);
  });

  it('markAllAsRead: nhánh UPDATE Zalo không chạm tin của hội thoại đang ẩn', async () => {
    await inbox.markAllAsRead(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    const zaloUpdate = db.query.mock.calls.map(([sql]) => sql).find((sql) => /UPDATE zalo_personal_messages/.test(sql));
    expect(zaloUpdate).toBeTruthy();
    expect(hiddenAliases(zaloUpdate)).toEqual(['zp']);
  });

  it('getAvailableChannels: cả nhánh "có tài khoản" lẫn nhánh "có hội thoại" đều loại tài khoản đã đăng xuất', async () => {
    await inbox.getAvailableChannels(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    const sql = flat(db.query.mock.calls[0][0]);
    expect(sql).toContain("FROM zalo_settings WHERE id_user = $1 AND is_active = true AND COALESCE(zalo_settings.status, '') <> 'logged_out'");
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zalo_personal_conversations']);
  });

  it('getConversationById (zalo_personal): tài khoản đăng xuất → không khớp dòng nào (controller trả 404)', async () => {
    await inbox.getConversationById(1, 9, 'zalo_personal');
    expect(flat(db.query.mock.calls[0][0])).toContain("WHERE zp.id = $1 AND zp.id_user = $2 AND COALESCE(zs.status, '') <> 'logged_out'");
  });

  it('getUnreadConversationCount: vẫn chỉ tính zs.status = connected (đã loại logged_out từ trước, KHÔNG đổi)', async () => {
    await inbox.getUnreadConversationCount(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    expect(flat(db.query.mock.calls[0][0])).toContain("zs.status = 'connected'");
  });
});

describe('hộp thư đi (outbox) + gửi lại', () => {
  it('getOutboxMessages / getOutboxMessagesCount / getOutboxStatsByChannel (2 truy vấn con) lọc hội thoại đang ẩn', async () => {
    await inbox.getOutboxMessages(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zpc']);

    db.query.mockClear();
    await inbox.getOutboxMessagesCount(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zpc']);

    db.query.mockClear();
    await inbox.getOutboxStatsByChannel(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zpc', 'zpc']);
  });

  it('getOutboxMessageById: tin của tài khoản đăng xuất → "không tìm thấy"', async () => {
    await inbox.getOutboxMessageById(1, 5, { accessibleZaloAccountIds: null, accessibleChannelRefs: OWNER_CHANNELS });
    const zaloSql = db.query.mock.calls.map(([sql]) => sql).find((sql) => /FROM zalo_personal_messages zpm/.test(sql));
    expect(hiddenAliases(zaloSql)).toEqual(['zpc']);
  });

  it('findAgentMessageForRetry (zalo_personal): không gửi lại qua tài khoản đã đăng xuất', async () => {
    await inbox.findAgentMessageForRetry(1, 5, 'zalo_personal');
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zp']);
  });
});

describe('liên hệ khách để lại / báo cáo AI / bản tin tuần', () => {
  it('chatbotContactAlert.listForOwner: một điều kiện phủ cả danh sách, tổng và số chưa xử lý (zs LEFT JOIN ở cả ba)', async () => {
    await alerts.listForOwner(1, { accessibleZaloAccountIds: null, accessibleChannelRefs: { telegram: null, whatsapp_baileys: null } });
    expect(db.query).toHaveBeenCalledTimes(3);
    for (const [sql] of db.query.mock.calls) {
      expect(flat(sql)).toContain("COALESCE(zs.status, '') <> 'logged_out'");
      expect(sql).toMatch(/LEFT JOIN zalo_settings zs ON zs\.id = zc\.id_zalo_setting/);
    }
  });

  it('chatbotContactAlert.listPendingGroupedByUser: không email liên hệ của tài khoản đã đăng xuất', async () => {
    await alerts.listPendingGroupedByUser();
    expect(flat(db.query.mock.calls[0][0])).toContain("AND COALESCE(zs.status, '') <> 'logged_out'");
  });

  it('markHandled giữ nguyên (không lọc đăng xuất): đóng liên hệ vẫn làm được', async () => {
    await alerts.markHandled(3, 1, 1);
    expect(db.query.mock.calls[0][0]).not.toMatch(/logged_out/);
  });

  it('zaloPersonal.getAiActivityReport + countStaleAiPausedConversations (báo cáo hoạt động AI của Hộp thư)', async () => {
    await zaloPersonal.getAiActivityReport({ userId: 1, startIso: 'a', endIso: 'b', accessibleZaloAccountIds: null });
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['c']);

    db.query.mockClear();
    await zaloPersonal.countStaleAiPausedConversations(1, 24, { accessibleZaloAccountIds: null });
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zalo_personal_conversations']);
  });

  it('chatbotDigest: người nhận, thống kê Zalo, top hội thoại, AI tạm dừng quá 24h, liên hệ khách để lại — đều bỏ hội thoại đang ẩn', async () => {
    await digest.listDigestRecipients('weekly', { startIso: 'a', endIso: 'b' });
    expect(hiddenAliases(db.query.mock.calls[0][0])).toEqual(['zm']);

    db.query.mockClear();
    await digest.getDigestStats(1, { startIso: 'a', endIso: 'b' });
    const all = db.query.mock.calls.map(([sql]) => sql);
    const byFrom = (needle) => all.find((sql) => sql.includes(needle));
    // thống kê Zalo cá nhân (zaloPromise)
    expect(hiddenAliases(byFrom("COUNT(CASE WHEN m.metadata->>'source' = 'ai_auto_reply'"))).toEqual(['m']);
    // top 5 hội thoại: chỉ nhánh zalo_personal có NOT EXISTS
    expect(hiddenAliases(byFrom('WITH top_convs AS'))).toEqual(['c']);
    // AI tạm dừng quá 24h: chỉ vế zalo_personal_conversations
    expect(hiddenAliases(byFrom('AS count'))).toEqual(['zalo_personal_conversations']);
    // liên hệ khách để lại
    expect(hiddenAliases(byFrom('AS contacts_left'))).toEqual(['zc']);
  });
});
