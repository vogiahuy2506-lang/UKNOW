/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-5 — trang Báo cáo (`/app/reports`): MỘT nguồn số.
 *
 * `GET /api/dashboard/overview` (4 thẻ), `/analytics` (đã gửi mỗi ngày + đơn theo ngày), `/campaigns` (bảng chiến dịch
 * trong kỳ) và `POST /api/dashboard/insights` (nhận xét AI dùng số do SERVER tính).
 *
 * Chạy trên DB thật (5433): test mock DB không bắt được SQL sai cột / sai kiểu (vụ `cj.campaign_id`, `chatbots`).
 * Mọi số kỳ vọng VIẾT TAY từ dữ liệu dựng ở đầu file, không tính bằng chính code đang test.
 *
 * Bẫy được cài sẵn để các nguồn cũ (sai) cho số KHÁC số đúng — đổi nguồn là một ca đỏ:
 *   - `customer_journey`: chỉ 2 sự kiện `email_sent` (thật có 8 thư) và 9 sự kiện `order_pending` (thật có 4 đơn chờ);
 *   - `campaign_runs`: bộ đếm phình (successful_sends 777, failed_sends 555, total_recipients 4242);
 *   - `campaigns.total_sent` = 6161.
 *
 * Mốc thời gian của tin dùng "hôm nay 00:10 giờ VN" (`CURRENT_DATE + 00:10`) để ca không phụ thuộc giờ chạy test.
 * Script integration chạy với TZ=UTC: lệch 7 giờ ở biên ngày (00:10 VN = 17:10 UTC hôm trước) lộ ngay ở ca "cửa sổ".
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.pool.end();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

const get = async (user, path) => {
  const token = await loginAs(user);
  return request(app).get(`/api/dashboard${path}`).set('Authorization', `Bearer ${token}`);
};

// ─────────────────────────── Dựng dữ liệu ───────────────────────────

const todayAt = (time) => `(CURRENT_DATE::timestamp + interval '${time}')`;
const yesterdayAt = (time) => `((CURRENT_DATE - 1)::timestamp + interval '${time}')`;

async function vnDate(offsetDays = 0) {
  const { rows } = await db.query(`SELECT to_char(CURRENT_DATE + $1::int, 'YYYY-MM-DD') AS day`, [offsetDays]);
  return rows[0].day;
}

let phoneSequence = 20000000;

async function createOwner(label, overrides = {}) {
  phoneSequence += 1;
  return createUser({ username: `rp_${label}_${Date.now().toString(36)}`, phone: `09${phoneSequence}`, ...overrides });
}

/** Một chiến dịch + node + lượt chạy của `owner`, với bộ đếm lượt chạy PHÌNH có chủ ý. */
async function createContext(owner, { name, type }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status, total_sent)
     VALUES ($1, $1, $1, $2, $3, 'active', 6161) RETURNING id`,
    [owner.id, name, type]
  );
  const campaignId = Number(rows[0].id);
  const node = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, execution_order)
     VALUES ($1, 'action', 'send_email', 'send', 1) RETURNING id`,
    [campaignId]
  );
  const run = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, total_recipients, successful_sends, failed_sends)
     VALUES ($1, $2, 'manual', 'running', 4242, 777, 555) RETURNING id`,
    [campaignId, owner.id]
  );
  return { ownerId: owner.id, campaignId, nodeId: Number(node.rows[0].id), runId: Number(run.rows[0].id) };
}

async function insertEmail(c, {
  to,
  status = 'sent',
  when = todayAt('00:10'),
  preview = false,
  opened = false,
  clicked = false,
  clickCount = 0,
  campaignId = c.campaignId,
  runId = c.runId,
  nodeId = c.nodeId,
}) {
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, recipient_email, email_step, status,
        is_preview, first_opened_at, first_clicked_at, click_count, error_message, tracking_token, sent_at, created_at)
     VALUES ($1, $1, $2, $3, $4, $5, 1, $6::text, $7,
             CASE WHEN $8::boolean THEN ${when} END, CASE WHEN $9::boolean THEN ${when} END, $10,
             CASE WHEN $6::text = 'failed' THEN 'smtp loi' END,
             md5(random()::text || clock_timestamp()::text), ${when}, ${when})`,
    [c.ownerId, campaignId, runId, nodeId, to, status, preview, opened, clicked, clickCount]
  );
}

