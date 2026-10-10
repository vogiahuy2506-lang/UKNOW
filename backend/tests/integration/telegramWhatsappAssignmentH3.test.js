/**
 * PLAN_GIAO_TK_TG_WA PR-H3 — Hộp thư + SSE theo tài khoản Telegram / WhatsApp (Baileys) ĐƯỢC GIAO (Postgres THẬT, HTTP thật).
 * Khuôn inboxAccountAssignment.test.js (Zalo G2).
 *
 * Nhân viên chỉ thấy / chạm được hội thoại, tin, tin gửi đi, liên hệ khách để lại của tài khoản được giao; luồng SSE chỉ phát
 * sự kiện của tài khoản được giao. Hỏng thì chặn (bảng giao hỏng → nhân viên không thấy Telegram / WhatsApp nào). Zalo OA và
 * Web chat KHÔNG nằm trong phạm vi giao nên không đổi. Mọi nhóm đều có ca "chủ thấy hết".
 */
import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';

const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const sseService = (await import('../../src/services/sse.service.js')).default;
const { broadcastTelegramInbox } = await import('../../src/services/chatbot/telegramInbox.service.js');
const { createUser, truncateAll } = await import('./helpers/db.js');

const BASE = '/api/ai/chatbot';
let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  await db.query('TRUNCATE TABLE chatbot_contact_alerts CASCADE');
  sseService._resetForTests();
});

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login thất bại cho ${user.username}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function addMembership(ownerId, employeeId, permissions) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin, accepted_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', 'created', NOW(), NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

let telegramSeq = 700000;
async function createTelegram(ownerId, name) {
  telegramSeq += 1;
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, first_name, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
    [ownerId, telegramSeq, name]
  );
  return Number(rows[0].id);
}

