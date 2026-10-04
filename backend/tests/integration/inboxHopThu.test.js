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

    expect(await repo.getUnreadConversationCount(user.id)).toBe(3);
  });

  it('theo phạm vi: tab Zalo / tab Web / một tài khoản cụ thể', async () => {
    const { user, connected, expired } = await setup();

    expect(await repo.getUnreadConversationCount(user.id, { channel: 'zalo_personal' })).toBe(2);
    expect(await repo.getUnreadConversationCount(user.id, { channel: 'web' })).toBe(1);
    expect(await repo.getUnreadConversationCount(user.id, { channel: 'zalo_personal', zaloAccountId: connected })).toBe(2);
    // tài khoản hết phiên: Zalo = 0
    expect(await repo.getUnreadConversationCount(user.id, { channel: 'zalo_personal', zaloAccountId: expired })).toBe(0);
    // "Tất cả" + tài khoản hết phiên: chỉ còn Web chat
    expect(await repo.getUnreadConversationCount(user.id, { zaloAccountId: expired })).toBe(1);
  });

  it('không rò sang user khác', async () => {
    const { user } = await setup();
    const other = await createUser({ username: `other${Date.now()}` });

    expect(await repo.getUnreadConversationCount(other.id)).toBe(0);
    expect(await repo.getUnreadConversationCount(user.id)).toBe(3);
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

    const list = await repo.getConversations(user.id, { date: 'today', limit: 20, offset: 0 });
    const total = await repo.getConversationsCount(user.id, { date: 'today' });

    expect(list.map((c) => Number(c.id))).toEqual([todayConv]);
    expect(total).toBe(1);
  });
});
