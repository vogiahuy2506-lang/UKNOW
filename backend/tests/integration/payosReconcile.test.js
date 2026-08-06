/**
 * Integration: cancel duplicate pending checkouts + reconcile helpers against DB.
 * PayOS HTTP is mocked at the util boundary where needed.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import {
  cancelRecentPendingPlanOrders,
  findPendingPayosOrdersSinceHours,
} from '../../src/repositories/payment/payment.repository.js';

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
  return res.body.data.accessToken;
}

async function insertPlan({ code = 'starter', price = 99000 } = {}) {
  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, duration_days, is_active)
     VALUES ($1, $2, $3, 30, TRUE) RETURNING *`,
    [code, code, price]
  );
  return rows[0];
}

describe('pending order duplicate cancel', () => {
  it('cancelRecentPendingPlanOrders marks older pending cancelled', async () => {
    const user = await createUser({ role: 'user', username: 'buyer1' });
    const plan = await insertPlan();
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, billing_period)
       VALUES (1001, $1, 99000, $2, $3, 'pending', 'payos', 'monthly')`,
      [plan.id, user.email, user.id]
    );

    const cancelled = await cancelRecentPendingPlanOrders({
      userId: user.id,
      userEmail: user.email,
      planId: plan.id,
      billingPeriod: 'monthly',
      withinMinutes: 13,
    });
    expect(cancelled).toHaveLength(1);

    const { rows } = await db.query(`SELECT status FROM orders WHERE order_code = 1001`);
    expect(rows[0].status).toBe('cancelled');
  });
});

describe('findPendingPayosOrdersSinceHours window', () => {
  it('excludes orders older than window', async () => {
    const user = await createUser({ role: 'user', username: 'buyer2' });
    const plan = await insertPlan({ code: 'basic' });
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, billing_period, created_at)
       VALUES
         (2001, $1, 99000, $2, $3, 'pending', 'payos', 'monthly', NOW() - INTERVAL '3 days'),
         (2002, $1, 99000, $2, $3, 'pending', 'payos', 'monthly', NOW() - INTERVAL '1 hour')`,
      [plan.id, user.email, user.id]
    );

    const rows = await findPendingPayosOrdersSinceHours(48);
    const codes = rows.map((r) => Number(r.order_code));
    expect(codes).toContain(2002);
    expect(codes).not.toContain(2001);
  });
});

describe('GET /payments/status ownership', () => {
  it('returns status for buyer', async () => {
    const user = await createUser({ role: 'user', username: 'buyer3' });
    const plan = await insertPlan({ code: 'pro' });
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, billing_period)
       VALUES (3001, $1, 99000, $2, $3, 'pending', 'payos', 'monthly')`,
      [plan.id, user.email, user.id]
    );
    const t = await loginAs(user);
    const res = await request(app)
      .get('/api/payments/status/3001')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });
});
