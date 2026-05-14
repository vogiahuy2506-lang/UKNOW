/**
 * Integration tests cho `/api/admin/stats/overview`.
 *
 * Phạm vi:
 *   - Authorization (chỉ admin).
 *   - KPI:
 *       * totalMembers / activeMembers / totalEmployees
 *       * ordersThisMonth / completedOrdersThisMonth / pendingOrdersThisMonth / revenueThisMonth
 *         (revenueThisMonth loại đơn payment_method = 'free')
 *   - monthlyRevenue: gộp theo tháng, chỉ cộng đơn "đã thanh toán".
 *   - planDistribution: count user_admin theo plan (chỉ plan is_active=true).
 *   - recentOrders / recentMembers.
 *
 * Bug đã sửa:
 *   - Repo trước đây query `status = 'completed'` cho orders, nhưng schema
 *     thực tế dùng giá trị `'success'`. Hậu quả: dashboard luôn báo doanh
 *     thu = 0 dù khách thật đã thanh toán. Test này ép giá trị 'success' để
 *     tránh tái phát.
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

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

/** Set created_at trực tiếp để dựng đơn ở tháng cụ thể. */
async function setOrderCreatedAt(orderId, date) {
  await db.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [date, orderId]);
}

describe('Authorization — /api/admin/stats/overview', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/admin/stats/overview');
    expect(res.status).toBe(401);
  });

  it('user/employee → 403', async () => {
    const u = await createUser({ role: 'user', username: 'u1' });
    const e = await createUser({ role: 'employee', username: 'e1' });
    const r1 = await request(app)
      .get('/api/admin/stats/overview')
      .set('Authorization', `Bearer ${await loginAs(u)}`);
    const r2 = await request(app)
      .get('/api/admin/stats/overview')
      .set('Authorization', `Bearer ${await loginAs(e)}`);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
  });

  it('admin → 200, payload có đủ 5 nhóm', async () => {
    const a = await createUser({ role: 'admin', username: 'sa' });
    const t = await loginAs(a);
    const res = await request(app)
      .get('/api/admin/stats/overview')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('kpi');
    expect(res.body.data).toHaveProperty('monthlyRevenue');
    expect(res.body.data).toHaveProperty('planDistribution');
    expect(res.body.data).toHaveProperty('recentOrders');
    expect(res.body.data).toHaveProperty('recentMembers');
  });
});

describe('KPI overview', () => {
  it('totalMembers chỉ đếm role=user (không gồm admin/employee)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    await createUser({ role: 'user', username: 'u1' });
    await createUser({ role: 'user', username: 'u2' });
    await createUser({ role: 'user', username: 'u3' });
    await createUser({ role: 'employee', username: 'e1' });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    expect(Number(res.body.data.kpi.totalMembers)).toBe(3);
    expect(Number(res.body.data.kpi.totalEmployees)).toBe(1);
  });

  it('activeMembers = user có active_plan_id ≠ null', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const paid = await createUser({ role: 'user', username: 'paid1' });
    await assignPlanToUser(paid.id, plan.id);
    await createUser({ role: 'user', username: 'free1' });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    expect(Number(res.body.data.kpi.totalMembers)).toBe(2);
    expect(Number(res.body.data.kpi.activeMembers)).toBe(1);
  });

  it('revenueThisMonth chỉ tính đơn status=success trong tháng hiện tại', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const buyer = await createUser({ role: 'user', username: 'buyer1', email: 'b@b.com' });

    // Trong tháng này — đếm
    await createOrder({ planId: plan.id, userId: buyer.id, userEmail: buyer.email, status: 'success', amount: 500000 });
    // Đơn pending — không đếm vào revenue
    await createOrder({ planId: plan.id, userId: buyer.id, userEmail: buyer.email, status: 'pending', amount: 700000 });
    // Đơn success nhưng tháng trước — không đếm
    const lastMonth = await createOrder({
      planId: plan.id, userId: buyer.id, userEmail: buyer.email, status: 'success', amount: 900000,
    });
    await setOrderCreatedAt(lastMonth.id, new Date(Date.UTC(2024, 0, 15)));

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    expect(Number(res.body.data.kpi.revenueThisMonth)).toBe(500000);
    expect(Number(res.body.data.kpi.completedOrdersThisMonth)).toBe(1);
  });

  it('revenueThisMonth loại đơn success có payment_method=free (gán miễn phí)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const buyer = await createUser({ role: 'user', username: 'buyer1', email: 'b@b.com' });

    await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      status: 'success',
      amount: 0,
      paymentMethod: 'free',
    });
    await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      status: 'success',
      amount: 300000,
      paymentMethod: 'manual',
    });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    expect(Number(res.body.data.kpi.revenueThisMonth)).toBe(300000);
    expect(Number(res.body.data.kpi.completedOrdersThisMonth)).toBe(2);
  });

  it('ordersThisMonth gồm cả pending + success + cancelled (KHÔNG lọc status)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u@b.com' });

    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'success' });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'pending' });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'cancelled' });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    expect(Number(res.body.data.kpi.ordersThisMonth)).toBe(3);
    expect(Number(res.body.data.kpi.pendingOrdersThisMonth)).toBe(1);
    expect(Number(res.body.data.kpi.completedOrdersThisMonth)).toBe(1);
  });
});

