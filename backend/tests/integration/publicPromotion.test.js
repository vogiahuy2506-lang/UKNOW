/**
 * Integration tests cho `GET /api/public/promotions/active`.
 *
 * Endpoint này là public (không cần auth). Nó tổng hợp voucher auto_apply
 * tốt nhất cho mỗi plan và trả về dữ liệu promotion.
 *
 * Covered:
 *   - Trả đúng shape khi không có voucher
 *   - Trả hasPromotion=true khi có voucher auto_apply đang active
 *   - billingPeriod query param được tôn trọng
 *   - byPlanCode map và topPromotion
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function adminToken() {
  const admin = await createUser({ role: 'admin', username: `admin${Date.now()}` });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: admin.username, password: admin.plainPassword });
  return res.body.data.accessToken;
}

async function createVoucher(token, payload) {
  const res = await request(app)
    .post('/api/admin/vouchers')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  if (res.status !== 201) throw new Error(`createVoucher failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/public/promotions/active', () => {
  it('không cần auth — public endpoint', async () => {
    const res = await request(app).get('/api/public/promotions/active');
    expect(res.status).toBe(200);
  });

  it('trả shape đúng khi chưa có plan hoặc voucher', async () => {
    const res = await request(app).get('/api/public/promotions/active');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('hasPromotion');
    expect(res.body.data).toHaveProperty('billingPeriod');
    expect(res.body.data).toHaveProperty('byPlanCode');
    expect(res.body.data).toHaveProperty('topPromotion');
    expect(res.body.data.hasPromotion).toBe(false);
    expect(res.body.data.topPromotion).toBeNull();
  });

  it('trả hasPromotion=false khi chỉ có plan nhưng không có voucher auto_apply', async () => {
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const res = await request(app).get('/api/public/promotions/active');
    expect(res.body.data.hasPromotion).toBe(false);
    expect(res.body.data.topPromotion).toBeNull();
  });

  it('trả hasPromotion=true + topPromotion khi có voucher auto_apply', async () => {
    await createPlan({ code: 'basic', name: 'Basic', price: 200000 });
    const adminTk = await adminToken();
    await createVoucher(adminTk, {
      code: 'PROMO25',
      name: 'Promo 25%',
      discountType: 'percentage',
      discountValue: 25,
      minOrderAmount: 0,
      autoApply: true,
    });

    const res = await request(app).get('/api/public/promotions/active');
    expect(res.body.data.hasPromotion).toBe(true);
    expect(res.body.data.topPromotion).not.toBeNull();
    expect(res.body.data.topPromotion.code).toBe('PROMO25');
    expect(res.body.data.topPromotion.discountAmount).toBe(50000);
    expect(res.body.data.byPlanCode).toHaveProperty('basic');
  });

  it('voucher manual (auto_apply=false) không xuất hiện trong promotions', async () => {
    await createPlan({ code: 'basic', name: 'Basic', price: 200000 });
    const adminTk = await adminToken();
    await createVoucher(adminTk, {
      code: 'MANUAL',
      name: 'Manual only',
      discountType: 'percentage',
      discountValue: 30,
      minOrderAmount: 0,
      autoApply: false,
    });

    const res = await request(app).get('/api/public/promotions/active');
    expect(res.body.data.hasPromotion).toBe(false);
  });

  it('billingPeriod=yearly dùng price_yearly để tính discount', async () => {
    const adminTk = await adminToken();
    await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${adminTk}`)
      .send({ code: 'pro', name: 'Pro', price: 200000, maxEmployees: 5 });
    const db = (await import('../../src/config/database.js')).default;
    await db.query(`UPDATE plans SET price_yearly = 1800000 WHERE code = 'pro'`);

    await createVoucher(adminTk, {
      code: 'YEARLY20',
      name: 'Yearly 20%',
      discountType: 'percentage',
      discountValue: 20,
      minOrderAmount: 0,
      autoApply: true,
      appliesToBillingPeriods: ['yearly'],
    });

    const res = await request(app).get('/api/public/promotions/active?billingPeriod=yearly');
    expect(res.body.data.hasPromotion).toBe(true);
    expect(res.body.data.billingPeriod).toBe('yearly');
    expect(res.body.data.topPromotion.discountAmount).toBe(360000);
  });

  it('?billingPeriod=invalid fallback về monthly', async () => {
    const res = await request(app).get('/api/public/promotions/active?billingPeriod=invalid');
    expect(res.status).toBe(200);
    expect(res.body.data.billingPeriod).toBe('monthly');
  });

  it('topPromotion là voucher có discountAmount lớn nhất', async () => {
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    await createPlan({ code: 'pro', name: 'Pro', price: 500000 });
    const adminTk = await adminToken();
    await createVoucher(adminTk, {
      code: 'SMALL10',
      name: 'Small 10%',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 0,
      autoApply: true,
    });
    await createVoucher(adminTk, {
      code: 'BIG30',
      name: 'Big 30%',
      discountType: 'percentage',
      discountValue: 30,
      minOrderAmount: 0,
      autoApply: true,
    });

    const res = await request(app).get('/api/public/promotions/active');
    expect(res.body.data.hasPromotion).toBe(true);
    // BIG30 trên plan pro: 30% × 500000 = 150000 > SMALL10 trên pro: 10% × 500000 = 50000
    expect(res.body.data.topPromotion.code).toBe('BIG30');
  });
});