async function assign(ownerId, employeeId, channel, ref) {
  await db.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source) VALUES ($1, $2, $3, $4, 'assigned')`,
    [ownerId, employeeId, channel, String(ref)]
  );
}

/** Một kết nối kênh (channel_connections) + một hội thoại có tin khách chưa đọc + một tin gửi đi (lỗi, để thử gửi lại). */
async function seedChannel(ownerId, { channel, externalChannelId, label, withAlert = false }) {
  const { rows: conn } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [ownerId, channel, externalChannelId, label]
  );
  const connId = Number(conn[0].id);
  const { rows: convRows } = await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name, last_message_at)
     VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
    [ownerId, connId, channel, `ext:${externalChannelId}:1`, `Khách ${label}`]
  );
  const convId = Number(convRows[0].id);
  await db.query(
    `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content, is_read) VALUES ($1, $2, $3, 'visitor', $4, false)`,
    [convId, ownerId, connId, `hỏi ${label}`]
  );
  const { rows: out } = await db.query(
    `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content, is_read, metadata)
     VALUES ($1, $2, $3, 'agent', $4, true, $5::jsonb) RETURNING id`,
    [convId, ownerId, connId, `trả lời ${label}`, JSON.stringify({ source: 'manual_inbox', send: { status: 'failed' } })]
  );
  let alertId = null;
  if (withAlert) {
    const { rows: alert } = await db.query(
      `INSERT INTO chatbot_contact_alerts (id_user, contact_type, contact_value, first_seen_at, last_seen_at, last_source, last_conversation_id, last_message_id, last_excerpt)
       VALUES ($1, 'phone', $2, NOW(), NOW(), 'channel', $3, 1, 'xin lien he') RETURNING id`,
      [ownerId, `09${Math.floor(Math.random() * 1e8)}`, convId]
    );
    alertId = Number(alert[0].id);
  }
  return { connId, convId, outId: Number(out[0].id), alertId };
}

/**
 * Một chủ: Telegram t1 (GIAO) + t2 (chưa); WhatsApp Baileys w1 (GIAO) + w2 (chưa); một kết nối Zalo OA (kênh ngoài phạm vi giao) và
 * một hội thoại Web chat. Mỗi kết nối có một hội thoại chưa đọc + một tin gửi đi + một liên hệ khách để lại.
 */
async function setupWorkspace({ assign: doAssign = true } = {}) {
  const owner = await createUser({ username: `chu_h3_${Date.now()}`, role: 'user' });
  const employee = await createUser({ username: `nv_h3_${Date.now()}`, role: 'user' });
  await addMembership(owner.id, employee.id, { inbox_view: true, inbox_reply: true, inbox_manage: true });
  const t1 = await createTelegram(owner.id, 'TeleMot');
  const t2 = await createTelegram(owner.id, 'TeleHai');
  const w1 = `${owner.id}-mot`;
  const w2 = `${owner.id}-hai`;
  if (doAssign) {
    await assign(owner.id, employee.id, 'telegram', t1);
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1);
  }
  const tg1 = await seedChannel(owner.id, { channel: 'telegram', externalChannelId: String(t1), label: 'TG1', withAlert: true });
  const tg2 = await seedChannel(owner.id, { channel: 'telegram', externalChannelId: String(t2), label: 'TG2', withAlert: true });
  const wa1 = await seedChannel(owner.id, { channel: 'whatsapp_baileys', externalChannelId: w1, label: 'WA1', withAlert: true });
  const wa2 = await seedChannel(owner.id, { channel: 'whatsapp_baileys', externalChannelId: w2, label: 'WA2', withAlert: true });
  const oa = await seedChannel(owner.id, { channel: 'zalo_oa', externalChannelId: 'oa-1', label: 'OA', withAlert: true });
  return {
    owner, employee, t1, t2, w1, w2, tg1, tg2, wa1, wa2, oa,
    ownerToken: await loginAs(owner),
    employeeToken: await loginAs(employee),
  };
}

const emp = (req, ctx) => req.set('Authorization', `Bearer ${ctx.employeeToken}`).set('X-Owner-Context', String(ctx.owner.id));
const own = (req, ctx) => req.set('Authorization', `Bearer ${ctx.ownerToken}`);
const NOT_ASSIGNED = { success: false, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' };
const idsOf = (rows) => rows.map((row) => Number(row.id)).sort((x, y) => x - y);
const sorted = (...ids) => [...ids].sort((x, y) => x - y);

describe('danh sách / đếm / chưa đọc / kênh / đọc hết', () => {
  it('danh sách hội thoại: nhân viên chỉ thấy tài khoản được giao + Zalo OA (kênh ngoài phạm vi); chủ thấy hết; tổng khớp danh sách', async () => {
    const ctx = await setupWorkspace();

    const employeeRes = await emp(request(app).get(`${BASE}/inbox/conversations`), ctx);
    expect(employeeRes.status).toBe(200);
    expect(idsOf(employeeRes.body.data.conversations)).toEqual(sorted(ctx.tg1.convId, ctx.wa1.convId, ctx.oa.convId));
    expect(employeeRes.body.data.total).toBe(3);

    const ownerRes = await own(request(app).get(`${BASE}/inbox/conversations`), ctx);
    expect(idsOf(ownerRes.body.data.conversations)).toEqual(sorted(ctx.tg1.convId, ctx.tg2.convId, ctx.wa1.convId, ctx.wa2.convId, ctx.oa.convId));
    expect(ownerRes.body.data.total).toBe(5);
  });

  it('tab Telegram / WhatsApp: nhân viên chỉ thấy hội thoại của tài khoản được giao (AND với bộ lọc kênh)', async () => {
    const ctx = await setupWorkspace();
    const tg = await emp(request(app).get(`${BASE}/inbox/conversations`).query({ channel: 'telegram' }), ctx);
    expect(idsOf(tg.body.data.conversations)).toEqual([ctx.tg1.convId]);
    const wa = await emp(request(app).get(`${BASE}/inbox/conversations`).query({ channel: 'whatsapp_baileys' }), ctx);
    expect(idsOf(wa.body.data.conversations)).toEqual([ctx.wa1.convId]);
    const ownerTg = await own(request(app).get(`${BASE}/inbox/conversations`).query({ channel: 'telegram' }), ctx);
    expect(idsOf(ownerTg.body.data.conversations)).toEqual(sorted(ctx.tg1.convId, ctx.tg2.convId));
  });

  it('số chưa đọc: nhân viên đếm tài khoản được giao + OA (3); chủ đếm cả hai tài khoản chưa giao (5)', async () => {
    const ctx = await setupWorkspace();
    const employeeRes = await emp(request(app).get(`${BASE}/inbox/unread-count`), ctx);
    expect(employeeRes.body.data).toEqual({ total: 3, unit: 'conversations' });
    const ownerRes = await own(request(app).get(`${BASE}/inbox/unread-count`), ctx);
    expect(ownerRes.body.data).toEqual({ total: 5, unit: 'conversations' });
    const tgOnly = await emp(request(app).get(`${BASE}/inbox/unread-count`).query({ channel: 'telegram' }), ctx);
    expect(tgOnly.body.data.total).toBe(1);
  });

  it('kênh có sẵn: nhân viên được giao có tab Telegram + WhatsApp; CHƯA được giao gì thì chỉ còn kênh ngoài phạm vi (Zalo OA); chủ có tất cả', async () => {
    const withAccounts = await setupWorkspace();
    const res1 = await emp(request(app).get(`${BASE}/inbox/channels`), withAccounts);
    expect(res1.body.data.channels).toEqual(expect.arrayContaining(['telegram', 'whatsapp_baileys', 'zalo_oa']));

    await truncateAll();
    const none = await setupWorkspace({ assign: false });
    const res2 = await emp(request(app).get(`${BASE}/inbox/channels`), none);
    expect(res2.body.data.channels).not.toContain('telegram');
    expect(res2.body.data.channels).not.toContain('whatsapp_baileys');
    expect(res2.body.data.channels).toContain('zalo_oa');
    const res3 = await own(request(app).get(`${BASE}/inbox/channels`), none);
    expect(res3.body.data.channels).toEqual(expect.arrayContaining(['telegram', 'whatsapp_baileys']));
  });

  it('"Đánh dấu tất cả đã đọc" của nhân viên chỉ chạm tin của tài khoản được giao; của chủ chạm tất cả', async () => {
    const ctx = await setupWorkspace();
    const unreadOf = async (conversationId) => Number((await db.query(
      `SELECT COUNT(*) AS n FROM channel_messages WHERE id_conversation = $1 AND role = 'visitor' AND is_read = false`, [conversationId]
    )).rows[0].n);

    const res = await emp(request(app).post(`${BASE}/inbox/read-all`).send({}), ctx);
    expect(res.status).toBe(200);
    expect(await unreadOf(ctx.tg1.convId)).toBe(0);
    expect(await unreadOf(ctx.wa1.convId)).toBe(0);
    expect(await unreadOf(ctx.tg2.convId)).toBe(1);
    expect(await unreadOf(ctx.wa2.convId)).toBe(1);

    await own(request(app).post(`${BASE}/inbox/read-all`).send({}), ctx);
    expect(await unreadOf(ctx.tg2.convId)).toBe(0);
    expect(await unreadOf(ctx.wa2.convId)).toBe(0);
  });
});

describe('đường theo id hội thoại / tin — nhân viên chưa được giao bị 403, DB không đổi', () => {
  const q = { type: 'channel' };

  it('xem hội thoại / tin / đánh dấu đã đọc / tạm dừng AI: 403 CHANNEL_ACCOUNT_NOT_ASSIGNED với Telegram và WhatsApp chưa giao; chủ làm được', async () => {
    const ctx = await setupWorkspace();
    for (const target of [ctx.tg2, ctx.wa2]) {
      const id = target.convId;
      const getConv = await emp(request(app).get(`${BASE}/inbox/conversations/${id}`).query(q), ctx);
      expect(getConv.status).toBe(403);
      expect(getConv.body).toMatchObject(NOT_ASSIGNED);

      const getMsgs = await emp(request(app).get(`${BASE}/inbox/conversations/${id}/messages`).query(q), ctx);
      expect(getMsgs.status).toBe(403);
      expect(getMsgs.body).toMatchObject(NOT_ASSIGNED);

      const read = await emp(request(app).post(`${BASE}/inbox/conversations/${id}/read`).send(q), ctx);
      expect(read.status).toBe(403);
      expect(Number((await db.query(`SELECT COUNT(*) AS n FROM channel_messages WHERE id_conversation = $1 AND role = 'visitor' AND is_read = false`, [id])).rows[0].n)).toBe(1);

      const pause = await emp(request(app).post(`${BASE}/inbox/conversations/${id}/ai-pause`).send({ ...q, paused: true }), ctx);
      expect(pause.status).toBe(403);
      expect(pause.body).toMatchObject(NOT_ASSIGNED);
      expect((await db.query(`SELECT ai_paused FROM channel_conversations WHERE id = $1`, [id])).rows[0].ai_paused).not.toBe(true);

      expect((await own(request(app).get(`${BASE}/inbox/conversations/${id}`).query(q), ctx)).status).toBe(200);
      expect((await own(request(app).get(`${BASE}/inbox/conversations/${id}/messages`).query(q), ctx)).status).toBe(200);
    }
  });

  it('cùng các thao tác với tài khoản ĐƯỢC giao (và Zalo OA): nhân viên làm được', async () => {
    const ctx = await setupWorkspace();
    for (const target of [ctx.tg1, ctx.wa1, ctx.oa]) {
      const id = target.convId;
      expect((await emp(request(app).get(`${BASE}/inbox/conversations/${id}`).query(q), ctx)).status).toBe(200);
      const msgs = await emp(request(app).get(`${BASE}/inbox/conversations/${id}/messages`).query(q), ctx);
      expect(msgs.status).toBe(200);
      expect(msgs.body.data.length).toBeGreaterThan(0);
      expect((await emp(request(app).post(`${BASE}/inbox/conversations/${id}/read`).send(q), ctx)).status).toBe(200);
      expect((await emp(request(app).post(`${BASE}/inbox/conversations/${id}/ai-pause`).send({ ...q, paused: true }), ctx)).status).toBe(200);
      expect((await db.query(`SELECT ai_paused FROM channel_conversations WHERE id = $1`, [id])).rows[0].ai_paused).toBe(true);
    }
  });

  it('gửi tin vào hội thoại của tài khoản chưa giao: 403 CHANNEL_ACCOUNT_NOT_ASSIGNED (không phải "hết hạn mức"), KHÔNG ghi tin, KHÔNG đặt chỗ hạn mức', async () => {
    const ctx = await setupWorkspace();
    for (const target of [ctx.tg2, ctx.wa2]) {
      const before = Number((await db.query(`SELECT COUNT(*) AS n FROM channel_messages WHERE id_conversation = $1`, [target.convId])).rows[0].n);
      const reservationsBefore = Number((await db.query(`SELECT COUNT(*) AS n FROM send_quota_reservations`)).rows[0].n);

      const res = await emp(
        request(app).post(`${BASE}/inbox/conversations/${target.convId}/messages`).set('Idempotency-Key', `h3-send-${target.convId}`).send({ type: 'channel', content: 'xin chào' }),
        ctx
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject(NOT_ASSIGNED);
      expect(res.body.upgradeRequired).toBeUndefined();
      expect(Number((await db.query(`SELECT COUNT(*) AS n FROM channel_messages WHERE id_conversation = $1`, [target.convId])).rows[0].n)).toBe(before);
      expect(Number((await db.query(`SELECT COUNT(*) AS n FROM send_quota_reservations`)).rows[0].n)).toBe(reservationsBefore);
    }
  });

  it('gửi vào tài khoản ĐƯỢC giao: không bị chặn bởi việc giao (kết quả gửi thật phụ thuộc phiên)', async () => {
    const ctx = await setupWorkspace();
    const res = await emp(
      request(app).post(`${BASE}/inbox/conversations/${ctx.tg1.convId}/messages`).set('Idempotency-Key', 'h3-send-tg1').send({ type: 'channel', content: 'xin chào' }),
      ctx
    );
    expect(res.body.code).not.toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
  });

  it('gửi lại tin lỗi của tài khoản chưa giao: 403, tin KHÔNG bị claim sang "retrying"; của tài khoản được giao không bị chặn bởi việc giao', async () => {
    const ctx = await setupWorkspace();
    for (const target of [ctx.tg2, ctx.wa2]) {
      const res = await emp(request(app).post(`${BASE}/inbox/messages/${target.outId}/retry`).send({ type: 'channel' }), ctx);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject(NOT_ASSIGNED);
      const status = (await db.query(`SELECT metadata->'send'->>'status' AS s FROM channel_messages WHERE id = $1`, [target.outId])).rows[0].s;
      expect(status).toBe('failed');
    }
    const ok = await emp(request(app).post(`${BASE}/inbox/messages/${ctx.tg1.outId}/retry`).send({ type: 'channel' }), ctx);
    expect(ok.body.code).not.toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
  });

  it('xoá hội thoại: tài khoản chưa giao → 403, hội thoại VÀ tin còn nguyên; tài khoản được giao → xoá được; Zalo OA xoá được; chủ xoá được mọi hội thoại', async () => {
    const ctx = await setupWorkspace();
    const counts = async (conversationId) => ({
      conv: Number((await db.query(`SELECT COUNT(*) AS n FROM channel_conversations WHERE id = $1`, [conversationId])).rows[0].n),
      msgs: Number((await db.query(`SELECT COUNT(*) AS n FROM channel_messages WHERE id_conversation = $1`, [conversationId])).rows[0].n),
    });

    for (const target of [ctx.tg2, ctx.wa2]) {
      const blocked = await emp(request(app).delete(`${BASE}/inbox/conversations/${target.convId}`).query(q), ctx);
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject(NOT_ASSIGNED);
      expect(await counts(target.convId)).toEqual({ conv: 1, msgs: 2 });
    }

    for (const target of [ctx.tg1, ctx.oa]) {
      const allowed = await emp(request(app).delete(`${BASE}/inbox/conversations/${target.convId}`).query(q), ctx);
      expect(allowed.status).toBe(200);
      expect(await counts(target.convId)).toEqual({ conv: 0, msgs: 0 });
    }

    const ownerDelete = await own(request(app).delete(`${BASE}/inbox/conversations/${ctx.tg2.convId}`).query(q), ctx);
    expect(ownerDelete.status).toBe(200);
    expect(await counts(ctx.tg2.convId)).toEqual({ conv: 0, msgs: 0 });
  });

  it('câu xoá kiểm LẠI phạm vi trong SQL (phòng thủ lớp repository): gọi thẳng với phạm vi rỗng / thiếu → không xoá dòng nào', async () => {
    const ctx = await setupWorkspace();
    const repo = (await import('../../src/repositories/ai/chatbotChannel.repository.js')).default;

    await repo.deleteChannelConversation(ctx.tg2.convId, ctx.owner.id, { accessibleChannelRefs: { telegram: [], whatsapp_baileys: [] } });
    await repo.deleteChannelConversation(ctx.tg2.convId, ctx.owner.id);
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM channel_conversations WHERE id = $1`, [ctx.tg2.convId])).rows[0].n)).toBe(1);

    await repo.deleteChannelConversation(ctx.tg2.convId, ctx.owner.id, { accessibleChannelRefs: { telegram: [String(ctx.t2)], whatsapp_baileys: [] } });
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM channel_conversations WHERE id = $1`, [ctx.tg2.convId])).rows[0].n)).toBe(0);
  });
});

describe('hộp gửi đi', () => {
  it('danh sách + thống kê chỉ gồm tin gửi đi của tài khoản được giao (+ OA); chi tiết tin của tài khoản chưa giao → 404; chủ thấy hết', async () => {
    const ctx = await setupWorkspace();

    const list = await emp(request(app).get(`${BASE}/inbox/outbox`), ctx);
    expect(list.status).toBe(200);
    expect(idsOf(list.body.data.messages)).toEqual(sorted(ctx.tg1.outId, ctx.wa1.outId, ctx.oa.outId));
    expect(list.body.data.total).toBe(3);

    const ownerList = await own(request(app).get(`${BASE}/inbox/outbox`), ctx);
    expect(idsOf(ownerList.body.data.messages)).toEqual(sorted(ctx.tg1.outId, ctx.tg2.outId, ctx.wa1.outId, ctx.wa2.outId, ctx.oa.outId));

    expect((await emp(request(app).get(`${BASE}/inbox/outbox/${ctx.tg1.outId}`), ctx)).status).toBe(200);
    expect((await emp(request(app).get(`${BASE}/inbox/outbox/${ctx.tg2.outId}`), ctx)).status).toBe(404);
    expect((await emp(request(app).get(`${BASE}/inbox/outbox/${ctx.wa2.outId}`), ctx)).status).toBe(404);
    expect((await own(request(app).get(`${BASE}/inbox/outbox/${ctx.tg2.outId}`), ctx)).status).toBe(200);
  });

  it('thống kê theo kênh (SQL thật): mỗi dòng Telegram / WhatsApp là một kết nối — nhân viên chỉ có dòng của tài khoản được giao', async () => {
    const ctx = await setupWorkspace();
    const repo = (await import('../../src/repositories/ai/unifiedInbox.repository.js')).default;
    const channelRows = (rows) => rows.filter((row) => row.channel === 'telegram' || row.channel === 'whatsapp_baileys').map((row) => row.channel).sort();

    const employeeRows = await repo.getOutboxStatsByChannel(ctx.owner.id, {
      accessibleZaloAccountIds: null,
      accessibleChannelRefs: { telegram: [String(ctx.t1)], whatsapp_baileys: [ctx.w1] },
    });
    expect(channelRows(employeeRows)).toEqual(['telegram', 'whatsapp_baileys']);

    const ownerRows = await repo.getOutboxStatsByChannel(ctx.owner.id, {
      accessibleZaloAccountIds: null,
      accessibleChannelRefs: { telegram: null, whatsapp_baileys: null },
    });
    expect(channelRows(ownerRows)).toEqual(['telegram', 'telegram', 'whatsapp_baileys', 'whatsapp_baileys']);

    const missing = await repo.getOutboxStatsByChannel(ctx.owner.id, { accessibleZaloAccountIds: null });
    expect(channelRows(missing)).toEqual([]); // thiếu phạm vi → chặn
  });
});

describe('liên hệ khách để lại', () => {
  it('danh sách: nhân viên chỉ thấy liên hệ qua tài khoản được giao (+ OA); đánh dấu / bỏ đánh dấu liên hệ của tài khoản chưa giao → 404, DB không đổi; chủ thấy hết', async () => {
    const ctx = await setupWorkspace();

    const list = await emp(request(app).get(`${BASE}/inbox/contact-alerts`), ctx);
    expect(list.status).toBe(200);
    expect(idsOf(list.body.data.items)).toEqual(sorted(ctx.tg1.alertId, ctx.wa1.alertId, ctx.oa.alertId));
    expect(list.body.data.total).toBe(3);
    expect(list.body.data.openCount).toBe(3);

    for (const blockedId of [ctx.tg2.alertId, ctx.wa2.alertId]) {
      const blocked = await emp(request(app).post(`${BASE}/inbox/contact-alerts/${blockedId}/handled`), ctx);
      expect(blocked.status).toBe(404);
      expect((await db.query(`SELECT handled_at FROM chatbot_contact_alerts WHERE id = $1`, [blockedId])).rows[0].handled_at).toBeNull();
    }
    expect((await emp(request(app).post(`${BASE}/inbox/contact-alerts/${ctx.tg1.alertId}/handled`), ctx)).status).toBe(200);
    expect((await emp(request(app).post(`${BASE}/inbox/contact-alerts/${ctx.oa.alertId}/handled`), ctx)).status).toBe(200);

    // Chủ đã xử lý alert của tài khoản chưa giao; nhân viên không bỏ đánh dấu được.
    expect((await own(request(app).post(`${BASE}/inbox/contact-alerts/${ctx.tg2.alertId}/handled`), ctx)).status).toBe(200);
    const unmark = await emp(request(app).delete(`${BASE}/inbox/contact-alerts/${ctx.tg2.alertId}/handled`), ctx);
    expect(unmark.status).toBe(404);
    expect((await db.query(`SELECT handled_at FROM chatbot_contact_alerts WHERE id = $1`, [ctx.tg2.alertId])).rows[0].handled_at).not.toBeNull();

    const ownerList = await own(request(app).get(`${BASE}/inbox/contact-alerts`).query({ status: 'all' }), ctx);
    expect(ownerList.body.data.items).toHaveLength(5);
  });

  it('hội thoại của liên hệ đã bị xoá (không còn biết thuộc tài khoản nào) → nhân viên không thấy; chủ vẫn thấy', async () => {
    const ctx = await setupWorkspace();
    await db.query(`DELETE FROM channel_conversations WHERE id = $1`, [ctx.tg1.convId]);
    const list = await emp(request(app).get(`${BASE}/inbox/contact-alerts`), ctx);
    expect(idsOf(list.body.data.items)).toEqual(sorted(ctx.wa1.alertId, ctx.oa.alertId));
    const ownerList = await own(request(app).get(`${BASE}/inbox/contact-alerts`), ctx);
    expect(ownerList.body.data.items.map((i) => Number(i.id))).toContain(ctx.tg1.alertId);
  });
});

describe('HỎNG THÌ CHẶN — bảng giao hỏng', () => {
  it('nhân viên không thấy Telegram / WhatsApp nào (Zalo OA vẫn thấy), by-id 403, tab biến mất; chủ vẫn thấy đủ và làm được', async () => {
    const ctx = await setupWorkspace();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await db.query('ALTER TABLE member_channel_accounts RENAME TO member_channel_accounts_tmp_broken');
    try {
      const list = await emp(request(app).get(`${BASE}/inbox/conversations`), ctx);
      expect(list.status).toBe(200);
      expect(idsOf(list.body.data.conversations)).toEqual([ctx.oa.convId]);

      const byId = await emp(request(app).get(`${BASE}/inbox/conversations/${ctx.tg1.convId}`).query({ type: 'channel' }), ctx);
      expect(byId.status).toBe(403);
      expect(byId.body).toMatchObject(NOT_ASSIGNED);

      const channels = await emp(request(app).get(`${BASE}/inbox/channels`), ctx);
      expect(channels.body.data.channels).not.toContain('telegram');
      expect(channels.body.data.channels).not.toContain('whatsapp_baileys');

      const ownerList = await own(request(app).get(`${BASE}/inbox/conversations`), ctx);
      expect(ownerList.body.data.total).toBe(5);
      expect((await own(request(app).get(`${BASE}/inbox/conversations/${ctx.tg1.convId}`).query({ type: 'channel' }), ctx)).status).toBe(200);
    } finally {
      await db.query('ALTER TABLE member_channel_accounts_tmp_broken RENAME TO member_channel_accounts');
      console.error.mockRestore?.();
    }
  });
});

describe('SSE thời gian thực', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    sseService._resetForTests();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const httpJson = (path, { method = 'GET', headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  async function openStream(token, ownerContext = null) {
    const headers = { Authorization: `Bearer ${token}` };
    if (ownerContext) headers['X-Owner-Context'] = String(ownerContext);
    const minted = await httpJson(`${BASE}/inbox/stream-ticket`, { method: 'POST', headers });
    expect(minted.status).toBe(200);
    const chunks = [];
    let onClosed;
    const closed = new Promise((resolve) => { onClosed = resolve; });
    const handle = { req: null, text: () => chunks.join(''), closed, close: () => handle.req?.destroy() };
    await new Promise((resolve, reject) => {
      handle.req = http.get(`${baseUrl}${BASE}/inbox/stream?ticket=${encodeURIComponent(minted.body.data.ticket)}`, (res) => {
        res.on('data', (c) => {
          chunks.push(c.toString('utf8'));
          if (chunks.join('').includes('event: connected')) resolve();
        });
        res.on('end', onClosed);
        res.on('close', onClosed);
      });
      handle.req.on('error', (error) => {
        if (!chunks.length) reject(error);
      });
    });
    return handle;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tgEvent = (ref, message) => ({ conversationId: 1, type: 'channel', conversationType: 'channel', channel: 'telegram', channelAccountRef: ref, message });
  const waEvent = (ref, message) => ({ conversationId: 2, type: 'channel', conversationType: 'channel', channel: 'whatsapp_baileys', channelAccountRef: ref, message });

  it('nhân viên chỉ nhận sự kiện Telegram / WhatsApp của tài khoản được giao (và Zalo OA, Web); chủ nhận hết', async () => {
    const ctx = await setupWorkspace();
    const employeeStream = await openStream(ctx.employeeToken, ctx.owner.id);
    const ownerStream = await openStream(ctx.ownerToken);

    sseService.broadcast(ctx.owner.id, 'inbox:new_message', tgEvent(String(ctx.t1), 'tg-duoc-giao'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', tgEvent(String(ctx.t2), 'tg-chua-giao'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', waEvent(ctx.w1, 'wa-duoc-giao'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', waEvent(ctx.w2, 'wa-chua-giao'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', { conversationId: 3, type: 'channel', channel: 'zalo_oa', message: 'oa-tin' });
    await wait(150);

    const employeeText = employeeStream.text();
    expect(employeeText).toContain('tg-duoc-giao');
    expect(employeeText).toContain('wa-duoc-giao');
    expect(employeeText).toContain('oa-tin');
    expect(employeeText).not.toContain('tg-chua-giao');
    expect(employeeText).not.toContain('wa-chua-giao');

    const ownerText = ownerStream.text();
    for (const marker of ['tg-duoc-giao', 'tg-chua-giao', 'wa-duoc-giao', 'wa-chua-giao', 'oa-tin']) expect(ownerText).toContain(marker);

    employeeStream.close();
    ownerStream.close();
  });

  it('phát SSE THẬT từ broadcastTelegramInbox: payload mang channelAccountRef nên nhân viên nhận đúng tài khoản được giao', async () => {
    const ctx = await setupWorkspace();
    const employeeStream = await openStream(ctx.employeeToken, ctx.owner.id);

    broadcastTelegramInbox({
      ownerUserId: ctx.owner.id,
      conversation: { id: ctx.tg1.convId, channel_external_id: String(ctx.t1) },
      role: 'visitor',
      message: 'that-su-tu-telegram-duoc-giao',
    });
    broadcastTelegramInbox({
      ownerUserId: ctx.owner.id,
      conversation: { id: ctx.tg2.convId, channel_external_id: String(ctx.t2) },
      role: 'visitor',
      message: 'that-su-tu-telegram-chua-giao',
    });
    // Thiếu ref (hội thoại không mang channel_external_id) → fail-closed, nhân viên không nhận.
    broadcastTelegramInbox({ ownerUserId: ctx.owner.id, conversation: { id: 99 }, role: 'visitor', message: 'thieu-ref' });
    await wait(150);

    const text = employeeStream.text();
    expect(text).toContain('that-su-tu-telegram-duoc-giao');
    expect(text).not.toContain('that-su-tu-telegram-chua-giao');
    expect(text).not.toContain('thieu-ref');
    employeeStream.close();
  });

  it('nhân viên CHƯA được giao tài khoản nào: không nhận sự kiện Telegram / WhatsApp, vẫn nhận Zalo OA / Web chat', async () => {
    const ctx = await setupWorkspace({ assign: false });
    const employeeStream = await openStream(ctx.employeeToken, ctx.owner.id);

    sseService.broadcast(ctx.owner.id, 'inbox:new_message', tgEvent(String(ctx.t1), 'tg-a'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', waEvent(ctx.w1, 'wa-a'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', { conversationId: 9, type: 'webchat', channel: 'web', message: 'tin-web' });
    await wait(150);

    expect(employeeStream.text()).not.toContain('tg-a');
    expect(employeeStream.text()).not.toContain('wa-a');
    expect(employeeStream.text()).toContain('tin-web');
    employeeStream.close();
  });

  it('chủ đổi việc giao Telegram / WhatsApp qua API → luồng đang mở của nhân viên bị đóng; nối lại có phạm vi mới; luồng của chủ vẫn sống', async () => {
    const ctx = await setupWorkspace();
    const employeeStream = await openStream(ctx.employeeToken, ctx.owner.id);
    const ownerStream = await openStream(ctx.ownerToken);
    await db.query('DELETE FROM whatsapp_baileys_session_creds');
    await db.query(`INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ($1, '{}'::jsonb), ($2, '{}'::jsonb)`, [ctx.w1, ctx.w2]);

    const res = await own(request(app).put(`/api/employees/${ctx.employee.id}/channel-accounts`), ctx)
      .send({ telegramAccountIds: [ctx.t1, ctx.t2], whatsappSessionKeys: [ctx.w1] });
    expect(res.status).toBe(200);

    await Promise.race([employeeStream.closed, wait(2000)]);
    expect(sseService.getClientCountForUser(ctx.owner.id)).toBe(1);

    const reconnected = await openStream(ctx.employeeToken, ctx.owner.id);
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', tgEvent(String(ctx.t2), 'tg-sau-khi-giao-them'));
    await wait(150);
    expect(reconnected.text()).toContain('tg-sau-khi-giao-them');
    expect(ownerStream.text()).toContain('tg-sau-khi-giao-them');

    await db.query('DELETE FROM whatsapp_baileys_session_creds');
    reconnected.close();
    ownerStream.close();
  });
});
