/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — Hộp thư theo tài khoản Zalo được giao (Postgres THẬT).
 *
 * Nhân viên chỉ thấy / chạm được hội thoại, tin, liên hệ khách để lại, báo cáo AI, danh bạ, đồng bộ của tài khoản Zalo cá
 * nhân được giao; luồng SSE chỉ phát sự kiện của tài khoản được giao. Hỏng thì chặn (bảng giao hỏng → nhân viên không thấy
 * Zalo nào). Mọi nhóm đều có ca "chủ thấy hết". Kênh khác (Web chat) không đổi.
 */
import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import sseService from '../../src/services/sse.service.js';
import { createUser, truncateAll } from './helpers/db.js';

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

async function createZalo(ownerId, name) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, $2, 'connected', TRUE) RETURNING id`,
    [ownerId, name]
  );
  return Number(rows[0].id);
}

async function assign(ownerId, employeeId, accountId) {
  await db.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
     VALUES ($1, $2, 'zalo_personal', $3, 'assigned')`,
    [ownerId, employeeId, String(accountId)]
  );
}

async function seedConversation(ownerId, accountId, { externalId, name, isGroup = false } = {}) {
  const visitorInfo = isGroup ? { is_group: true, group_id: externalId, group_name: name } : {};
  const { rows } = await db.query(
    `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, visitor_info, last_message_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW()) RETURNING id`,
    [ownerId, accountId, externalId, name, JSON.stringify(visitorInfo)]
  );
  return Number(rows[0].id);
}

