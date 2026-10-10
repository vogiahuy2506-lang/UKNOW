/**
 * PLAN_GIAO_TK_TG_WA PR-H3 — mọi truy vấn Hộp thư chạm hội thoại / tin Telegram + WhatsApp lọc theo `accessibleChannelRefs`
 * (`{ telegram, whatsapp_baileys }`, mỗi kênh null = chủ / super admin, mảng = nhân viên, thiếu / sai kiểu = [] — HỎNG THÌ CHẶN).
 * Kết quả trên Postgres thật: backend/tests/integration/telegramWhatsappAssignmentH3.test.js.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: jest.fn() } }));

const db = (await import('../../../config/database.js')).default;
const { default: repo } = await import('../unifiedInbox.repository.js');

const OWNER = { telegram: null, whatsapp_baileys: null };
const EMP = { telegram: ['7'], whatsapp_baileys: ['1-mot'] };
const Z_NULL = { accessibleZaloAccountIds: null };
const CHANNEL_FILTER = /ch\.channel NOT IN \('telegram', 'whatsapp_baileys'\) OR \(ch\.channel = 'telegram' AND ch\.external_channel_id = ANY\(\$(\d+)::text\[\]\)\) OR \(ch\.channel = 'whatsapp_baileys' AND ch\.external_channel_id = ANY\(\$(\d+)::text\[\]\)\)/;

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [] });
});

const argsOf = (match, params) => [params[Number(match[1]) - 1], params[Number(match[2]) - 1]];

describe('getConversations / getConversationsCount / markAllAsRead — nhánh channel_conversations', () => {
  it('nhân viên: điều kiện trong nhánh channel của danh sách, mảng ref là tham số (không nối chuỗi)', async () => {
    await repo.getConversations(1, { ...Z_NULL, accessibleChannelRefs: EMP, limit: 20, offset: 0 });
    const [sql, params] = db.query.mock.calls[0];
    const match = sql.match(CHANNEL_FILTER);
    expect(match).not.toBeNull();
    expect(argsOf(match, params)).toEqual([['7'], ['1-mot']]);
    expect(sql.match(/ch\.external_channel_id = ANY/g)).toHaveLength(2); // đúng một lần cho mỗi kênh, ở nhánh channel
    expect(sql).not.toContain("'1-mot'");
  });

  it('đếm tổng dùng CÙNG phạm vi với danh sách', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '0' }] });
    await repo.getConversationsCount(1, { ...Z_NULL, accessibleChannelRefs: EMP });
    const [sql, params] = db.query.mock.calls[0];
    expect(argsOf(sql.match(CHANNEL_FILTER), params)).toEqual([['7'], ['1-mot']]);
  });

  it('CHỦ (null cả hai): SQL và tham số y như cũ — không điều kiện, không tham số thừa', async () => {
    await repo.getConversations(1, { ...Z_NULL, accessibleChannelRefs: OWNER, limit: 20, offset: 0 });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/external_channel_id = ANY/);
    expect(params).toEqual([1, 20, 0]);
  });

  it('HỎNG THÌ CHẶN: thiếu / sai kiểu phạm vi → ANY với mảng rỗng cho cả hai kênh', async () => {
    for (const bad of [undefined, 'all', { telegram: ['7'] }]) {
      db.query.mockClear();
      // eslint-disable-next-line no-await-in-loop
      await repo.getConversations(1, { ...Z_NULL, accessibleChannelRefs: bad, limit: 20, offset: 0 });
      const [sql, params] = db.query.mock.calls[0];
      const [tg, wa] = argsOf(sql.match(CHANNEL_FILTER), params);
      expect(tg).toEqual(bad && bad.telegram ? ['7'] : []);
      expect(wa).toEqual([]);
    }
  });

  it('tham số đánh số đúng khi có tab kênh + tìm kiếm + ngày (bộ lọc khác đi SAU phạm vi, không lệch $n)', async () => {
    await repo.getConversations(1, { ...Z_NULL, accessibleChannelRefs: EMP, channel: 'telegram', search: 'an', status: 'active', limit: 20, offset: 0 });
    const [sql, params] = db.query.mock.calls[0];
    const match = sql.match(CHANNEL_FILTER);
    expect(argsOf(match, params)).toEqual([['7'], ['1-mot']]);
    // Mọi $n trong câu lệnh đều có tham số tương ứng.
    const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...used)).toBeLessThanOrEqual(params.length);
  });

  it('markAllAsRead: chỉ câu UPDATE channel có điều kiện; UPDATE Zalo / web KHÔNG nhận tham số thừa', async () => {
    await repo.markAllAsRead(1, { ...Z_NULL, accessibleChannelRefs: EMP });
    const calls = db.query.mock.calls;
    const channelCall = calls.find(([sql]) => /UPDATE channel_messages/.test(sql));
    expect(argsOf(channelCall[0].match(CHANNEL_FILTER), channelCall[1])).toEqual([['7'], ['1-mot']]);
    const zaloCall = calls.find(([sql]) => /UPDATE zalo_personal_messages/.test(sql));
    expect(zaloCall[0]).not.toMatch(/external_channel_id/);
    expect(zaloCall[1]).toHaveLength(2);
    const webCall = calls.find(([sql]) => /UPDATE webchat_messages/.test(sql));
    expect(webCall[1]).toHaveLength(2);
  });
});

describe('getUnreadConversationCount', () => {
  it('nhân viên: chỉ đếm hội thoại Telegram / WhatsApp của tài khoản được giao', async () => {
    db.query.mockResolvedValue({ rows: [{ total_unread: '0' }] });
    await repo.getUnreadConversationCount(1, { ...Z_NULL, accessibleChannelRefs: EMP });
    const [sql, params] = db.query.mock.calls[0];
    expect(argsOf(sql.match(CHANNEL_FILTER), params)).toEqual([['7'], ['1-mot']]);
  });

  it('CHỦ: không điều kiện; thiếu phạm vi → chặn', async () => {
    db.query.mockResolvedValue({ rows: [{ total_unread: '0' }] });
    await repo.getUnreadConversationCount(1, { ...Z_NULL, accessibleChannelRefs: OWNER });
    expect(db.query.mock.calls[0][0]).not.toMatch(/external_channel_id = ANY/);
    db.query.mockClear();
    await repo.getUnreadConversationCount(1, { ...Z_NULL });
    const [sql, params] = db.query.mock.calls[0];
    expect(argsOf(sql.match(CHANNEL_FILTER), params)).toEqual([[], []]);
  });
});

describe('getAvailableChannels — tab Telegram / WhatsApp', () => {
  it('nhân viên: cả hai nhánh (kết nối, hội thoại) gắn điều kiện phạm vi; tham số là mảng', async () => {
    await repo.getAvailableChannels(1, { ...Z_NULL, accessibleChannelRefs: EMP });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql.match(/external_channel_id = ANY/g)).toHaveLength(4); // 2 nhánh x 2 kênh
    expect(params).toEqual([1, ['7'], ['1-mot']]);
  });

  it('CHỦ: câu lệnh và tham số y như cũ; thiếu phạm vi → chặn (mảng rỗng)', async () => {
    await repo.getAvailableChannels(1, { ...Z_NULL, accessibleChannelRefs: OWNER });
    expect(db.query.mock.calls[0][0]).not.toMatch(/external_channel_id = ANY/);
    expect(db.query.mock.calls[0][1]).toEqual([1]);
    db.query.mockClear();
    await repo.getAvailableChannels(1, { ...Z_NULL });
    expect(db.query.mock.calls[0][1]).toEqual([1, [], []]);
  });
});

describe('Hộp gửi đi (outbox)', () => {
  it('danh sách + đếm: nhánh channel_messages có điều kiện phạm vi; số $n đúng sau bộ lọc tìm kiếm', async () => {
    await repo.getOutboxMessages(1, { ...Z_NULL, accessibleChannelRefs: EMP, search: 'an', limit: 20, offset: 0 });
    let [sql, params] = db.query.mock.calls[0];
    expect(argsOf(sql.match(CHANNEL_FILTER), params)).toEqual([['7'], ['1-mot']]);

    db.query.mockClear();
    db.query.mockResolvedValue({ rows: [{ total: '0' }] });
    await repo.getOutboxMessagesCount(1, { ...Z_NULL, accessibleChannelRefs: EMP, search: 'an' });
    [sql, params] = db.query.mock.calls[0];
    expect(argsOf(sql.match(CHANNEL_FILTER), params)).toEqual([['7'], ['1-mot']]);
  });

  it('CHỦ: không điều kiện; thiếu → chặn', async () => {
    await repo.getOutboxMessages(1, { ...Z_NULL, accessibleChannelRefs: OWNER, limit: 20, offset: 0 });
    expect(db.query.mock.calls[0][1]).toEqual([1, 20, 0]);
    db.query.mockClear();
    await repo.getOutboxMessages(1, { ...Z_NULL, limit: 20, offset: 0 });
    expect(db.query.mock.calls[0][1]).toEqual([1, 20, 0, [], []]);
  });

  it('thống kê theo kênh: mỗi dòng Telegram / WhatsApp là MỘT kết nối — lọc theo alias cc', async () => {
    await repo.getOutboxStatsByChannel(1, { ...Z_NULL, accessibleChannelRefs: EMP });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/FROM channel_connections cc\s+WHERE cc\.id_user = \$1 AND \(cc\.channel NOT IN/);
    expect(params).toEqual([1, ['7'], ['1-mot']]);
  });

  it('chi tiết một tin: id tin của tài khoản chưa giao không khớp dòng nào (rơi xuống "không tìm thấy")', async () => {
    await repo.getOutboxMessageById(1, 99, { ...Z_NULL, accessibleChannelRefs: EMP });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/FROM channel_messages cm/);
    expect(argsOf(sql.match(CHANNEL_FILTER), params)).toEqual([['7'], ['1-mot']]);
    expect(params.slice(0, 2)).toEqual([99, 1]);
  });
});

describe('getConversationById / findAgentMessageForRetry trả khoá tài khoản để service kiểm', () => {
  it('SELECT lấy ch.external_channel_id AS channel_external_id (hội thoại và tin gửi lại)', async () => {
    await repo.getConversationById(1, 5, 'channel');
    expect(db.query.mock.calls[0][0]).toMatch(/ch\.external_channel_id AS channel_external_id/);
    db.query.mockClear();
    await repo.findAgentMessageForRetry(1, 42, 'channel');
    expect(db.query.mock.calls[0][0]).toMatch(/ch\.external_channel_id AS channel_external_id/);
  });
});
