/**
 * Integration tests cho `/api/founderai/*` + `POST /api/campaigns/:id/sync-founderai` — Batch E.
 *
 * Phạm vi:
 *   - GET   /api/founderai/customers  /courses  /orders  /orders/:orderId
 *   - POST  /api/founderai/sync/customers  /sync/courses  /sync/orders  /sync/orders/:orderId
 *   - POST  /api/campaigns/:id/sync-founderai
 *
 * Mock:
 *   - `axios` (toàn bộ HTTP ra Founder AI WP REST) qua `jest.unstable_mockModule`.
 *
 * Lưu ý:
 *   - Env `UKNOW_API_URL`/`UKNOW_CONSUMER_KEY`/`UKNOW_CONSUMER_SECRET` phải
 *     được set TRƯỚC khi import `app.js` (controller singleton capture).
 *   - Sync sử dụng `db.getClient()` + transaction — DB thật.
 *   - Bảng `customer_purchases.order_status` tồn tại trong bootstrap → controller
 *     cache `purchaseOrderStatusColumnExists=true` và đi qua nhánh INSERT 13-col.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

process.env.UKNOW_API_URL = 'https://test.local/wp-json';
process.env.UKNOW_CONSUMER_KEY = 'test-key';
process.env.UKNOW_CONSUMER_SECRET = 'test-secret';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: mockAxiosGet },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  mockAxiosGet.mockReset();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function createCampaign({ userId, name = 'CMP A', status = 'active' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, status]
  );
  return rows[0];
}

async function createCustomer({ userId, email, phone = null, fullName = 'Khách' }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email, phone, full_name, customer_source)
     VALUES ($1, $2, $3, $4, 'founderai') RETURNING *`,
    [userId, email, phone, fullName]
  );
  return rows[0];
}

// ═══════════════════════════════════════════════════════════════════════
// Read proxy — GET /api/founderai/customers /courses /orders /orders/:id
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/founderai/customers', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/founderai/customers');
    expect(res.status).toBe(401);
  });

  it('happy path → map đúng + auth header Basic', async () => {
    const user = await createUser({ username: 'fa-c-1' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url, opts) => {
      expect(url).toContain('/wc/v3/customers');
      expect(opts.headers.Authorization).toMatch(/^Basic /);
      expect(opts.params).toMatchObject({ page: 1, per_page: 100 });
      return {
        status: 200,
        data: [
          {
            id: 1,
            email: 'a@b.com',
            first_name: 'A',
            last_name: 'B',
            username: 'ab',
            billing: { phone: '0901' },
            date_created: '2024-01-01',
            orders_count: '3',
            total_spent: '500000.50',
          },
        ],
        headers: { 'x-wp-total': '1', 'x-wp-totalpages': '1' },
      };
    });
    const res = await request(app)
      .get('/api/founderai/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({
      id: 1,
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      phone: '0901',
      ordersCount: 3,
      totalSpent: 500000.5,
    });
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.totalPages).toBe(1);
  });

  it('axios throw → 500', async () => {
    const user = await createUser({ username: 'fa-c-2' });
    const token = await loginAs(user);
    mockAxiosGet.mockRejectedValueOnce(new Error('network down'));
    const res = await request(app)
      .get('/api/founderai/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/founderai/orders/:orderId', () => {
  it('orderId không phải số → 400', async () => {
    const user = await createUser({ username: 'fa-o-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/founderai/orders/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('Woo trả 404 → 404 "Không tìm thấy đơn hàng"', async () => {
    const user = await createUser({ username: 'fa-o-2' });
    const token = await loginAs(user);
    const err = new Error('Not Found');
    err.response = { status: 404 };
    mockAxiosGet.mockRejectedValueOnce(err);
    const res = await request(app)
      .get('/api/founderai/orders/99')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('status=onhold → normalize on-hold + statusLabel="Quan tâm"', async () => {
    const user = await createUser({ username: 'fa-o-3' });
    const token = await loginAs(user);
    mockAxiosGet.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 100,
        status: 'onhold',
        total: '100000',
        currency: 'VND',
        billing: { email: 'x@y.z', first_name: 'X', last_name: 'Y' },
        line_items: [{ id: 1, name: 'P', product_id: 10, quantity: 1, total: '100000' }],
      },
    });
    const res = await request(app)
      .get('/api/founderai/orders/100')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('on-hold');
    expect(res.body.data.statusLabel).toBe('Quan tâm');
    expect(res.body.data.lineItems).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/founderai/sync/customers
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/founderai/sync/customers', () => {
  it('không token → 401', async () => {
    const res = await request(app).post('/api/founderai/sync/customers');
    expect(res.status).toBe(401);
  });

  it('1 trang, 2 customer mới → inserted=2 + lưu source=founderai', async () => {
    const user = await createUser({ username: 'fa-sc-1' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url, opts) => {
      if (opts.params.page === 1) {
        return {
          status: 200,
          headers: { 'x-wp-totalpages': '1' },
          data: [
            { email: 'one@u.local', first_name: 'O', last_name: 'N', billing: { phone: '0901' }, orders_count: 2, total_spent: '200000' },
            { email: 'two@u.local', first_name: 'T', last_name: 'W', billing: { phone: '0902' }, orders_count: 0, total_spent: '0' },
          ],
        };
      }
      return { status: 200, headers: {}, data: [] };
    });
    const res = await request(app)
      .post('/api/founderai/sync/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ inserted: 2, updated: 0, processed: 2 });

    const { rows } = await db.query(
      `SELECT email, customer_source, has_purchased, total_orders, total_spent
       FROM customers WHERE id_user = $1 ORDER BY email`,
      [user.id]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      email: 'one@u.local',
      customer_source: 'founderai',
      has_purchased: true,
      total_orders: 2,
      total_spent: '200000',
    });
    expect(rows[1].has_purchased).toBe(false);
  });

  it('Rerun với customer cùng email (case insensitive) → UPDATE path', async () => {
    const user = await createUser({ username: 'fa-sc-2' });
    await createCustomer({ userId: user.id, email: 'EXISTING@u.local' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async () => ({
      status: 200,
      headers: { 'x-wp-totalpages': '1' },
      data: [
        { email: 'existing@u.local', first_name: 'New', last_name: 'Name', billing: { phone: '0911' }, orders_count: 5, total_spent: '500000' },
      ],
    }));
    const res = await request(app)
      .post('/api/founderai/sync/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toMatchObject({ inserted: 0, updated: 1, processed: 1 });

    const { rows } = await db.query(
      `SELECT phone, total_orders FROM customers WHERE id_user = $1`,
      [user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: '0911', total_orders: 5 });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/founderai/sync/courses
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/founderai/sync/courses', () => {
  it('1 product mới → INSERT vào courses với id_user', async () => {
    const user = await createUser({ username: 'fa-co-1' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url, opts) => {
      if (opts.params.page === 1) {
        return {
          status: 200,
          headers: { 'x-wp-totalpages': '1' },
          data: [
            {
              id: 777,
              name: 'Course Founder AI',
              price: '299000',
              regular_price: '499000',
              short_description: 'desc',
              status: 'publish',
              categories: [{ name: 'AI' }],
              images: [{ src: 'https://x.test/img.png' }],
            },
          ],
        };
      }
      return { status: 200, headers: {}, data: [] };
    });
    const res = await request(app)
      .post('/api/founderai/sync/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ inserted: 1, updated: 0, processed: 1 });

    const { rows } = await db.query(
      `SELECT course_code, course_name, price, original_price, category, thumbnail_url
       FROM courses WHERE id_user = $1`,
      [user.id]
    );
    expect(rows[0]).toMatchObject({
      course_code: '777',
      course_name: 'Course Founder AI',
      price: '299000',
      original_price: '499000',
      category: 'AI',
      thumbnail_url: 'https://x.test/img.png',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/founderai/sync/orders/:orderId — single order
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/founderai/sync/orders/:orderId', () => {
  it('orderId không hợp lệ → 400', async () => {
    const user = await createUser({ username: 'fa-so-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/founderai/sync/orders/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('Woo trả status=processing (không hỗ trợ) → 422', async () => {
    const user = await createUser({ username: 'fa-so-2' });
    const token = await loginAs(user);
    mockAxiosGet.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 500,
        status: 'processing',
        billing: { email: 'x@y.z', first_name: 'X' },
        line_items: [],
      },
    });
    const res = await request(app)
      .post('/api/founderai/sync/orders/500')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('Đơn completed → INSERT customer_purchases + journey order_completed + refresh stats', async () => {
    const user = await createUser({ username: 'fa-so-3' });
    const token = await loginAs(user);

    mockAxiosGet.mockImplementation(async (url) => {
      if (url.endsWith('/wc/v3/orders/700')) {
        return {
          status: 200,
          data: {
            id: 700,
            status: 'completed',
            total: '500000',
            currency: 'VND',
            payment_method: 'bank',
            date_paid: '2025-01-15T10:00:00',
            billing: { email: 'buyer@u.local', first_name: 'B', last_name: 'U', phone: '0933' },
            line_items: [
              { id: 1, name: 'Course Z', product_id: 555, quantity: 1, price: '500000', total: '500000' },
            ],
          },
        };
      }
      if (url.endsWith('/wc/v3/products/555')) {
        return {
          status: 200,
          data: {
            id: 555,
            name: 'Course Z',
            price: '500000',
            regular_price: '500000',
            status: 'publish',
            categories: [],
          },
        };
      }
      return { status: 200, data: null };
    });

    const res = await request(app)
      .post('/api/founderai/sync/orders/700')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      orderId: 700,
      orderStatus: 'completed',
      insertedPurchases: 1,
      insertedCourses: 1,
    });

    const cust = await db.query(
      `SELECT id, has_purchased, total_orders, total_spent FROM customers WHERE id_user = $1`,
      [user.id]
    );
    expect(cust.rows[0]).toMatchObject({
      has_purchased: true,
      total_orders: 1,
      total_spent: '500000',
    });

    const purchases = await db.query(
      `SELECT product_name, amount, order_id, order_status, product_type FROM customer_purchases WHERE id_customer = $1`,
      [cust.rows[0].id]
    );
    expect(purchases.rows[0]).toMatchObject({
      product_name: 'Course Z',
      amount: '500000',
      order_id: '700',
      order_status: 'completed',
      product_type: 'complete',
    });

    const journey = await db.query(
      `SELECT event_type, event_channel FROM customer_journey WHERE id_customer = $1`,
      [cust.rows[0].id]
    );
    expect(journey.rows.map((r) => r.event_type)).toContain('order_completed');
  });

  it('Đơn on-hold → product_type=interested + journey order_pending', async () => {
    const user = await createUser({ username: 'fa-so-4' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.endsWith('/wc/v3/orders/800')) {
        return {
          status: 200,
          data: {
            id: 800,
            status: 'on-hold',
            total: '100000',
            currency: 'VND',
            billing: { email: 'hold@u.local', first_name: 'H', last_name: 'O' },
            line_items: [
              { id: 1, name: 'Course H', product_id: 444, quantity: 1, price: '100000', total: '100000' },
            ],
          },
        };
      }
      if (url.endsWith('/wc/v3/products/444')) {
        return {
          status: 200,
          data: { id: 444, name: 'Course H', price: '100000', regular_price: '100000', status: 'publish' },
        };
      }
      return { status: 200, data: null };
    });

    const res = await request(app)
      .post('/api/founderai/sync/orders/800')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const cust = await db.query(`SELECT id, has_purchased FROM customers WHERE id_user = $1`, [user.id]);
    expect(cust.rows[0].has_purchased).toBe(false);
    const purchases = await db.query(
      `SELECT product_type, order_status FROM customer_purchases WHERE id_customer = $1`,
      [cust.rows[0].id]
    );
    expect(purchases.rows[0]).toMatchObject({ product_type: 'interested', order_status: 'on-hold' });

    const journey = await db.query(
      `SELECT event_type FROM customer_journey WHERE id_customer = $1`,
      [cust.rows[0].id]
    );
    expect(journey.rows.map((r) => r.event_type)).toContain('order_pending');
  });

  it('Order không có email + phone → 422', async () => {
    const user = await createUser({ username: 'fa-so-5' });
    const token = await loginAs(user);
    mockAxiosGet.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 900,
        status: 'completed',
        billing: {},
        line_items: [],
      },
    });
    const res = await request(app)
      .post('/api/founderai/sync/orders/900')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/founderai/sync/orders  — bulk
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/founderai/sync/orders', () => {
  it('bulk: 1 đơn completed + 1 đơn on-hold → INSERT 2 customer + 2 purchase', async () => {
    const user = await createUser({ username: 'fa-bulk-1' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url, opts) => {
      if (url.endsWith('/wc/v3/orders')) {
        if (opts.params.page === 1) {
          return {
            status: 200,
            headers: { 'x-wp-totalpages': '1' },
            data: [
              {
                id: 1001,
                status: 'completed',
                total: '300000',
                currency: 'VND',
                date_paid: '2025-01-01',
                billing: { email: 'c1@u.local' },
                line_items: [{ id: 1, name: 'A', product_id: 11, quantity: 1, price: '300000', total: '300000' }],
              },
              {
                id: 1002,
                status: 'on-hold',
                total: '100000',
                currency: 'VND',
                date_created: '2025-01-02',
                billing: { email: 'c2@u.local' },
                line_items: [{ id: 2, name: 'B', product_id: 22, quantity: 1, price: '100000', total: '100000' }],
              },
            ],
          };
        }
        return { status: 200, headers: {}, data: [] };
      }
      if (url.endsWith('/wc/v3/products/11')) {
        return { status: 200, data: { id: 11, name: 'A', price: '300000', regular_price: '300000', status: 'publish' } };
      }
      if (url.endsWith('/wc/v3/products/22')) {
        return { status: 200, data: { id: 22, name: 'B', price: '100000', regular_price: '100000', status: 'publish' } };
      }
      return { status: 200, data: null };
    });

    const res = await request(app)
      .post('/api/founderai/sync/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      processedOrders: 2,
      processedLineItems: 2,
      insertedPurchases: 2,
      insertedCustomers: 2,
      insertedCourses: 2,
    });
  });

  it('UTM source=email_campaign + sources=email → đi qua filter, journey.event_channel=email', async () => {
    const user = await createUser({ username: 'fa-bulk-2' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url, opts) => {
      if (url.endsWith('/wc/v3/orders') && opts.params.page === 1) {
        return {
          status: 200,
          headers: { 'x-wp-totalpages': '1' },
          data: [
            {
              id: 2001,
              status: 'completed',
              total: '200000',
              currency: 'VND',
              date_paid: '2025-01-10',
              billing: { email: 'm@u.local' },
              line_items: [{ id: 1, name: 'X', product_id: 33, quantity: 1, total: '200000' }],
              meta_data: [{ key: '_wc_order_attribution_utm_source', value: 'email_campaign' }],
            },
          ],
        };
      }
      if (url.endsWith('/wc/v3/products/33')) {
        return { status: 200, data: { id: 33, name: 'X', price: '200000', regular_price: '200000', status: 'publish' } };
      }
      return { status: 200, headers: {}, data: [] };
    });

    const res = await request(app)
      .post('/api/founderai/sync/orders?sources=email')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.processedOrders).toBe(1);

    const journey = await db.query(
      `SELECT event_type, event_channel FROM customer_journey
       WHERE id_customer IN (SELECT id FROM customers WHERE id_user = $1)`,
      [user.id]
    );
    // Có ít nhất 1 row event_channel='email' (event order_completed)
    expect(journey.rows.some((r) => r.event_type === 'order_completed' && r.event_channel === 'email')).toBe(true);
  });

  it('UTM source=zalo nhưng filter sources=email → skippedBySource=1', async () => {
    const user = await createUser({ username: 'fa-bulk-3' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url, opts) => {
      if (url.endsWith('/wc/v3/orders') && opts.params.page === 1) {
        return {
          status: 200,
          headers: { 'x-wp-totalpages': '1' },
          data: [
            {
              id: 3001,
              status: 'completed',
              total: '100000',
              currency: 'VND',
              billing: { email: 'z@u.local' },
              line_items: [{ id: 1, name: 'Z', product_id: 99, quantity: 1, total: '100000' }],
              meta_data: [{ key: '_wc_order_attribution_utm_source', value: 'zalo_campaign' }],
            },
          ],
        };
      }
      return { status: 200, headers: {}, data: [] };
    });

    const res = await request(app)
      .post('/api/founderai/sync/orders?sources=email')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      processedOrders: 0,
      skippedBySource: 1,
      insertedPurchases: 0,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/campaigns/:id/sync-founderai
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/campaigns/:id/sync-founderai', () => {
  it('campaignId không hợp lệ → 400', async () => {
    const user = await createUser({ username: 'fa-cmp-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/campaigns/abc/sync-founderai')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('Không phải owner → 404', async () => {
    const owner = await createUser({ username: 'fa-cmp-owner' });
    const other = await createUser({ username: 'fa-cmp-other' });
    const camp = await createCampaign({ userId: owner.id });
    const token = await loginAs(other);
    const res = await request(app)
      .post(`/api/campaigns/${camp.id}/sync-founderai`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('Customer có completed order → uknow_status=purchased', async () => {
    const user = await createUser({ username: 'fa-cmp-2' });
    const camp = await createCampaign({ userId: user.id });
    const cust = await createCustomer({ userId: user.id, email: 'sub@u.local' });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, joined_at) VALUES ($1, $2, NOW())`,
      [camp.id, cust.id]
    );
    const token = await loginAs(user);

    mockAxiosGet.mockImplementation(async (url, opts) => {
      if (url.endsWith('/wc/v3/orders') && opts.params.billing_email === 'sub@u.local') {
        return { status: 200, data: [{ id: 1, status: 'completed' }] };
      }
      return { status: 200, data: [] };
    });

    const res = await request(app)
      .post(`/api/campaigns/${camp.id}/sync-founderai`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ synced: 1, unchanged: 0, total: 1 });

    const cc = await db.query(
      `SELECT uknow_status FROM campaign_customers WHERE id_campaign = $1`,
      [camp.id]
    );
    expect(cc.rows[0].uknow_status).toBe('purchased');
  });

  it('Customer chỉ có on-hold order → uknow_status=lead', async () => {
    const user = await createUser({ username: 'fa-cmp-3' });
    const camp = await createCampaign({ userId: user.id });
    const cust = await createCustomer({ userId: user.id, email: 'hold@u.local' });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, joined_at) VALUES ($1, $2, NOW())`,
      [camp.id, cust.id]
    );
    const token = await loginAs(user);

    mockAxiosGet.mockImplementation(async () => ({
      status: 200,
      data: [{ id: 2, status: 'on-hold' }],
    }));

    await request(app)
      .post(`/api/campaigns/${camp.id}/sync-founderai`)
      .set('Authorization', `Bearer ${token}`);
    const cc = await db.query(`SELECT uknow_status FROM campaign_customers WHERE id_customer = $1`, [cust.id]);
    expect(cc.rows[0].uknow_status).toBe('lead');
  });

  it('Customer không có order Woo → unchanged++, không update uknow_status', async () => {
    const user = await createUser({ username: 'fa-cmp-4' });
    const camp = await createCampaign({ userId: user.id });
    const cust = await createCustomer({ userId: user.id, email: 'none@u.local' });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, joined_at) VALUES ($1, $2, NOW())`,
      [camp.id, cust.id]
    );
    const token = await loginAs(user);
    mockAxiosGet.mockResolvedValue({ status: 200, data: [] });

    const res = await request(app)
      .post(`/api/campaigns/${camp.id}/sync-founderai`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toMatchObject({ synced: 0, unchanged: 1, total: 1 });
    const cc = await db.query(`SELECT uknow_status FROM campaign_customers WHERE id_customer = $1`, [cust.id]);
    expect(cc.rows[0].uknow_status).toBeNull();
  });
});