describe('monthlyRevenue — gộp 6 tháng gần nhất', () => {
  it('chỉ cộng amount của đơn success vào revenue, totalOrders đếm tất cả', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u@b.com' });

    // 2 đơn success + 1 pending cùng trong tháng hiện tại
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'success', amount: 200000 });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'success', amount: 300000 });
    await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email, status: 'pending', amount: 999000 });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    const months = res.body.data.monthlyRevenue;
    expect(months.length).toBeGreaterThan(0);
    const latest = months[months.length - 1];
    expect(Number(latest.revenue)).toBe(500000);
    expect(Number(latest.totalOrders)).toBe(3);
    expect(Number(latest.completedOrders)).toBe(2);
  });

  it('loại bỏ đơn cũ hơn 6 tháng', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u@b.com' });

    const oldOrder = await createOrder({
      planId: plan.id, userId: u.id, userEmail: u.email, status: 'success', amount: 100000,
    });
    // 1 năm trước
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    await setOrderCreatedAt(oldOrder.id, oneYearAgo);

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    // Không nên xuất hiện trong 6 tháng gần nhất → tổng revenue = 0
    const totalRevenue = res.body.data.monthlyRevenue.reduce(
      (sum, m) => sum + Number(m.revenue),
      0
    );
    expect(totalRevenue).toBe(0);
  });
});

describe('planDistribution', () => {
  it('count user_admin theo plan, chỉ kể plan is_active=true, sort ASC theo price', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const cheap = await createPlan({ code: 'basic', name: 'Basic', price: 100000, isActive: true });
    const mid = await createPlan({ code: 'pro', name: 'Pro', price: 500000, isActive: true });
    const hidden = await createPlan({ code: 'legacy', name: 'Legacy', price: 50000, isActive: false });

    const u1 = await createUser({ role: 'user', username: 'u1' });
    const u2 = await createUser({ role: 'user', username: 'u2' });
    const u3 = await createUser({ role: 'user', username: 'u3' });
    await assignPlanToUser(u1.id, cheap.id);
    await assignPlanToUser(u2.id, cheap.id);
    await assignPlanToUser(u3.id, mid.id);

    // Employee gán plan KHÔNG nên đếm vào userCount của plan
    const emp = await createUser({ role: 'employee', username: 'e1' });
    await assignPlanToUser(emp.id, cheap.id);

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    const plans = res.body.data.planDistribution;
    // Chỉ 2 plan active, không có legacy
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.code)).toEqual(['basic', 'pro']);
    const basic = plans.find((p) => p.code === 'basic');
    const pro = plans.find((p) => p.code === 'pro');
    expect(Number(basic.userCount)).toBe(2); // employee không đếm
    expect(Number(pro.userCount)).toBe(1);
  });
});

describe('recentOrders / recentMembers', () => {
  it('recentOrders trả tối đa 10, sort created_at DESC', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u@b.com' });

    for (let i = 0; i < 12; i += 1) {
      await createOrder({ planId: plan.id, userId: u.id, userEmail: u.email });
    }

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    expect(res.body.data.recentOrders).toHaveLength(10);
  });

  it('recentMembers chỉ trả user role=user, tối đa 10', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    for (let i = 0; i < 8; i += 1) {
      await createUser({ role: 'user', username: `mem${i}` });
    }
    await createUser({ role: 'employee', username: 'emp_x' }); // không được tính

    const t = await loginAs(admin);
    const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);

    expect(res.body.data.recentMembers).toHaveLength(8);
    expect(res.body.data.recentMembers.every((m) => m.username.startsWith('mem'))).toBe(true);
  });
});