async function insertZalo(c, { channel = 'zalo_personal', to, status, clickCount = 0, when = todayAt('00:10') }) {
  await db.query(
    `INSERT INTO zalo_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_type, recipient_value,
        group_id, status, tracking_metadata, click_count, is_preview, tracking_token, sent_at, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, FALSE,
             md5(random()::text || clock_timestamp()::text), ${when}, ${when}, ${when})`,
    [c.ownerId, c.campaignId, c.runId, c.nodeId, channel, channel === 'zalo_group' ? 'group' : 'phone', to,
      channel === 'zalo_group' ? to : null, status, JSON.stringify({ status, stepIndex: 1 }), clickCount]
  );
}

async function insertAdapter(c, { channel, to, status, category = null, when = todayAt('00:10'), campaignId = c.campaignId }) {
  const instant = `((${when}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  await db.query(
    `INSERT INTO campaign_channel_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, id_node, channel, recipient_key, step_index, status,
        error_category, is_preview, sent_at, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, $6, 1, $7, $8, FALSE, ${status === 'sent' ? instant : 'NULL'}, ${instant}, ${instant})`,
    [c.ownerId, campaignId, c.runId, c.nodeId, channel, to, status, category]
  );
}

/** `productType`: 'complete' → đã mua; 'interested' → khách để lại thông tin (đơn chờ) — bootstrap chưa có cột order_status. */
async function insertPurchase(owner, campaignId, { productType, createdAt = 'NOW()' }) {
  const customer = await db.query(
    `INSERT INTO customers (id_user, workspace_owner_id, email, full_name)
     VALUES ($1, $1, $2, 'Khach') RETURNING id`,
    [owner.id, `kh${Math.random().toString(36).slice(2, 9)}@test.local`]
  );
  await db.query(
    `INSERT INTO customer_purchases (id_customer, id_campaign, product_name, product_type, amount, currency, created_at)
     VALUES ($1, $2, 'Khoa hoc', $3, 100000, 'VND', ${createdAt})`,
    [customer.rows[0].id, campaignId, productType]
  );
}

async function insertJourney(owner, campaignId, eventType, n, extra = {}) {
  const customer = await db.query(
    `INSERT INTO customers (id_user, workspace_owner_id, email) VALUES ($1, $1, $2) RETURNING id`,
    [owner.id, `jr${Math.random().toString(36).slice(2, 9)}@test.local`]
  );
  for (let i = 0; i < n; i += 1) {
    await db.query(
      `INSERT INTO customer_journey (id_customer, id_campaign, event_type, event_channel, event_data, event_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, ${todayAt('00:10')})`,
      [customer.rows[0].id, campaignId, eventType, extra.channel ?? null, JSON.stringify({ order_id: `${eventType}-${i}` })]
    );
  }
}

/**
 * Bộ dữ liệu chính của một chủ. Số đúng (viết tay):
 *   Email (CA, loại 'email'): 7 trạng thái đã gửi (sent, delivered, opened, clicked×3 link, bounced, spam, unsubscribed)
 *     + 1 thư lỗi rồi gửi lại được = 8 thư đã gửi; 1 thư lỗi thật; queued / pending / gửi thử bị bỏ; 3 thư đã mở, 1 đã nhấp.
 *   Zalo (CB, loại 'zalo'): cá nhân 3 gửi (1 có click) + 1 lỗi + 1 aborted (bỏ); kết bạn 4 gửi + 1 lỗi (dòng riêng).
 *   Đa kênh (CC, loại 'mixed'): Zalo nhóm 2 gửi; Telegram 2 gửi + 1 lỗi cứng.
 *   Đơn: CA 2 mua + 1 chờ; CB 1 mua + 2 chờ; CC 1 mua + 1 chờ.
 */
async function seedMain(owner) {
  const ca = await createContext(owner, { name: 'CA Email', type: 'email' });
  const cb = await createContext(owner, { name: 'CB Zalo', type: 'zalo' });
  const cc = await createContext(owner, { name: 'CC Da kenh', type: 'mixed' });

  await insertEmail(ca, { to: 'a1@x.test', status: 'sent' });
  await insertEmail(ca, { to: 'a2@x.test', status: 'delivered' });
  await insertEmail(ca, { to: 'a3@x.test', status: 'opened', opened: true });
  await insertEmail(ca, { to: 'a4@x.test', status: 'clicked', opened: true, clicked: true, clickCount: 3 });
  await insertEmail(ca, { to: 'a5@x.test', status: 'bounced' });
  await insertEmail(ca, { to: 'a6@x.test', status: 'spam' });
  await insertEmail(ca, { to: 'a7@x.test', status: 'unsubscribed', opened: true });
  await insertEmail(ca, { to: 'a8@x.test', status: 'failed' });
  await insertEmail(ca, { to: 'a9@x.test', status: 'failed' });
  await insertEmail(ca, { to: 'a9@x.test', status: 'sent' });
  await insertEmail(ca, { to: 'a10@x.test', status: 'queued' });
  await insertEmail(ca, { to: 'a11@x.test', status: 'sent', preview: true });
  await insertEmail(ca, { to: 'a12@x.test', status: 'pending' });

  for (const to of ['0901', '0902', '0903']) await insertZalo(cb, { to, status: 'sent', clickCount: to === '0902' ? 2 : 0 });
  await insertZalo(cb, { to: '0904', status: 'failed' });
  await insertZalo(cb, { to: '0905', status: 'aborted' });
  for (const to of ['0911', '0912', '0913', '0914']) await insertZalo(cb, { channel: 'zalo_friend_request', to, status: 'sent' });
  await insertZalo(cb, { channel: 'zalo_friend_request', to: '0915', status: 'failed' });

  await insertZalo(cc, { channel: 'zalo_group', to: 'g1', status: 'sent' });
  await insertZalo(cc, { channel: 'zalo_group', to: 'g2', status: 'sent' });
  await insertAdapter(cc, { channel: 'telegram', to: 't1', status: 'sent' });
  await insertAdapter(cc, { channel: 'telegram', to: 't2', status: 'sent' });
  await insertAdapter(cc, { channel: 'telegram', to: 't3', status: 'failed', category: 'hard' });

  await insertPurchase(owner, ca.campaignId, { productType: 'complete' });
  await insertPurchase(owner, ca.campaignId, { productType: 'complete' });
  await insertPurchase(owner, ca.campaignId, { productType: 'interested' });
  await insertPurchase(owner, cb.campaignId, { productType: 'complete' });
  await insertPurchase(owner, cb.campaignId, { productType: 'interested' });
  await insertPurchase(owner, cb.campaignId, { productType: 'interested' });
  await insertPurchase(owner, cc.campaignId, { productType: 'complete' });
  await insertPurchase(owner, cc.campaignId, { productType: 'interested' });

  // Nguồn cũ (sai): hành trình khách chỉ ghi 2/8 thư và 9 "đơn chờ" khác số thật.
  await insertJourney(owner, ca.campaignId, 'email_sent', 2, { channel: 'email' });
  await insertJourney(owner, ca.campaignId, 'order_pending', 9);

  return { ca, cb, cc };
}

const byChannelObject = (rows, key) => Object.fromEntries(rows.map((row) => [row.channel, row[key]]));

// ─────────────────────────── /overview ───────────────────────────

describe('GET /api/dashboard/overview — đếm từ bảng tin, một nguồn', () => {
  it('số khớp tay: Đã gửi, Chưa gửi được, Email mở/nhấp, Nhấp mọi kênh, Đơn hàng; kết bạn KHÔNG vào Đã gửi', async () => {
    const owner = await createOwner('main');
    await seedMain(owner);
    const today = await vnDate();

    const res = await get(owner, `/overview?startDate=${today}&endDate=${today}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    // Đã gửi = 8 email + 3 Zalo cá nhân + 2 Zalo nhóm + 2 Telegram = 15. 4 lời mời kết bạn là dòng riêng.
    expect(data.sent.total).toBe(15);
    expect(byChannelObject(data.sent.byChannel, 'sent')).toEqual({
      email: 8, zalo_personal: 3, zalo_group: 2, telegram: 2, whatsapp: 0,
    });
    expect(data.sent.friendRequests).toBe(4);
    expect(data.sent.byChannel.map((row) => row.channel)).not.toContain('zalo_friend_request');

    // Chưa gửi được (theo người nhận) = email a8 + Zalo 0904 + Telegram t3. a9 lỗi rồi gửi lại được nên KHÔNG tính;
    // kết bạn lỗi 0915 và 'aborted' 0905 không tính.
    expect(data.failed).toEqual({ total: 3 });

    // Email: 8 gửi, 3 đã mở (a3, a4, a7), 1 đã nhấp (a4 — bấm 3 link vẫn là MỘT thư).
    expect(data.email).toEqual({ sent: 8, opened: 3, clicked: 1, openRate: 37.5, clickRate: 12.5 });

    // Nhấp mọi kênh = 1 thư email + 1 tin Zalo có click_count > 0.
    expect(data.clicks.total).toBe(2);
    expect(byChannelObject(data.clicks.byChannel, 'clicked')).toEqual({
      email: 1, zalo_personal: 1, zalo_group: 0, telegram: 0, whatsapp: 0,
    });

    // Đơn: một nguồn customer_purchases — KHÔNG phải 9 sự kiện order_pending trên hành trình.
    expect(data.orders.completed).toBe(4);
    expect(data.orders.pending).toBe(4);
    expect(data.orders.byChannel).toEqual([
      { channel: 'email', completed: 2, pending: 1 },
      { channel: 'zalo_personal', completed: 1, pending: 2 },
      { channel: 'other', completed: 1, pending: 1 },
    ]);
  });

  it('không còn các trường của bản cũ (headline, journeyEvents, channels.*)', async () => {
    const owner = await createOwner('shape');
    const res = await get(owner, '/overview');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(['clicks', 'email', 'failed', 'filters', 'orders', 'sent']);
    expect(res.body.data.sent).toEqual({ total: 0, byChannel: expect.any(Array), friendRequests: 0 });
    expect(res.body.data.email).toEqual({ sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 });
    expect(res.body.data.orders).toEqual({ completed: 0, pending: 0, byChannel: [] });
  });

  it('tỉ lệ mở / nhấp ≤ 100% khi MỘT thư bấm 3 link (đếm theo thư, không theo link)', async () => {
    const owner = await createOwner('rate');
    const c = await createContext(owner, { name: 'Mot thu', type: 'email' });
    await insertEmail(c, { to: 'solo@x.test', status: 'clicked', opened: true, clicked: true, clickCount: 3 });
    const res = await get(owner, '/overview');
    expect(res.body.data.email).toEqual({ sent: 1, opened: 1, clicked: 1, openRate: 100, clickRate: 100 });
    expect(res.body.data.email.clickRate).toBeLessThanOrEqual(100);
  });

  it('đơn chờ: tổng = cộng theo kênh (một nguồn), kể cả đơn của chiến dịch đa kênh', async () => {
    const owner = await createOwner('orders');
    await seedMain(owner);
    const res = await get(owner, '/overview');
    const { orders } = res.body.data;
    expect(orders.pending).toBe(orders.byChannel.reduce((sum, row) => sum + row.pending, 0));
    expect(orders.completed).toBe(orders.byChannel.reduce((sum, row) => sum + row.completed, 0));
    expect(orders.pending).toBe(4);
  });

  it('cửa sổ ngày VN (TZ=UTC): tin 23:50 hôm qua và 00:10 hôm nay, đơn 00:30 hôm nay đúng ngày VN', async () => {
    const owner = await createOwner('window');
    const c = await createContext(owner, { name: 'Cua so', type: 'email' });
    await insertEmail(c, { to: 'y@x.test', when: yesterdayAt('23:50') });
    await insertEmail(c, { to: 't@x.test', when: todayAt('00:10') });
    await insertPurchase(owner, c.campaignId, {
      productType: 'complete',
      createdAt: `((${todayAt('00:30')}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    });
    await insertPurchase(owner, c.campaignId, {
      productType: 'complete',
      createdAt: `((${yesterdayAt('23:30')}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    });
    const today = await vnDate();
    const yesterday = await vnDate(-1);

    const onlyToday = (await get(owner, `/overview?startDate=${today}&endDate=${today}`)).body.data;
    expect(onlyToday.sent.total).toBe(1);
    expect(onlyToday.orders.completed).toBe(1);

    const onlyYesterday = (await get(owner, `/overview?startDate=${yesterday}&endDate=${yesterday}`)).body.data;
    expect(onlyYesterday.sent.total).toBe(1);
    expect(onlyYesterday.orders.completed).toBe(1);

    const both = (await get(owner, `/overview?startDate=${yesterday}&endDate=${today}`)).body.data;
    expect(both.sent.total).toBe(2);
    expect(both.orders.completed).toBe(2);
  });

  it('bộ lọc kênh áp lên KÊNH CỦA TỪNG TIN (kể cả chiến dịch đa kênh) và bộ lọc chiến dịch lọc trong CTE', async () => {
    const owner = await createOwner('filters');
    const { ca, cc } = await seedMain(owner);

    const email = (await get(owner, '/overview?campaignType=email')).body.data;
    expect(email.sent.total).toBe(8);
    expect(email.sent.byChannel.map((row) => row.channel)).toEqual(['email']);
    expect(email.sent.friendRequests).toBe(0);
    expect(email.failed.total).toBe(1);

    // Zalo cá nhân gồm cả lời mời kết bạn (dòng riêng).
    const zalo = (await get(owner, '/overview?campaignType=zalo')).body.data;
    expect(zalo.sent.total).toBe(3);
    expect(zalo.sent.friendRequests).toBe(4);
    expect(zalo.email.sent).toBe(0);

    // Chiến dịch đa kênh (loại 'mixed') vẫn hiện ở bộ lọc Telegram / Zalo nhóm — lọc theo kênh của tin, không theo loại chiến dịch.
    const telegram = (await get(owner, '/overview?campaignType=telegram')).body.data;
    expect(telegram.sent.total).toBe(2);
    expect(telegram.failed.total).toBe(1);
    const group = (await get(owner, '/overview?campaignType=zalo_group')).body.data;
    expect(group.sent.total).toBe(2);

    const onlyMixed = (await get(owner, `/overview?campaignIds=${cc.campaignId}`)).body.data;
    expect(onlyMixed.sent.total).toBe(4);
    expect(onlyMixed.email.sent).toBe(0);
    expect(onlyMixed.orders).toEqual({ completed: 1, pending: 1, byChannel: [{ channel: 'other', completed: 1, pending: 1 }] });

    const twoCampaigns = (await get(owner, `/overview?campaignIds=${ca.campaignId},${cc.campaignId}`)).body.data;
    expect(twoCampaigns.sent.total).toBe(12);
  });

  it('cô lập: chủ chỉ thấy tin của mình; admin thấy toàn hệ thống', async () => {
    const owner = await createOwner('iso_a');
    const other = await createOwner('iso_b');
    const admin = await createUser({ role: 'admin', username: `rp_admin_${Date.now().toString(36)}` });
    await seedMain(owner);
    const cOther = await createContext(other, { name: 'Cua nguoi khac', type: 'email' });
    for (let i = 0; i < 5; i += 1) await insertEmail(cOther, { to: `o${i}@x.test` });

    expect((await get(owner, '/overview')).body.data.sent.total).toBe(15);
    expect((await get(other, '/overview')).body.data.sent.total).toBe(5);
    expect((await get(admin, '/overview')).body.data.sent.total).toBe(20);
  });
});

