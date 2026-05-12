/**
 * Integration tests cho `/api/plans` — endpoint công khai trang pricing.
 *
 * Repository `findAllPlans` chỉ trả về plan có:
 *   - is_active = TRUE
 *   - is_custom = FALSE (custom plan dành riêng cho khách hàng, không hiện public)
 * và sort theo `price ASC`.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createPlan } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

describe('GET /api/plans', () => {
  it('không yêu cầu auth', async () => {
    await createPlan({ code: 'basic', name: 'Basic', price: 100000 });
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(res.body.plans).toHaveLength(1);
  });

  it('chỉ trả plan is_active=TRUE và is_custom=FALSE', async () => {
    await createPlan({ code: 'pub', name: 'Public', price: 100000, isActive: true, isCustom: false });
    await createPlan({ code: 'hidden', name: 'Hidden', price: 200000, isActive: false, isCustom: false });
    await createPlan({ code: 'cust', name: 'Custom', price: 300000, isActive: true, isCustom: true });

    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0].code).toBe('pub');
  });

  it('sắp xếp theo price ASC', async () => {
    await createPlan({ code: 'pro', name: 'Pro', price: 500000 });
    await createPlan({ code: 'starter', name: 'Starter', price: 100000 });
    await createPlan({ code: 'biz', name: 'Business', price: 300000 });

    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans.map((p) => p.code)).toEqual(['starter', 'biz', 'pro']);
  });

  it('không có plan nào → trả về mảng rỗng (vẫn 200)', async () => {
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, plans: [] });
  });

  it('payload chứa các field public cần thiết (id, code, name, price, features)', async () => {
    await createPlan({
      code: 'biz',
      name: 'Business',
      price: 500000,
      description: 'Best for growing teams',
    });
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    const plan = res.body.plans[0];
    // price là BIGINT → pg trả về string
    expect(plan).toMatchObject({
      code: 'biz',
      name: 'Business',
      description: 'Best for growing teams',
      is_active: true,
      is_custom: false,
    });
    expect(Number(plan.price)).toBe(500000);
    expect(plan).toHaveProperty('features');
  });

  it('500-safety: pool ổn định khi gọi lặp', async () => {
    await createPlan({ code: 'a', price: 100000 });
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/api/plans'))
    );
    responses.forEach((r) => expect(r.status).toBe(200));

    // Đảm bảo plan chưa bị nhân đôi do test race
    const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM plans');
    expect(rows[0].c).toBe(1);
  });
});
