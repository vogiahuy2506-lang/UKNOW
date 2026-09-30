/**
 * P11 (PLAN_TG_WA_DAY_DU mục 18.3) — trần tin lẻ theo số tài khoản cho Telegram/WhatsApp (giống Zalo), ở top-up.
 * Basic TG 8.000 tin / 2 slot → năng lực 2 × 16.000 = 32.000 → còn mua được 24.000.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../src/utils/payos.util.js', () => ({
  default: { paymentRequests: { create: jest.fn() }, webhooks: { verify: jest.fn() } },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan } = await import('./helpers/db.js');
const { _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');

let app;

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function createChannelTopupUser(username, overrides = {}) {
  const cfg = {
    monthlyTelegramLimit: 8000, maxTelegramAccounts: 2,
    monthlyWhatsappLimit: 8000, maxWhatsappAccounts: 2,
    ...overrides,
  };
  const plan = await createPlan({ name: `P11 plan ${username}`, price: 100000, isActive: true, maxEmployees: 5 });
  const user = await createUser({ username, planId: plan.id });
  await db.query(
    `UPDATE plans SET monthly_zalo_limit = 8000, max_zalo_accounts = 1,
            monthly_telegram_limit = $1, max_telegram_accounts = $2,
            monthly_whatsapp_limit = $3, max_whatsapp_accounts = $4,
            daily_zalo_limit = NULL, daily_email_limit = NULL, messages_per_period = NULL
     WHERE id = $5`,
    [cfg.monthlyTelegramLimit, cfg.maxTelegramAccounts, cfg.monthlyWhatsappLimit, cfg.maxWhatsappAccounts, plan.id]
  );
  // topup_lock/unlimitedItemKeys đọc cột trên users cho slot: giữ đồng bộ với gói.
  await db.query(
    `UPDATE users SET max_telegram_accounts = $1, max_whatsapp_accounts = $2 WHERE id = $3`,
    [cfg.maxTelegramAccounts, cfg.maxWhatsappAccounts, user.id]
  );
  return user;
}

describe('P11 — năng lực top-up Telegram/WhatsApp theo số tài khoản', () => {
  beforeAll(() => { app = createApp(); });
  beforeEach(async () => { await truncateAll(); _clearQuotaCache(); });

  it('config trả telegramCapacity/whatsappCapacity (remaining 24.000) và vẫn trả zaloCapacity', async () => {
    const user = await createChannelTopupUser('p11-cfg');
    const token = await loginAs(user);
    const cfg = await request(app).get('/api/topup/config').set('Authorization', `Bearer ${token}`);
    expect(cfg.status).toBe(200);
    expect(cfg.body.result.zaloCapacity).toMatchObject({ accounts: 1, remaining: 8000 });
    expect(cfg.body.result.telegramCapacity).toMatchObject({ accounts: 2, capacity: 32000, remaining: 24000, channel: 'telegram' });
    expect(cfg.body.result.whatsappCapacity).toMatchObject({ accounts: 2, capacity: 32000, remaining: 24000, channel: 'whatsapp' });
  });

  it('quote telegram 24.000 → 200; 24.050 → 400 TELEGRAM_CAPACITY_EXCEEDED; whatsapp 24.050 → WHATSAPP_CAPACITY_EXCEEDED', async () => {
    const user = await createChannelTopupUser('p11-quote');
    const token = await loginAs(user);
    const quote = (quantities) => request(app)
      .post('/api/topup/quote').set('Authorization', `Bearer ${token}`).send({ quantities });

    const ok = await quote({ telegram_messages: 24000 });
    expect(ok.status).toBe(200);
    expect(ok.body.result.telegramCapacity.ok).toBe(true);
    const item = ok.body.result.items.find((i) => i.itemKey === 'telegram_messages');
    expect(Number(item.maxQty)).toBe(24000);

    const over = await quote({ telegram_messages: 24050 });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe('TELEGRAM_CAPACITY_EXCEEDED');

    const overWa = await quote({ whatsapp_messages: 24050 });
    expect(overWa.status).toBe(400);
    expect(overWa.body.code).toBe('WHATSAPP_CAPACITY_EXCEEDED');
    expect(overWa.body.message).toContain('WhatsApp');
  });

  it('gói có max_telegram_accounts=0 → TELEGRAM_NO_SLOT', async () => {
    const user = await createChannelTopupUser('p11-noslot', { maxTelegramAccounts: 0 });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/topup/quote').set('Authorization', `Bearer ${token}`)
      .send({ quantities: { telegram_messages: 500 } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TELEGRAM_NO_SLOT');
  });
});
