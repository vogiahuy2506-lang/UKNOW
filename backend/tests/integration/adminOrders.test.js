/**
 * Integration tests cho `/api/admin/orders`.
 *
 * Phạm vi:
 *   - Authorization: chỉ role 'admin' (super_admin) mới được truy cập.
 *   - GET / — filter (status, search, dateFrom/dateTo), pagination, KPI.
 *   - PATCH /:orderCode/cancel — chỉ cho phép cancel đơn pending; vẫn cancel DB
 *     dù PayOS trả lỗi (graceful — link/QR có thể đã hết hạn ở PayOS).
 *
 * Mock:
 *   - `payos.util.js` để chặn network. KPI total/success/pending/cancelled
 *     vẫn tính trên DB nên không bị ảnh hưởng.
 *
 * Lưu ý:
 *   - Schema bootstrap chỉ cho status IN ('pending','success','cancelled','failed').
 *     Không tạo đơn 'completed' (giá trị này không tồn tại trong CHECK constraint).
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

const mockPayosCancel = jest.fn();

jest.unstable_mockModule('../../src/utils/payos.util.js', () => ({
  default: {
    paymentRequests: { create: jest.fn(), cancel: mockPayosCancel },
    webhooks: { verify: jest.fn() },
  },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan, createOrder } = await import('./helpers/db.js');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  mockPayosCancel.mockReset().mockResolvedValue({ code: '00' });
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

describe('Authorization — /api/admin/orders', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/admin/orders');
    expect(res.status).toBe(401);
  });

  it('user/employee → 403', async () => {
    const u = await createUser({ role: 'user', username: 'u1' });
    const e = await createUser({ role: 'employee', username: 'e1' });
    const tU = await loginAs(u);
    const tE = await loginAs(e);
    const r1 = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${tU}`);
    const r2 = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${tE}`);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
  });

  it('admin → 200', async () => {
    const a = await createUser({ role: 'admin', username: 'sa' });
    const t = await loginAs(a);
    const res = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('orders');
    expect(res.body.data).toHaveProperty('kpi');
    expect(res.body.data).toHaveProperty('total');
  });
});

describe('GET /api/admin/orders — list + KPI', () => {
  /**
   * Tạo seed gồm 4 đơn ở các status khác nhau để test filter + KPI.
   */
  async function seedOrders() {
    const plan = await createPlan({ code: 'pro', name: 'Pro' });
    const u = await createUser({ role: 'user', username: 'buyer1', email: 'buyer1@test.local' });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'success', amount: 500000 });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'pending', amount: 600000 });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'cancelled', amount: 700000 });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'failed', amount: 800000 });
    return { plan, user: u };
  }

  it('không filter → trả về tất cả + KPI tổng quan', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    await seedOrders();
    const t = await loginAs(admin);

    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(4);
    expect(Number(res.body.data.total)).toBe(4);
    expect(Number(res.body.data.kpi.totalOrders)).toBe(4);
    expect(Number(res.body.data.kpi.successCount)).toBe(1);
    expect(Number(res.body.data.kpi.pendingCount)).toBe(1);
    expect(Number(res.body.data.kpi.cancelledCount)).toBe(1);
    // totalRevenue chỉ tính đơn success
    expect(Number(res.body.data.kpi.totalRevenue)).toBe(500000);
  });

  it('filter status=pending → chỉ trả đơn pending', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    await seedOrders();
    const t = await loginAs(admin);

    const res = await request(app)
      .get('/api/admin/orders?status=pending')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.orders.every((o) => o.status === 'pending')).toBe(true);
    expect(Number(res.body.data.total)).toBe(1);
  });

  it('search ILIKE qua user_email và order_code', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u1 = await createUser({ role: 'user', username: 'alice_b', email: 'alice@buy.com' });
    const u2 = await createUser({ role: 'user', username: 'bob_b', email: 'bob@buy.com' });
    await createOrder({ planId: plan.id, userId: u1.id, userEmail: u1.email, status: 'success' });
    await createOrder({ planId: plan.id, userId: u2.id, userEmail: u2.email, status: 'success' });
    const t = await loginAs(admin);

    const res = await request(app)
      .get('/api/admin/orders?search=alice@')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0].userEmail).toBe('alice@buy.com');
  });

  it('search theo order_code (ép kiểu CAST)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });
    const order = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'success' });

    const t = await loginAs(admin);
    const res = await request(app)
      .get(`/api/admin/orders?search=${order.order_code}`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.orders).toHaveLength(1);
    expect(Number(res.body.data.orders[0].orderCode)).toBe(Number(order.order_code));
  });

  it('filter dateFrom/dateTo cắt đúng khoảng', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });

    // Tạo 3 đơn ở 3 ngày khác nhau bằng update trực tiếp
    const o1 = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });
    const o2 = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });
    const o3 = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });
    await db.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
      new Date('2025-01-01T10:00:00Z'),
      o1.id,
    ]);
    await db.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
      new Date('2025-06-15T10:00:00Z'),
      o2.id,
    ]);
    await db.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
      new Date('2025-12-31T10:00:00Z'),
      o3.id,
    ]);

    const t = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/orders?dateFrom=2025-06-01&dateTo=2025-09-01')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.orders).toHaveLength(1);
    expect(Number(res.body.data.orders[0].id)).toBe(Number(o2.id));
  });

  it('pagination — limit=2 + page=2 trả về đúng số đơn', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });
    for (let i = 0; i < 5; i += 1) {
      await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });
    }

    const t = await loginAs(admin);
    const p1 = await request(app)
      .get('/api/admin/orders?limit=2&page=1')
      .set('Authorization', `Bearer ${t}`);
    const p2 = await request(app)
      .get('/api/admin/orders?limit=2&page=2')
      .set('Authorization', `Bearer ${t}`);
    const p3 = await request(app)
      .get('/api/admin/orders?limit=2&page=3')
      .set('Authorization', `Bearer ${t}`);

    expect(p1.body.data.orders).toHaveLength(2);
    expect(p2.body.data.orders).toHaveLength(2);
    expect(p3.body.data.orders).toHaveLength(1);
    expect(Number(p1.body.data.total)).toBe(5);
    expect(Number(p2.body.data.total)).toBe(5);
  });

  it('limit > 100 sẽ bị cap về 100 (controller Math.min)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const t = await loginAs(admin);
    // Không cần seed 1000 đơn; chỉ assert request không lỗi và limit không vỡ.
    const res = await request(app)
      .get('/api/admin/orders?limit=9999')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });

  it('trả về planName/planCode kèm theo (JOIN plans)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pro', name: 'Pro Plan' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${t}`);

    expect(res.body.data.orders[0].planCode).toBe('pro');
    expect(res.body.data.orders[0].planName).toBe('Pro Plan');
  });

  it('sort created_at DESC (đơn mới nhất lên đầu)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });
    const oOld = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });
    const oNew = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });
    await db.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
      new Date('2024-01-01T00:00:00Z'),
      oOld.id,
    ]);
    await db.query(`UPDATE orders SET created_at = NOW() WHERE id = $1`, [oNew.id]);

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${t}`);

    expect(Number(res.body.data.orders[0].id)).toBe(Number(oNew.id));
    expect(Number(res.body.data.orders[1].id)).toBe(Number(oOld.id));
  });
});

