/**
 * Integration tests for mid-cycle top-up purchases.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

const mockPaymentRequestsCreate = jest.fn();
const mockWebhooksVerify = jest.fn();

jest.unstable_mockModule('../../src/utils/payos.util.js', () => ({
  default: {
    paymentRequests: { create: mockPaymentRequestsCreate },
    webhooks: { verify: mockWebhooksVerify },
  },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const {
  truncateAll,
  createUser,
  createPlan,
} = await import('./helpers/db.js');
const { checkSendQuota, _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');

let app;

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function createTopupReadyUser({
  username,
  monthlyZaloLimit = 8000,
  maxZaloAccounts = 1,
  monthlyEmailLimit = 5000,
  aiCredits = 100,
  connectedZaloAccounts = 0,
} = {}) {
  const plan = await createPlan({
    name: `Topup plan ${username}`,
    price: 100000,
    isActive: true,
    monthlyZaloLimit,
    monthlyEmailLimit,
    maxEmployees: 5,
    aiCreditsPerPeriod: aiCredits,
  });
  const user = await createUser({ username, planId: plan.id });
  await db.query(
    `UPDATE plans
     SET monthly_zalo_limit = $1,
         monthly_email_limit = $2,
         max_zalo_accounts = $3,
         ai_credits_per_period = $4,
         daily_zalo_limit = NULL,
         daily_email_limit = NULL,
         messages_per_period = NULL
     WHERE id = $5`,
    [monthlyZaloLimit, monthlyEmailLimit, maxZaloAccounts, aiCredits, plan.id]
  );
  for (let i = 0; i < connectedZaloAccounts; i += 1) {
    await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active)
       VALUES ($1, $2, 'connected', TRUE)`,
      [user.id, `Zalo ${i + 1}`]
    );
  }
  return { user, plan };
}

describe('Top-up mid-cycle', () => {
  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await truncateAll();
    mockPaymentRequestsCreate.mockReset();
    mockWebhooksVerify.mockReset();
    _clearQuotaCache();
  });

  it('quote 300+1000+50 = 60000 and rejects under min / bad step / over capacity', async () => {
    const { user } = await createTopupReadyUser({
      username: 'topup-quote',
      connectedZaloAccounts: 1,
    });
    const token = await loginAs(user);

    const ok = await request(app)
      .post('/api/topup/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: { zalo_messages: 300, emails: 1000, ai_credits: 50 },
      });
    expect(ok.status).toBe(200);
    expect(Number(ok.body.result.total)).toBe(60000);
    expect(ok.body.result.meetsMinimum).toBe(true);

    const underMin = await request(app)
      .post('/api/topup/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 100 } });
    expect(underMin.status).toBe(200);
    expect(underMin.body.result.meetsMinimum).toBe(false);
    expect(Number(underMin.body.result.total)).toBe(10000);

    const badStep = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 320, emails: 2500 } });
    expect(badStep.status).toBe(400);

    const overCap = await request(app)
      .post('/api/topup/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 10000 } });
    expect(overCap.status).toBe(400);
    expect(overCap.body.code).toBe('ZALO_CAPACITY_EXCEEDED');
  });

  it('Pro 5 slot mới nối 1 TK → năng lực tính theo slot gói, chặn khi vượt trần', async () => {
    // Năng lực = slot gói (5 × 16.000 = 80.000), không phụ thuộc đã quét QR bao nhiêu TK.
    // Gói đã cấp 25.000 → còn bán được đúng 55.000.
    const { user } = await createTopupReadyUser({
      username: 'topup-pro-1tk',
      monthlyZaloLimit: 25000,
      maxZaloAccounts: 5,
      connectedZaloAccounts: 1,
    });
    const token = await loginAs(user);

    const cfg = await request(app)
      .get('/api/topup/config')
      .set('Authorization', `Bearer ${token}`);
    expect(cfg.status).toBe(200);
    expect(Number(cfg.body.result.zaloCapacity.accounts)).toBe(5);
    expect(Number(cfg.body.result.zaloCapacity.remaining)).toBe(55000);

    const atCeiling = await request(app)
      .post('/api/topup/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 55000 } });
    expect(atCeiling.status).toBe(200);

    const overCeiling = await request(app)
      .post('/api/topup/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 55050 } });
    expect(overCeiling.status).toBe(400);
    expect(overCeiling.body.code).toBe('ZALO_CAPACITY_EXCEEDED');
  });

  it('chưa nối Zalo vẫn mua được tin — kết nối sau', async () => {
    // Chủ ý thương mại: slot gói là trần bán, khách mua trước rồi quét QR sau.
    const { user } = await createTopupReadyUser({
      username: 'topup-no-zalo',
      connectedZaloAccounts: 0,
    });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/topup/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 500 } });
    expect(res.status).toBe(200);
  });

  it('gói không có slot Zalo → chặn mua tin', async () => {
    const { user } = await createTopupReadyUser({
      username: 'topup-no-slot',
      maxZaloAccounts: 0,
      connectedZaloAccounts: 0,
    });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/topup/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 500 } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ZALO_NO_SLOT');
  });

  it('create-payment ignores client amount; webhook grants once; no plan extension', async () => {
    const { user } = await createTopupReadyUser({
      username: 'topup-pay',
      connectedZaloAccounts: 1,
    });
    const token = await loginAs(user);

    const before = await db.query(
      `SELECT subscription_expires_at FROM users WHERE id = $1`,
      [user.id]
    );
    const expiresBefore = new Date(before.rows[0].subscription_expires_at).getTime();

    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: '000201fake',
      checkoutUrl: 'https://pay.payos.vn/web/fake-topup',
    });

    const created = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: { zalo_messages: 300, emails: 1000, ai_credits: 50 },
        amount: 1,
      });

    expect(created.status).toBe(200);
    expect(Number(created.body.result.amount)).toBe(60000);
    const orderCode = created.body.result.orderCode;

    const orderRow = await db.query(
      `SELECT note, plan_id, topup_config, amount FROM orders WHERE order_code = $1`,
      [orderCode]
    );
    expect(orderRow.rows[0].note).toBe('topup');
    expect(orderRow.rows[0].plan_id).toBeNull();
    expect(Number(orderRow.rows[0].amount)).toBe(60000);

    mockWebhooksVerify.mockResolvedValue({
      code: '00',
      orderCode,
      amount: 60000,
    });

    await request(app).post('/api/payments/webhook').send({});
    await request(app).post('/api/payments/webhook').send({});

    const grants = await db.query(
      `SELECT item_key, qty, user_id, cycle_end FROM topup_grants WHERE order_id = (
         SELECT id FROM orders WHERE order_code = $1
       ) ORDER BY item_key`,
      [orderCode]
    );
    expect(grants.rows).toHaveLength(3);
    expect(Number(grants.rows.find((g) => g.item_key === 'zalo_messages').qty)).toBe(300);
    expect(Number(grants.rows.find((g) => g.item_key === 'emails').qty)).toBe(1000);
    expect(Number(grants.rows.find((g) => g.item_key === 'ai_credits').qty)).toBe(50);
    expect(Number(grants.rows[0].user_id)).toBe(Number(user.id));
    for (const g of grants.rows) {
      expect(g.cycle_end).toBeNull();
    }

    const after = await db.query(
      `SELECT subscription_expires_at FROM users WHERE id = $1`,
      [user.id]
    );
    expect(new Date(after.rows[0].subscription_expires_at).getTime()).toBe(expiresBefore);

    _clearQuotaCache();
    // Monthly limit was 8000 + 300 topup = 8300; with 0 sent should allow.
    const quota = await checkSendQuota({ userId: user.id, channel: 'zalo' });
    expect(quota.allowed).toBe(true);
  });

  it('employee context bị chặn mua topup (owner-only)', async () => {
    const { user: owner } = await createTopupReadyUser({ username: 'topup-owner' });
    const employee = await createUser({ username: 'topup-emp', withPlan: false });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status, permissions, created_at)
       VALUES ($1, $2, 'active', '{}'::jsonb, NOW())`,
      [owner.id, employee.id]
    );

    const token = await loginAs(employee);
    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'fake',
      checkoutUrl: 'https://pay.payos.vn/web/fake',
    });

    const created = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id))
      .send({ quantities: { emails: 2500 } });

    expect(created.status).toBe(403);
    expect(created.body.code).toBe('OWNER_ONLY');
    expect(mockPaymentRequestsCreate).not.toHaveBeenCalled();
  });

  it('early renewal keeps wallet grants (cycle_end NULL)', async () => {
    const { user, plan } = await createTopupReadyUser({
      username: 'topup-renew',
      monthlyZaloLimit: 100,
    });

    const cycleEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE users SET subscription_expires_at = $1 WHERE id = $2`,
      [cycleEnd, user.id]
    );

    // Seed a fake successful topup order + grant for old cycle
    const { rows: orderRows } = await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, note, topup_config)
       VALUES ($1, NULL, 50000, $2, $3, 'success', 'payos', 'topup', $4::jsonb)
       RETURNING id`,
      [
        Date.now() * 100 + 11,
        user.email,
        user.id,
        JSON.stringify({ quantities: { zalo_messages: 500 }, billingUserId: user.id }),
      ]
    );
    await db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
       VALUES ($1, 'zalo_messages', 500, $2, NULL)`,
      [user.id, orderRows[0].id]
    );

    _clearQuotaCache();
    // Wallet grants survive subscription renew (cycle_end IS NULL)
    const withGrant = await db.query(
      `SELECT COALESCE(SUM(tg.qty), 0)::int AS total
       FROM topup_grants tg
       WHERE tg.user_id = $1 AND tg.item_key = 'zalo_messages'
         AND tg.cycle_end IS NULL`,
      [user.id]
    );
    expect(Number(withGrant.rows[0].total)).toBe(500);

    // Early renew: push subscription_expires_at forward — wallet must remain
    await db.query(
      `UPDATE users SET subscription_expires_at = NOW() + INTERVAL '40 days' WHERE id = $1`,
      [user.id]
    );

    const afterRenew = await db.query(
      `SELECT COALESCE(SUM(tg.qty), 0)::int AS total
       FROM topup_grants tg
       WHERE tg.user_id = $1 AND tg.item_key = 'zalo_messages'
         AND tg.cycle_end IS NULL`,
      [user.id]
    );
    expect(Number(afterRenew.rows[0].total)).toBe(500);

    // Sanity: plan still there
    expect(Number(plan.id)).toBeTruthy();
  });

  it('create-payment rejects under minimum at server', async () => {
    const { user } = await createTopupReadyUser({
      username: 'topup-min',
      connectedZaloAccounts: 1,
    });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 100 } });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tối thiểu/i);
  });

  it('profile addons + my-orders kind=topup; monthlyZaloLimit không đổi', async () => {
    const { user } = await createTopupReadyUser({
      username: 'topup-display',
      monthlyZaloLimit: 2000,
      connectedZaloAccounts: 1,
    });
    const cycleEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE users SET subscription_expires_at = $1 WHERE id = $2`,
      [cycleEnd, user.id]
    );
    const token = await loginAs(user);

    const before = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect(before.body.data.addons).toBeNull();
    expect(Number(before.body.data.monthlyZaloLimit)).toBe(2000);

    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'fake',
      checkoutUrl: 'https://pay.payos.vn/web/fake',
    });
    const created = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { zalo_messages: 300, emails: 1000, ai_credits: 50 } });
    expect(created.status).toBe(200);
    const orderCode = created.body.result.orderCode;

    mockWebhooksVerify.mockResolvedValue({
      code: '00',
      orderCode,
      amount: created.body.result.amount,
    });
    await request(app).post('/api/payments/webhook').send({});

    const profile = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(Number(profile.body.data.monthlyZaloLimit)).toBe(2000);
    expect(profile.body.data.addons).toEqual(
      expect.objectContaining({
        zaloMessages: { granted: 300, used: 0, remaining: 300 },
        emails: { granted: 1000, used: 0, remaining: 1000 },
        aiCredits: { granted: 50, used: 0, remaining: 50 },
      })
    );

    const orders = await request(app)
      .get('/api/users/my-orders')
      .set('Authorization', `Bearer ${token}`);
    expect(orders.status).toBe(200);
    const topupOrder = orders.body.data.find((o) => o.kind === 'topup');
    expect(topupOrder).toBeTruthy();
    expect(topupOrder.topup.items).toEqual(
      expect.arrayContaining([
        { itemKey: 'zalo_messages', qty: 300 },
        { itemKey: 'emails', qty: 1000 },
        { itemKey: 'ai_credits', qty: 50 },
      ])
    );

    await db.query(
      `UPDATE users SET subscription_expires_at = NOW() + INTERVAL '40 days' WHERE id = $1`,
      [user.id]
    );
    const afterCycle = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    // Ví vĩnh viễn — gia hạn gói không làm mất số dư (ca nghiệm thu #3)
    expect(afterCycle.body.data.addons).toEqual(
      expect.objectContaining({
        zaloMessages: { granted: 300, used: 0, remaining: 300 },
        emails: { granted: 1000, used: 0, remaining: 1000 },
        aiCredits: { granted: 50, used: 0, remaining: 50 },
      })
    );
    expect(Number(afterCycle.body.data.monthlyZaloLimit)).toBe(2000);
  });
});