// ─────────────────────────── /analytics ───────────────────────────

describe('GET /api/dashboard/analytics — đã gửi mỗi ngày (một chuỗi từ sendStats)', () => {
  it('đủ mọi ngày, tổng các ngày = sent.total, mỗi ngày là chuỗi YYYY-MM-DD theo giờ VN, kết bạn không có trong chuỗi', async () => {
    const owner = await createOwner('daily');
    await seedMain(owner);
    const c = await createContext(owner, { name: 'Hom qua', type: 'email' });
    await insertEmail(c, { to: 'hq1@x.test', when: yesterdayAt('23:50') });
    await insertEmail(c, { to: 'hq2@x.test', when: yesterdayAt('10:00') });
    const today = await vnDate();
    const yesterday = await vnDate(-1);
    const twoDaysAgo = await vnDate(-2);

    const res = await get(owner, `/analytics?startDate=${twoDaysAgo}&endDate=${today}`);
    expect(res.status).toBe(200);
    const { dailySent } = res.body.data;

    expect(dailySent.map((row) => row.date)).toEqual([twoDaysAgo, yesterday, today]);
    expect(dailySent[0]).toEqual({ date: twoDaysAgo, total: 0, email: 0, zalo_personal: 0, zalo_group: 0, telegram: 0, whatsapp: 0 });
    // 23:50 và 10:00 hôm qua đều là ngày VN hôm qua (23:50 VN = 16:50 UTC cùng ngày; 10:00 VN = 03:00 UTC).
    expect(dailySent[1]).toMatchObject({ date: yesterday, total: 2, email: 2 });
    // Hôm nay: bộ dữ liệu chính (15 tin, không gồm 4 lời mời kết bạn).
    expect(dailySent[2]).toEqual({ date: today, total: 15, email: 8, zalo_personal: 3, zalo_group: 2, telegram: 2, whatsapp: 0 });

    const overview = (await get(owner, `/overview?startDate=${twoDaysAgo}&endDate=${today}`)).body.data;
    expect(dailySent.reduce((sum, row) => sum + row.total, 0)).toBe(overview.sent.total);
  });

  it('bộ lọc kênh: chỉ còn cột của kênh đó; chiến dịch đa kênh (mixed) có mặt trong chuỗi', async () => {
    const owner = await createOwner('dailyfilter');
    await seedMain(owner);
    const today = await vnDate();
    const res = await get(owner, `/analytics?startDate=${today}&endDate=${today}&campaignType=telegram`);
    expect(res.body.data.dailySent).toEqual([{ date: today, total: 2, telegram: 2 }]);
  });

  it('ordersTimeline: đơn theo NGÀY VN (đơn 00:30 hôm nay không rơi sang hôm qua), tổng = số thẻ', async () => {
    const owner = await createOwner('ordersday');
    const c = await createContext(owner, { name: 'Don', type: 'email' });
    await insertPurchase(owner, c.campaignId, {
      productType: 'complete',
      createdAt: `((${todayAt('00:30')}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    });
    await insertPurchase(owner, c.campaignId, {
      productType: 'interested',
      createdAt: `((${yesterdayAt('23:30')}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    });
    const today = await vnDate();
    const yesterday = await vnDate(-1);

    const res = await get(owner, `/analytics?startDate=${yesterday}&endDate=${today}`);
    const byDate = Object.fromEntries(res.body.data.ordersTimeline.map((row) => [row.date, row]));
    expect(byDate[today]).toMatchObject({ completedOrders: 1, pendingOrders: 0, emailCompletedOrders: 1 });
    expect(byDate[yesterday]).toMatchObject({ completedOrders: 0, pendingOrders: 1, emailPendingOrders: 1 });

    const overview = (await get(owner, `/overview?startDate=${yesterday}&endDate=${today}`)).body.data;
    expect(overview.orders).toMatchObject({ completed: 1, pending: 1 });
  });

  it('không còn timeline cũ (emailSent/zaloSent/… từ hành trình)', async () => {
    const owner = await createOwner('shape2');
    const res = await get(owner, '/analytics?period=7d');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(['dailySent', 'filters', 'ordersTimeline']);
    expect(res.body.data.dailySent).toHaveLength(7);
    expect(res.body.data.ordersTimeline).toHaveLength(7);
    expect(res.body.data.ordersTimeline[0]).not.toHaveProperty('emailSent');
  });
});

// ─────────────────────────── /campaigns ───────────────────────────

describe('GET /api/dashboard/campaigns — bảng "Chiến dịch trong kỳ"', () => {
  it('Đã gửi · Chưa gửi được · Mở · Nhấp · Đã mua theo chiến dịch, sắp theo đã gửi; kết bạn không vào dòng nào', async () => {
    const owner = await createOwner('table');
    const { ca, cb, cc } = await seedMain(owner);
    const today = await vnDate();

    const res = await get(owner, `/campaigns?startDate=${today}&endDate=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      { campaignId: ca.campaignId, campaignName: 'CA Email', campaignType: 'email', sent: 8, failed: 1, opened: 3, clicked: 1, purchased: 2 },
      { campaignId: cc.campaignId, campaignName: 'CC Da kenh', campaignType: 'mixed', sent: 4, failed: 1, opened: 0, clicked: 0, purchased: 1 },
      { campaignId: cb.campaignId, campaignName: 'CB Zalo', campaignType: 'zalo', sent: 3, failed: 1, opened: 0, clicked: 1, purchased: 1 },
    ]);
  });

  it('limit cắt bớt dòng; chiến dịch không có tin trong kỳ không xuất hiện; chiến dịch đã xoá gộp một dòng campaignId null', async () => {
    const owner = await createOwner('tablelimit');
    const { ca } = await seedMain(owner);
    const idle = await createContext(owner, { name: 'Khong gui', type: 'email' });
    const gone = await createContext(owner, { name: 'Se bi xoa', type: 'telegram' });
    await insertAdapter(gone, { channel: 'telegram', to: 'del1', status: 'sent' });
    await insertAdapter(gone, { channel: 'telegram', to: 'del2', status: 'sent' });
    await db.query('DELETE FROM campaigns WHERE id = $1', [gone.campaignId]);
    const today = await vnDate();

    const all = (await get(owner, `/campaigns?startDate=${today}&endDate=${today}`)).body.data.items;
    expect(all.map((row) => row.campaignId)).not.toContain(idle.campaignId);
    const deleted = all.find((row) => row.campaignId === null);
    expect(deleted).toMatchObject({ campaignName: null, sent: 2, failed: 0, purchased: 0 });

    const top1 = (await get(owner, `/campaigns?startDate=${today}&endDate=${today}&limit=1`)).body.data.items;
    expect(top1).toHaveLength(1);
    expect(top1[0].campaignId).toBe(ca.campaignId);
  });

  it('cô lập: không lộ tên / số của chiến dịch chủ khác', async () => {
    const owner = await createOwner('tableiso_a');
    const other = await createOwner('tableiso_b');
    const cOther = await createContext(other, { name: 'Bi mat', type: 'email' });
    await insertEmail(cOther, { to: 'secret@x.test' });
    const res = await get(owner, '/campaigns');
    expect(res.body.data.items).toEqual([]);
  });
});

// ─────────────────────────── /insights (nhận xét AI) ───────────────────────────

describe('POST /api/dashboard/insights — nhận xét AI dùng số do SERVER tính', () => {
  const realFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  let prompts;

  beforeEach(() => {
    prompts = [];
    process.env.GEMINI_API_KEY = 'test-key';
    globalThis.fetch = async (url, init) => {
      if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
      const body = JSON.parse(init.body);
      prompts.push(body.contents[0].parts[0].text);
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  overview: 'Tong quan thu nghiem',
                  key_metrics_analysis: { open_rate: { value: '37.5%' } },
                  charts: {},
                  notes: [],
                }),
              }],
            },
            finishReason: 'STOP',
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      };
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });

  it('prompt chứa số đếm từ bảng tin; KHÔNG chứa số do trình duyệt gửi lên, bộ đếm campaign_runs hay số hành trình', async () => {
    const owner = await createOwner('ai');
    await seedMain(owner);
    const today = await vnDate();
    const token = await loginAs(owner);

    const res = await request(app)
      .post('/api/dashboard/insights')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filters: { startDate: today, endDate: today, campaignType: 'all', campaignIds: [] },
        locale: 'vi',
        // Trình duyệt bản cũ còn gửi số của nó lên — server phải bỏ qua.
        overview: { sent: { total: 987654 }, headline: { totalRecipients: 555444, successfulSends: 444333, failedSends: 333222 } },
        analytics: { timeline: [{ date: today, emailSent: 111222 }] },
        topListsData: { topCampaignsByClicks: [{ campaignName: 'GIA MAO', clickCount: 246810 }] },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prompts).toHaveLength(1);
    const prompt = prompts[0];

    // Số đúng, từ bảng tin.
    expect(prompt).toContain('Đã gửi (số tin, không gồm lời mời kết bạn Zalo): 15');
    expect(prompt).toContain('Email: 8 | Zalo cá nhân: 3 | Zalo nhóm: 2 | Telegram: 2');
    expect(prompt).toContain('Lời mời kết bạn Zalo đã gửi (dòng riêng, không cộng vào Đã gửi): 4');
    expect(prompt).toContain('Chưa gửi được (số người nhận chưa nhận được tin sau khi đã thử lại): 3');
    expect(prompt).toContain('đã mở 3 (37.5% số thư đã gửi); đã bấm link 1 (12.5% số thư đã gửi)');
    expect(prompt).toContain('Khách để lại thông tin (đơn chờ): 4; Đã mua: 4');
    expect(prompt).toContain('CA Email (email): đã gửi 8 · chưa gửi được 1 · mở 3 · nhấp 1 · đã mua 2');

    // Số sai không được lọt vào lời.
    for (const wrong of ['987654', '555444', '444333', '333222', '111222', 'GIA MAO', '246810']) {
      expect(prompt).not.toContain(wrong);
    }
    // Bộ đếm lượt chạy phình (777 / 555 / 4242) và campaigns.total_sent (6161) — nguồn cũ của dòng "Người nhận / gửi thành công / lỗi".
    expect(prompt).not.toMatch(/4242|6161|Người nhận \/ gửi thành công/);
    expect(prompt).not.toMatch(/\b777\b/);
    expect(prompt).not.toMatch(/\b555\b/);

    const { rows } = await db.query('SELECT payload FROM dashboard_insights WHERE id_user = $1', [owner.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.overview).toBe('Tong quan thu nghiem');
  });

  it('body chỉ có bộ lọc vẫn chạy (không còn đòi overview / analytics / topListsData); filters sai kiểu → 400', async () => {
    const owner = await createOwner('ai2');
    const token = await loginAs(owner);
    const ok = await request(app).post('/api/dashboard/insights').set('Authorization', `Bearer ${token}`).send({});
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .post('/api/dashboard/insights')
      .set('Authorization', `Bearer ${token}`)
      .send({ filters: 'khong-phai-doi-tuong' });
    expect(bad.status).toBe(400);
  });
});
