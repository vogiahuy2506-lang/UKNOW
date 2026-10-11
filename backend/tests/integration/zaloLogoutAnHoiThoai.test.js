/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — "Đăng xuất Zalo": hội thoại + tin nhắn của tài khoản bị ẨN khỏi Hộp thư cho tới
 * khi CHÍNH tài khoản Zalo đó (cùng zalo_user_id) quét QR lại (Postgres THẬT).
 *
 * Đăng xuất ≠ Xoá: dữ liệu còn nguyên (DB đếm lại), chỉ không lộ ra: danh sách, đếm, kênh, chi tiết, chưa đọc, hộp thư đi, liên hệ
 * khách để lại, báo cáo hoạt động AI, bản tin tuần, banner "cần đăng nhập lại". Phiên tự hết hạn (disconnected / needs_reauth)
 * KHÔNG phải đăng xuất — vẫn thấy lịch sử như trước (ca hồi quy).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import zaloSettingRepository from '../../src/repositories/zalo/zaloSetting.repository.js';
import campaignZaloSenderRepository from '../../src/repositories/campaign/campaignZaloSender.repository.js';
import campaignZaloSenderService from '../../src/services/campaign/campaignZaloSender.service.js';
import chatbotDigestRepository from '../../src/repositories/chatbot/chatbotDigest.repository.js';
import channelDisconnectAlertRepository from '../../src/repositories/chatbot/channelDisconnectAlert.repository.js';
import zaloSettingsController from '../../src/controllers/zaloSettings.controller.js';
import { metricZaloDisconnected } from '../../src/repositories/admin/alert.repository.js';
import { createUser, truncateAll } from './helpers/db.js';

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';

const BASE = '/api/ai/chatbot';
const ZALO = '/api/zalo';
let app;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await db.query('TRUNCATE TABLE chatbot_contact_alerts CASCADE');
});

