/**
 * Integration tests cho `/api/users/*` — phần dành cho user tự quản lý profile.
 *
 * Phạm vi:
 *   - GET  /api/users/profile         : lấy info + plan đang dùng + orders fallback.
 *   - PUT  /api/users/profile         : update fullName/email/phone.
 *   - PUT  /api/users/change-password : đổi mật khẩu (bcrypt compare).
 *   - GET  /api/users/my-orders       : lịch sử đơn hàng `status='success'`.
 *
 * Các route legacy admin (`/api/users/employees/*`) sử dụng bảng `roles` cũ và
 * đã được thay thế bởi `/api/employees` module (đã có test riêng) nên KHÔNG
 * cover ở đây để tránh phải dựng schema roles cho test.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import bcrypt from 'bcryptjs';
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

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

// ===========================================================================
// GET /api/users/profile
// ===========================================================================
describe('GET /api/users/profile', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });

  it('user thường → 200, trả về basic info (chưa có plan)', async () => {
    const user = await createUser({ username: 'me', fullName: 'Me Person' });
    const token = await loginAs(user);

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      username: 'me',
      fullName: 'Me Person',
      email: user.email,
      activePlanId: null,
      activePlanCode: null,
    });
  });

  it('user đang dùng plan → trả về activePlan* fields', async () => {
    const plan = await createPlan({ code: 'biz', name: 'Business' });
    const user = await createUser({ username: 'subscriber' });
    await assignPlanToUser(user.id, plan.id);
    const token = await loginAs(user);

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.activePlanId)).toBe(Number(plan.id));
    expect(res.body.data.activePlanCode).toBe('biz');
    expect(res.body.data.activePlanName).toBe('Business');
  });

  it('user chưa có active_plan_id NHƯNG có order success → fallback theo order mới nhất', async () => {
    const plan = await createPlan({ code: 'past' });
    const user = await createUser({ username: 'has-order' });
    // Tạo order success nhưng KHÔNG gán active_plan_id (giả lập order cũ migration thiếu sót)
    await createOrder({ planId: plan.id, userId: user.id, userEmail: user.email, status: 'success' });
    const token = await loginAs(user);

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.activePlanId)).toBe(Number(plan.id));
    expect(res.body.data.activePlanCode).toBe('past');
  });
});

// ===========================================================================
// PUT /api/users/profile
// ===========================================================================
describe('PUT /api/users/profile', () => {
  it('update fullName + phone → DB cập nhật', async () => {
    const user = await createUser({ username: 'upd' });
    const token = await loginAs(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'New Name', phone: '0901234567' });

    expect(res.status).toBe(200);
    const u = await db.query(`SELECT full_name, phone FROM users WHERE id = $1`, [user.id]);
    expect(u.rows[0].full_name).toBe('New Name');
    expect(u.rows[0].phone).toBe('0901234567');
  });

  it('email mới trùng user khác → 400, KHÔNG đổi DB', async () => {
    const me = await createUser({ username: 'a', email: 'a@test.local' });
    await createUser({ username: 'b', email: 'taken@test.local' });
    const token = await loginAs(me);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@test.local' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);

    const u = await db.query(`SELECT email FROM users WHERE id = $1`, [me.id]);
    expect(u.rows[0].email).toBe('a@test.local');
  });

  it('phone không đúng 10-11 chữ số → 400 (validator)', async () => {
    const user = await createUser({ username: 'bad-ph' });
    const token = await loginAs(user);
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '123' });
    expect(res.status).toBe(400);
  });

  it('email sai format → 400 (validator)', async () => {
    const user = await createUser({ username: 'bad-em' });
    const token = await loginAs(user);
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// PUT /api/users/change-password
// ===========================================================================
describe('PUT /api/users/change-password', () => {
  it('đúng currentPassword → đổi thành công, bcrypt verify với newPassword', async () => {
    const user = await createUser({ username: 'pw', password: 'Old1234!' });
    const token = await loginAs(user);

    const res = await request(app)
      .put('/api/users/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Old1234!', newPassword: 'New5678!' });

    expect(res.status).toBe(200);
    const u = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
    const ok = await bcrypt.compare('New5678!', u.rows[0].password_hash);
    expect(ok).toBe(true);
  });

  it('sai currentPassword → 400, password_hash không đổi', async () => {
    const user = await createUser({ username: 'pw2', password: 'Right1!' });
    const token = await loginAs(user);
    const before = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);

    const res = await request(app)
      .put('/api/users/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Wrong!!', newPassword: 'New5678!' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hiện tại không đúng/i);

    const after = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
  });

  it('newPassword < 6 ký tự → 400 (validator)', async () => {
    const user = await createUser({ username: 'pw3' });
    const token = await loginAs(user);
    const res = await request(app)
      .put('/api/users/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: user.plainPassword, newPassword: '123' });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// GET /api/users/my-orders
// ===========================================================================
describe('GET /api/users/my-orders', () => {
  it('user chưa có order → mảng rỗng', async () => {
    const user = await createUser({ username: 'noorder' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/users/my-orders')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('chỉ trả về orders status="success", không có pending/cancelled', async () => {
    const plan = await createPlan({ code: 'mix' });
    const user = await createUser({ username: 'mixed' });
    await createOrder({ planId: plan.id, userId: user.id, userEmail: user.email, status: 'success' });
    await createOrder({ planId: plan.id, userId: user.id, userEmail: user.email, status: 'pending' });
    await createOrder({ planId: plan.id, userId: user.id, userEmail: user.email, status: 'cancelled' });
    const token = await loginAs(user);

    const res = await request(app)
      .get('/api/users/my-orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('success');
    expect(res.body.data[0].plan).toMatchObject({ code: 'mix' });
  });

  it('order chỉ có user_email (user_id NULL) vẫn được match', async () => {
    const plan = await createPlan({ code: 'em' });
    const user = await createUser({ username: 'em-user', email: 'em@test.local' });
    // Order thiếu user_id nhưng user_email khớp
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, created_at)
       VALUES ($1, $2, $3, $4, NULL, 'success', NOW())`,
      [Date.now(), plan.id, plan.price, 'em@test.local']
    );
    const token = await loginAs(user);

    const res = await request(app)
      .get('/api/users/my-orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
