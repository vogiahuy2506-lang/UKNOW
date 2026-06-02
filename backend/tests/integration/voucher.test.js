/**
 * Integration tests cho user-facing `/api/vouchers` endpoints.
 *
 * Covered:
 *   - Authorization (mọi endpoint đều yêu cầu auth)
 *   - GET /available — chỉ trả voucher auto_apply + đủ điều kiện
 *   - GET /code-suggestions — trả voucher manual kể cả chưa đủ min_order
 *   - POST /validate — tìm voucher theo code; 404 nếu không hợp lệ; 404 nếu plan không tồn tại
 *
 * Logic tính giảm giá (calculateVoucherDiscount) được kiểm tra qua API thật.
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

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function adminToken() {
  const admin = await createUser({ role: 'admin', username: `admin${Date.now()}` });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: admin.username, password: admin.plainPassword });
  return res.body.data.accessToken;
}

async function createVoucherViaAdmin(token, payload) {
  const res = await request(app)
    .post('/api/admin/vouchers')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  if (res.status !== 201) throw new Error(`createVoucher failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

// ─── Authorization ──────────────────────────────────────────────────────────
describe('Authorization — /api/vouchers/*', () => {
  it('mọi endpoint trả 401 khi không có token', async () => {
    const responses = await Promise.all([
      request(app).get('/api/vouchers/available?planCode=basic'),
      request(app).get('/api/vouchers/code-suggestions?planCode=basic'),
      request(app).post('/api/vouchers/validate').send({ planCode: 'basic', code: 'X' }),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });
});

// ─── GET /available ─────────────────────────────────────────────────────────
describe('GET /api/vouchers/available', () => {
  it('trả danh sách rỗng khi chưa có voucher auto_apply nào', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const token = await loginAs(user);

    const res = await request(app)
      .get('/api/vouchers/available?planCode=basic')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.vouchers)).toBe(true);
    expect(res.body.data.vouchers).toHaveLength(0);
    expect(res.body.data.originalAmount).toBe(100000);
  });

  it('trả voucher auto_apply đang active + đủ điều kiện', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const adminTk = await adminToken();
    await createVoucherViaAdmin(adminTk, {
      code: 'AUTO20',
      name: 'Auto 20%',
      discountType: 'percentage',
      discountValue: 20,
      minOrderAmount: 0,
      autoApply: true,
    });

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/vouchers/available?planCode=basic')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.vouchers).toHaveLength(1);
    expect(res.body.data.vouchers[0].code).toBe('AUTO20');
    expect(res.body.data.vouchers[0].discountAmount).toBe(20000);
    expect(res.body.data.vouchers[0].isEligible).toBe(true);
  });

  it('không trả voucher manual (auto_apply=false) qua endpoint /available', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const adminTk = await adminToken();
    await createVoucherViaAdmin(adminTk, {
      code: 'MANUAL20',
      name: 'Manual 20%',
      discountType: 'percentage',
      discountValue: 20,
      minOrderAmount: 0,
      autoApply: false,
    });

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/vouchers/available?planCode=basic')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.vouchers).toHaveLength(0);
  });

  it('voucher bị inactive → không hiển thị', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const adminTk = await adminToken();
    const v = await createVoucherViaAdmin(adminTk, {
      code: 'INACTIVE',
      name: 'Inactive',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 0,
      autoApply: true,
    });
    await request(app)
      .patch(`/api/admin/vouchers/${v.id}`)
      .set('Authorization', `Bearer ${adminTk}`)
      .send({ code: 'INACTIVE', name: 'Inactive', discountType: 'percentage', discountValue: 10, minOrderAmount: 0, isActive: false });

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/vouchers/available?planCode=basic')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.vouchers).toHaveLength(0);
  });

  it('plan không tồn tại → 404', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/vouchers/available?planCode=ghost')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('billingPeriod=yearly dùng price_yearly thay vì price', async () => {
    const user = await createUser({ username: 'u1' });
    const adminTk = await adminToken();
    await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${adminTk}`)
      .send({ code: 'pro', name: 'Pro', price: 200000, maxEmployees: 5 });
    // Set price_yearly trực tiếp vào DB vì admin API không có field này
    const { rows } = await (await import('../../src/config/database.js')).default.query(
      `UPDATE plans SET price_yearly = 1800000 WHERE code = 'pro' RETURNING id`
    );
    expect(rows).toHaveLength(1);

    await createVoucherViaAdmin(adminTk, {
      code: 'YEARLY10',
      name: 'Yearly 10%',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 0,
      autoApply: true,
      appliesToBillingPeriods: ['yearly'],
    });

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/vouchers/available?planCode=pro&billingPeriod=yearly')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.originalAmount).toBe(1800000);
    expect(res.body.data.vouchers[0].discountAmount).toBe(180000);
  });
});

// ─── GET /code-suggestions ──────────────────────────────────────────────────
describe('GET /api/vouchers/code-suggestions', () => {
  it('trả voucher manual kể cả chưa đủ min_order (ignoreMinOrder=true)', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 50000 });
    const adminTk = await adminToken();
    await createVoucherViaAdmin(adminTk, {
      code: 'HIGHMIN',
      name: 'High min order',
      discountType: 'fixed_amount',
      discountValue: 30000,
      minOrderAmount: 500000,
      autoApply: false,
    });

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/vouchers/code-suggestions?planCode=basic')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.vouchers).toHaveLength(1);
    expect(res.body.data.vouchers[0].code).toBe('HIGHMIN');
    expect(res.body.data.vouchers[0].isEligible).toBe(false);
  });

  it('không trả voucher auto_apply', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const adminTk = await adminToken();
    await createVoucherViaAdmin(adminTk, {
      code: 'AUTO',
      name: 'Auto',
      discountType: 'percentage',
      discountValue: 15,
      minOrderAmount: 0,
      autoApply: true,
    });

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/vouchers/code-suggestions?planCode=basic')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.vouchers).toHaveLength(0);
  });
});

// ─── POST /validate ─────────────────────────────────────────────────────────
describe('POST /api/vouchers/validate', () => {
  it('code hợp lệ → 200 + trả voucher + finalAmount', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 200000 });
    const adminTk = await adminToken();
    await createVoucherViaAdmin(adminTk, {
      code: 'SAVE25',
      name: '25% off',
      discountType: 'percentage',
      discountValue: 25,
      minOrderAmount: 0,
      autoApply: false,
    });

    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/vouchers/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'basic', code: 'SAVE25' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.voucher).not.toBeNull();
    expect(res.body.data.voucher.code).toBe('SAVE25');
    expect(res.body.data.voucher.discountAmount).toBe(50000);
    expect(res.body.data.voucher.finalAmount).toBe(150000);
    expect(res.body.data.originalAmount).toBe(200000);
  });

  it('code không tồn tại → 404', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/vouchers/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'basic', code: 'GHOST' });
    expect(res.status).toBe(404);
  });

  it('voucher không áp dụng cho plan này → 404', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    await createPlan({ code: 'pro', name: 'Pro', price: 300000 });
    const adminTk = await adminToken();
    await createVoucherViaAdmin(adminTk, {
      code: 'PROONLY',
      name: 'Pro only',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 0,
      autoApply: false,
      appliesToPlanCodes: ['pro'],
    });

    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/vouchers/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'basic', code: 'PROONLY' });
    expect(res.status).toBe(404);
  });

  it('voucher với maxDiscountAmount giới hạn số tiền giảm', async () => {
    const user = await createUser({ username: 'u1' });
    await createPlan({ code: 'basic', name: 'Basic', price: 500000 });
    const adminTk = await adminToken();
    await createVoucherViaAdmin(adminTk, {
      code: 'CAPPED',
      name: 'Capped 50%',
      discountType: 'percentage',
      discountValue: 50,
      maxDiscountAmount: 50000,
      minOrderAmount: 0,
      autoApply: false,
    });

    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/vouchers/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'basic', code: 'CAPPED' });

    expect(res.status).toBe(200);
    // 50% của 500000 = 250000, nhưng bị cap ở 50000
    expect(res.body.data.voucher.discountAmount).toBe(50000);
    expect(res.body.data.voucher.finalAmount).toBe(450000);
  });

  it('plan không tồn tại → 404', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/vouchers/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'ghost', code: 'ANY' });
    expect(res.status).toBe(404);
  });
});
