/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-D (D1) — webhook TikTok Business phải có bí mật trong đường dẫn
 * (`/api/webhooks/tiktok-business/:secret`, env TIKTOK_WEBHOOK_PATH_SECRET), cùng mẫu webhook Mắt Bão.
 *
 * Trước: thiếu TIKTOK_APP_CLIENT_KEYS thì nhận MỌI request, mà `client_key` không phải bí mật — ai biết business_id gửi một
 * sự kiện `account_status_update` giả là vô hiệu hoá được tài khoản TikTok của khách. Sau: sai/thiếu bí mật vẫn 200 (để TikTok
 * không gửi lại dồn dập) nhưng KHÔNG xử lý gì.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

const SECRET = 'bi-mat-duong-dan-tiktok-test-0123456789';
let app;
let previousSecret;
let previousClientKeys;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM tiktok_business_accounts');
  previousSecret = process.env.TIKTOK_WEBHOOK_PATH_SECRET;
  previousClientKeys = process.env.TIKTOK_APP_CLIENT_KEYS;
  process.env.TIKTOK_WEBHOOK_PATH_SECRET = SECRET;
  delete process.env.TIKTOK_APP_CLIENT_KEYS;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.TIKTOK_WEBHOOK_PATH_SECRET;
  else process.env.TIKTOK_WEBHOOK_PATH_SECRET = previousSecret;
  if (previousClientKeys === undefined) delete process.env.TIKTOK_APP_CLIENT_KEYS;
  else process.env.TIKTOK_APP_CLIENT_KEYS = previousClientKeys;
});

const BUSINESS_ID = 'biz-open-id-001';

async function createTikTokAccount() {
  const user = await createUser({ username: `tt_${Date.now()}_${Math.floor(Math.random() * 1e6)}` });
  const { rows } = await db.query(
    `INSERT INTO tiktok_business_accounts
       (id_user, business_id, display_name, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, is_active)
     VALUES ($1, $2, 'TikTok test', 'enc', 'enc', NOW() + INTERVAL '1 day', NOW() + INTERVAL '30 days', true) RETURNING id`,
    [user.id, BUSINESS_ID]
  );
  return Number(rows[0].id);
}

const suspendEvent = () => ({
  event: 'account_status_update',
  status: 'suspended',
  content: JSON.stringify({ to_user: { id: BUSINESS_ID } }),
});

const isActive = async (id) => (await db.query('SELECT is_active FROM tiktok_business_accounts WHERE id = $1', [id])).rows[0].is_active;
const lastWebhookAt = async (id) => (await db.query('SELECT last_webhook_at FROM tiktok_business_accounts WHERE id = $1', [id])).rows[0].last_webhook_at;
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await settle(50);
  }
  return false;
}

describe('POST /api/webhooks/tiktok-business — bí mật trong đường dẫn', () => {
  it('đường cũ KHÔNG có secret -> 200 nhưng không xử lý (tài khoản không bị vô hiệu hoá, không chạm last_webhook_at)', async () => {
    const accountId = await createTikTokAccount();

    const res = await request(app).post('/api/webhooks/tiktok-business').send(suspendEvent());
    await settle();

    expect(res.status).toBe(200);
    expect(await isActive(accountId)).toBe(true);
    expect(await lastWebhookAt(accountId)).toBeNull();
  });

  it('sai secret -> 200, không xử lý', async () => {
    const accountId = await createTikTokAccount();

    const res = await request(app).post('/api/webhooks/tiktok-business/secret-sai').send(suspendEvent());
    await settle();

    expect(res.status).toBe(200);
    expect(await isActive(accountId)).toBe(true);
    expect(await lastWebhookAt(accountId)).toBeNull();
  });

  it('secret chỉ khác độ dài (tiền tố của secret thật) -> 200, không xử lý', async () => {
    const accountId = await createTikTokAccount();

    const res = await request(app).post(`/api/webhooks/tiktok-business/${SECRET.slice(0, -1)}`).send(suspendEvent());
    await settle();

    expect(res.status).toBe(200);
    expect(await isActive(accountId)).toBe(true);
  });

  it('env TIKTOK_WEBHOOK_PATH_SECRET trống -> mọi đường dẫn đều bị bỏ qua (kể cả khi đoán secret rỗng), vẫn 200', async () => {
    const accountId = await createTikTokAccount();
    process.env.TIKTOK_WEBHOOK_PATH_SECRET = '';

    const res = await request(app).post(`/api/webhooks/tiktok-business/${SECRET}`).send(suspendEvent());
    await settle();

    expect(res.status).toBe(200);
    expect(await isActive(accountId)).toBe(true);
    expect(await lastWebhookAt(accountId)).toBeNull();
  });

  it('đúng secret -> xử lý như cũ: account_status_update suspended vô hiệu hoá tài khoản, cập nhật last_webhook_at', async () => {
    const accountId = await createTikTokAccount();

    const res = await request(app).post(`/api/webhooks/tiktok-business/${SECRET}`).send(suspendEvent());

    expect(res.status).toBe(200);
    expect(await waitFor(async () => (await isActive(accountId)) === false)).toBe(true);
    expect(await lastWebhookAt(accountId)).not.toBeNull();
  });

  it('đúng secret nhưng client_key ngoài whitelist -> vẫn bị chặn (lớp phụ còn hiệu lực)', async () => {
    const accountId = await createTikTokAccount();
    process.env.TIKTOK_APP_CLIENT_KEYS = 'client_key_hop_le';

    const res = await request(app)
      .post(`/api/webhooks/tiktok-business/${SECRET}`)
      .send({ ...suspendEvent(), client_key: 'client_key_la' });
    await settle();

    expect(res.status).toBe(200);
    expect(await isActive(accountId)).toBe(true);
  });
});