beforeEach(async () => {
  await truncateAll();
  await db.query('TRUNCATE TABLE chatbot_contact_alerts CASCADE');
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

async function createZalo(ownerId, { name, zaloUserId, isDefault = false, status = 'connected', cookie = 'cookie-cu' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, zalo_user_id, cookie_text, status, is_active, is_default)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id`,
    [ownerId, name, zaloUserId, cookie, status, isDefault]
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
 * Một chủ, MỘT tài khoản Zalo `a` (connected, có cookie, mặc định, giao cho nhân viên) với: hội thoại 1-1 (tin khách chưa đọc +
 * tin gửi đi failed), một nhóm (tin khách chưa đọc), một liên hệ khách để lại. Cộng một hội thoại Web (kênh khác — không bao giờ ẩn).
 */
async function setup() {
  const owner = await createUser({ username: 'chu_dang_xuat', role: 'user' });
  const employee = await createUser({ username: 'nv_duoc_giao', role: 'user' });
  const stranger = await createUser({ username: 'nv_khong_giao', role: 'user' });
  await addMembership(owner.id, employee.id, { zalo_settings: true, inbox_view: true, inbox_reply: true, inbox_manage: true });
  await addMembership(owner.id, stranger.id, { zalo_settings: true, inbox_view: true });

  const a = await createZalo(owner.id, { name: 'Shop A', zaloUserId: 'zuid-a', isDefault: true });
  await assign(owner.id, employee.id, a);

  const conv = await seedConversation(owner.id, a, { externalId: 'khach-1', name: 'Khách 1' });
  const group = await seedConversation(owner.id, a, { externalId: 'group_x', name: 'Nhóm X', isGroup: true });
  await seedMessage(owner.id, a, conv, { content: 'khách hỏi giá' });
  await seedMessage(owner.id, a, group, { content: 'nhóm nhắn' });
  const outbound = await seedMessage(owner.id, a, conv, {
    role: 'agent', isRead: true, content: 'shop trả lời', metadata: { source: 'manual_inbox', send: { status: 'failed' } },
  });
  const web = await seedWebchat(owner.id);
  const alertZalo = await seedAlert(owner.id, { source: 'zalo_personal', conversationId: conv, value: '0900000001' });
  const alertWeb = await seedAlert(owner.id, { source: 'web', conversationId: web, value: '0900000002' });

  return {
    owner, employee, stranger, a, conv, group, outbound, web, alertZalo, alertWeb,
    ownerToken: await loginAs(owner),
    employeeToken: await loginAs(employee),
    strangerToken: await loginAs(stranger),
  };
}

const own = (req, ctx) => req.set('Authorization', `Bearer ${ctx.ownerToken}`);
const asEmployee = (req, token, ctx) => req.set('Authorization', `Bearer ${token}`).set('X-Owner-Context', String(ctx.owner.id));
const Q = { type: 'zalo_personal' };
const keys = (rows) => rows.map((row) => `${row.type}:${row.id}`).sort();
const idsOf = (rows) => rows.map((row) => Number(row.id)).sort((x, y) => x - y);

const logout = (ctx, id = ctx.a) => own(request(app).post(`${ZALO}/accounts/${id}/logout`), ctx);
const listConversations = (ctx, query = {}) => own(request(app).get(`${BASE}/inbox/conversations`).query(query), ctx);
const rowOf = async (id) => (await db.query(`SELECT * FROM zalo_settings WHERE id = $1`, [id])).rows[0];
const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);

describe('trước khi đăng xuất (mốc so sánh)', () => {
  it('hội thoại + nhóm + Web đều hiện; tab Zalo cá nhân có; chưa đọc / hộp thư đi / liên hệ / báo cáo AI / banner đều thấy tài khoản', async () => {
    const ctx = await setup();

    const list = await listConversations(ctx);
    expect(list.status).toBe(200);
    expect(keys(list.body.data.conversations)).toEqual([`webchat:${ctx.web}`, `zalo_personal:${ctx.conv}`, `zalo_personal:${ctx.group}`].sort());
    expect(list.body.data.total).toBe(3);
    expect((await own(request(app).get(`${BASE}/inbox/channels`), ctx)).body.data.channels).toContain('zalo_personal');
    expect((await own(request(app).get(`${BASE}/inbox/unread-count`), ctx)).body.data.total).toBe(2); // hội thoại 1-1 + Web (nhóm không tính)

    const outbox = await own(request(app).get(`${BASE}/inbox/outbox`), ctx);
    expect(idsOf(outbox.body.data.messages)).toEqual([ctx.outbound]);
    expect((await own(request(app).get(`${BASE}/inbox/contact-alerts`), ctx)).body.data.total).toBe(2);
    expect(idsOf((await own(request(app).get(`${BASE}/inbox/ai-activity`), ctx)).body.data.conversations)).toEqual([ctx.conv]);
    expect(idsOf((await own(request(app).get(`${BASE}/zalo-personal/sync/status`), ctx)).body.data.accounts)).toEqual([ctx.a]);
  });
});

describe('POST /api/zalo/accounts/:id/logout', () => {
  it('200; status=logged_out, cookie NULL; is_active / is_default / zalo_user_id / việc giao nhân viên / hội thoại / tin nhắn GIỮ NGUYÊN', async () => {
    const ctx = await setup();
    const convsBefore = await count(`SELECT COUNT(*) AS n FROM zalo_personal_conversations WHERE id_zalo_setting = $1`, [ctx.a]);
    const msgsBefore = await count(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_zalo_setting = $1`, [ctx.a]);

    const res = await logout(ctx);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { id: String(ctx.a), status: 'logged_out' } });
    const row = await rowOf(ctx.a);
    expect(row).toMatchObject({ status: 'logged_out', cookie_text: null, is_active: true, is_default: true, zalo_user_id: 'zuid-a', restore_fail_count: 0 });
    expect(await count(`SELECT COUNT(*) AS n FROM member_channel_accounts WHERE channel = 'zalo_personal' AND account_ref = $1`, [String(ctx.a)])).toBe(1);
    expect(await count(`SELECT COUNT(*) AS n FROM zalo_personal_conversations WHERE id_zalo_setting = $1`, [ctx.a])).toBe(convsBefore);
    expect(await count(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_zalo_setting = $1`, [ctx.a])).toBe(msgsBefore);
  });

  it('gọi lại lần nữa (đã đăng xuất) vẫn 200, không đổi gì', async () => {
    const ctx = await setup();
    await logout(ctx);
    const res = await logout(ctx);
    expect(res.status).toBe(200);
    expect((await rowOf(ctx.a)).status).toBe('logged_out');
  });

  it('tài khoản của chủ KHÁC hoặc không tồn tại → 404, DB của người kia không đổi', async () => {
    const ctx = await setup();
    const other = await createUser({ username: 'chu_khac', role: 'user' });
    const foreign = await createZalo(other.id, { name: 'Của người khác', zaloUserId: 'zuid-khac' });

    const res = await logout(ctx, foreign);
    expect(res.status).toBe(404);
    expect((await rowOf(foreign)).status).toBe('connected');
    expect((await rowOf(foreign)).cookie_text).toBe('cookie-cu');

    expect((await logout(ctx, 99999999)).status).toBe(404);
  });

  it('nhân viên: tài khoản CHƯA được giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, DB không đổi; tài khoản ĐƯỢC giao → 200', async () => {
    const ctx = await setup();

    const blocked = await asEmployee(request(app).post(`${ZALO}/accounts/${ctx.a}/logout`), ctx.strangerToken, ctx);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    expect((await rowOf(ctx.a)).status).toBe('connected');

    const allowed = await asEmployee(request(app).post(`${ZALO}/accounts/${ctx.a}/logout`), ctx.employeeToken, ctx);
    expect(allowed.status).toBe(200);
    expect((await rowOf(ctx.a)).status).toBe('logged_out');
  });

  it('nhân viên ĐƯỢC giao tài khoản nhưng KHÔNG có quyền zalo_settings → 403 PERMISSION_DENIED (router.use requirePermission phủ route logout), DB không đổi', async () => {
    const ctx = await setup();
    const noPerm = await createUser({ username: 'nv_khong_quyen', role: 'user' });
    await addMembership(ctx.owner.id, noPerm.id, { inbox_view: true, inbox_reply: true });
    await assign(ctx.owner.id, noPerm.id, ctx.a);

    const res = await asEmployee(request(app).post(`${ZALO}/accounts/${ctx.a}/logout`), await loginAs(noPerm), ctx);
    expect(res.status).toBe(403);
    expect(res.body?.success).toBe(false);
    expect(res.body?.code).toBe('PERMISSION_DENIED');
    expect((await rowOf(ctx.a)).status).toBe('connected');
  });

  it('GET /api/zalo/accounts vẫn liệt kê tài khoản với status "logged_out" (trang Cài đặt để quét QR lại)', async () => {
    const ctx = await setup();
    await logout(ctx);

    const res = await own(request(app).get(`${ZALO}/accounts`), ctx);

    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i) => Number(i.id) === ctx.a);
    expect(item).toMatchObject({ status: 'logged_out', isActive: true, isDefault: true });
  });
});

describe('sau khi đăng xuất: hội thoại / tin của tài khoản ẨN ở mọi chỗ của Hộp thư', () => {
  it('danh sách (cả khi lọc kênh / tài khoản) + đếm tổng: chỉ còn Web; Web không bị ảnh hưởng', async () => {
    const ctx = await setup();
    await logout(ctx);

    const list = await listConversations(ctx);
    expect(keys(list.body.data.conversations)).toEqual([`webchat:${ctx.web}`]);
    expect(list.body.data.total).toBe(1);

    const zaloOnly = await listConversations(ctx, { channel: 'zalo_personal' });
    expect(zaloOnly.body.data.conversations).toEqual([]);
    expect(zaloOnly.body.data.total).toBe(0);

    const byAccount = await listConversations(ctx, { channel: 'zalo_personal', zaloAccountId: ctx.a });
    expect(byAccount.body.data.conversations).toEqual([]);
    expect(byAccount.body.data.total).toBe(0);
  });

  it('phân trang không ra trang trống / ngắn: lọc nằm ở bước CHỌN TRANG', async () => {
    const ctx = await setup();
    // 5 hội thoại Zalo ẩn MỚI hơn mọi hội thoại Web; nếu lọc muộn thì trang 1 (limit 1) toàn dòng bị ẩn → rỗng.
    for (let i = 0; i < 5; i += 1) {
      const c = await seedConversation(ctx.owner.id, ctx.a, { externalId: `nhieu-${i}`, name: `Nhiều ${i}` });
      await seedMessage(ctx.owner.id, ctx.a, c, { content: 'x' });
    }
    await logout(ctx);

    const page1 = await listConversations(ctx, { limit: 1, offset: 0 });
    expect(keys(page1.body.data.conversations)).toEqual([`webchat:${ctx.web}`]);
    expect(page1.body.data.total).toBe(1);
  });

  it('kênh có sẵn: KHÔNG còn zalo_personal (khi chủ không còn tài khoản Zalo nào khác) nhưng vẫn còn web', async () => {
    const ctx = await setup();
    await logout(ctx);

    const res = await own(request(app).get(`${BASE}/inbox/channels`), ctx);
    expect(res.body.data.channels).toEqual(['web']);
  });

  it('kênh có sẵn: còn tài khoản Zalo KHÁC chưa đăng xuất → tab Zalo cá nhân vẫn có', async () => {
    const ctx = await setup();
    await createZalo(ctx.owner.id, { name: 'Shop B', zaloUserId: 'zuid-b' });
    await logout(ctx);

    const res = await own(request(app).get(`${BASE}/inbox/channels`), ctx);
    expect(res.body.data.channels).toContain('zalo_personal');
  });

  it('chi tiết / tin / đánh dấu đã đọc / gửi tin / bật tắt AI / xoá hội thoại: 404, DB không đổi', async () => {
    const ctx = await setup();
    await logout(ctx);
    const unreadBefore = await count(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1 AND is_read = false`, [ctx.conv]);
    const msgsBefore = await count(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1`, [ctx.conv]);

    expect((await own(request(app).get(`${BASE}/inbox/conversations/${ctx.conv}`).query(Q), ctx)).status).toBe(404);
    expect((await own(request(app).get(`${BASE}/inbox/conversations/${ctx.conv}/messages`).query(Q), ctx)).status).toBe(404);
    expect((await own(request(app).post(`${BASE}/inbox/conversations/${ctx.conv}/read`).send(Q), ctx)).status).toBe(404);
    expect((await own(request(app).post(`${BASE}/inbox/conversations/${ctx.conv}/ai-pause`).send({ ...Q, paused: true }), ctx)).status).toBe(404);
    const send = await own(
      request(app).post(`${BASE}/inbox/conversations/${ctx.conv}/messages`).set('Idempotency-Key', 'logout-send-1').send({ type: 'zalo_personal', content: 'xin chào' }),
      ctx
    );
    expect(send.status).toBe(404);
    expect((await own(request(app).delete(`${BASE}/inbox/conversations/${ctx.conv}`).query(Q), ctx)).status).toBe(404);

    expect(await count(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1`, [ctx.conv])).toBe(msgsBefore);
    expect(await count(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_conversation = $1 AND is_read = false`, [ctx.conv])).toBe(unreadBefore);
    expect(await count(`SELECT COUNT(*) AS n FROM zalo_personal_conversations WHERE id = $1`, [ctx.conv])).toBe(1);
  });

  it('chưa đọc: chỉ còn Web (0 từ Zalo); "Đánh dấu tất cả đã đọc" không chạm tin của tài khoản đã đăng xuất', async () => {
    const ctx = await setup();
    await logout(ctx);

    expect((await own(request(app).get(`${BASE}/inbox/unread-count`), ctx)).body.data.total).toBe(1);
    expect((await own(request(app).get(`${BASE}/inbox/unread-count`).query({ zaloAccountId: ctx.a }), ctx)).body.data.total).toBe(1);

    const readAll = await own(request(app).post(`${BASE}/inbox/read-all`).send({}), ctx);
    expect(readAll.status).toBe(200);
    expect(await count(`SELECT COUNT(*) AS n FROM zalo_personal_messages WHERE id_zalo_setting = $1 AND role = 'visitor' AND is_read = false`, [ctx.a])).toBe(2);
    expect(await count(`SELECT COUNT(*) AS n FROM webchat_messages WHERE is_read = false`)).toBe(0);
  });

  it('hộp thư đi: danh sách, tổng, thống kê, chi tiết, gửi lại — đều không thấy tin gửi đi của tài khoản đã đăng xuất', async () => {
    const ctx = await setup();
    await logout(ctx);
    const sendState = async () => (await db.query(`SELECT metadata->'send' AS send FROM zalo_personal_messages WHERE id = $1`, [ctx.outbound])).rows[0].send;
    const sendBefore = await sendState();

    const outbox = await own(request(app).get(`${BASE}/inbox/outbox`), ctx);
    expect(outbox.status).toBe(200);
    expect(outbox.body.data.messages).toEqual([]);
    expect(outbox.body.data.total).toBe(0);
    // statsByChannel chỉ liệt kê kênh có tin đã gửi (> 0): đăng xuất rồi thì Zalo cá nhân không còn mục nào.
    expect(outbox.body.data.statsByChannel.zalo_personal).toBeUndefined();
    expect((await own(request(app).get(`${BASE}/inbox/outbox/${ctx.outbound}`), ctx)).status).toBe(404);
    expect((await own(request(app).post(`${BASE}/inbox/messages/${ctx.outbound}/retry`).send(Q), ctx)).status).toBe(404);
    // Gửi lại bị chặn NGAY ở bước tìm tin: tin không bị "nhận gửi lại" (retrying) rồi ghi failed + tăng số lần thử.
    expect(await sendState()).toEqual(sendBefore);
  });

  it('liên hệ khách để lại: liên hệ qua tài khoản đã đăng xuất ẩn (cả tổng và số chưa xử lý); liên hệ Web vẫn còn; "đã xử lý" của liên hệ ẩn giữ nguyên', async () => {
    const ctx = await setup();
    await logout(ctx);

    const list = await own(request(app).get(`${BASE}/inbox/contact-alerts`).query({ status: 'all' }), ctx);
    expect(list.status).toBe(200);
    expect(idsOf(list.body.data.items)).toEqual([ctx.alertWeb]);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.openCount).toBe(1);
    // Dòng sổ liên hệ vẫn còn trong DB (ẩn ≠ xoá).
    expect(await count(`SELECT COUNT(*) AS n FROM chatbot_contact_alerts WHERE id = $1`, [ctx.alertZalo])).toBe(1);
  });

  it('báo cáo hoạt động AI + bản tin tuần: không đếm hội thoại của tài khoản đã đăng xuất', async () => {
    const ctx = await setup();
    const hour = 60 * 60 * 1000;
    const period = { startIso: new Date(Date.now() - hour).toISOString(), endIso: new Date(Date.now() + hour).toISOString() };
    await db.query(`UPDATE zalo_personal_conversations SET ai_paused = TRUE, ai_paused_at = NOW() - INTERVAL '30 hours' WHERE id = $1`, [ctx.conv]);
    const before = await chatbotDigestRepository.getDigestStats(ctx.owner.id, period);
    expect(before.byChannel.find((c) => c.channel === 'zalo_personal')).toBeTruthy();
    expect(before.topConversations.some((c) => c.source === 'zalo_personal')).toBe(true);
    expect(before.stalePaused).toBe(1);
    expect(before.contactsOpen).toBe(2);

    await logout(ctx);

    const activity = await own(request(app).get(`${BASE}/inbox/ai-activity`), ctx);
    expect(activity.body.data.conversations).toEqual([]);
    expect(activity.body.data.stats.totalConversations).toBe(0);

    const after = await chatbotDigestRepository.getDigestStats(ctx.owner.id, period);
    expect(after.byChannel.find((c) => c.channel === 'zalo_personal')).toBeUndefined();
    expect(after.topConversations.some((c) => c.source === 'zalo_personal')).toBe(false);
    expect(after.stalePaused).toBe(0);
    expect(after.contactsOpen).toBe(1);
    expect(after.contactsLeft).toBe(1);
  });

  it('banner "cần đăng nhập lại" (sync/status) không nhắc tài khoản đã đăng xuất', async () => {
    const ctx = await setup();
    await logout(ctx);

    const res = await own(request(app).get(`${BASE}/zalo-personal/sync/status`), ctx);

    expect(res.status).toBe(200);
    expect(res.body.data.accounts).toEqual([]);
    expect(res.body.data.connected).toBe(false);
  });

  it('nhân viên được giao cũng không thấy gì sau khi đăng xuất (việc giao còn nguyên nhưng hội thoại ẩn)', async () => {
    const ctx = await setup();
    await logout(ctx);

    const list = await asEmployee(request(app).get(`${BASE}/inbox/conversations`).query({ channel: 'zalo_personal' }), ctx.employeeToken, ctx);
    expect(list.status).toBe(200);
    expect(list.body.data.conversations).toEqual([]);
    expect((await asEmployee(request(app).get(`${BASE}/inbox/conversations/${ctx.conv}`).query(Q), ctx.employeeToken, ctx)).status).toBe(404);
  });
});

describe('khôi phục / thử lại phiên của tài khoản đã đăng xuất', () => {
  it('restore-session và retry-restore: 409 ZALO_ACCOUNT_LOGGED_OUT, DB không đổi (không tự về connected)', async () => {
    const ctx = await setup();
    await logout(ctx);
    const expected = { success: false, code: 'ZALO_ACCOUNT_LOGGED_OUT', message: 'Tài khoản đã đăng xuất, hãy quét QR để kết nối lại' };

    const restore = await own(request(app).post(`${ZALO}/accounts/${ctx.a}/restore-session`), ctx);
    expect(restore.status).toBe(409);
    expect(restore.body).toMatchObject(expected);

    const retry = await own(request(app).post(`${ZALO}/accounts/${ctx.a}/retry-restore`), ctx);
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject(expected);

    expect(await rowOf(ctx.a)).toMatchObject({ status: 'logged_out', cookie_text: null, restore_fail_count: 0 });
  });
});

describe('hệ thống KHÔNG tự mở lại tài khoản đã đăng xuất (chỉ quét QR mới mở)', () => {
  it('recordRestoreFailure (≥5 lần / 60 phút lẽ ra → needs_reauth): tài khoản connected cùng dữ liệu bị chuyển, tài khoản logged_out thì KHÔNG', async () => {
    const ctx = await setup();
    const control = await createZalo(ctx.owner.id, { name: 'Đối chứng', zaloUserId: 'zuid-doichung' });
    await logout(ctx);
    for (const id of [ctx.a, control]) {
      await db.query(`UPDATE zalo_settings SET restore_fail_count = 10, first_restore_fail_at = NOW() - INTERVAL '3 hours' WHERE id = $1`, [id]);
    }

    await campaignZaloSenderRepository.recordRestoreFailure(control);
    await campaignZaloSenderRepository.recordRestoreFailure(ctx.a);

    expect((await rowOf(control)).status).toBe('needs_reauth'); // chứng minh câu lệnh có tác dụng
    expect(await rowOf(ctx.a)).toMatchObject({ status: 'logged_out', restore_fail_count: 10 });
  });

  it('chiến dịch dùng nhầm tài khoản đã đăng xuất: getConnectedApiOrSyncStatus báo lỗi nhưng KHÔNG đổi trạng thái, KHÔNG tăng bộ đếm khôi phục', async () => {
    const ctx = await setup();
    await logout(ctx);

    await expect(campaignZaloSenderService.getConnectedApiOrSyncStatus({ accountId: ctx.a, userId: ctx.owner.id }))
      .rejects.toThrow(/Phiên đăng nhập Zalo/);

    expect(await rowOf(ctx.a)).toMatchObject({ status: 'logged_out', restore_fail_count: 0, cookie_text: null });
    const snapshot = (await channelDisconnectAlertRepository.listZaloSnapshot()).find((r) => Number(r.account_ref) === ctx.a);
    expect(snapshot.down).toBe(false); // không email "mất kết nối" cho người đã chủ động đăng xuất
  });

  it('markAccountConnected / markAccountDisconnected(ById) / resetRestoreForRetry không đổi status logged_out', async () => {
    const ctx = await setup();
    await logout(ctx);

    await campaignZaloSenderRepository.markAccountConnected({ accountId: ctx.a, userId: ctx.owner.id, displayName: 'x', cookieText: 'cookie-moi', now: new Date() });
    expect(await rowOf(ctx.a)).toMatchObject({ status: 'logged_out', cookie_text: null });

    await campaignZaloSenderRepository.markAccountDisconnected(ctx.a, ctx.owner.id);
    await campaignZaloSenderRepository.markAccountDisconnectedById(ctx.a);
    await zaloSettingRepository.markAccountDisconnected(ctx.owner.id, ctx.a);
    expect((await rowOf(ctx.a)).status).toBe('logged_out');

    expect(await campaignZaloSenderRepository.resetRestoreForRetry(ctx.a, { userId: ctx.owner.id, isAdmin: false })).toBeNull();
    expect((await rowOf(ctx.a)).status).toBe('logged_out');
  });

  it('khởi động lại / cron khôi phục không nhặt tài khoản đã đăng xuất (không còn cookie, không còn connected)', async () => {
    const ctx = await setup();
    await logout(ctx);

    const { rows } = await campaignZaloSenderRepository.findConnectedAccountsNeedingRestore();
    expect(rows.map((r) => Number(r.id))).not.toContain(ctx.a);
  });

  it('cảnh báo admin "Zalo mất kết nối" không tính tài khoản đăng xuất; vẫn tính tài khoản disconnected (đối chứng)', async () => {
    const ctx = await setup();
    await logout(ctx);
    await db.query(`UPDATE zalo_settings SET updated_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [ctx.a]);
    expect(await metricZaloDisconnected(5, 600)).toBe(0);

    await createZalo(ctx.owner.id, { name: 'Mất kết nối', zaloUserId: 'zuid-dc', status: 'disconnected' });
    await db.query(`UPDATE zalo_settings SET updated_at = NOW() - INTERVAL '1 hour' WHERE zalo_user_id = 'zuid-dc'`);
    expect(await metricZaloDisconnected(5, 600)).toBe(1);
  });
});

