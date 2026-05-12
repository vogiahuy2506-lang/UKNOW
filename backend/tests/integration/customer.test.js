/**
 * Integration tests cho `/api/customers` — CRUD + isolation + bulk upsert.
 *
 * Phạm vi:
 *   - Authorization (token bắt buộc).
 *   - GET / — list + pagination, search (email/phone/name), filter source,
 *     filter campaignId (qua 4 nguồn: campaign_customers, campaign_participations,
 *     customer_purchases, customer_journey), tenant isolation.
 *   - GET /:id — detail profile (purchases + email journey + campaign participations),
 *     isolation (user khác không xem được), 404 khi không tồn tại.
 *   - POST / — create với normalize customer_source (uknow|uknow_campaign),
 *     reject source không hợp lệ (400 nhưng vẫn 201 nếu source null).
 *   - PUT /:id — partial update (COALESCE), 404 isolation.
 *   - DELETE /:id — xoá + isolation.
 *   - POST /bulk — upsert items theo (email, phone, zalo_id), tính inserted/updated/skipped,
 *     tự động link vào campaign khi có campaignId.
 *
 * KHÔNG cover (để session sau):
 *   - getJourney / getCampaignJourneyDetail (cần customer_journey + email_messages full).
 *   - getInterestedCustomersWithCourses (cần courses + customer_purchases data).
 *   - interested-courses-from-api (cần mock WooCommerce HTTP).
 *   - Email/Zalo tracking pixel (đã có test file riêng).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
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

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function createCustomerRow({ userId, email = null, phone = null, fullName = 'Khách', source = null, customFields = null }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email, phone, full_name, customer_source, custom_fields)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, email, phone, fullName, source, customFields ? JSON.stringify(customFields) : null]
  );
  return rows[0];
}

async function createCampaignRow({ userId, name = 'C1' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'running') RETURNING *`,
    [userId, name]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────
describe('Customer routes — authorization', () => {
  it.each([
    ['get list',            'get',    '/api/customers'],
    ['get by id',           'get',    '/api/customers/1'],
    ['create',              'post',   '/api/customers'],
    ['update',              'put',    '/api/customers/1'],
    ['delete',              'delete', '/api/customers/1'],
    ['bulk upsert',         'post',   '/api/customers/bulk'],
    ['journey',             'get',    '/api/customers/1/journey'],
    ['campaign-participations', 'get', '/api/customers/1/campaign-participations'],
  ])('%s yêu cầu auth → 401', async (_name, method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/customers — create', () => {
  it('tạo thành công với đầy đủ field, trả 201 + data có id', async () => {
    const user = await createUser();
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'new@uknow.local',
        phone: '0900000001',
        fullName: 'New Customer',
        gender: 'male',
        customerSource: 'uknow',
        notes: 'test note',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      email: 'new@uknow.local',
      phone: '0900000001',
      fullName: 'New Customer',
    });

    const { rows } = await db.query(`SELECT id_user, customer_source, notes FROM customers WHERE id = $1`, [res.body.data.id]);
    expect(Number(rows[0].id_user)).toBe(Number(user.id));
    expect(rows[0].customer_source).toBe('uknow');
    expect(rows[0].notes).toBe('test note');
  });

  it('customer_source = "campaign" → normalize thành "uknow_campaign"', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'x@u.local', customerSource: 'campaign' });
    expect(res.status).toBe(201);
    const { rows } = await db.query(`SELECT customer_source FROM customers WHERE id = $1`, [res.body.data.id]);
    expect(rows[0].customer_source).toBe('uknow_campaign');
  });

  it('customer_source không hợp lệ → 400', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'x@u.local', customerSource: 'facebook_ads' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/nguon khach hang|customer/i);
  });

  it('email không hợp lệ → 400 (validator)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('không có email/phone đều hợp lệ (route validator không bắt buộc)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Anon' });
    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/customers — list', () => {
  it('trả mảng rỗng + pagination khi không có customer', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it('chỉ trả customer của user hiện tại (tenant isolation)', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await createCustomerRow({ userId: userA.id, email: 'a@u.local' });
    await createCustomerRow({ userId: userB.id, email: 'b@u.local' });

    const tokenA = await loginAs(userA);
    const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${tokenA}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].email).toBe('a@u.local');
  });

  it('pagination — page=2, limit=2 trả về items[2..3]', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await createCustomerRow({ userId: user.id, email: `c${i}@u.local`, fullName: `KH ${i}` });
    }
    const token = await loginAs(user);
    const res = await request(app).get('/api/customers?page=2&limit=2').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it('search match email', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, email: 'alice@u.local', fullName: 'Alice' });
    await createCustomerRow({ userId: user.id, email: 'bob@u.local', fullName: 'Bob' });
    const token = await loginAs(user);
    const res = await request(app).get('/api/customers?search=alice').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].email).toBe('alice@u.local');
  });

  it('search match phone', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, phone: '0911111111', fullName: 'KH1' });
    await createCustomerRow({ userId: user.id, phone: '0922222222', fullName: 'KH2' });
    const token = await loginAs(user);
    const res = await request(app).get('/api/customers?search=0911').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].phone).toBe('0911111111');
  });

  it('filter source=uknow_campaign trả customer có source IN ("uknow_campaign","campaign_uknow")', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, email: 'a@u.local', source: 'uknow' });
    await createCustomerRow({ userId: user.id, email: 'b@u.local', source: 'uknow_campaign' });
    await createCustomerRow({ userId: user.id, email: 'c@u.local', source: 'campaign_uknow' });

    const token = await loginAs(user);
    const res = await request(app).get('/api/customers?source=uknow_campaign').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items).toHaveLength(2);
    const emails = res.body.data.items.map((i) => i.email).sort();
    expect(emails).toEqual(['b@u.local', 'c@u.local']);
  });

  it('filter campaignId — match customer qua campaign_customers', async () => {
    const user = await createUser();
    const camp = await createCampaignRow({ userId: user.id });
    const cInside = await createCustomerRow({ userId: user.id, email: 'inside@u.local' });
    await createCustomerRow({ userId: user.id, email: 'outside@u.local' });
    await db.query(`INSERT INTO campaign_customers (id_campaign, id_customer) VALUES ($1, $2)`, [camp.id, cInside.id]);

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers?campaignId=${camp.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].email).toBe('inside@u.local');
  });

  it('filter campaignId — fallback match qua customer_journey (4th source)', async () => {
    const user = await createUser();
    const camp = await createCampaignRow({ userId: user.id });
    const cWithJourney = await createCustomerRow({ userId: user.id, email: 'journey@u.local' });
    await db.query(
      `INSERT INTO customer_journey (id_customer, id_campaign, event_type) VALUES ($1, $2, 'email_opened')`,
      [cWithJourney.id, camp.id]
    );
    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers?campaignId=${camp.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].email).toBe('journey@u.local');
  });

  it('campaign_count được tính từ campaign_customers join campaigns id_user', async () => {
    const user = await createUser();
    const c1 = await createCampaignRow({ userId: user.id, name: 'C1' });
    const c2 = await createCampaignRow({ userId: user.id, name: 'C2' });
    const cu = await createCustomerRow({ userId: user.id, email: 'multi@u.local' });
    await db.query(`INSERT INTO campaign_customers (id_campaign, id_customer) VALUES ($1, $2), ($3, $2)`, [c1.id, cu.id, c2.id]);

    const token = await loginAs(user);
    const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items[0].campaignCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/customers/:id — detail', () => {
  it('trả profile + purchases + campaignParticipations + emailJourney + journey', async () => {
    const user = await createUser();
    const cu = await createCustomerRow({ userId: user.id, email: 'd@u.local', fullName: 'Detail KH' });
    const camp = await createCampaignRow({ userId: user.id });

    // 1 purchase
    await db.query(
      `INSERT INTO customer_purchases (id_customer, id_campaign, id_run, product_name, amount, order_id, order_status, purchase_date)
       VALUES ($1, $2, NULL, 'Khoá A', 500000, 'WC-1', 'completed', NOW())`,
      [cu.id, camp.id]
    );
    // 1 campaign_customer (participation row)
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, email_received_count, has_opened, last_activity_at, joined_at)
       VALUES ($1, $2, 2, TRUE, NOW(), NOW())`,
      [camp.id, cu.id]
    );
    // 1 email message
    await db.query(
      `INSERT INTO email_messages (id_customer, id_campaign, subject, status, open_count) VALUES ($1, $2, 'Subj', 'opened', 1)`,
      [cu.id, camp.id]
    );
    // 1 journey event
    await db.query(
      `INSERT INTO customer_journey (id_customer, id_campaign, event_type, event_channel, event_data)
       VALUES ($1, $2, 'email_opened', 'email', $3::jsonb)`,
      [cu.id, camp.id, JSON.stringify({ description: 'Đã mở email' })]
    );

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      email: 'd@u.local',
      fullName: 'Detail KH',
    });
    expect(res.body.data.purchases).toHaveLength(1);
    expect(res.body.data.purchases[0]).toMatchObject({
      productName: 'Khoá A',
      orderId: 'WC-1',
      itemStatus: 'complete',
    });
    expect(res.body.data.campaignParticipations).toHaveLength(1);
    expect(res.body.data.emailJourney).toHaveLength(1);
    expect(res.body.data.journey).toHaveLength(1);
    expect(res.body.data.emailsReceived).toBe(2);
  });

  it('không tồn tại → 404', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/customers/999999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('isolation — user khác không xem được', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const cu = await createCustomerRow({ userId: userA.id, email: 'a@u.local' });
    const tokenB = await loginAs(userB);
    const res = await request(app).get(`/api/customers/${cu.id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PUT /api/customers/:id — update', () => {
  it('partial update với COALESCE — chỉ field truyền lên thay đổi', async () => {
    const user = await createUser();
    const cu = await createCustomerRow({ userId: user.id, email: 'old@u.local', fullName: 'Old' });
    const token = await loginAs(user);
    const res = await request(app)
      .put(`/api/customers/${cu.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('New Name');
    const { rows } = await db.query(`SELECT email, full_name FROM customers WHERE id = $1`, [cu.id]);
    expect(rows[0].email).toBe('old@u.local'); // không bị xoá
    expect(rows[0].full_name).toBe('New Name');
  });

  it('update customFields (JSONB) — stringify đúng', async () => {
    const user = await createUser();
    const cu = await createCustomerRow({ userId: user.id, email: 'cf@u.local' });
    const token = await loginAs(user);
    const res = await request(app)
      .put(`/api/customers/${cu.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ customFields: { dept: 'sales', score: 9 } });
    expect(res.status).toBe(200);
    const { rows } = await db.query(`SELECT custom_fields FROM customers WHERE id = $1`, [cu.id]);
    expect(rows[0].custom_fields).toEqual({ dept: 'sales', score: 9 });
  });

  it('email không hợp lệ → 400 (validator)', async () => {
    const user = await createUser();
    const cu = await createCustomerRow({ userId: user.id, email: 'a@u.local' });
    const token = await loginAs(user);
    const res = await request(app)
      .put(`/api/customers/${cu.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-email' });
    expect(res.status).toBe(400);
  });

  it('customer_source không hợp lệ → 400 trước khi update', async () => {
    const user = await createUser();
    const cu = await createCustomerRow({ userId: user.id, email: 'a@u.local' });
    const token = await loginAs(user);
    const res = await request(app)
      .put(`/api/customers/${cu.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ customerSource: 'tiktok_ads' });
    expect(res.status).toBe(400);
  });

  it('404 khi không tồn tại / user khác', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const cu = await createCustomerRow({ userId: userA.id, email: 'a@u.local' });
    const tokenB = await loginAs(userB);
    const res = await request(app)
      .put(`/api/customers/${cu.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ fullName: 'Hijack' });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('DELETE /api/customers/:id', () => {
  it('xoá thành công', async () => {
    const user = await createUser();
    const cu = await createCustomerRow({ userId: user.id, email: 'del@u.local' });
    const token = await loginAs(user);
    const res = await request(app).delete(`/api/customers/${cu.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const { rows } = await db.query(`SELECT id FROM customers WHERE id = $1`, [cu.id]);
    expect(rows).toHaveLength(0);
  });

  it('404 khi không tồn tại', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).delete('/api/customers/999999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('isolation — user khác không xoá được', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const cu = await createCustomerRow({ userId: userA.id });
    const tokenB = await loginAs(userB);
    const res = await request(app).delete(`/api/customers/${cu.id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/customers/bulk — bulk upsert', () => {
  it('thiếu items → 400', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).post('/api/customers/bulk').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it('items rỗng → 400', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).post('/api/customers/bulk').set('Authorization', `Bearer ${token}`).send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('insert 3 customer mới — inserted=3, updated=0', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { email: 'a@u.local', fullName: 'A' },
          { email: 'b@u.local', fullName: 'B' },
          { phone: '0900000003', fullName: 'C' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ inserted: 3, updated: 0, skipped: 0, total: 3 });
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM customers WHERE id_user = $1`, [user.id]);
    expect(rows[0].c).toBe(3);
  });

  it('upsert theo email + phone — bản trùng update thay vì insert', async () => {
    const user = await createUser();
    await createCustomerRow({ userId: user.id, email: 'dup@u.local', phone: '0911', fullName: 'Old' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { email: 'dup@u.local', phone: '0911', fullName: 'Updated' },
          { email: 'fresh@u.local', fullName: 'Fresh' },
        ],
      });
    expect(res.body.data).toMatchObject({ inserted: 1, updated: 1, skipped: 0 });
    const { rows } = await db.query(`SELECT full_name FROM customers WHERE email = 'dup@u.local'`);
    expect(rows[0].full_name).toBe('Updated');
  });

  it('items không có email/phone/zaloId đều bị skip', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ fullName: 'No Contact' }, { email: 'ok@u.local' }] });
    expect(res.body.data).toMatchObject({ inserted: 1, skipped: 1 });
  });

  it('có campaignId → tự động link customer vào campaign (campaign_customers + campaign_participations)', async () => {
    const user = await createUser();
    const camp = await createCampaignRow({ userId: user.id });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ email: 'link1@u.local' }, { email: 'link2@u.local' }],
        campaignId: camp.id,
      });
    expect(res.body.data).toMatchObject({ inserted: 2, campaignLinked: 2 });
    const cc = await db.query(`SELECT COUNT(*)::int AS c FROM campaign_customers WHERE id_campaign = $1`, [camp.id]);
    expect(cc.rows[0].c).toBe(2);
    const cp = await db.query(`SELECT COUNT(*)::int AS c FROM campaign_participations WHERE id_campaign = $1`, [camp.id]);
    expect(cp.rows[0].c).toBe(2);
  });

  it('upsert by zalo_id', async () => {
    const user = await createUser();
    await db.query(
      `INSERT INTO customers (id_user, zalo_id, full_name) VALUES ($1, 'zalo-uid-1', 'Old')`,
      [user.id]
    );
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ zaloId: 'zalo-uid-1', fullName: 'NewName' }] });
    expect(res.body.data).toMatchObject({ inserted: 0, updated: 1 });
    const { rows } = await db.query(`SELECT full_name FROM customers WHERE zalo_id = 'zalo-uid-1'`);
    expect(rows[0].full_name).toBe('NewName');
  });

  it('gender normalize: "nam" → male, "Nu" → female, "khac" → other', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { email: 'g1@u.local', gender: 'nam' },
          { email: 'g2@u.local', gender: 'Nu' },
          { email: 'g3@u.local', gender: 'khac' },
          { email: 'g4@u.local', gender: 'unknown-value' },
        ],
      });
    const { rows } = await db.query(
      `SELECT email, gender FROM customers WHERE id_user = $1 ORDER BY email`,
      [user.id]
    );
    expect(rows.map((r) => [r.email, r.gender])).toEqual([
      ['g1@u.local', 'male'],
      ['g2@u.local', 'female'],
      ['g3@u.local', 'other'],
      ['g4@u.local', null],
    ]);
  });
});