async function seedMessage(ownerId, accountId, conversationId, { role = 'visitor', content = 'tin', isRead = false, metadata = {} } = {}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, is_read, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW()) RETURNING id`,
    [conversationId, ownerId, accountId, role, content, isRead, JSON.stringify(metadata)]
  );
  return Number(rows[0].id);
}

async function seedWebchat(ownerId) {
  const { rows: widget } = await db.query(
    `INSERT INTO web_widget_configs (id_user, widget_key, display_name) VALUES ($1, $2, 'Widget') RETURNING id`,
    [ownerId, `k_${Date.now()}_${Math.floor(Math.random() * 1e6)}`]
  );
  const { rows } = await db.query(
    `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name) VALUES ($1, $2, $3, 'Khách web') RETURNING id`,
    [ownerId, widget[0].id, `s_${Math.floor(Math.random() * 1e9)}`]
  );
  const convId = Number(rows[0].id);
  await db.query(
    `INSERT INTO webchat_messages (id_conversation, id_user, role, content, is_read) VALUES ($1, $2, 'visitor', 'hi', false)`,
    [convId, ownerId]
  );
  return convId;
}

async function seedAlert(ownerId, { source, conversationId, value }) {
  const { rows } = await db.query(
    `INSERT INTO chatbot_contact_alerts (id_user, contact_type, contact_value, first_seen_at, last_seen_at, last_source, last_conversation_id, last_message_id, last_excerpt)
     VALUES ($1, 'phone', $2, NOW(), NOW(), $3, $4, 1, 'xin lien he') RETURNING id`,
    [ownerId, value, source, conversationId]
  );
  return Number(rows[0].id);
}

/**
 * Một chủ: tài khoản Zalo `a` (GIAO cho nhân viên) và `b` ("Gia đình" — KHÔNG giao). Mỗi tài khoản có một hội thoại 1-1 chưa
 * đọc + một tin gửi đi; `b` còn một nhóm. Thêm một hội thoại Web chat (kênh khác, không bị lọc).
 */
async function setupWorkspace({ assignA = true } = {}) {
  const owner = await createUser({ username: 'chu_hop_thu', role: 'user' });
  const employee = await createUser({ username: 'nv_hop_thu', role: 'user' });
  await addMembership(owner.id, employee.id, { inbox_view: true, inbox_reply: true, inbox_manage: true });

  const a = await createZalo(owner.id, 'Shop');
  const b = await createZalo(owner.id, 'Gia dinh');
  if (assignA) await assign(owner.id, employee.id, a);

  const convA = await seedConversation(owner.id, a, { externalId: 'ua', name: 'Khách shop' });
  const convB = await seedConversation(owner.id, b, { externalId: 'ub', name: 'Người nhà' });
  const groupB = await seedConversation(owner.id, b, { externalId: 'group_b', name: 'Nhóm gia đình', isGroup: true });
  await seedMessage(owner.id, a, convA, { content: 'khách hỏi giá' });
  await seedMessage(owner.id, b, convB, { content: 'con ơi' });
  await seedMessage(owner.id, b, groupB, { content: 'nhóm nhắn' });
  const outA = await seedMessage(owner.id, a, convA, { role: 'agent', isRead: true, content: 'shop trả lời', metadata: { source: 'manual_inbox', send: { status: 'failed' } } });
  const outB = await seedMessage(owner.id, b, convB, { role: 'agent', isRead: true, content: 'trả lời người nhà', metadata: { source: 'manual_inbox', send: { status: 'failed' } } });
  const webConv = await seedWebchat(owner.id);

  return {
    owner, employee, a, b, convA, convB, groupB, outA, outB, webConv,
    ownerToken: await loginAs(owner),
    employeeToken: await loginAs(employee),
  };
}

const emp = (req, ctx) => req.set('Authorization', `Bearer ${ctx.employeeToken}`).set('X-Owner-Context', String(ctx.owner.id));
const own = (req, ctx) => req.set('Authorization', `Bearer ${ctx.ownerToken}`);
const NOT_ASSIGNED = { success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' };
const keyOf = (row) => `${row.type}:${row.id}`;
/** pg trả BIGINT dạng chuỗi — chuẩn hoá về số, sắp tăng dần để so sánh không phụ thuộc thứ tự. */
const idsOf = (rows) => rows.map((row) => Number(row.id)).sort((x, y) => x - y);
const sorted = (...ids) => [...ids].sort((x, y) => x - y);

describe('danh sách / đếm / chưa đọc / kênh / đọc hết', () => {
  it('danh sách hội thoại: nhân viên chỉ thấy tài khoản được giao + Web chat; chủ thấy hết; đếm tổng khớp danh sách', async () => {
    const ctx = await setupWorkspace();

    const employeeRes = await emp(request(app).get(`${BASE}/inbox/conversations`), ctx);
    expect(employeeRes.status).toBe(200);
    expect(employeeRes.body.data.conversations.map(keyOf).sort()).toEqual([`webchat:${ctx.webConv}`, `zalo_personal:${ctx.convA}`].sort());
    expect(employeeRes.body.data.total).toBe(2);

    const ownerRes = await own(request(app).get(`${BASE}/inbox/conversations`), ctx);
    expect(ownerRes.body.data.conversations.map(keyOf).sort()).toEqual(
      [`webchat:${ctx.webConv}`, `zalo_personal:${ctx.convA}`, `zalo_personal:${ctx.convB}`, `zalo_personal:${ctx.groupB}`].sort()
    );
    expect(ownerRes.body.data.total).toBe(4);
  });

  it('nhân viên gửi zaloAccountId của tài khoản CHƯA giao → không lộ hội thoại nào của tài khoản đó (AND với phạm vi)', async () => {
    const ctx = await setupWorkspace();

    const res = await emp(request(app).get(`${BASE}/inbox/conversations`).query({ channel: 'zalo_personal', zaloAccountId: ctx.b }), ctx);
    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toEqual([]);
    expect(res.body.data.total).toBe(0);

    const ownerRes = await own(request(app).get(`${BASE}/inbox/conversations`).query({ channel: 'zalo_personal', zaloAccountId: ctx.b }), ctx);
    expect(idsOf(ownerRes.body.data.conversations)).toEqual(sorted(ctx.convB, ctx.groupB));
  });

  it('số chưa đọc: nhân viên đếm tài khoản được giao + Web (2); chủ đếm cả tài khoản "Gia đình" (3); id tài khoản chưa giao → chỉ còn Web', async () => {
    const ctx = await setupWorkspace();

    const employeeRes = await emp(request(app).get(`${BASE}/inbox/unread-count`), ctx);
    expect(employeeRes.body.data).toEqual({ total: 2, unit: 'conversations' });
    const ownerRes = await own(request(app).get(`${BASE}/inbox/unread-count`), ctx);
    expect(ownerRes.body.data).toEqual({ total: 3, unit: 'conversations' });

    const foreign = await emp(request(app).get(`${BASE}/inbox/unread-count`).query({ zaloAccountId: ctx.b }), ctx);
    expect(foreign.body.data.total).toBe(1);
  });

  it('kênh có sẵn: nhân viên được giao tài khoản có tab Zalo cá nhân; nhân viên CHƯA được giao gì thì không; chủ có', async () => {
    const withAccount = await setupWorkspace();
    const res1 = await emp(request(app).get(`${BASE}/inbox/channels`), withAccount);
    expect(res1.body.data.channels).toContain('zalo_personal');

    await truncateAll();
    const noAccount = await setupWorkspace({ assignA: false });
    const res2 = await emp(request(app).get(`${BASE}/inbox/channels`), noAccount);
    expect(res2.body.data.channels).toEqual(['web']);
    const res3 = await own(request(app).get(`${BASE}/inbox/channels`), noAccount);
    expect(res3.body.data.channels).toContain('zalo_personal');
  });

  it('"Đánh dấu tất cả đã đọc" của nhân viên chỉ chạm tin của tài khoản được giao; của chủ chạm tất cả', async () => {
    const ctx = await setupWorkspace();
    const unreadOf = async (conversationId) => Number((await db.query(
      `SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1 AND role = 'visitor' AND is_read = false`, [conversationId]
    )).rows[0].n);

    const res = await emp(request(app).post(`${BASE}/inbox/read-all`).send({}), ctx);
    expect(res.status).toBe(200);
    expect(await unreadOf(ctx.convA)).toBe(0);
    expect(await unreadOf(ctx.convB)).toBe(1);
    expect(await unreadOf(ctx.groupB)).toBe(1);

    await own(request(app).post(`${BASE}/inbox/read-all`).send({}), ctx);
    expect(await unreadOf(ctx.convB)).toBe(0);
    expect(await unreadOf(ctx.groupB)).toBe(0);
  });
});

describe('đường theo id hội thoại / tin — nhân viên chưa được giao bị 403, DB không đổi', () => {
  it('xem hội thoại / tin / đánh dấu đã đọc / tạm dừng AI: 403 ZALO_ACCOUNT_NOT_ASSIGNED với tài khoản chưa giao; chủ làm được', async () => {
    const ctx = await setupWorkspace();
    const id = ctx.convB;
    const q = { type: 'zalo_personal' };

    const getConv = await emp(request(app).get(`${BASE}/inbox/conversations/${id}`).query(q), ctx);
    expect(getConv.status).toBe(403);
    expect(getConv.body).toMatchObject(NOT_ASSIGNED);

    const getMsgs = await emp(request(app).get(`${BASE}/inbox/conversations/${id}/messages`).query(q), ctx);
    expect(getMsgs.status).toBe(403);
    expect(getMsgs.body).toMatchObject(NOT_ASSIGNED);

    const read = await emp(request(app).post(`${BASE}/inbox/conversations/${id}/read`).send(q), ctx);
    expect(read.status).toBe(403);
    expect(read.body).toMatchObject(NOT_ASSIGNED);
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1 AND role = 'visitor' AND is_read = false`, [id])).rows[0].n)).toBe(1);

    const pause = await emp(request(app).post(`${BASE}/inbox/conversations/${id}/ai-pause`).send({ ...q, paused: true }), ctx);
    expect(pause.status).toBe(403);
    expect(pause.body).toMatchObject(NOT_ASSIGNED);
    expect((await db.query(`SELECT ai_paused FROM zalo_personal_conversations WHERE id = $1`, [id])).rows[0].ai_paused).not.toBe(true);

    // Chủ làm được tất cả.
    expect((await own(request(app).get(`${BASE}/inbox/conversations/${id}`).query(q), ctx)).status).toBe(200);
    expect((await own(request(app).get(`${BASE}/inbox/conversations/${id}/messages`).query(q), ctx)).status).toBe(200);
  });

  it('cùng các thao tác với tài khoản ĐƯỢC giao: nhân viên làm được', async () => {
    const ctx = await setupWorkspace();
    const id = ctx.convA;
    const q = { type: 'zalo_personal' };

    expect((await emp(request(app).get(`${BASE}/inbox/conversations/${id}`).query(q), ctx)).status).toBe(200);
    const msgs = await emp(request(app).get(`${BASE}/inbox/conversations/${id}/messages`).query(q), ctx);
    expect(msgs.status).toBe(200);
    expect(msgs.body.data.length).toBeGreaterThan(0);
    expect((await emp(request(app).post(`${BASE}/inbox/conversations/${id}/read`).send(q), ctx)).status).toBe(200);
    const pause = await emp(request(app).post(`${BASE}/inbox/conversations/${id}/ai-pause`).send({ ...q, paused: true }), ctx);
    expect(pause.status).toBe(200);
    expect((await db.query(`SELECT ai_paused FROM zalo_personal_conversations WHERE id = $1`, [id])).rows[0].ai_paused).toBe(true);
  });

  it('gửi tin vào hội thoại của tài khoản chưa giao: 403 ZALO_ACCOUNT_NOT_ASSIGNED (không phải "hết hạn mức"), KHÔNG ghi tin, KHÔNG đặt chỗ hạn mức', async () => {
    const ctx = await setupWorkspace();
    const before = Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1`, [ctx.convB])).rows[0].n);
    const reservationsBefore = Number((await db.query(`SELECT COUNT(*) AS n FROM send_quota_reservations`)).rows[0].n);

    const res = await emp(
      request(app).post(`${BASE}/inbox/conversations/${ctx.convB}/messages`).set('Idempotency-Key', 'g2-send-b').send({ type: 'zalo_personal', content: 'xin chào' }),
      ctx
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(NOT_ASSIGNED);
    expect(res.body.upgradeRequired).toBeUndefined();
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1`, [ctx.convB])).rows[0].n)).toBe(before);
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM send_quota_reservations`)).rows[0].n)).toBe(reservationsBefore);
  });

  it('gửi vào tài khoản ĐƯỢC giao: không bị chặn bởi việc giao (kết quả gửi thật phụ thuộc phiên Zalo)', async () => {
    const ctx = await setupWorkspace();

    const res = await emp(
      request(app).post(`${BASE}/inbox/conversations/${ctx.convA}/messages`).set('Idempotency-Key', 'g2-send-a').send({ type: 'zalo_personal', content: 'xin chào' }),
      ctx
    );

    expect(res.body.code).not.toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
  });

  it('gửi lại tin lỗi của tài khoản chưa giao: 403, tin KHÔNG bị claim sang "retrying"; của tài khoản được giao không bị chặn bởi việc giao', async () => {
    const ctx = await setupWorkspace();

    const res = await emp(request(app).post(`${BASE}/inbox/messages/${ctx.outB}/retry`).send({ type: 'zalo_personal' }), ctx);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(NOT_ASSIGNED);
    const status = (await db.query(`SELECT metadata->'send'->>'status' AS s FROM zalo_personal_messages WHERE id = $1`, [ctx.outB])).rows[0].s;
    expect(status).toBe('failed');

    const ok = await emp(request(app).post(`${BASE}/inbox/messages/${ctx.outA}/retry`).send({ type: 'zalo_personal' }), ctx);
    expect(ok.body.code).not.toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
  });

  it('xoá hội thoại: tài khoản chưa giao → 403, hội thoại VÀ tin còn nguyên; tài khoản được giao → xoá được; chủ xoá được mọi hội thoại', async () => {
    const ctx = await setupWorkspace();
    const counts = async (conversationId) => ({
      conv: Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_conversations WHERE id = $1`, [conversationId])).rows[0].n),
      msgs: Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1`, [conversationId])).rows[0].n),
    });

    const blocked = await emp(request(app).delete(`${BASE}/inbox/conversations/${ctx.convB}`).query({ type: 'zalo_personal' }), ctx);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject(NOT_ASSIGNED);
    expect(await counts(ctx.convB)).toEqual({ conv: 1, msgs: 2 });

    const allowed = await emp(request(app).delete(`${BASE}/inbox/conversations/${ctx.convA}`).query({ type: 'zalo_personal' }), ctx);
    expect(allowed.status).toBe(200);
    expect(await counts(ctx.convA)).toEqual({ conv: 0, msgs: 0 });

    const ownerDelete = await own(request(app).delete(`${BASE}/inbox/conversations/${ctx.convB}`).query({ type: 'zalo_personal' }), ctx);
    expect(ownerDelete.status).toBe(200);
    expect(await counts(ctx.convB)).toEqual({ conv: 0, msgs: 0 });
  });

  it('LỖI CÓ SẴN đã sửa: xoá hội thoại của CHỦ KHÁC không còn xoá mất tin của họ (trước đây xoá tin trước khi kiểm chủ)', async () => {
    const ctx = await setupWorkspace();
    const stranger = await createUser({ username: 'chu_khac', role: 'user' });
    const strangerToken = await loginAs(stranger);
    const before = Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1`, [ctx.convB])).rows[0].n);

    const res = await request(app)
      .delete(`${BASE}/inbox/conversations/${ctx.convB}`)
      .query({ type: 'zalo_personal' })
      .set('Authorization', `Bearer ${strangerToken}`);

    expect(res.status).toBe(404);
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1`, [ctx.convB])).rows[0].n)).toBe(before);
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM zalo_personal_conversations WHERE id = $1`, [ctx.convB])).rows[0].n)).toBe(1);
  });
});