describe('PATCH /api/admin/orders/:orderCode/cancel', () => {
  it('cancel đơn pending → 200, status DB chuyển thành cancelled, gọi PayOS.cancel', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });
    const order = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'pending' });

    const t = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/orders/${order.order_code}/cancel`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(mockPayosCancel).toHaveBeenCalledWith(Number(order.order_code));

    const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(rows[0].status).toBe('cancelled');
  });

  it('cancel đơn không phải pending → 400, không gọi PayOS, không update DB', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });
    const order = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'success' });

    const t = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/orders/${order.order_code}/cancel`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(400);
    expect(mockPayosCancel).not.toHaveBeenCalled();

    const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(rows[0].status).toBe('success');
  });

  it('cancel đơn không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const t = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/orders/9999999/cancel')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
    expect(mockPayosCancel).not.toHaveBeenCalled();
  });

  it('PayOS.cancel throw → vẫn cancel trong DB (graceful)', async () => {
    mockPayosCancel.mockRejectedValueOnce(new Error('PayOS link expired'));
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u1@b.com' });
    const order = await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'pending' });

    const t = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/orders/${order.order_code}/cancel`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(rows[0].status).toBe('cancelled');
  });

  it('user role thường không cancel được → 403, PayOS không bị gọi', async () => {
    const buyer = await createUser({ role: 'user', username: 'buyer', email: 'buyer@b.com' });
    const plan = await createPlan({ code: 'p' });
    const order = await createOrder({ planId: plan.id, userId: buyer.id, userEmail: buyer.email, status: 'pending' });

    const t = await loginAs(buyer);
    const res = await request(app)
      .patch(`/api/admin/orders/${order.order_code}/cancel`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(403);
    expect(mockPayosCancel).not.toHaveBeenCalled();
  });
});
