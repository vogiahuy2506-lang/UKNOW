/**
 * Hộp thư (RA_SOAT_3_MAN 04/10/2026) chạy trên Postgres THẬT — các câu SQL đi qua unit test chỉ được kiểm hình dạng,
 * ở đây kiểm kết quả: H-01 (phân trang tin theo (created_at, id), đánh dấu đọc từ một tin), H-03 (số chưa đọc = số
 * hội thoại 1-1, không nhóm, không tài khoản hết phiên), H-14 (lọc "Hôm nay" theo ngày lịch VN).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { default: repo } = await import('../../src/repositories/ai/unifiedInbox.repository.js');
const { getVietnamDayRange } = await import('../../src/utils/vnTimeFormat.util.js');

let app;
beforeAll(() => { app = createApp(); });
beforeEach(async () => { await truncateAll(); });

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function seedZaloAccount(userId, { status = 'connected', name = 'Zalo' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id`,
    [userId, name, status]
  );
  return Number(rows[0].id);
}

async function seedZaloConversation(userId, zaloSettingId, { externalId, name, isGroup = false, lastMessageAt = null } = {}) {
  const visitorInfo = isGroup ? { is_group: true, group_id: externalId, group_name: name } : {};
  const { rows } = await db.query(
    `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, visitor_info, last_message_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, NOW())) RETURNING id`,
    [userId, zaloSettingId, externalId, name, JSON.stringify(visitorInfo), lastMessageAt]
  );
  return Number(rows[0].id);
}

async function seedZaloMessage(userId, zaloSettingId, conversationId, { role = 'visitor', isRead = false, createdAt = null, content = 'tin' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, is_read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW())) RETURNING id`,
    [conversationId, userId, zaloSettingId, role, content, isRead, createdAt]
  );
  return Number(rows[0].id);
}

async function seedWebchatConversation(userId, { name = 'Khách web', unread = 1 } = {}) {
  const { rows: widget } = await db.query(
    `INSERT INTO web_widget_configs (id_user, widget_key, display_name) VALUES ($1, $2, 'Widget') RETURNING id`,
    [userId, `k_${Date.now()}_${Math.floor(Math.random() * 1e6)}`]
  );
  const { rows } = await db.query(
    `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, widget[0].id, `s_${Math.floor(Math.random() * 1e9)}`, name]
  );
  const convId = Number(rows[0].id);
  for (let i = 0; i < unread; i += 1) {
    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, is_read) VALUES ($1, $2, 'visitor', 'hi', false)`,
      [convId, userId]
    );
  }
  return convId;
}

describe('H-03 — số chưa đọc = số hội thoại 1-1 có tin chưa đọc', () => {
  async function setup() {
    const user = await createUser({ username: `own${Date.now()}` });
    const connected = await seedZaloAccount(user.id, { status: 'connected', name: 'Đang kết nối' });
    const expired = await seedZaloAccount(user.id, { status: 'needs_reauth', name: 'Hết phiên' });

    // Tài khoản đang kết nối: 2 hội thoại 1-1 có tin chưa đọc (3 + 1 tin), 1 đã đọc hết, 1 nhóm 5 tin chưa đọc.
    const p1 = await seedZaloConversation(user.id, connected, { externalId: 'u1', name: 'Hải' });
    for (let i = 0; i < 3; i += 1) await seedZaloMessage(user.id, connected, p1);
    const p2 = await seedZaloConversation(user.id, connected, { externalId: 'u2', name: 'Lan' });
    await seedZaloMessage(user.id, connected, p2);
    const p3 = await seedZaloConversation(user.id, connected, { externalId: 'u3', name: 'Đã đọc hết' });
    await seedZaloMessage(user.id, connected, p3, { isRead: true });
    await seedZaloMessage(user.id, connected, p3, { role: 'agent', isRead: false });
    const g1 = await seedZaloConversation(user.id, connected, { externalId: 'group_1', name: 'Nhóm A', isGroup: true });
    for (let i = 0; i < 5; i += 1) await seedZaloMessage(user.id, connected, g1);

    // Tài khoản hết phiên: 1 hội thoại 1-1 (3 tin) + 1 nhóm — không được tính.
    const p4 = await seedZaloConversation(user.id, expired, { externalId: 'u4', name: 'Cũ' });
    for (let i = 0; i < 3; i += 1) await seedZaloMessage(user.id, expired, p4);
    const g2 = await seedZaloConversation(user.id, expired, { externalId: 'group_2', name: 'Nhóm B', isGroup: true });
    await seedZaloMessage(user.id, expired, g2);

    await seedWebchatConversation(user.id, { unread: 2 });
    return { user, connected, expired };
  }

  it('đếm HỘI THOẠI (không đếm tin), bỏ nhóm và tài khoản hết phiên: 2 Zalo 1-1 + 1 Web chat = 3', async () => {
    const { user } = await setup();

    expect(await repo.getUnreadConversationCount(user.id, { accessibleZaloAccountIds: null })).toBe(3);
  });

  it('theo phạm vi: tab Zalo / tab Web / một tài khoản cụ thể', async () => {
    const { user, connected, expired } = await setup();

    expect(await repo.getUnreadConversationCount(user.id, { accessibleZaloAccountIds: null, channel: 'zalo_personal' })).toBe(2);
    expect(await repo.getUnreadConversationCount(user.id, { accessibleZaloAccountIds: null, channel: 'web' })).toBe(1);
    expect(await repo.getUnreadConversationCount(user.id, { accessibleZaloAccountIds: null, channel: 'zalo_personal', zaloAccountId: connected })).toBe(2);
    // tài khoản hết phiên: Zalo = 0
    expect(await repo.getUnreadConversationCount(user.id, { accessibleZaloAccountIds: null, channel: 'zalo_personal', zaloAccountId: expired })).toBe(0);
    // "Tất cả" + tài khoản hết phiên: chỉ còn Web chat
    expect(await repo.getUnreadConversationCount(user.id, { accessibleZaloAccountIds: null, zaloAccountId: expired })).toBe(1);
  });

  it('không rò sang user khác', async () => {
    const { user } = await setup();
    const other = await createUser({ username: `other${Date.now()}` });

    expect(await repo.getUnreadConversationCount(other.id, { accessibleZaloAccountIds: null })).toBe(0);
    expect(await repo.getUnreadConversationCount(user.id, { accessibleZaloAccountIds: null })).toBe(3);
  });

  it('API: GET /inbox/unread-count trả { total, unit } theo phạm vi query', async () => {
    const { user, connected } = await setup();
    const token = await loginAs(user);

    const all = await request(app).get('/api/ai/chatbot/inbox/unread-count').set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.data).toEqual({ total: 3, unit: 'conversations' });

    const scoped = await request(app)
      .get('/api/ai/chatbot/inbox/unread-count')
      .query({ channel: 'zalo_personal', zaloAccountId: connected })
      .set('Authorization', `Bearer ${token}`);
    expect(scoped.body.data.total).toBe(2);
  });
});

describe('H-01 — khung đọc: phân trang theo (created_at, id) và đánh dấu đọc từ một tin', () => {
  it('3 trang liên tiếp 50 + 50 + 20 tin: không trùng, không sót, hasMore đúng, thứ tự cũ → mới', async () => {
    const user = await createUser({ username: `own${Date.now()}` });
    const zs = await seedZaloAccount(user.id);
    const conv = await seedZaloConversation(user.id, zs, { externalId: 'u1', name: 'Dài' });
    const base = Date.parse('2026-10-01T00:00:00Z');
    for (let i = 0; i < 120; i += 1) {
      await seedZaloMessage(user.id, zs, conv, { createdAt: new Date(base + i * 60_000).toISOString(), content: `tin ${i}` });
    }
    const token = await loginAs(user);
    const get = (before) => request(app)
      .get(`/api/ai/chatbot/inbox/conversations/${conv}/messages`)
      .query({ type: 'zalo_personal', limit: 50, ...(before ? { before } : {}) })
      .set('Authorization', `Bearer ${token}`);

    const p1 = await get();
    expect(p1.body.data).toHaveLength(50);
    expect(p1.body.hasMore).toBe(true);
    expect(p1.body.data[49].content).toBe('tin 119');
    expect(p1.body.data[0].content).toBe('tin 70');

    const p2 = await get(p1.body.data[0].id);
    expect(p2.body.data).toHaveLength(50);
    expect(p2.body.hasMore).toBe(true);
    expect(p2.body.data[49].content).toBe('tin 69');

    const p3 = await get(p2.body.data[0].id);
    expect(p3.body.data).toHaveLength(20);
    expect(p3.body.hasMore).toBe(false);
    expect(p3.body.data[0].content).toBe('tin 0');

    const ids = [...p3.body.data, ...p2.body.data, ...p1.body.data].map((m) => String(m.id));
    expect(new Set(ids).size).toBe(120);
  });

  it('tin kéo lịch sử về sau (id LỚN nhưng created_at CŨ) vẫn nằm đúng chỗ — `id < before` sẽ làm mất nó', async () => {
    const user = await createUser({ username: `own${Date.now()}` });
    const zs = await seedZaloAccount(user.id);
    const conv = await seedZaloConversation(user.id, zs, { externalId: 'u1', name: 'Lịch sử' });
    const now = Date.now();
    const idRecent = await seedZaloMessage(user.id, zs, conv, { createdAt: new Date(now - 5 * 60_000).toISOString(), content: 'mới' });
    const idMiddle = await seedZaloMessage(user.id, zs, conv, { createdAt: new Date(now - 10 * 60_000).toISOString(), content: 'giữa' });
    const idSynced = await seedZaloMessage(user.id, zs, conv, { createdAt: new Date(now - 20 * 60_000).toISOString(), content: 'kéo về sau, cũ nhất' });
    expect(idSynced).toBeGreaterThan(idMiddle);
    expect(idMiddle).toBeGreaterThan(idRecent);

    const older = await repo.getMessages(conv, 'zalo_personal', { limit: 5, beforeId: idMiddle });

    expect(older.messages.map((m) => m.content)).toEqual(['kéo về sau, cũ nhất']);
    expect(older.hasMore).toBe(false);
  });

  it('markAsRead(fromMessageId): chỉ tin từ mốc đó trở về sau được đánh dấu, tin cũ hơn chưa tải giữ chưa đọc', async () => {
    const user = await createUser({ username: `own${Date.now()}` });
    const zs = await seedZaloAccount(user.id);
    const conv = await seedZaloConversation(user.id, zs, { externalId: 'g1', name: 'Nhóm', isGroup: true });
    const t0 = Date.now();
    const m1 = await seedZaloMessage(user.id, zs, conv, { createdAt: new Date(t0 - 30 * 60_000).toISOString() });
    const m2 = await seedZaloMessage(user.id, zs, conv, { createdAt: new Date(t0 - 20 * 60_000).toISOString() });
    const m3 = await seedZaloMessage(user.id, zs, conv, { createdAt: new Date(t0 - 10 * 60_000).toISOString() });
    const token = await loginAs(user);

    const res = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${conv}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'zalo_personal', fromMessageId: m2 });

    expect(res.status).toBe(200);
    expect(res.body.data.remainingUnread).toBe(1);
    const { rows } = await db.query(`SELECT id, is_read FROM zalo_personal_messages WHERE id_conversation = $1 ORDER BY id`, [conv]);
    expect(rows.map((r) => [Number(r.id), r.is_read])).toEqual([[m1, false], [m2, true], [m3, true]]);

    // Không gửi fromMessageId (client cũ): đánh dấu hết như trước.
    const all = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${conv}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'zalo_personal' });
    expect(all.body.data.remainingUnread).toBe(0);
  });

  it('mốc fromMessageId thuộc hội thoại KHÁC không đánh dấu gì (không rò chéo hội thoại)', async () => {
    const user = await createUser({ username: `own${Date.now()}` });
    const zs = await seedZaloAccount(user.id);
    const convA = await seedZaloConversation(user.id, zs, { externalId: 'a', name: 'A' });
    const convB = await seedZaloConversation(user.id, zs, { externalId: 'b', name: 'B' });
    const mA = await seedZaloMessage(user.id, zs, convA);
    await seedZaloMessage(user.id, zs, convB);

    const result = await repo.markAsRead(convB, 'zalo_personal', { fromMessageId: mA });

    // Mốc không tìm thấy trong hội thoại B → so sánh với NULL → không dòng nào được đánh dấu.
    expect(result.remainingUnread).toBe(1);
  });
});

describe('H-14 — lọc "Hôm nay" theo ngày lịch Việt Nam', () => {
  it('tin lúc 00:01 giờ VN thuộc "Hôm nay", tin lúc 23:59 hôm qua thì không', async () => {
    const user = await createUser({ username: `own${Date.now()}` });
    const zs = await seedZaloAccount(user.id);
    const startVn = getVietnamDayRange().startUtc.getTime();
    const todayConv = await seedZaloConversation(user.id, zs, {
      externalId: 'today', name: 'Hôm nay', lastMessageAt: new Date(startVn + 60_000).toISOString(),
    });
    await seedZaloConversation(user.id, zs, {
      externalId: 'yesterday', name: 'Hôm qua', lastMessageAt: new Date(startVn - 60_000).toISOString(),
    });

    const list = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, date: 'today', limit: 20, offset: 0 });
    const total = await repo.getConversationsCount(user.id, { accessibleZaloAccountIds: null, date: 'today' });

    expect(list.map((c) => Number(c.id))).toEqual([todayConv]);
    expect(total).toBe(1);
  });
});

describe('H-06 / H-13 / H-33 — danh sách: chọn trang trước, chip lọc phía server, tìm không dấu', () => {
  /** 3 Zalo (1 nhóm) + 2 Web chat xen kẽ thời gian: web1 > zaloA > nhóm > web2 > zaloB. */
  async function seedMixed() {
    const user = await createUser({ username: `own${Date.now()}` });
    const zs = await seedZaloAccount(user.id, { status: 'connected', name: 'TK' });
    const t = Date.now();
    const at = (minutesAgo) => new Date(t - minutesAgo * 60_000).toISOString();

    const web1 = await seedWebchatConversation(user.id, { name: 'Khách web 1', unread: 0 });
    const zaloA = await seedZaloConversation(user.id, zs, { externalId: 'ua', name: 'Nguyễn Văn Đức', lastMessageAt: at(20) });
    const group = await seedZaloConversation(user.id, zs, { externalId: 'group_9', name: 'PHÒNG RD 2', isGroup: true, lastMessageAt: at(30) });
    const web2 = await seedWebchatConversation(user.id, { name: 'Khách web 2', unread: 2 });
    const zaloB = await seedZaloConversation(user.id, zs, { externalId: 'ub', name: 'Trần Lan', lastMessageAt: at(50) });
    // Ép last_message_at của web theo kịch bản.
    await db.query(`UPDATE webchat_conversations SET last_message_at = $2 WHERE id = $1`, [web1, at(10)]);
    await db.query(`UPDATE webchat_conversations SET last_message_at = $2 WHERE id = $1`, [web2, at(40)]);

    // Tin cuối: ảnh Zalo lưu dạng JSON trong content + msg_type_raw; nhóm có người gửi.
    await db.query(
      `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, is_read, metadata, created_at)
       VALUES ($1, $2, $3, 'visitor', $4, false, $5::jsonb, $6)`,
      [zaloA, user.id, zs, JSON.stringify({ title: '', href: 'https://photo.zdn.vn/x.jpg' }),
        JSON.stringify({ msg_type_raw: 'chat.photo' }), at(20)]
    );
    await db.query(
      `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, is_read, metadata, created_at)
       VALUES ($1, $2, $3, 'visitor', 'Dạ chạy được', false, $4::jsonb, $5)`,
      [group, user.id, zs, JSON.stringify({ sender_name: 'Hải' }), at(30)]
    );
    await seedZaloMessage(user.id, zs, zaloB, { isRead: true, createdAt: at(50) });
    return { user, ids: { web1, zaloA, group, web2, zaloB } };
  }

  const idsOf = (rows) => rows.map((r) => `${r.type}:${Number(r.id)}`);

  it('trộn 3 bảng đúng thứ tự thời gian và phân trang liền mạch (không trùng, không sót)', async () => {
    const { user, ids } = await seedMixed();
    const expected = [
      `webchat:${ids.web1}`, `zalo_personal:${ids.zaloA}`, `zalo_personal:${ids.group}`,
      `webchat:${ids.web2}`, `zalo_personal:${ids.zaloB}`,
    ];

    const all = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, limit: 20, offset: 0 });
    const p1 = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, limit: 2, offset: 0 });
    const p2 = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, limit: 2, offset: 2 });
    const p3 = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, limit: 2, offset: 4 });

    expect(idsOf(all)).toEqual(expected);
    expect([...idsOf(p1), ...idsOf(p2), ...idsOf(p3)]).toEqual(expected);
    expect(await repo.getConversationsCount(user.id, { accessibleZaloAccountIds: null,})).toBe(5);
  });

  it('tin cuối trả mã loại + người gửi + số chưa đọc đúng cho từng dòng của trang', async () => {
    const { user, ids } = await seedMixed();

    const rows = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, limit: 20, offset: 0 });
    const byId = new Map(rows.map((r) => [`${r.type}:${Number(r.id)}`, r]));

    const photo = byId.get(`zalo_personal:${ids.zaloA}`);
    expect(photo.lastMessageRawType).toBe('chat.photo');
    expect(JSON.parse(photo.lastMessage).href).toBe('https://photo.zdn.vn/x.jpg');
    expect(photo.unreadCount).toBe(1);

    const grp = byId.get(`zalo_personal:${ids.group}`);
    expect(grp.isGroup).toBe(true);
    expect(grp.lastMessage).toBe('Dạ chạy được');
    expect(grp.lastMessageSender).toBe('Hải');

    expect(byId.get(`webchat:${ids.web2}`).unreadCount).toBe(2);
    expect(byId.get(`zalo_personal:${ids.zaloB}`).unreadCount).toBe(0);
  });

  it('chip lọc phía server: Cá nhân / Nhóm / Chưa đọc, tổng khớp danh sách', async () => {
    const { user, ids } = await seedMixed();

    const group = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, kind: 'group', limit: 20, offset: 0 });
    expect(idsOf(group)).toEqual([`zalo_personal:${ids.group}`]);
    expect(await repo.getConversationsCount(user.id, { accessibleZaloAccountIds: null, kind: 'group' })).toBe(1);

    const personal = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, kind: 'personal', limit: 20, offset: 0 });
    expect(idsOf(personal)).toEqual([
      `webchat:${ids.web1}`, `zalo_personal:${ids.zaloA}`, `webchat:${ids.web2}`, `zalo_personal:${ids.zaloB}`,
    ]);

    const unread = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, unreadOnly: true, limit: 20, offset: 0 });
    expect(idsOf(unread)).toEqual([`zalo_personal:${ids.zaloA}`, `zalo_personal:${ids.group}`, `webchat:${ids.web2}`]);
    expect(await repo.getConversationsCount(user.id, { accessibleZaloAccountIds: null, unreadOnly: true })).toBe(3);

    const personalUnread = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, kind: 'personal', unreadOnly: true, limit: 20, offset: 0 });
    expect(idsOf(personalUnread)).toEqual([`zalo_personal:${ids.zaloA}`, `webchat:${ids.web2}`]);
  });

  it('tìm không dấu, không phân biệt hoa thường: "nguyen" và "NGUYỄN" ra Nguyễn Văn Đức; "duc" ra cả tên có Đ', async () => {
    const { user, ids } = await seedMixed();

    for (const term of ['nguyen', 'NGUYỄN', 'Nguyễn Văn', 'duc']) {
      const rows = await repo.getConversations(user.id, { accessibleZaloAccountIds: null, search: term, limit: 20, offset: 0 });
      expect(idsOf(rows)).toEqual([`zalo_personal:${ids.zaloA}`]);
      expect(await repo.getConversationsCount(user.id, { accessibleZaloAccountIds: null, search: term })).toBe(1);
    }
    expect(idsOf(await repo.getConversations(user.id, { accessibleZaloAccountIds: null, search: 'phong rd', limit: 20, offset: 0 })))
      .toEqual([`zalo_personal:${ids.group}`]);
    expect(await repo.getConversationsCount(user.id, { accessibleZaloAccountIds: null, search: 'khong co ten nay' })).toBe(0);
  });

  it('API: GET /inbox/conversations nhận kind + unreadOnly và trả các trường xem trước mới', async () => {
    const { user, ids } = await seedMixed();
    const token = await loginAs(user);

    const res = await request(app)
      .get('/api/ai/chatbot/inbox/conversations')
      .query({ kind: 'personal', unreadOnly: 'true', search: 'nguyen' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.conversations).toHaveLength(1);
    expect(Number(res.body.data.conversations[0].id)).toBe(ids.zaloA);
    expect(res.body.data.conversations[0].lastMessageRawType).toBe('chat.photo');
    expect(res.body.data.unreadByChannel).toBeUndefined();
  });
});