describe('quét QR lại', () => {
  const identity = (over = {}) => ({
    zaloUserId: 'zuid-a', displayName: 'Shop A', zaloName: 'Shop A', zaloPhone: '0900000000', cookieText: '{"cookie":[{"key":"a"}]}', ...over,
  });

  it('cùng zalo_user_id quét lại → status connected, hội thoại + tin + liên hệ + hộp thư đi + banner hiện lại, không mất gì', async () => {
    const ctx = await setup();
    await logout(ctx);
    expect((await listConversations(ctx)).body.data.total).toBe(1);

    const account = await zaloSettingsController.upsertQrLoggedInAccount(ctx.owner.id, identity(), 'user');

    expect(Number(account.id)).toBe(ctx.a);
    expect(await rowOf(ctx.a)).toMatchObject({ status: 'connected', is_default: true });
    const list = await listConversations(ctx);
    expect(keys(list.body.data.conversations)).toEqual([`webchat:${ctx.web}`, `zalo_personal:${ctx.conv}`, `zalo_personal:${ctx.group}`].sort());
    expect(list.body.data.total).toBe(3);
    expect((await own(request(app).get(`${BASE}/inbox/channels`), ctx)).body.data.channels).toContain('zalo_personal');
    expect((await own(request(app).get(`${BASE}/inbox/conversations/${ctx.conv}`).query(Q), ctx)).status).toBe(200);
    expect(idsOf((await own(request(app).get(`${BASE}/inbox/outbox`), ctx)).body.data.messages)).toEqual([ctx.outbound]);
    expect((await own(request(app).get(`${BASE}/inbox/contact-alerts`), ctx)).body.data.total).toBe(2);
    expect(idsOf((await own(request(app).get(`${BASE}/zalo-personal/sync/status`), ctx)).body.data.accounts)).toEqual([ctx.a]);
  });

  it('mô phỏng đúng đường lưu: zaloSettingRepository.updateQrConnectedById đưa về connected và hội thoại hiện lại', async () => {
    const ctx = await setup();
    await logout(ctx);
    const found = await zaloSettingRepository.findByZaloUserId(ctx.owner.id, 'zuid-a');
    expect(Number(found.id)).toBe(ctx.a);

    await zaloSettingRepository.updateQrConnectedById(found.id, { displayName: 'Shop A', zaloName: '', zaloPhone: '', cookieText: 'cookie-qr-moi' }, new Date());

    expect((await rowOf(ctx.a)).status).toBe('connected');
    expect((await listConversations(ctx)).body.data.total).toBe(3);
  });

  it('Zalo KHÁC (zalo_user_id khác) quét QR dù TRÙNG tên hiển thị → tạo tài khoản MỚI; tài khoản cũ và hội thoại của nó vẫn ẨN', async () => {
    const ctx = await setup();
    await logout(ctx);

    const account = await zaloSettingsController.upsertQrLoggedInAccount(ctx.owner.id, identity({ zaloUserId: 'zuid-nguoi-khac' }), 'user');

    expect(Number(account.id)).not.toBe(ctx.a);
    expect(await rowOf(ctx.a)).toMatchObject({ status: 'logged_out', zalo_user_id: 'zuid-a', cookie_text: null });
    const list = await listConversations(ctx);
    expect(keys(list.body.data.conversations)).toEqual([`webchat:${ctx.web}`]);
    expect(list.body.data.total).toBe(1);
  });
});