describe('hộp gửi đi', () => {
  it('danh sách + thống kê chỉ gồm tin gửi đi của tài khoản được giao; chi tiết tin của tài khoản chưa giao → 404; chủ thấy hết', async () => {
    const ctx = await setupWorkspace();

    const list = await emp(request(app).get(`${BASE}/inbox/outbox`), ctx);
    expect(list.status).toBe(200);
    expect(idsOf(list.body.data.messages)).toEqual([ctx.outA]);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.statsByChannel.zalo_personal.totalSent).toBe(1);

    const ownerList = await own(request(app).get(`${BASE}/inbox/outbox`), ctx);
    expect(idsOf(ownerList.body.data.messages)).toEqual(sorted(ctx.outA, ctx.outB));
    expect(ownerList.body.data.statsByChannel.zalo_personal.totalSent).toBe(2);

    expect((await emp(request(app).get(`${BASE}/inbox/outbox/${ctx.outA}`), ctx)).status).toBe(200);
    expect((await emp(request(app).get(`${BASE}/inbox/outbox/${ctx.outB}`), ctx)).status).toBe(404);
    expect((await own(request(app).get(`${BASE}/inbox/outbox/${ctx.outB}`), ctx)).status).toBe(200);
  });
});

describe('liên hệ khách để lại', () => {
  it('danh sách: nhân viên chỉ thấy liên hệ qua tài khoản được giao + Web; đánh dấu / bỏ đánh dấu liên hệ của tài khoản chưa giao → 404, DB không đổi; chủ thấy hết', async () => {
    const ctx = await setupWorkspace();
    const alertA = await seedAlert(ctx.owner.id, { source: 'zalo_personal', conversationId: ctx.convA, value: '0900000001' });
    const alertB = await seedAlert(ctx.owner.id, { source: 'zalo_personal', conversationId: ctx.convB, value: '0900000002' });
    const alertWeb = await seedAlert(ctx.owner.id, { source: 'web', conversationId: ctx.webConv, value: '0900000003' });

    const list = await emp(request(app).get(`${BASE}/inbox/contact-alerts`), ctx);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((i) => Number(i.id)).sort()).toEqual([alertA, alertWeb].sort());
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.openCount).toBe(2);

    const blocked = await emp(request(app).post(`${BASE}/inbox/contact-alerts/${alertB}/handled`), ctx);
    expect(blocked.status).toBe(404);
    expect((await db.query(`SELECT handled_at FROM chatbot_contact_alerts WHERE id = $1`, [alertB])).rows[0].handled_at).toBeNull();

    expect((await emp(request(app).post(`${BASE}/inbox/contact-alerts/${alertA}/handled`), ctx)).status).toBe(200);
    expect((await emp(request(app).post(`${BASE}/inbox/contact-alerts/${alertWeb}/handled`), ctx)).status).toBe(200);

    // Chủ đã xử lý alertB; nhân viên không bỏ đánh dấu được.
    expect((await own(request(app).post(`${BASE}/inbox/contact-alerts/${alertB}/handled`), ctx)).status).toBe(200);
    const unmark = await emp(request(app).delete(`${BASE}/inbox/contact-alerts/${alertB}/handled`), ctx);
    expect(unmark.status).toBe(404);
    expect((await db.query(`SELECT handled_at FROM chatbot_contact_alerts WHERE id = $1`, [alertB])).rows[0].handled_at).not.toBeNull();

    const ownerList = await own(request(app).get(`${BASE}/inbox/contact-alerts`).query({ status: 'all' }), ctx);
    expect(ownerList.body.data.items).toHaveLength(3);
  });
});

