/**
 * Integration tests cho POST /api/webhooks/woocommerce/order — WooCommerce → CRM.
 *
 * Đặc thù endpoint:
 *   - Endpoint trả 200 ngay, xử lý DB qua `setImmediate` (best-effort, async).
 *     → Test phải đợi DB rows bằng polling.
 *   - Yêu cầu env `WC_WEBHOOK_USER_ID` (id_user gán cho khách hàng webhook).
 *   - Xác thực HMAC qua `WC_WEBHOOK_SECRET` (test mặc định KHÔNG set → bypass).
 *
 * Phạm vi:
 *   - Validation: payload không object → bỏ qua.
 *   - WC_WEBHOOK_USER_ID không set → bỏ qua.
 *   - Thiếu UTM (utm_campaign hoặc id_email/id_zalo) → bỏ qua.
 *   - UTM tham chiếu invalid (campaign/email_msg không tồn tại) → bỏ qua.
 *   - Match customer theo email (priority email_first cho email_campaign).
 *   - Insert customer_purchases + customer_journey 'order_completed'.
 *   - Update uknow_status: NULL → 'purchased' (status='completed').
 *   - Upgrade product_type 'interested' → 'complete' khi đơn từ on-hold → completed.
 *   - Dedup: cùng order_id + status → bỏ qua call thứ hai.
 *   - Tạo customer mới khi email_campaign + email khớp không tìm thấy + allowCreate=TRUE.
 *   - Match course theo course_code = product_id.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
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
  delete process.env.WC_WEBHOOK_SECRET; // luôn bỏ verify chữ ký
});

afterEach(() => {
  delete process.env.WC_WEBHOOK_USER_ID;
});

/**
 * Poll DB cho tới khi predicate trả truthy hoặc hết timeout.
 */
async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await predicate();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function createCampaign({ userId, name = 'C' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'running') RETURNING *`,
    [userId, name]
  );
  return rows[0];
}

async function createCustomer({ userId, email = null, phone = null, fullName = 'Khách' }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email, phone, full_name) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, email, phone, fullName]
  );
  return rows[0];
}

async function createEmailMessage({ campaignId, customerId = null }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (id_campaign, id_customer, status, tracking_token)
     VALUES ($1, $2, 'sent', $3) RETURNING *`,
    [campaignId, customerId, `em-${Math.random()}`]
  );
  return rows[0];
}

async function createCourse({ courseCode, name = 'Khoá A' }) {
  const productId = Number.isFinite(parseInt(courseCode, 10)) ? parseInt(courseCode, 10) : null;
  const { rows } = await db.query(
    `INSERT INTO courses (course_code, course_name, product_id) VALUES ($1, $2, $3) RETURNING *`,
    [courseCode, name, productId]
  );
  return rows[0];
}