describe('ca hồi quy: phiên tự hết hạn (KHÔNG đăng xuất) giữ nguyên hành vi cũ', () => {
  it.each(['disconnected', 'needs_reauth'])('status=%s: vẫn thấy lịch sử hội thoại, tab Zalo, banner "cần đăng nhập lại"', async (status) => {
    const ctx = await setup();
    await db.query(`UPDATE zalo_settings SET status = $2 WHERE id = $1`, [ctx.a, status]);

    const list = await listConversations(ctx);
    expect(keys(list.body.data.conversations)).toEqual([`webchat:${ctx.web}`, `zalo_personal:${ctx.conv}`, `zalo_personal:${ctx.group}`].sort());
    expect(list.body.data.total).toBe(3);
    expect((await own(request(app).get(`${BASE}/inbox/channels`), ctx)).body.data.channels).toContain('zalo_personal');
    expect((await own(request(app).get(`${BASE}/inbox/conversations/${ctx.conv}`).query(Q), ctx)).status).toBe(200);
    expect(idsOf((await own(request(app).get(`${BASE}/inbox/outbox`), ctx)).body.data.messages)).toEqual([ctx.outbound]);
    expect((await own(request(app).get(`${BASE}/inbox/contact-alerts`), ctx)).body.data.total).toBe(2);

    const sync = await own(request(app).get(`${BASE}/zalo-personal/sync/status`), ctx);
    expect(sync.body.data.accounts).toHaveLength(1);
    expect(sync.body.data.accounts[0]).toMatchObject({ status, needsReauth: true, isConnected: false });
  });
});