describe('báo cáo hoạt động AI + bật lại AI hàng loạt', () => {
  it('báo cáo: nhân viên chỉ thấy hội thoại của tài khoản được giao; chủ thấy hết', async () => {
    const ctx = await setupWorkspace();

    const employeeRes = await emp(request(app).get(`${BASE}/inbox/ai-activity`), ctx);
    expect(employeeRes.status).toBe(200);
    expect(idsOf(employeeRes.body.data.conversations)).toEqual([ctx.convA]);
    expect(employeeRes.body.data.stats.totalConversations).toBe(1);

    const ownerRes = await own(request(app).get(`${BASE}/inbox/ai-activity`), ctx);
    expect(idsOf(ownerRes.body.data.conversations)).toEqual(sorted(ctx.convA, ctx.convB, ctx.groupB));
  });

  it('bật lại AI hàng loạt: nhân viên chỉ bật hội thoại của tài khoản được giao; chủ bật hết', async () => {
    const ctx = await setupWorkspace();
    await db.query(`UPDATE zalo_personal_conversations SET ai_paused = TRUE, ai_paused_at = NOW() WHERE id = ANY($1::bigint[])`, [[ctx.convA, ctx.convB]]);
    const pausedOf = async (id) => (await db.query(`SELECT ai_paused FROM zalo_personal_conversations WHERE id = $1`, [id])).rows[0].ai_paused;

    const res = await emp(request(app).post(`${BASE}/inbox/ai-activity/resume-all`), ctx);
    expect(res.status).toBe(200);
    expect(res.body.data.resumedCount).toBe(1);
    expect(await pausedOf(ctx.convA)).toBe(false);
    expect(await pausedOf(ctx.convB)).toBe(true);

    const ownerRes = await own(request(app).post(`${BASE}/inbox/ai-activity/resume-all`), ctx);
    expect(ownerRes.body.data.resumedCount).toBe(1);
    expect(await pausedOf(ctx.convB)).toBe(false);
  });
});