/** Build WooCommerce webhook payload với UTM params trong session_entry URL. */
function buildPayload({
  orderId = 100,
  status = 'completed',
  email = 'cust@u.local',
  phone = null,
  total = 500000,
  lineItems = [{ productId: '101', name: 'Khoá A', total: 500000, quantity: 1 }],
  utmCampaign,
  utmCustomer = null,
  utmEmailMsgId,
  utmSource = 'email_campaign',
}) {
  const params = new URLSearchParams();
  if (utmCampaign) params.set('utm_campaign', String(utmCampaign));
  if (utmCustomer) params.set('utm_customer', String(utmCustomer));
  if (utmEmailMsgId) params.set('utm_id_email', String(utmEmailMsgId));
  if (utmSource) params.set('utm_source', utmSource);
  const sessionEntry = `https://uknow.vn/course?${params.toString()}`;

  return {
    id: orderId,
    number: String(orderId),
    status,
    currency: 'VND',
    total: String(total),
    payment_method: 'cod',
    date_created: new Date().toISOString(),
    billing: {
      first_name: 'Khách',
      last_name: 'Hàng',
      email,
      phone: phone || '',
    },
    line_items: lineItems.map((it) => ({
      product_id: it.productId,
      name: it.name,
      total: String(it.total),
      quantity: it.quantity,
    })),
    meta_data: [
      { key: '_wc_order_attribution_session_entry', value: sessionEntry },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/webhooks/woocommerce/order — guard rails', () => {
  it('200 ngay nhưng KHÔNG ghi gì khi WC_WEBHOOK_USER_ID không set', async () => {
    const res = await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({ utmCampaign: 1, utmEmailMsgId: 1 }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Cho async path 200ms để chắc chắn không ghi gì
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases`);
    expect(rows[0].c).toBe(0);
  });

  it('payload không phải object → bỏ qua', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const res = await request(app).post('/api/webhooks/woocommerce/order').send('plain-string');
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases`);
    expect(rows[0].c).toBe(0);
  });

  it('thiếu utm_campaign → bỏ qua không ghi purchase', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const payload = buildPayload({ utmCampaign: null, utmEmailMsgId: 1 });
    await request(app).post('/api/webhooks/woocommerce/order').send(payload);
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases`);
    expect(rows[0].c).toBe(0);
  });

  it('thiếu utm_id_email VÀ utm_id_zalo_message → bỏ qua', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const payload = buildPayload({ utmCampaign: 1, utmEmailMsgId: null });
    await request(app).post('/api/webhooks/woocommerce/order').send(payload);
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases`);
    expect(rows[0].c).toBe(0);
  });

  it('UTM tham chiếu campaign không tồn tại → bỏ qua', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({ campaignId: camp.id });
    const payload = buildPayload({ utmCampaign: 99999, utmEmailMsgId: em.id });
    await request(app).post('/api/webhooks/woocommerce/order').send(payload);
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases`);
    expect(rows[0].c).toBe(0);
  });

  it('không tìm thấy customer (no email/phone/zalo_uid match + email_campaign) → tạo mới', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({ campaignId: camp.id });
    await createCourse({ courseCode: '101' });

    const payload = buildPayload({
      utmCampaign: camp.id,
      utmEmailMsgId: em.id,
      email: 'auto-create@u.local',
      utmSource: 'email_campaign',
    });
    await request(app).post('/api/webhooks/woocommerce/order').send(payload);

    const found = await waitFor(async () => {
      const { rows } = await db.query(`SELECT * FROM customers WHERE email = 'auto-create@u.local' LIMIT 1`);
      return rows[0] || null;
    });
    expect(found).not.toBeNull();
    expect(Number(found.id_user)).toBe(Number(user.id));
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Happy path — order completed → write purchase + journey + uknow_status', () => {
  it('ghi customer_purchases với product_type=complete, id_course đúng', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'happy@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    const course = await createCourse({ courseCode: '201', name: 'Excel cơ bản' });

    const payload = buildPayload({
      orderId: 555,
      utmCampaign: camp.id,
      utmCustomer: customer.id,
      utmEmailMsgId: em.id,
      email: 'happy@u.local',
      total: 750000,
      lineItems: [{ productId: '201', name: 'Excel cơ bản', total: 750000, quantity: 1 }],
    });

    await request(app).post('/api/webhooks/woocommerce/order').send(payload);

    const purchase = await waitFor(async () => {
      const { rows } = await db.query(`SELECT * FROM customer_purchases WHERE order_id = '555' LIMIT 1`);
      return rows[0] || null;
    });
    expect(purchase).not.toBeNull();
    expect(purchase).toMatchObject({
      product_type: 'complete',
      product_name: 'Excel cơ bản',
    });
    expect(Number(purchase.id_customer)).toBe(Number(customer.id));
    expect(Number(purchase.id_course)).toBe(Number(course.id));
    expect(Number(purchase.id_campaign)).toBe(Number(camp.id));
    expect(Number(purchase.amount)).toBe(750000);
  });

  it('ghi customer_journey event order_completed với event_data chứa products', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'journey@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    await createCourse({ courseCode: '301' });

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      orderId: 777,
      utmCampaign: camp.id,
      utmEmailMsgId: em.id,
      email: 'journey@u.local',
      lineItems: [{ productId: '301', name: 'Khoá X', total: 500000, quantity: 1 }],
    }));

    const journey = await waitFor(async () => {
      const { rows } = await db.query(
        `SELECT * FROM customer_journey WHERE event_data->>'order_id' = '777'`
      );
      return rows[0] || null;
    });
    expect(journey).not.toBeNull();
    expect(journey.event_type).toBe('order_completed');
    expect(journey.event_channel).toBe('email');
    expect(journey.event_data.status).toBe('completed');
    expect(journey.event_data.products).toEqual([
      { product_id: '301', product_name: 'Khoá X', quantity: 1, total: 500000 },
    ]);
  });

  it('set uknow_status=purchased trong campaign_customers (insert mới khi chưa có)', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'unkw@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    await createCourse({ courseCode: '401' });

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      utmCampaign: camp.id,
      utmEmailMsgId: em.id,
      email: 'unkw@u.local',
      lineItems: [{ productId: '401', name: 'X', total: 100000, quantity: 1 }],
    }));

    const cc = await waitFor(async () => {
      const { rows } = await db.query(
        `SELECT uknow_status FROM campaign_customers WHERE id_campaign = $1 AND id_customer = $2`,
        [camp.id, customer.id]
      );
      return rows[0] || null;
    });
    expect(cc.uknow_status).toBe('purchased');
  });

  it('upgrade uknow_status từ "interested" → "purchased" (không downgrade)', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'up@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    await createCourse({ courseCode: '501' });

    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, uknow_status, joined_at)
       VALUES ($1, $2, 'interested', NOW())`,
      [camp.id, customer.id]
    );

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      utmCampaign: camp.id,
      utmEmailMsgId: em.id,
      email: 'up@u.local',
      lineItems: [{ productId: '501', name: 'X', total: 1000, quantity: 1 }],
    }));

    await waitFor(async () => {
      const { rows } = await db.query(
        `SELECT uknow_status FROM campaign_customers WHERE id_campaign = $1 AND id_customer = $2`,
        [camp.id, customer.id]
      );
      return rows[0]?.uknow_status === 'purchased' ? rows[0] : null;
    });
    const { rows: ccRows } = await db.query(
      `SELECT uknow_status FROM campaign_customers WHERE id_campaign = $1`,
      [camp.id]
    );
    expect(ccRows[0].uknow_status).toBe('purchased');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('On-hold → completed upgrade & dedup', () => {
  it('on-hold trước → product_type="interested" + journey "order_pending"', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'oh@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    await createCourse({ courseCode: '601' });

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      orderId: 800,
      status: 'on-hold',
      utmCampaign: camp.id,
      utmEmailMsgId: em.id,
      email: 'oh@u.local',
      lineItems: [{ productId: '601', name: 'X', total: 100, quantity: 1 }],
    }));

    const purchase = await waitFor(async () => {
      const { rows } = await db.query(`SELECT product_type FROM customer_purchases WHERE order_id = '800' LIMIT 1`);
      return rows[0] || null;
    });
    expect(purchase.product_type).toBe('interested');

    const { rows: cj } = await db.query(
      `SELECT event_type FROM customer_journey WHERE event_data->>'order_id' = '800'`
    );
    expect(cj[0].event_type).toBe('order_pending');
  });

  it('on-hold rồi update sang completed → product_type chuyển interested → complete', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'upgr@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    await createCourse({ courseCode: '701' });

    // Lần 1: on-hold
    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      orderId: 900, status: 'on-hold',
      utmCampaign: camp.id, utmEmailMsgId: em.id,
      email: 'upgr@u.local',
      lineItems: [{ productId: '701', name: 'X', total: 100, quantity: 1 }],
    }));
    await waitFor(async () => (await db.query(`SELECT product_type FROM customer_purchases WHERE order_id='900'`)).rows[0] || null);

    // Lần 2: completed
    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      orderId: 900, status: 'completed',
      utmCampaign: camp.id, utmEmailMsgId: em.id,
      email: 'upgr@u.local',
      lineItems: [{ productId: '701', name: 'X', total: 100, quantity: 1 }],
    }));
    await waitFor(async () => {
      const { rows } = await db.query(`SELECT product_type FROM customer_purchases WHERE order_id='900' LIMIT 1`);
      return rows[0]?.product_type === 'complete' ? rows[0] : null;
    });

    const { rows } = await db.query(`SELECT product_type FROM customer_purchases WHERE order_id='900' LIMIT 1`);
    expect(rows[0].product_type).toBe('complete');
  });

  it('dedup: cùng order_id + cùng status gọi 2 lần → chỉ ghi 1 purchase + 1 journey', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'd@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    await createCourse({ courseCode: '801' });

    const payload = buildPayload({
      orderId: 1010,
      utmCampaign: camp.id, utmEmailMsgId: em.id,
      email: 'd@u.local',
      lineItems: [{ productId: '801', name: 'X', total: 100, quantity: 1 }],
    });

    await request(app).post('/api/webhooks/woocommerce/order').send(payload);
    await waitFor(async () => (await db.query(`SELECT id FROM customer_purchases WHERE order_id='1010'`)).rows[0] || null);

    await request(app).post('/api/webhooks/woocommerce/order').send(payload);
    await new Promise((r) => setTimeout(r, 300));

    const { rows: purchaseRows } = await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases WHERE order_id='1010'`);
    expect(purchaseRows[0].c).toBe(1);

    const { rows: journeyRows } = await db.query(
      `SELECT COUNT(*)::int AS c FROM customer_journey WHERE event_data->>'order_id' = '1010'`
    );
    expect(journeyRows[0].c).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Match course by course_code = product_id', () => {
  it('course_code không match product_id → bỏ qua purchase đó (warn log)', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'nocourse@u.local' });
    const em = await createEmailMessage({ campaignId: camp.id, customerId: customer.id });
    await createCourse({ courseCode: '901' }); // course tồn tại với code 901

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      orderId: 2000,
      utmCampaign: camp.id, utmEmailMsgId: em.id,
      email: 'nocourse@u.local',
      lineItems: [
        { productId: '901', name: 'Match', total: 100, quantity: 1 },
        { productId: '999', name: 'NoCourse', total: 100, quantity: 1 },
      ],
    }));

    await waitFor(async () => (await db.query(`SELECT id FROM customer_purchases WHERE order_id='2000'`)).rows[0] || null);
    const { rows } = await db.query(`SELECT product_name FROM customer_purchases WHERE order_id='2000' ORDER BY id`);
    expect(rows).toHaveLength(1);
    expect(rows[0].product_name).toBe('Match');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Customer matching priority', () => {
  it('email_campaign → priority email_first, không tạo mới nếu tìm thấy', async () => {
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const customer = await createCustomer({ userId: user.id, email: 'match-pri@u.local', phone: '0900111222' });
    const em = await createEmailMessage({ campaignId: camp.id });
    await createCourse({ courseCode: 'P1' });

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      orderId: 3000,
      utmCampaign: camp.id, utmEmailMsgId: em.id,
      email: 'match-pri@u.local',
      phone: '0900111222',
      utmSource: 'email_campaign',
      lineItems: [{ productId: 'P1', name: 'X', total: 100, quantity: 1 }],
    }));

    await waitFor(async () => (await db.query(`SELECT id FROM customer_purchases WHERE order_id='3000'`)).rows[0] || null);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id_user = $1`, [user.id]);
    expect(rows[0].c).toBe(1); // không tạo thêm

    const { rows: purchases } = await db.query(`SELECT id_customer FROM customer_purchases WHERE order_id='3000'`);
    expect(Number(purchases[0].id_customer)).toBe(Number(customer.id));
  });

  it('email match nhưng không có với userId này → tạo mới (email_campaign cho phép create)', async () => {
    const userA = await createUser();
    const userB = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(userA.id);
    // Customer thuộc userB → KHÔNG match cho userA
    await createCustomer({ userId: userB.id, email: 'cross@u.local' });

    const camp = await createCampaign({ userId: userA.id });
    const em = await createEmailMessage({ campaignId: camp.id });
    await createCourse({ courseCode: 'CC1' });

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      orderId: 4000,
      utmCampaign: camp.id, utmEmailMsgId: em.id,
      email: 'cross@u.local',
      lineItems: [{ productId: 'CC1', name: 'X', total: 100, quantity: 1 }],
    }));

    await waitFor(async () => (await db.query(`SELECT id FROM customers WHERE id_user = $1 AND email = 'cross@u.local'`, [userA.id])).rows[0] || null);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customers WHERE email = 'cross@u.local'`);
    expect(rows[0].c).toBe(2); // 1 cũ của userB + 1 mới của userA
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('HMAC signature verification', () => {
  it('có WC_WEBHOOK_SECRET nhưng thiếu signature → bỏ qua', async () => {
    process.env.WC_WEBHOOK_SECRET = 'test-secret';
    const user = await createUser();
    process.env.WC_WEBHOOK_USER_ID = String(user.id);
    const camp = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({ campaignId: camp.id });
    await createCourse({ courseCode: 'S1' });

    await request(app).post('/api/webhooks/woocommerce/order').send(buildPayload({
      utmCampaign: camp.id, utmEmailMsgId: em.id,
      email: 'sig@u.local',
      lineItems: [{ productId: 'S1', name: 'X', total: 100, quantity: 1 }],
    }));
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customer_purchases`);
    expect(rows[0].c).toBe(0);
  });
});
