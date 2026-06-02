/**
 * Integration tests cho `/api/admin/vouchers` endpoints.
 *
 * Covered:
 *   - Authorization (chỉ admin được dùng toàn bộ router)
 *   - GET / — list, sort mới nhất trước
 *   - POST / — tạo voucher %, fixed_amount; validation lỗi
 *   - PATCH /:id — cập nhật; 404 khi không tồn tại
 *   - DELETE /:id — xoá; 404 khi không tồn tại
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
    throw new Error(`loginAs failed for ${user.username}: ${res.status} ${res.body.message}`);
  }
  return res.body.data.accessToken;
}

const baseVoucher = {
  code: 'TEST20',
  name: 'Test 20%',
  discountType: 'percentage',
  discountValue: 20,
  minOrderAmount: 0,
};

// ─── Authorization ──────────────────────────────────────────────────────────
describe('Authorization — /api/admin/vouchers/*', () => {
  it('không có token → 401', async () => {
    const responses = await Promise.all([
      request(app).get('/api/admin/vouchers'),
      request(app).post('/api/admin/vouchers').send({}),
      request(app).patch('/api/admin/vouchers/1').send({}),
      request(app).delete('/api/admin/vouchers/1'),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });

  it('user role thường → 403', async () => {
    const user = await createUser({ role: 'user', username: 'plain' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin role → 200', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET / ──────────────────────────────────────────────────────────────────
describe('GET /api/admin/vouchers', () => {
  it('trả danh sách rỗng khi chưa có voucher', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('trả đúng số voucher + sort mới nhất trước', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, code: 'OLD10', name: 'Old 10%', discountValue: 10 });
    await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, code: 'NEW30', name: 'New 30%', discountValue: 30 });

    const res = await request(app)
      .get('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].code).toBe('NEW30');
  });

  it('mỗi voucher có đủ các trường cần thiết', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);
    const res = await request(app)
      .get('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`);
    const v = res.body.data[0];
    expect(v).toHaveProperty('id');
    expect(v).toHaveProperty('code');
    expect(v).toHaveProperty('name');
    expect(v).toHaveProperty('discountType');
    expect(v).toHaveProperty('discountValue');
    expect(v).toHaveProperty('isActive');
    expect(v).toHaveProperty('usedCount');
    expect(v).toHaveProperty('createdAt');
  });
});

// ─── POST / ─────────────────────────────────────────────────────────────────
describe('POST /api/admin/vouchers', () => {
  it('tạo voucher percentage thành công → 201', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('TEST20');
    expect(res.body.data.discountType).toBe('percentage');
    expect(Number(res.body.data.discountValue)).toBe(20);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.usedCount).toBe(0);
  });

  it('tạo voucher fixed_amount → 201', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'FIXED50K', name: '50k off', discountType: 'fixed_amount', discountValue: 50000, minOrderAmount: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.discountType).toBe('fixed_amount');
    expect(Number(res.body.data.discountValue)).toBe(50000);
  });

  it('code bị normalize về UPPERCASE tự động', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, code: 'lower20' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('LOWER20');
  });

  it('voucher với usageLimit, usageLimitPerUser, endsAt', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...baseVoucher,
        code: 'LIMITED',
        usageLimit: 100,
        usageLimitPerUser: 1,
        endsAt: '2099-12-31T23:59:59Z',
        autoApply: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.usageLimit).toBe(100);
    expect(res.body.data.usageLimitPerUser).toBe(1);
    expect(res.body.data.autoApply).toBe(true);
  });

  it('trùng code → 409', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);
    expect(res.status).toBe(409);
  });

  it('code rỗng → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, code: '' });
    expect(res.status).toBe(400);
  });

  it('name rỗng → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, name: '' });
    expect(res.status).toBe(400);
  });

  it('discountType không hợp lệ → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, discountType: 'cashback' });
    expect(res.status).toBe(400);
  });

  it('percentage > 100 → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, discountValue: 110 });
    expect(res.status).toBe(400);
  });

  it('discountValue = 0 → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, discountValue: 0 });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /:id ─────────────────────────────────────────────────────────────
describe('PATCH /api/admin/vouchers/:id', () => {
  it('cập nhật name và discountValue → 200', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const created = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/admin/vouchers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, name: 'Updated 25%', discountValue: 25 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated 25%');
    expect(Number(res.body.data.discountValue)).toBe(25);
  });

  it('deactivate voucher (isActive=false)', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const created = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/admin/vouchers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseVoucher, isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const row = await db.query('SELECT is_active FROM vouchers WHERE id = $1', [id]);
    expect(row.rows[0].is_active).toBe(false);
  });

  it('id không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/vouchers/99999')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────
describe('DELETE /api/admin/vouchers/:id', () => {
  it('xoá voucher tồn tại → 200 + row biến mất khỏi DB', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const created = await request(app)
      .post('/api/admin/vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send(baseVoucher);
    const id = created.body.data.id;

    const res = await request(app)
      .delete(`/api/admin/vouchers/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await db.query('SELECT id FROM vouchers WHERE id = $1', [id]);
    expect(check.rows).toHaveLength(0);
  });

  it('id không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .delete('/api/admin/vouchers/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
