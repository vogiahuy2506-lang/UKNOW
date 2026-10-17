/**
 * GET /api/email-settings trả cờ isLocked (tài khoản email bị khoá theo gói, bảng topup_locked_resources).
 * Trình "Tạo chiến dịch từng bước" cần cờ này để không cho chọn tài khoản bị khoá.
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
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function createEmailAccount(ownerId, name, email) {
  const { rows } = await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, status, email_mode)
     VALUES ($1, $2, $3, $3, 'active', 'smtp')
     RETURNING *`,
    [ownerId, name, email]
  );
  return rows[0];
}

describe('GET /api/email-settings — cờ isLocked', () => {
  it('true cho tài khoản có dòng topup_locked_resources, false cho tài khoản khác', async () => {
    const owner = await createUser({ role: 'user', username: 'email_list_locked_flag' });
    const token = await loginAs(owner);
    const locked = await createEmailAccount(owner.id, 'Bi khoa', 'lk@example.com');
    const free = await createEmailAccount(owner.id, 'Binh thuong', 'fr@example.com');
    await db.query(
      `INSERT INTO topup_locked_resources (user_id, resource_key, resource_id) VALUES ($1, 'email_accounts', $2)`,
      [owner.id, locked.id]
    );

    const res = await request(app)
      .get('/api/email-settings?status=active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.items.map((item) => [item.id, item.isLocked]));
    expect(byId[locked.id]).toBe(true);
    expect(byId[free.id]).toBe(false);
  });
});