describe('đồng bộ / trạng thái / bạn bè', () => {
  it('sync/status: ô chọn tài khoản của nhân viên chỉ có tài khoản được giao; chủ thấy cả hai', async () => {
    const ctx = await setupWorkspace();

    const employeeRes = await emp(request(app).get(`${BASE}/zalo-personal/sync/status`), ctx);
    expect(employeeRes.status).toBe(200);
    expect(idsOf(employeeRes.body.data.accounts)).toEqual([ctx.a]);

    const ownerRes = await own(request(app).get(`${BASE}/zalo-personal/sync/status`), ctx);
    expect(idsOf(ownerRes.body.data.accounts)).toEqual(sorted(ctx.a, ctx.b));
  });

  it('sync / sync/contacts / chat-history / friends với accountId chưa giao: 403 ZALO_ACCOUNT_NOT_ASSIGNED; tài khoản được giao đi qua bước kiểm', async () => {
    const ctx = await setupWorkspace();

    const call = (method, url, accountId, send) => {
      const req = request(app)[method](`${BASE}${url}`).query({ accountId });
      return emp(send ? req.send(send) : req, ctx);
    };
    for (const [method, url, send] of [
      ['get', '/zalo-personal/sync', null],
      ['get', '/zalo-personal/sync/contacts', null],
      ['post', '/zalo-personal/sync/chat-history', { externalId: 'ub' }],
      ['get', '/zalo-personal/friends', null],
    ]) {
      const blocked = await call(method, url, ctx.b, send);
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject(NOT_ASSIGNED);

      const passed = await call(method, url, ctx.a, send);
      expect(passed.body.code).not.toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    }

    // Chủ: tài khoản "Gia đình" không bị chặn bởi việc giao.
    const ownerFriends = await own(request(app).get(`${BASE}/zalo-personal/friends`).query({ accountId: ctx.b }), ctx);
    expect(ownerFriends.status).toBe(200);
  });

  it('sync thiếu accountId: nhân viên chưa được giao tài khoản nào KHÔNG bị "tự lấy" tài khoản đang kết nối của chủ → 400', async () => {
    const ctx = await setupWorkspace({ assignA: false });

    const res = await emp(request(app).get(`${BASE}/zalo-personal/sync/contacts`), ctx);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('HỎNG THÌ CHẶN — bảng giao hỏng', () => {
  it('nhân viên không thấy hội thoại Zalo nào, by-id 403, tab Zalo biến mất; chủ vẫn thấy đủ và làm được', async () => {
    const ctx = await setupWorkspace();
    await db.query('ALTER TABLE member_channel_accounts RENAME TO member_channel_accounts_tmp_broken');
    try {
      const list = await emp(request(app).get(`${BASE}/inbox/conversations`), ctx);
      expect(list.status).toBe(200);
      expect(list.body.data.conversations.map(keyOf)).toEqual([`webchat:${ctx.webConv}`]);

      const byId = await emp(request(app).get(`${BASE}/inbox/conversations/${ctx.convA}`).query({ type: 'zalo_personal' }), ctx);
      expect(byId.status).toBe(403);
      expect(byId.body).toMatchObject(NOT_ASSIGNED);

      const channels = await emp(request(app).get(`${BASE}/inbox/channels`), ctx);
      expect(channels.body.data.channels).toEqual(['web']);

      const ownerList = await own(request(app).get(`${BASE}/inbox/conversations`), ctx);
      expect(ownerList.body.data.total).toBe(4);
      expect((await own(request(app).get(`${BASE}/inbox/conversations/${ctx.convB}`).query({ type: 'zalo_personal' }), ctx)).status).toBe(200);
    } finally {
      await db.query('ALTER TABLE member_channel_accounts_tmp_broken RENAME TO member_channel_accounts');
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

  /** Mở luồng SSE bằng vé; trả { events: string[], closed: Promise, close() }. */
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
        // destroy() chủ động lúc dọn dẹp cũng ném ECONNRESET — chỉ coi là lỗi khi chưa kết nối xong.
        if (!chunks.length) reject(error);
      });
    });
    return handle;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const zaloEvent = (zaloAccountId, message) => ({ conversationId: 1, channel: 'zalo_personal', type: 'zalo_personal', zaloAccountId, message });

  it('nhân viên chỉ nhận sự kiện của tài khoản được giao (và Web chat); chủ nhận cả hai', async () => {
    const ctx = await setupWorkspace();
    const employeeStream = await openStream(ctx.employeeToken, ctx.owner.id);
    const ownerStream = await openStream(ctx.ownerToken);

    sseService.broadcast(ctx.owner.id, 'inbox:new_message', zaloEvent(ctx.a, 'tin-tai-khoan-duoc-giao'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', zaloEvent(ctx.b, 'tin-tai-khoan-gia-dinh'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', { conversationId: 9, type: 'webchat', channel: 'web', message: 'tin-web' });
    await wait(150);

    const employeeText = employeeStream.text();
    expect(employeeText).toContain('tin-tai-khoan-duoc-giao');
    expect(employeeText).toContain('tin-web');
    expect(employeeText).not.toContain('tin-tai-khoan-gia-dinh');

    const ownerText = ownerStream.text();
    expect(ownerText).toContain('tin-tai-khoan-duoc-giao');
    expect(ownerText).toContain('tin-tai-khoan-gia-dinh');
    expect(ownerText).toContain('tin-web');

    employeeStream.close();
    ownerStream.close();
  });

  it('nhân viên CHƯA được giao tài khoản nào: không nhận sự kiện Zalo nào, vẫn nhận Web chat', async () => {
    const ctx = await setupWorkspace({ assignA: false });
    const employeeStream = await openStream(ctx.employeeToken, ctx.owner.id);

    sseService.broadcast(ctx.owner.id, 'inbox:new_message', zaloEvent(ctx.a, 'zalo-a'));
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', { conversationId: 9, type: 'webchat', channel: 'web', message: 'tin-web' });
    await wait(150);

    expect(employeeStream.text()).not.toContain('zalo-a');
    expect(employeeStream.text()).toContain('tin-web');
    employeeStream.close();
  });

  it('chủ đổi việc giao qua API → luồng đang mở của nhân viên bị đóng (nối lại sẽ có danh sách mới); luồng của chủ vẫn sống', async () => {
    const ctx = await setupWorkspace();
    const employeeStream = await openStream(ctx.employeeToken, ctx.owner.id);
    const ownerStream = await openStream(ctx.ownerToken);

    const res = await own(request(app).put(`/api/employees/${ctx.employee.id}/channel-accounts`), ctx).send({ zaloAccountIds: [ctx.a, ctx.b] });
    expect(res.status).toBe(200);

    await Promise.race([employeeStream.closed, wait(2000)]);
    expect(sseService.getClientCountForUser(ctx.owner.id)).toBe(1);

    // Nối lại → phạm vi mới có cả hai tài khoản.
    const reconnected = await openStream(ctx.employeeToken, ctx.owner.id);
    sseService.broadcast(ctx.owner.id, 'inbox:new_message', zaloEvent(ctx.b, 'tin-sau-khi-giao-them'));
    await wait(150);
    expect(reconnected.text()).toContain('tin-sau-khi-giao-them');
    expect(ownerStream.text()).toContain('tin-sau-khi-giao-them');

    reconnected.close();
    ownerStream.close();
  });
});