describe('H-12 — tab kênh chỉ hiện kênh user có; C5 — Đánh dấu tất cả đã đọc theo bộ lọc', () => {
  it('GET /inbox/channels: chỉ kênh có kết nối/tài khoản/hội thoại, đúng thứ tự, KHÔNG có Facebook', async () => {
    const user = await createUser({ username: `own${Date.now()}` });
    const token = await loginAs(user);
    const get = async () => (await request(app).get('/api/ai/chatbot/inbox/channels').set('Authorization', `Bearer ${token}`)).body.data.channels;

    expect(await get()).toEqual([]);

    await seedZaloAccount(user.id, { status: 'needs_reauth' });
    await seedWebchatConversation(user.id, { unread: 0 });
    await db.query(
      `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name) VALUES ($1, 'facebook', 'fb1', 'FB')`,
      [user.id]
    );
    expect(await get()).toEqual(['web', 'zalo_personal']);

    await db.query(
      `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name) VALUES ($1, 'telegram', 'tg1', 'TG')`,
      [user.id]
    );
    expect(await get()).toEqual(['web', 'zalo_personal', 'telegram']);
  });

  async function seedScope() {
    const user = await createUser({ username: `own${Date.now()}` });
    const zs = await seedZaloAccount(user.id);
    const personal = await seedZaloConversation(user.id, zs, { externalId: 'u1', name: 'Hải' });
    const group = await seedZaloConversation(user.id, zs, { externalId: 'group_1', name: 'Nhóm', isGroup: true });
    for (let i = 0; i < 3; i += 1) await seedZaloMessage(user.id, zs, personal);
    for (let i = 0; i < 5; i += 1) await seedZaloMessage(user.id, zs, group);
    const web = await seedWebchatConversation(user.id, { unread: 2 });
    const other = await createUser({ username: `other${Date.now()}` });
    const ozs = await seedZaloAccount(other.id);
    const oconv = await seedZaloConversation(other.id, ozs, { externalId: 'o1', name: 'Của người khác' });
    await seedZaloMessage(other.id, ozs, oconv);
    return { user, zs, personal, group, web, other };
  }

  const unreadOf = async (table, convId) => Number((await db.query(
    `SELECT COUNT(*) AS n FROM ${table} WHERE id_conversation = $1 AND role = 'visitor' AND is_read = false`, [convId]
  )).rows[0].n);

  it('không bộ lọc: đánh dấu mọi hội thoại của user (cả nhóm), không đụng user khác', async () => {
    const { user, personal, group, web, other } = await seedScope();
    const token = await loginAs(user);

    const res = await request(app).post('/api/ai/chatbot/inbox/read-all').set('Authorization', `Bearer ${token}`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.updatedMessages).toBe(3 + 5 + 2);
    expect(await unreadOf('zalo_personal_messages', personal)).toBe(0);
    expect(await unreadOf('zalo_personal_messages', group)).toBe(0);
    expect(await unreadOf('webchat_messages', web)).toBe(0);
    const otherUnread = Number((await db.query(
      `SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_user = $1 AND is_read = false`, [other.id]
    )).rows[0].n);
    expect(otherUnread).toBe(1);
  });

  it('theo bộ lọc đang xem: kind=group chỉ đánh dấu nhóm; channel=web chỉ đánh dấu Web chat', async () => {
    const { user, personal, group, web } = await seedScope();
    const token = await loginAs(user);

    const g = await request(app).post('/api/ai/chatbot/inbox/read-all').set('Authorization', `Bearer ${token}`).send({ kind: 'group' });
    expect(g.body.data.updatedMessages).toBe(5);
    expect(await unreadOf('zalo_personal_messages', group)).toBe(0);
    expect(await unreadOf('zalo_personal_messages', personal)).toBe(3);
    expect(await unreadOf('webchat_messages', web)).toBe(2);

    const w = await request(app).post('/api/ai/chatbot/inbox/read-all').set('Authorization', `Bearer ${token}`).send({ channel: 'web' });
    expect(w.body.data.updatedMessages).toBe(2);
    expect(await unreadOf('webchat_messages', web)).toBe(0);
    expect(await unreadOf('zalo_personal_messages', personal)).toBe(3);
  });

  it('tài khoản Zalo cụ thể: chỉ hội thoại của tài khoản đó', async () => {
    const { user, zs, personal } = await seedScope();
    const zs2 = await seedZaloAccount(user.id, { name: 'TK2' });
    const c2 = await seedZaloConversation(user.id, zs2, { externalId: 'x', name: 'Khác TK' });
    await seedZaloMessage(user.id, zs2, c2);

    const result = await repo.markAllAsRead(user.id, { accessibleZaloAccountIds: null, zaloAccountId: zs2, channel: 'zalo_personal' });

    expect(result.updatedMessages).toBe(1);
    expect(await unreadOf('zalo_personal_messages', c2)).toBe(0);
    expect(await unreadOf('zalo_personal_messages', personal)).toBe(3);
    expect(zs).toBeGreaterThan(0);
  });
});
