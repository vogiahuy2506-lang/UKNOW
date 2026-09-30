/**
 * P6 (PLAN_TG_WA_DAY_DU) — bán lẻ slot Telegram/WhatsApp qua top-up + gói tuỳ chỉnh có 2 cột mới.
 * CSDL thật + HTTP thật (PayOS giả): giá mặc định = giá slot Zalo, mua slot → grant → MỞ khoá, gói không giới hạn
 * thì không bán, gói tuỳ chỉnh tính tiền + copy hạn mức sang users.
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
const { truncateAll, createUser, seedProductionPublicPlans } = await import('./helpers/db.js');
const { reconcileResourceLocks } = await import('../../src/services/payment/topupLock.service.js');
const { resourceIsLocked } = await import('../../src/utils/topupLockGate.util.js');

let app;

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function addTelegramAccounts(ownerId, n) {
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const { rows } = await db.query(
      `INSERT INTO telegram_accounts (id_user, telegram_user_id, username, is_active)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [ownerId, Date.now() * 10 + i + Math.floor(Math.random() * 1000000), `tg_${i}`]
    );
    ids.push(Number(rows[0].id));
  }
  return ids;
}

const baseCustomQuantities = {
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
  mockPaymentRequestsCreate.mockReset();
  mockWebhooksVerify.mockReset();
});

describe('P6 — bán lẻ slot Telegram/WhatsApp (top-up)', () => {
  it('bảng giá bán lẻ có 2 món mới, giá + bước + trần y hệt slot Zalo; config trả unlimitedItemKeys theo gói', async () => {
    const user = await createUser({ username: 'p6-config' });
    await db.query(`UPDATE users SET max_telegram_accounts = 1 WHERE id = $1`, [user.id]); // WA để NULL
    const token = await loginAs(user);

    const res = await request(app).get('/api/topup/config').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const items = res.body.result.items;
    const zalo = items.find((i) => i.itemKey === 'zalo_accounts');
    for (const key of ['telegram_accounts', 'whatsapp_accounts']) {
      const item = items.find((i) => i.itemKey === key);
      expect(item).toBeDefined();
      expect({ p: item.unitPrice, min: item.minQty, step: item.stepQty, max: item.maxQty })
        .toEqual({ p: zalo.unitPrice, min: zalo.minQty, step: zalo.stepQty, max: zalo.maxQty });
    }
    // P10 — gói thử nghiệm không khai hạn mức tin (NULL = không giới hạn) nên hai ví tin cũng KHÔNG bán; đặt trần riêng cho
    // Telegram thì ví telegram_messages hiện lại (còn whatsapp_messages vẫn ẩn).
    expect([...res.body.result.unlimitedItemKeys].sort())
      .toEqual(['telegram_messages', 'whatsapp_accounts', 'whatsapp_messages']);
    const zaloMessages = items.find((i) => i.itemKey === 'zalo_messages');
    for (const key of ['telegram_messages', 'whatsapp_messages']) {
      const item = items.find((i) => i.itemKey === key);
      expect({ p: item.unitPrice, min: item.minQty, step: item.stepQty, max: item.maxQty })
        .toEqual({ p: zaloMessages.unitPrice, min: zaloMessages.minQty, step: zaloMessages.stepQty, max: zaloMessages.maxQty });
    }
    await db.query(
      `UPDATE plans SET monthly_telegram_limit = 2000 WHERE id = (SELECT active_plan_id FROM users WHERE id = $1)`,
      [user.id]
    );
    const res2 = await request(app).get('/api/topup/config').set('Authorization', `Bearer ${token}`);
    expect([...res2.body.result.unlimitedItemKeys].sort()).toEqual(['whatsapp_accounts', 'whatsapp_messages']);
  });

  it('mua 1 slot Telegram: đơn 50.000đ → webhook cấp grant → MỞ khoá tài khoản đang bị khoá', async () => {
    const user = await createUser({ username: 'p6-buy-tg' });
    await db.query(`UPDATE users SET max_telegram_accounts = 1 WHERE id = $1`, [user.id]);
    const [a, b] = await addTelegramAccounts(user.id, 2);
    await reconcileResourceLocks(user.id, db);
    expect(await resourceIsLocked('telegram_accounts', a)).toBe(false);
    expect(await resourceIsLocked('telegram_accounts', b)).toBe(true);

    const token = await loginAs(user);
    mockPaymentRequestsCreate.mockResolvedValue({ qrCode: '000201fake', checkoutUrl: 'https://pay.payos.vn/web/fake' });
    const created = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { telegram_accounts: 1 }, amount: 1 });
    expect(created.status).toBe(200);
    expect(Number(created.body.result.amount)).toBe(50000);
    const orderCode = created.body.result.orderCode;

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode, amount: 50000 });
    await request(app).post('/api/payments/webhook').send({});

    const grants = await db.query(
      `SELECT item_key, qty, cycle_end FROM topup_grants WHERE order_id = (SELECT id FROM orders WHERE order_code = $1)`,
      [orderCode]
    );
    expect(grants.rows).toHaveLength(1);
    expect(grants.rows[0].item_key).toBe('telegram_accounts');
    expect(Number(grants.rows[0].qty)).toBe(1);
    expect(grants.rows[0].cycle_end).not.toBeNull();

    expect(await resourceIsLocked('telegram_accounts', a)).toBe(false);
    expect(await resourceIsLocked('telegram_accounts', b)).toBe(false);
  });

  it('gói KHÔNG giới hạn số tài khoản kênh (cột NULL) → không bán slot: 400 CHANNEL_SLOTS_UNLIMITED, không tạo đơn', async () => {
    const user = await createUser({ username: 'p6-unlimited' }); // max_telegram/whatsapp NULL
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { whatsapp_accounts: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHANNEL_SLOTS_UNLIMITED');
    const orders = await db.query(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1`, [user.id]);
    expect(orders.rows[0].n).toBe(0);
  });
});

describe('P10 — mua ví tin Telegram/WhatsApp (top-up tiêu hao)', () => {
  it('gói có trần tin Telegram: mua 100 tin = 10.000đ (100đ/tin như Zalo) → webhook cấp grant VĨNH VIỄN (cycle_end NULL) cho telegram_messages; gói KHÔNG trần thì 400', async () => {
    const user = await createUser({ username: 'p10-buy-tg-msg' });
    const token = await loginAs(user);
    mockPaymentRequestsCreate.mockResolvedValue({ qrCode: '000201fake', checkoutUrl: 'https://pay.payos.vn/web/fake' });

    // Gói thử nghiệm không khai trần tin (NULL = không giới hạn) → không bán.
    const blocked = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { telegram_messages: 500 } });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('CHANNEL_SLOTS_UNLIMITED');

    await db.query(
      `UPDATE plans SET monthly_telegram_limit = 2000 WHERE id = (SELECT active_plan_id FROM users WHERE id = $1)`,
      [user.id]
    );
    const created = await request(app)
      .post('/api/topup/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { telegram_messages: 500 }, amount: 1 });
    expect(created.status).toBe(200);
    expect(Number(created.body.result.amount)).toBe(50000); // 500 tin x 100đ = 50.000đ (đúng mức tối thiểu đơn)
    const orderCode = created.body.result.orderCode;

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode, amount: 50000 });
    await request(app).post('/api/payments/webhook').send({});

    const grants = await db.query(
      `SELECT item_key, qty, cycle_end FROM topup_grants WHERE order_id = (SELECT id FROM orders WHERE order_code = $1)`,
      [orderCode]
    );
    expect(grants.rows).toHaveLength(1);
    expect(grants.rows[0].item_key).toBe('telegram_messages');
    expect(Number(grants.rows[0].qty)).toBe(500);
    expect(grants.rows[0].cycle_end).toBeNull();
  });
});

describe('P6 — gói tuỳ chỉnh có max_telegram_accounts / max_whatsapp_accounts', () => {
  // Migration 270 (30/09): TG/WA min 1, kèm sẵn 1 như Zalo/email — bỏ trống = 1 (không tốn thêm), 0 bị từ chối.
  it('cấu hình giá trả 2 hạng mục mới; báo giá tính đúng theo đơn giá TK Zalo; bỏ trống = 1 kèm sẵn không tốn tiền; 0 bị từ chối', async () => {
    await seedProductionPublicPlans();
    const user = await createUser({ username: 'p6-custom-quote' });
    const token = await loginAs(user);

    const zeroRes = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: baseCustomQuantities, billingPeriod: 'monthly' });
    expect(zeroRes.status).toBe(200);
    expect(Number(zeroRes.body.data.total)).toBe(199000);
    expect(Number(zeroRes.body.data.planColumns.maxTelegramAccounts)).toBe(1);
    expect(Number(zeroRes.body.data.planColumns.maxWhatsappAccounts)).toBe(1);

    const belowMin = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantities: { ...baseCustomQuantities, telegram_accounts: 0 }, billingPeriod: 'monthly' });
    expect(belowMin.status).toBe(400);

    const res = await request(app)
      .post('/api/plans/custom/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: { ...baseCustomQuantities, telegram_accounts: 2, whatsapp_accounts: 1 },
        billingPeriod: 'monthly',
      });
    expect(res.status).toBe(200);
    // 199.000 + (2 − 1 kèm sẵn) Telegram × 40.000 + (1 − 1 kèm sẵn) WhatsApp × 40.000 (= đơn giá TK Zalo)
    expect(Number(res.body.data.monthlyTotal)).toBe(199000 + 1 * 40000);
    expect(Number(res.body.data.planColumns.maxTelegramAccounts)).toBe(2);
    expect(Number(res.body.data.planColumns.maxWhatsappAccounts)).toBe(1);

    const cfg = await request(app).get('/api/plans/custom/config').set('Authorization', `Bearer ${token}`);
    expect(cfg.status).toBe(200);
    const flat = JSON.stringify(cfg.body);
    expect(flat).toContain('telegram_accounts');
    expect(flat).toContain('whatsapp_accounts');
  });

  it('thanh toán + webhook: plans và users nhận đúng max_telegram_accounts / max_whatsapp_accounts', async () => {
    await seedProductionPublicPlans();
    const user = await createUser({ username: 'p6-custom-pay' });
    const token = await loginAs(user);
    mockPaymentRequestsCreate.mockResolvedValue({ qrCode: '000201fake', checkoutUrl: 'https://pay.payos.vn/web/fake' });

    const created = await request(app)
      .post('/api/payments/create-custom-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantities: { ...baseCustomQuantities, telegram_accounts: 2, whatsapp_accounts: 1 },
        billingPeriod: 'monthly',
      });
    expect(created.status).toBe(200);
    const { orderCode, planId, amount } = created.body.result;
    expect(Number(amount)).toBe(199000 + 1 * 40000);

    const planRow = await db.query(`SELECT max_telegram_accounts, max_whatsapp_accounts FROM plans WHERE id = $1`, [planId]);
    expect(Number(planRow.rows[0].max_telegram_accounts)).toBe(2);
    expect(Number(planRow.rows[0].max_whatsapp_accounts)).toBe(1);

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode: Number(orderCode), amount: Number(amount) });
    const wh = await request(app).post('/api/payments/webhook').send({ fake: true });
    expect(wh.status).toBe(200);

    const u = await db.query(`SELECT max_telegram_accounts, max_whatsapp_accounts FROM users WHERE id = $1`, [user.id]);
    expect(Number(u.rows[0].max_telegram_accounts)).toBe(2);
    expect(Number(u.rows[0].max_whatsapp_accounts)).toBe(1);
  });
});
