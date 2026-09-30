/**
 * Integration tests for self-serve custom plans.
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
  seedProductionPublicPlans,
} = await import('./helpers/db.js');
const { deleteOrphanCustomPlans } = await import('../../src/repositories/payment/customPlan.repository.js');

let app;

const baseQuantities = {
  base_fee: 1,
  zalo_messages: 500,
  emails: 2500,
  ai_credits: 250,
  zalo_accounts: 1,
  email_accounts: 1,
  landing_pages: 1,
  chatbots: 1,
  employees: 1,
  campaigns: 1,
  zalo_campaigns: 0,
  zalo_group_campaigns: 0,
  email_campaigns: 0,
  email_templates: 0,
  zalo_templates: 0,
};

beforeAll(() => {
  app = createApp();
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
});

beforeEach(async () => {
  await truncateAll();
  await seedProductionPublicPlans();
  mockPaymentRequestsCreate.mockReset();
  mockWebhooksVerify.mockReset();
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

describe('Custom plan self-serve', () => {
  it('GET /api/plans/custom/config requires auth', async () => {
    const res = await request(app).get('/api/plans/custom/config');
    expect(res.status).toBe(401);
  });

  it('minimum config stays at base fee with production plans present (no hard floor)', async () => {
    const user = await createUser({ username: 'custom-min-floor' });
    const token = await loginAs(user);

    const ok = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: baseQuantities, billingPeriod: 'monthly' });

    expect(ok.status).toBe(200);
    expect(Number(ok.body.data.total)).toBe(199000);
    expect(ok.body.data.priceFloorApplied).toBe(false);
    expect(Number(ok.body.data.planColumns.monthlyZaloLimit)).toBe(500);
    expect(Number(ok.body.data.planColumns.monthlyEmailLimit)).toBe(2500);
  });

  it('quotes starter-like and skewed configs without flooring to Pro', async () => {
    const user = await createUser({ username: 'custom-quote' });
    const token = await loginAs(user);

    const starterLike = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: {
          ...baseQuantities,
          zalo_messages: 2000,
          emails: 5000,
          ai_credits: 1000,
          landing_pages: 3,
          campaigns: 5,
        },
        billingPeriod: 'monthly',
      });
    expect(starterLike.status).toBe(200);
    expect(Number(starterLike.body.data.monthlyTotal)).toBe(499000);
    expect(starterLike.body.data.priceFloorApplied).toBe(false);

    const skewed = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: {
          ...baseQuantities,
          zalo_messages: 3000,
          zalo_accounts: 5,
        },
        billingPeriod: 'monthly',
      });
    expect(skewed.status).toBe(200);
    expect(Number(skewed.body.data.total)).toBe(509000);
    expect(skewed.body.data.priceFloorApplied).toBe(false);

    const over = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: { ...baseQuantities, zalo_messages: 20000, zalo_accounts: 1 },
        billingPeriod: 'monthly',
      });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe('ZALO_CAPACITY_EXCEEDED');
  });

  it('create-custom-payment ignores client price and creates owned custom plan', async () => {
    const user = await createUser({ username: 'custom-pay' });
    const token = await loginAs(user);

    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: '000201fake',
      checkoutUrl: 'https://pay.payos.vn/web/fake',
    });

    const res = await request(app)
      .post('/api/payments/create-custom-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: baseQuantities,
        billingPeriod: 'monthly',
        amount: 1,
        price: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.result.originalAmount)).toBe(199000);
    expect(Number(res.body.result.amount)).toBe(199000);

    const plan = await db.query(`SELECT * FROM plans WHERE id = $1`, [res.body.result.planId]);
    expect(plan.rows[0].is_custom).toBe(true);
    expect(Number(plan.rows[0].custom_owner_user_id)).toBe(Number(user.id));
    expect(Number(plan.rows[0].price)).toBe(199000);
    expect(plan.rows[0].messages_per_period).toBeNull();
    expect(Number(plan.rows[0].monthly_zalo_limit)).toBe(500);
    // P10 — khách không chọn tin Telegram/WhatsApp: mặc định = mức tối thiểu 500 kèm sẵn trong phí nền (giá không đổi),
    // và cột riêng của gói được ghi (KHÔNG để NULL = không giới hạn).
    expect(Number(plan.rows[0].monthly_telegram_limit)).toBe(500);
    expect(Number(plan.rows[0].monthly_whatsapp_limit)).toBe(500);
  });

  it('P10: quote + tạo gói tuỳ chỉnh tính tiền tin Telegram/WhatsApp như tin Zalo (30.000đ / 500 tin) và ghi cột riêng', async () => {
    const user = await createUser({ username: 'custom-tgwa' });
    const token = await loginAs(user);
    mockPaymentRequestsCreate.mockResolvedValue({ qrCode: '000201fake', checkoutUrl: 'https://pay.payos.vn/web/fake' });
    const quantities = { ...baseQuantities, telegram_messages: 1500, whatsapp_messages: 1000 };

    const quote = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities, billingPeriod: 'monthly' });
    expect(quote.status).toBe(200);
    // 199.000 phí nền + Telegram (1500-500)/500*30.000 = 60.000 + WhatsApp (1000-500)/500*30.000 = 30.000
    expect(Number(quote.body.data.monthlyTotal)).toBe(289000);

    const res = await request(app)
      .post('/api/payments/create-custom-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities, billingPeriod: 'monthly' });
    expect(res.status).toBe(200);
    const plan = await db.query('SELECT monthly_zalo_limit, monthly_telegram_limit, monthly_whatsapp_limit FROM plans WHERE id = $1', [res.body.result.planId]);
    expect(plan.rows[0]).toEqual({ monthly_zalo_limit: 500, monthly_telegram_limit: 1500, monthly_whatsapp_limit: 1000 });
  });

  it('rejects reusePlanId owned by another user', async () => {
    const owner = await createUser({ username: 'owner-custom' });
    const attacker = await createUser({ username: 'attacker-custom' });
    const token = await loginAs(attacker);

    const foreignPlan = await createPlan({
      name: 'Foreign custom',
      price: 500000,
      isCustom: true,
      isActive: true,
      code: null,
    });
    await db.query(
      `UPDATE plans SET custom_owner_user_id = $1, custom_config = $2::jsonb WHERE id = $3`,
      [owner.id, JSON.stringify({ quantities: baseQuantities }), foreignPlan.id]
    );

    const res = await request(app)
      .post('/api/payments/create-custom-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: baseQuantities,
        billingPeriod: 'monthly',
        reusePlanId: foreignPlan.id,
      });

    expect(res.status).toBe(403);
  });

  it('webhook activates custom plan and copies resource limits', async () => {
    const user = await createUser({ username: 'custom-webhook' });
    const token = await loginAs(user);

    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: '000201fake',
      checkoutUrl: 'https://pay.payos.vn/web/fake',
    });

    const created = await request(app)
      .post('/api/payments/create-custom-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: baseQuantities, billingPeriod: 'monthly' });

    expect(created.status).toBe(200);
    const orderCode = created.body.result.orderCode;
    const planId = created.body.result.planId;
    const amount = created.body.result.amount;
    expect(Number(amount)).toBe(199000);

    mockWebhooksVerify.mockResolvedValue({
      code: '00',
      orderCode: Number(orderCode),
      amount: Number(amount),
    });

    const wh = await request(app).post('/api/payments/webhook').send({ fake: true });
    expect(wh.status).toBe(200);

    const u = await db.query(
      `SELECT active_plan_id, max_landing_pages, max_zalo_accounts, max_email_accounts, max_campaigns
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(Number(u.rows[0].active_plan_id)).toBe(Number(planId));
    expect(Number(u.rows[0].max_landing_pages)).toBe(1);
    expect(Number(u.rows[0].max_zalo_accounts)).toBe(1);
    expect(Number(u.rows[0].max_email_accounts)).toBe(1);
    expect(Number(u.rows[0].max_campaigns)).toBe(1);
  });

  it('cleanup deletes orphan unpaid custom plans past pending window', async () => {
    const user = await createUser({ username: 'orphan-custom' });
    const plan = await createPlan({
      name: 'Orphan custom',
      price: 199000,
      isCustom: true,
      isActive: true,
      code: null,
    });
    await db.query(
      `UPDATE plans
       SET custom_owner_user_id = $1,
           created_at = NOW() - INTERVAL '2 hours'
       WHERE id = $2`,
      [user.id, plan.id]
    );

    const deleted = await deleteOrphanCustomPlans(15);
    expect(deleted.some((p) => Number(p.id) === Number(plan.id))).toBe(true);

    const check = await db.query(`SELECT id FROM plans WHERE id = $1`, [plan.id]);
    expect(check.rows).toHaveLength(0);
  });

  // PLAN_HOAN_TIEN_DON_HANG mục 1.2 (27/09) — FK orders_plan_id_fkey không có ON DELETE: gói
  // còn BẤT KỲ đơn nào trỏ vào mà lọt vào DELETE thì cả lượt dọn nổ, không gói mồ côi nào khác
  // được dọn. Ghim: gói có đơn (mọi trạng thái) được giữ, lượt dọn vẫn chạy và dọn gói không đơn.
  it.each(['cancelled', 'failed', 'refunded', 'pending'])(
    'cleanup giữ gói có đơn %s trỏ vào (không vướng FK) và vẫn dọn gói không có đơn nào',
    async (orderStatus) => {
      const user = await createUser({ username: `orphan-keep-${orderStatus}` });
      const kept = await createPlan({
        name: `Custom có đơn ${orderStatus}`, price: 199000, isCustom: true, isActive: true, code: null,
      });
      const orphan = await createPlan({
        name: 'Custom không đơn', price: 199000, isCustom: true, isActive: true, code: null,
      });
      await db.query(
        `UPDATE plans
         SET custom_owner_user_id = $1,
             created_at = NOW() - INTERVAL '2 hours'
         WHERE id = ANY($2::int[])`,
        [user.id, [kept.id, orphan.id]]
      );
      // Đơn cũ hơn cửa sổ 15 phút — với pending đây là ca mà điều kiện cũ (chỉ loại pending còn
      // mới) để lọt vào DELETE.
      await db.query(
        `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, created_at)
         VALUES ($1, $2, 199000, $3, $4, $5, NOW() - INTERVAL '2 hours')`,
        [Date.now() + 11, kept.id, user.email, user.id, orderStatus]
      );

      const deleted = await deleteOrphanCustomPlans(15);
      const deletedIds = deleted.map((p) => Number(p.id));
      expect(deletedIds).toContain(Number(orphan.id));
      expect(deletedIds).not.toContain(Number(kept.id));

      const check = await db.query(`SELECT id FROM plans WHERE id = $1`, [kept.id]);
      expect(check.rows).toHaveLength(1);
    }
  );

  it('rejects admin patch when minQty < includedQty', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin-pricing' });
    const token = await loginAs(admin);

    const res = await request(app)
      .patch('/api/admin/plans/custom-pricing/zalo_messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ minQty: 100, includedQty: 500 });

    expect(res.status).toBe(400);
    expect(String(res.body.message || '')).toMatch(/minQty/i);
  });

  it('audits custom pricing updates', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin-pricing-audit' });
    const token = await loginAs(admin);

    const before = await db.query(
      `SELECT unit_price FROM custom_plan_pricing WHERE item_key = 'landing_pages'`
    );
    const prevPrice = Number(before.rows[0].unit_price);

    const res = await request(app)
      .patch('/api/admin/plans/custom-pricing/landing_pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ unitPrice: prevPrice + 1000 });

    expect(res.status).toBe(200);

    const logs = await db.query(
      `SELECT action, details FROM audit_logs
       WHERE action = 'CUSTOM_PLAN_PRICING_UPDATED'
       ORDER BY id DESC LIMIT 1`
    );
    expect(logs.rows).toHaveLength(1);
    expect(logs.rows[0].details.itemKey).toBe('landing_pages');
    expect(Number(logs.rows[0].details.after.unitPrice)).toBe(prevPrice + 1000);
  });
});
