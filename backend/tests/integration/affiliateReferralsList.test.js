/**
 * Integration tests — GET /api/affiliate/referrals: danh sách người đã đăng ký bằng mã giới
 * thiệu của "tôi" (referrer), và /api/affiliate/overview.referralCount.
 *
 * Kiểm tra đầy đủ:
 * 1. A giới thiệu B, C; D giới thiệu E → A gọi /referrals CHỈ thấy B, C (không thấy E).
 * 2. Sắp mới nhất trước (C đăng ký sau B → C đứng trước).
 * 3. Email đã che (maskEmail 3 ký tự), KHÔNG có trường email đầy đủ hay phone trong JSON.
 * 4. C có 2 event (1 đã reversed) → hasPurchased=true, attributedRevenue CHỈ tính event chưa reversed.
 * 5. B chưa có event nào → hasPurchased=false, attributedRevenue=0.
 * 6. Phân trang limit=1 → 2 trang.
 * 7. Không token → 401.
 * 8. /overview.referralCount của A = 2.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, createOrder } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await db.query(`
    TRUNCATE TABLE
      affiliate_withdrawals,
      affiliate_ledger,
      affiliate_periods,
      affiliate_revenue_events
    CASCADE;
  `);
  await truncateAll();
});

function createAuthToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET || 'test-jwt-secret'
  );
}

async function setReferredBy(referredUser, referrerUser, referredAt) {
  await db.query(
    `UPDATE users SET referred_by_user_id = $1, referred_at = $2 WHERE id = $3`,
    [referrerUser.id, referredAt, referredUser.id]
  );
}

async function insertRevenueEvent({ referrer, buyer, plan, amount = 299000, reversed = false }) {
  const order = await createOrder({
    planId: plan.id,
    userId: buyer.id,
    userEmail: buyer.email,
    status: 'success',
    amount,
  });
  const { rows } = await db.query(
    `INSERT INTO affiliate_revenue_events
       (referrer_user_id, buyer_user_id, order_id, amount, month_key, reversed_at)
     VALUES ($1, $2, $3, $4, '2026-09', $5)
     RETURNING *`,
    [referrer.id, buyer.id, order.id, amount, reversed ? new Date() : null]
  );
  return rows[0];
}

describe('GET /api/affiliate/referrals — danh sách người dùng mã giới thiệu', () => {
  it('1-5. A thấy đúng B,C (không thấy E), sắp mới nhất trước, email đã che, C tính đúng doanh thu còn hiệu lực', async () => {
    const a = await createUser({ email: 'a@test.com', username: 'user_a' });
    const d = await createUser({ email: 'd@test.com', username: 'user_d' });
    const b = await createUser({ email: 'nguyenvanb@test.com', username: 'user_b' });
    const c = await createUser({ email: 'nguyenvanc@test.com', username: 'user_c' });
    const e = await createUser({ email: 'user-e@test.com', username: 'user_e' });
    const plan = await createPlan();

    await setReferredBy(b, a, new Date('2026-09-10T00:00:00Z'));
    await setReferredBy(c, a, new Date('2026-09-20T00:00:00Z')); // C mới hơn B
    await setReferredBy(e, d, new Date('2026-09-15T00:00:00Z'));

    // C có 2 event: 1 hợp lệ (299.000đ), 1 đã reversed (599.000đ) — không được cộng vào
    await insertRevenueEvent({ referrer: a, buyer: c, plan, amount: 299000, reversed: false });
    await insertRevenueEvent({ referrer: a, buyer: c, plan, amount: 599000, reversed: true });

    const token = createAuthToken(a);
    const res = await request(app)
      .get('/api/affiliate/referrals')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { items, total } = res.body.data;

    expect(total).toBe(2);
    expect(items).toHaveLength(2);

    // Sắp mới nhất trước: C rồi tới B. Không có E (con của D).
    expect(items[0].name).toBe(c.full_name);
    expect(items[1].name).toBe(b.full_name);
    expect(items.some((it) => it.name === e.full_name)).toBe(false);

    // C: hasPurchased true, attributedRevenue CHỈ tính event chưa reversed (299.000)
    expect(items[0].hasPurchased).toBe(true);
    expect(items[0].attributedRevenue).toBe(299000);

    // B: chưa mua gì
    expect(items[1].hasPurchased).toBe(false);
    expect(items[1].attributedRevenue).toBe(0);

    // Email đã che, không lộ email đầy đủ / phone trong JSON
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('nguyenvanc@test.com');
    expect(raw).not.toContain('nguyenvanb@test.com');
    expect(items[0].emailMasked).toBe('ngu***@test.com');
    items.forEach((it) => {
      expect(it.email).toBeUndefined();
      expect(it.phone).toBeUndefined();
      expect(it.id).toBeUndefined();
    });
  });

  it('6. Phân trang limit=1 → 2 trang', async () => {
    const a = await createUser({ email: 'a2@test.com', username: 'user_a2' });
    const b = await createUser({ email: 'b2@test.com', username: 'user_b2' });
    const c = await createUser({ email: 'c2@test.com', username: 'user_c2' });
    await setReferredBy(b, a, new Date('2026-09-10T00:00:00Z'));
    await setReferredBy(c, a, new Date('2026-09-20T00:00:00Z'));

    const token = createAuthToken(a);

    const page1 = await request(app)
      .get('/api/affiliate/referrals?page=1&limit=1')
      .set('Authorization', `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(1);
    expect(page1.body.data.total).toBe(2);
    expect(page1.body.data.totalPages).toBe(2);
    expect(page1.body.data.items[0].name).toBe(c.full_name);

    const page2 = await request(app)
      .get('/api/affiliate/referrals?page=2&limit=1')
      .set('Authorization', `Bearer ${token}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data.items).toHaveLength(1);
    expect(page2.body.data.items[0].name).toBe(b.full_name);
  });

  it('7. Không token → 401', async () => {
    const res = await request(app).get('/api/affiliate/referrals');
    expect(res.status).toBe(401);
  });

  it('Chưa có ai dùng mã → items rỗng, total=0', async () => {
    const a = await createUser({ email: 'a3@test.com', username: 'user_a3' });
    const token = createAuthToken(a);

    const res = await request(app)
      .get('/api/affiliate/referrals')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });
});

describe('GET /api/affiliate/referrals — ẩn người dùng đã xoá + cờ awaitingPhone', () => {
  async function getList(referrer, query = '') {
    const res = await request(app)
      .get(`/api/affiliate/referrals${query}`)
      .set('Authorization', `Bearer ${createAuthToken(referrer)}`);
    expect(res.status).toBe(200);
    return res.body.data;
  }

  it('9. B (status=deleted) và C (deleted_at) bị ẩn; chỉ còn D, total=1', async () => {
    const a = await createUser({ email: 'a9@test.com', username: 'user_a9' });
    const b = await createUser({ email: 'b9@test.com', username: 'user_b9' });
    const c = await createUser({ email: 'c9@test.com', username: 'user_c9' });
    const d = await createUser({ email: 'd9@test.com', username: 'user_d9' });
    await setReferredBy(b, a, new Date('2026-09-10T00:00:00Z'));
    await setReferredBy(c, a, new Date('2026-09-11T00:00:00Z'));
    await setReferredBy(d, a, new Date('2026-09-12T00:00:00Z'));
    await db.query(`UPDATE users SET status = 'deleted' WHERE id = $1`, [b.id]);
    await db.query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [c.id]);

    const { items, total, totalPages } = await getList(a);
    expect(total).toBe(1);
    expect(totalPages).toBe(1);
    expect(items.map((it) => it.name)).toEqual([d.full_name]);
  });

  it('10. awaitingPhone: chỉ true khi ĐÃ MUA và CHƯA có SĐT; không lộ trường phone', async () => {
    const a = await createUser({ email: 'a10@test.com', username: 'user_a10' });
    const plan = await createPlan();
    const buyNoPhone = await createUser({ email: 'buynophone@test.com', username: 'u_buy_nophone', phone: null });
    const buyBlankPhone = await createUser({ email: 'buyblank@test.com', username: 'u_buy_blank' });
    const buyPhone = await createUser({ email: 'buyphone@test.com', username: 'u_buy_phone' });
    const noBuyNoPhone = await createUser({ email: 'nobuy@test.com', username: 'u_nobuy_nophone', phone: null });
    await db.query(`UPDATE users SET phone = '   ' WHERE id = $1`, [buyBlankPhone.id]);

    await setReferredBy(buyNoPhone, a, new Date('2026-09-10T00:00:00Z'));
    await setReferredBy(buyBlankPhone, a, new Date('2026-09-11T00:00:00Z'));
    await setReferredBy(buyPhone, a, new Date('2026-09-12T00:00:00Z'));
    await setReferredBy(noBuyNoPhone, a, new Date('2026-09-13T00:00:00Z'));
    await insertRevenueEvent({ referrer: a, buyer: buyNoPhone, plan });
    await insertRevenueEvent({ referrer: a, buyer: buyBlankPhone, plan });
    await insertRevenueEvent({ referrer: a, buyer: buyPhone, plan });

    const { items } = await getList(a);
    const byName = Object.fromEntries(items.map((it) => [it.name, it]));

    expect(byName[buyNoPhone.full_name]).toMatchObject({ hasPurchased: true, awaitingPhone: true });
    expect(byName[buyBlankPhone.full_name]).toMatchObject({ hasPurchased: true, awaitingPhone: true });
    expect(byName[buyPhone.full_name]).toMatchObject({ hasPurchased: true, awaitingPhone: false });
    expect(byName[noBuyNoPhone.full_name]).toMatchObject({ hasPurchased: false, awaitingPhone: false });

    items.forEach((it) => {
      expect(it.phone).toBeUndefined();
      expect(it.missing_phone).toBeUndefined();
    });
    expect(JSON.stringify(items)).not.toContain(buyPhone.phone);
  });
});

describe('GET /api/affiliate/overview — referralCount', () => {
  it('8. referralCount của A = 2 (B, C), không tính E của D', async () => {
    const a = await createUser({ email: 'a4@test.com', username: 'user_a4' });
    const d = await createUser({ email: 'd4@test.com', username: 'user_d4' });
    const b = await createUser({ email: 'b4@test.com', username: 'user_b4' });
    const c = await createUser({ email: 'c4@test.com', username: 'user_c4' });
    const e = await createUser({ email: 'e4@test.com', username: 'user_e4' });

    await setReferredBy(b, a, new Date('2026-09-10T00:00:00Z'));
    await setReferredBy(c, a, new Date('2026-09-20T00:00:00Z'));
    await setReferredBy(e, d, new Date('2026-09-15T00:00:00Z'));

    const token = createAuthToken(a);
    const res = await request(app)
      .get('/api/affiliate/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.referralCount).toBe(2);
  });
});
