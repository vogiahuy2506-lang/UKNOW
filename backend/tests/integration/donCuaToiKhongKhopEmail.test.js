/**
 * PLAN_GOM_MUC_NHE_2026-10-20 PR-2 — "Đơn của tôi" (GET /api/users/my-orders) và trạng thái thanh toán (GET /api/payments/status/:orderCode)
 * không còn khớp đơn theo EMAIL: email hồ sơ đổi được mà không xác minh, nên khớp theo email = đặt email người khác là xem được đơn cũ của họ.
 *
 *  - Migration 309 gán `user_id` cho đơn `user_id IS NULL` có `user_email` khớp ĐÚNG MỘT tài khoản (không phân biệt hoa/thường);
 *    khớp 0 hoặc ≥ 2 tài khoản thì bỏ qua; không đổi trạng thái / số tiền; chạy lại không đổi thêm.
 *  - Sau khi bỏ nhánh email: đơn NULL cùng email với A không hiện cho A (cho tới khi migration gán), và B đổi email trùng email đơn mồ côi
 *    thì cũng không thấy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, createOrder, createPlan, truncateAll } from './helpers/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/309_orders_gan_user_id_theo_email_duy_nhat.sql'),
  'utf8'
);

let app;
let plan;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  plan = await createPlan();
});

const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.data.accessToken;
}

const myOrders = (token) =>
  request(app).get('/api/users/my-orders').set('Authorization', `Bearer ${token}`);
const orderCodes = (res) => res.body.data.map((o) => String(o.orderCode));

const readOrder = async (id) =>
  (await db.query('SELECT user_id, status, amount, user_email, updated_at FROM orders WHERE id = $1', [id])).rows[0];

describe('migration 309 — gán user_id cho đơn cũ theo email khớp ĐÚNG MỘT tài khoản', () => {
  it('khớp đúng một (không phân biệt hoa/thường) → gán; khớp 0 → giữ NULL; khớp 2 tài khoản → giữ NULL; đơn đã có chủ → không đổi; không đổi trạng thái/số tiền; chạy lại không đổi', async () => {
    const a = await createUser({ username: `don_a_${rnd()}`.slice(0, 40), email: `Chu.A.${rnd()}@Test.Local` });
    const b = await createUser({ username: `don_b_${rnd()}`.slice(0, 40) });
    const dupEmail = `trung.${rnd()}@test.local`;
    await createUser({ username: `don_d1_${rnd()}`.slice(0, 40), email: dupEmail });
    await createUser({ username: `don_d2_${rnd()}`.slice(0, 40), email: dupEmail.toUpperCase() });

    const single = await createOrder({ planId: plan.id, userId: null, userEmail: a.email.toLowerCase(), status: 'success', amount: 123000 });
    const cancelled = await createOrder({ planId: plan.id, userId: null, userEmail: a.email, status: 'cancelled', amount: 456000 });
    const orphan = await createOrder({ planId: plan.id, userId: null, userEmail: `khong.ai.${rnd()}@test.local` });
    const ambiguous = await createOrder({ planId: plan.id, userId: null, userEmail: dupEmail });
    const noEmail = await createOrder({ planId: plan.id, userId: null, userEmail: null });
    const owned = await createOrder({ planId: plan.id, userId: b.id, userEmail: a.email });

    const before = Object.fromEntries(
      await Promise.all(
        [single, cancelled, orphan, ambiguous, noEmail, owned].map(async (o) => [o.id, await readOrder(o.id)])
      )
    );

    await db.query(MIGRATION_SQL);

    expect(String((await readOrder(single.id)).user_id)).toBe(String(a.id));
    expect(String((await readOrder(cancelled.id)).user_id)).toBe(String(a.id));
    expect((await readOrder(orphan.id)).user_id).toBeNull();
    expect((await readOrder(ambiguous.id)).user_id).toBeNull();
    expect((await readOrder(noEmail.id)).user_id).toBeNull();
    expect(String((await readOrder(owned.id)).user_id)).toBe(String(b.id));

    // Chỉ cột user_id đổi: trạng thái, số tiền, email, updated_at giữ nguyên.
    for (const o of [single, cancelled, orphan, ambiguous, noEmail, owned]) {
      const after = await readOrder(o.id);
      expect(after.status).toBe(before[o.id].status);
      expect(Number(after.amount)).toBe(Number(before[o.id].amount));
      expect(after.user_email).toBe(before[o.id].user_email);
      expect(new Date(after.updated_at).getTime()).toBe(new Date(before[o.id].updated_at).getTime());
    }

    // Chạy lại: không đổi thêm gì.
    const snapshot = JSON.stringify((await db.query('SELECT id, user_id FROM orders ORDER BY id')).rows);
    await db.query(MIGRATION_SQL);
    expect(JSON.stringify((await db.query('SELECT id, user_id FROM orders ORDER BY id')).rows)).toBe(snapshot);
  });
});

describe('"Đơn của tôi" chỉ theo user_id', () => {
  it('đơn user_id NULL cùng email với A: A KHÔNG thấy cho tới khi migration gán user_id; sau migration A thấy', async () => {
    const a = await createUser({ username: `don_a_${rnd()}`.slice(0, 40) });
    const legacy = await createOrder({ planId: plan.id, userId: null, userEmail: a.email, status: 'success' });
    const tokenA = await loginAs(a);

    expect(orderCodes(await myOrders(tokenA))).not.toContain(String(legacy.order_code));

    await db.query(MIGRATION_SQL);

    const res = await myOrders(tokenA);
    expect(res.status).toBe(200);
    expect(orderCodes(res)).toContain(String(legacy.order_code));
  });

  it('B đổi email hồ sơ thành email của đơn mồ côi (không tài khoản nào khớp) → B KHÔNG thấy đơn đó', async () => {
    const b = await createUser({ username: `don_b_${rnd()}`.slice(0, 40) });
    const orphanEmail = `nguoi.cu.${rnd()}@test.local`;
    const orphan = await createOrder({ planId: plan.id, userId: null, userEmail: orphanEmail, status: 'success' });
    const tokenB = await loginAs(b);

    const put = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ email: orphanEmail });
    expect(put.status).toBe(200);

    const res = await myOrders(tokenB);
    expect(res.status).toBe(200);
    expect(orderCodes(res)).not.toContain(String(orphan.order_code));
  });

  it('đơn có user_id của A vẫn hiện cho A và KHÔNG hiện cho B', async () => {
    const a = await createUser({ username: `don_a_${rnd()}`.slice(0, 40) });
    const b = await createUser({ username: `don_b_${rnd()}`.slice(0, 40) });
    const mine = await createOrder({ planId: plan.id, userId: a.id, userEmail: a.email, status: 'success' });

    expect(orderCodes(await myOrders(await loginAs(a)))).toContain(String(mine.order_code));
    expect(orderCodes(await myOrders(await loginAs(b)))).not.toContain(String(mine.order_code));
  });
});

describe('GET /payments/status/:orderCode chỉ theo user_id khi đã đăng nhập', () => {
  const status = (token, orderCode) =>
    request(app).get(`/api/payments/status/${orderCode}`).set('Authorization', `Bearer ${token}`);

  it('chủ đơn (user_id) → 200; người khác → 404; đơn NULL cùng email với người đang đăng nhập → 404 (không khớp email nữa)', async () => {
    const a = await createUser({ username: `don_a_${rnd()}`.slice(0, 40) });
    const b = await createUser({ username: `don_b_${rnd()}`.slice(0, 40) });
    const owned = await createOrder({ planId: plan.id, userId: a.id, userEmail: a.email, status: 'success' });
    const legacy = await createOrder({ planId: plan.id, userId: null, userEmail: b.email, status: 'success' });
    const tokenA = await loginAs(a);
    const tokenB = await loginAs(b);

    expect((await status(tokenA, owned.order_code)).status).toBe(200);
    expect((await status(tokenB, owned.order_code)).status).toBe(404);
    expect((await status(tokenB, legacy.order_code)).status).toBe(404);

    await db.query(MIGRATION_SQL);
    expect((await status(tokenB, legacy.order_code)).status).toBe(200);
    expect((await status(tokenA, legacy.order_code)).status).toBe(404);
  });
});
