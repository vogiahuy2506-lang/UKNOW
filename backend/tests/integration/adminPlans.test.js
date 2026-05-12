/**
 * Integration tests cho `/api/admin/plans` endpoints.
 *
 * Module vừa được refactor lớn (smart delete, payment-status polling,
 * is_active = "chưa bị xoá") nên đây là vùng cao rủi ro nhất hiện tại.
 *
 * Test này KHÔNG cover:
 *   - POST /custom-with-payment (cần PayOS live → skip, sẽ test riêng với mock)
 *
 * Covered:
 *   - Authorization (chỉ admin role được dùng cả router)
 *   - GET /
 *   - GET /custom-list (+ showHidden)
 *   - GET /search-users
 *   - POST /
 *   - PATCH /:id
 *   - DELETE /:id (smart delete: hard vs soft)
 *   - POST /:id/assign
 *   - POST /custom (tạo plan riêng + gán user trực tiếp, không qua PayOS)
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import {
  truncateAll,
  createUser,
  createPlan,
  assignPlanToUser,
  createOrder,
} from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

/**
 * Login user và trả accessToken (gọi qua endpoint thật để token có shape đúng,
 * tránh phải nhập tay JWT_SECRET).
 */
async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) {
    throw new Error(`loginAs failed for ${user.username}: ${res.status} ${res.body.message}`);
  }
  return res.body.data.accessToken;
}

describe('Authorization — /api/admin/plans/*', () => {
  it('không có token → 401 với mọi route', async () => {
    const responses = await Promise.all([
      request(app).get('/api/admin/plans'),
      request(app).get('/api/admin/plans/custom-list'),
      request(app).get('/api/admin/plans/search-users'),
      request(app).post('/api/admin/plans').send({}),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });

  it('user role thường (không phải admin) → 403', async () => {
    const user = await createUser({ role: 'user', username: 'plainuser' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin role → vượt qua middleware', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/plans', () => {
  it('chỉ trả plan đại trà (is_custom = false), sort theo price ASC', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    await createPlan({ code: 'pro', name: 'Pro', price: 500000 });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    await createPlan({ code: 'enterprise', name: 'Custom Acme', price: 9000000, isCustom: true });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].code).toBe('basic');
    expect(res.body.data[1].code).toBe('pro');
    expect(res.body.data.every((p) => p.isCustom === false)).toBe(true);
  });

  it('mỗi plan có user_count phản ánh số user gán', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'basic', name: 'Basic', price: 100000 });

    const u1 = await createUser({ username: 'u1', role: 'user' });
    const u2 = await createUser({ username: 'u2', role: 'user' });
    await assignPlanToUser(u1.id, plan.id);
    await assignPlanToUser(u2.id, plan.id);

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].user_count).toBe(2);
  });
});

describe('GET /api/admin/plans/custom-list', () => {
  it('chỉ trả gói custom đang active mặc định', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    await createPlan({ code: 'cust1', name: 'Custom A', price: 1000000, isCustom: true, isActive: true });
    await createPlan({ code: 'cust2', name: 'Custom B (hidden)', price: 2000000, isCustom: true, isActive: false });
    await createPlan({ code: 'pro', name: 'Pro', price: 500000, isCustom: false });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans/custom-list')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Custom A');
  });

  it('?showHidden=true → bao gồm cả gói đã ẩn', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    await createPlan({ code: 'c1', name: 'Visible', isCustom: true, isActive: true });
    await createPlan({ code: 'c2', name: 'Hidden', isCustom: true, isActive: false });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans/custom-list?showHidden=true')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('GET /api/admin/plans/search-users', () => {
  it('tìm user_admin theo email (ILIKE)', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    await createUser({ role: 'user', username: 'alice', email: 'alice@x.com' });
    await createUser({ role: 'user', username: 'bob', email: 'bob@y.com' });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans/search-users?q=alice')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('alice@x.com');
  });

  it('?excludeWithPlan=true → loại user đang có active_plan_id', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'basic', name: 'Basic' });
    const userWithPlan = await createUser({ role: 'user', username: 'has', email: 'has@x.com' });
    await assignPlanToUser(userWithPlan.id, plan.id);
    await createUser({ role: 'user', username: 'free', email: 'free@x.com' });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans/search-users?q=@x.com&excludeWithPlan=true')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.email)).toEqual(['free@x.com']);
  });
});

describe('POST /api/admin/plans', () => {
  it('tạo plan mới → 201, plans table có row mới', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);

    const res = await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'starter',
        name: 'Starter',
        price: 49000,
        description: 'Test plan',
        maxEmployees: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('starter');
    expect(res.body.data.is_custom).toBe(false);

    const row = await db.query('SELECT * FROM plans WHERE code = $1', ['starter']);
    expect(row.rows).toHaveLength(1);
  });

  it('thiếu name → 400 (validation)', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', price: 100, maxEmployees: 0 });
    expect(res.status).toBe(400);
  });

  it('price âm → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', price: -1, maxEmployees: 0 });
    expect(res.status).toBe(400);
  });

  it('maxEmployees = -1 (unlimited) → cho phép', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Unlimited', price: 0, maxEmployees: -1 });
    expect(res.status).toBe(201);
    expect(res.body.data.max_employees).toBe(-1);
  });
});

describe('PATCH /api/admin/plans/:id', () => {
  it('cập nhật plan thành công', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'old', name: 'Old', price: 100000 });
    const token = await loginAs(admin);

    const res = await request(app)
      .patch(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated', price: 200000, maxEmployees: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
    expect(Number(res.body.data.price)).toBe(200000);
  });

  it('plan không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/plans/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', price: 100, maxEmployees: 0 });
    expect(res.status).toBe(404);
  });

  it('id không phải int → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/plans/not-a-number')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', price: 100, maxEmployees: 0 });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/plans/:id — smart delete', () => {
  it('plan KHÔNG có order → hard delete (row biến mất)', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'h', name: 'Hard' });
    const token = await loginAs(admin);

    const res = await request(app)
      .delete(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('hard');

    const check = await db.query('SELECT id FROM plans WHERE id = $1', [plan.id]);
    expect(check.rows).toHaveLength(0);
  });

  it('plan đại trà có order → soft delete (is_active = false), user đang dùng GIỮ NGUYÊN', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'mass', name: 'Mass', isCustom: false });
    const buyer = await createUser({ role: 'user', username: 'buyer' });
    await assignPlanToUser(buyer.id, plan.id);
    await createOrder({ planId: plan.id, userId: buyer.id, userEmail: buyer.email });

    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('soft');
    expect(res.body.data.unassignedUsers).toEqual([]); // mass plan giữ user

    const planRow = await db.query('SELECT is_active FROM plans WHERE id = $1', [plan.id]);
    expect(planRow.rows[0].is_active).toBe(false);

    const userRow = await db.query('SELECT active_plan_id FROM users WHERE id = $1', [buyer.id]);
    expect(Number(userRow.rows[0].active_plan_id)).toBe(Number(plan.id)); // vẫn giữ
  });

  it('plan custom có order → soft delete + GỠ active_plan_id của user', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'cust', name: 'Custom', isCustom: true });
    const buyer = await createUser({ role: 'user', username: 'buyer' });
    await assignPlanToUser(buyer.id, plan.id);
    await createOrder({ planId: plan.id, userId: buyer.id, userEmail: buyer.email });

    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('soft');
    expect(res.body.data.unassignedUsers).toHaveLength(1);
    expect(res.body.data.unassignedUsers[0].email).toBe(buyer.email);

    const userRow = await db.query('SELECT active_plan_id FROM users WHERE id = $1', [buyer.id]);
    expect(userRow.rows[0].active_plan_id).toBeNull();
  });

  it('plan không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .delete('/api/admin/plans/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/plans/:id/assign', () => {
  it('gán plan cho user → user.active_plan_id được cập nhật + order success tạo ra', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'pro', name: 'Pro', price: 500000 });
    const customer = await createUser({ role: 'user', username: 'cust', email: 'cust@x.com' });

    const token = await loginAs(admin);
    const res = await request(app)
      .post(`/api/admin/plans/${plan.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userEmail: customer.email });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.activePlanId)).toBe(Number(plan.id));

    const userRow = await db.query(
      'SELECT active_plan_id, subscription_expires_at FROM users WHERE id = $1',
      [customer.id]
    );
    expect(Number(userRow.rows[0].active_plan_id)).toBe(Number(plan.id));
    expect(userRow.rows[0].subscription_expires_at).not.toBeNull();

    const orderRow = await db.query(
      `SELECT status, amount FROM orders WHERE user_id = $1 AND plan_id = $2`,
      [customer.id, plan.id]
    );
    expect(orderRow.rows[0].status).toBe('success');
    expect(Number(orderRow.rows[0].amount)).toBe(500000);
  });

  it('user không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'p', name: 'P' });

    const token = await loginAs(admin);
    const res = await request(app)
      .post(`/api/admin/plans/${plan.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userEmail: 'ghost@x.com' });
    expect(res.status).toBe(404);
  });

  it('plan không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const customer = await createUser({ role: 'user', username: 'c', email: 'c@x.com' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/plans/99999/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ userEmail: customer.email });
    expect(res.status).toBe(404);
  });

  it('email không hợp lệ → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const plan = await createPlan({ code: 'p', name: 'P' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post(`/api/admin/plans/${plan.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userEmail: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/plans/custom — tạo gói riêng + gán user', () => {
  it('happy path → tạo plan custom + gán + tạo order success', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const customer = await createUser({ role: 'user', username: 'cust', email: 'cust@x.com' });
    const token = await loginAs(admin);

    const res = await request(app)
      .post('/api/admin/plans/custom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userEmail: customer.email,
        name: 'Bespoke Plan',
        price: 5000000,
        maxEmployees: 20,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.plan.name).toBe('Bespoke Plan');
    expect(res.body.data.plan.is_custom).toBe(true);
    expect(res.body.data.assignedTo.email).toBe(customer.email);

    const userRow = await db.query('SELECT active_plan_id FROM users WHERE id = $1', [customer.id]);
    expect(Number(userRow.rows[0].active_plan_id)).toBe(Number(res.body.data.plan.id));
  });

  it('user không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/plans/custom')
      .set('Authorization', `Bearer ${token}`)
      .send({ userEmail: 'ghost@x.com', name: 'X', price: 100000, maxEmployees: 0 });
    expect(res.status).toBe(404);
  });
});
