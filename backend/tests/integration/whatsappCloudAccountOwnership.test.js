/**
 * PLAN_TEN_MIEN_TXT_WHATSAPP_TEST_TIMEOUT_2026-10-20 PR-2 — xoá / đặt mặc định / bật-tắt tài khoản WhatsApp Cloud
 * (`DELETE|PATCH /api/whatsapp/accounts/:id[...]`) trước đây luôn 404: controller so `row.id_user` nhưng bảng
 * `chatbot_channel_connections` KHÔNG có cột `id_user` (chủ lấy qua `custom_chatbots.id_user`). Postgres + Express thật.
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

const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.data.accessToken;
}

const auth = (token, ownerContextId = null) => ({
  Authorization: `Bearer ${token}`,
  // Nhân viên phải khai báo không gian làm việc của chủ (giống FE) — thiếu header thì bị coi là không gian riêng của chính họ.
  ...(ownerContextId ? { 'X-Owner-Context': String(ownerContextId) } : {}),
});

async function createChatbot(ownerId, name = 'Bot') {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, $2, $3) RETURNING id`,
    [ownerId, name, `wk_${rnd()}`]
  );
  return rows[0].id;
}

// Kết nối vừa tạo qua OAuth luôn có is_active = false ("user opts-in via toggle") — mặc định ở đây cũng vậy.
async function createWhatsAppConnection(chatbotId, { isActive = false, isDefault = false } = {}) {
  const { rows } = await db.query(
    `INSERT INTO chatbot_channel_connections
       (id_chatbot, channel_type, webhook_token, display_name, external_channel_id, phone_number_id, is_active, settings)
     VALUES ($1, 'whatsapp', $2, 'WA cloud', $3, $3, $4, $5::jsonb) RETURNING id`,
    [chatbotId, `wh_${rnd()}`, `pn_${rnd()}`, isActive, JSON.stringify({ is_default: isDefault })]
  );
  return rows[0].id;
}

async function readConnection(id) {
  const { rows } = await db.query(
    `SELECT is_active, COALESCE(settings->>'is_default', 'false') AS is_default, updated_at
     FROM chatbot_channel_connections WHERE id = $1`,
    [id]
  );
  return rows[0];
}

async function auditCount() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM audit_logs WHERE entity_type = 'chatbot_channel'`
  );
  return rows[0].n;
}

async function setup() {
  const ownerA = await createUser({ username: `wa_own_a_${rnd()}`.slice(0, 40) });
  const ownerB = await createUser({ username: `wa_own_b_${rnd()}`.slice(0, 40) });
  const tokenA = await loginAs(ownerA);
  const tokenB = await loginAs(ownerB);
  const botA = await createChatbot(ownerA.id, 'Bot A');
  const connA = await createWhatsAppConnection(botA);
  return { ownerA, ownerB, tokenA, tokenB, botA, connA };
}

describe('WhatsApp Cloud — chủ thật thao tác lên kết nối của chính mình', () => {
  it('PATCH /active: bật kết nối vừa tạo (is_active=false) -> 200, DB true; tắt lại -> 200, DB false', async () => {
    const { tokenA, connA } = await setup();

    const on = await request(app)
      .patch(`/api/whatsapp/accounts/${connA}/active`)
      .set(auth(tokenA))
      .send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.data).toMatchObject({ id: connA, isActive: true });
    expect((await readConnection(connA)).is_active).toBe(true);

    const off = await request(app)
      .patch(`/api/whatsapp/accounts/${connA}/active`)
      .set(auth(tokenA))
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ id: connA, isActive: false });
    expect((await readConnection(connA)).is_active).toBe(false);
  });

  it('PATCH /default: đặt mặc định -> 200, isDefault true trong phản hồi và settings.is_default trong DB; dòng mặc định cũ bị bỏ cờ', async () => {
    const { tokenA, botA, connA } = await setup();
    const connOld = await createWhatsAppConnection(botA, { isDefault: true });

    const res = await request(app).patch(`/api/whatsapp/accounts/${connA}/default`).set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: connA, isDefault: true });
    expect((await readConnection(connA)).is_default).toBe('true');
    expect((await readConnection(connOld)).is_default).toBe('false');
  });

  it('DELETE: ngắt kết nối đang bật -> 200, is_active=false và có 1 dòng audit', async () => {
    const { tokenA, botA } = await setup();
    const connOn = await createWhatsAppConnection(botA, { isActive: true });

    const res = await request(app).delete(`/api/whatsapp/accounts/${connOn}`).set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: connOn, isActive: false });
    expect((await readConnection(connOn)).is_active).toBe(false);
    expect(await auditCount()).toBe(1);
  });

  it('DELETE: kết nối vừa tạo chưa bật (is_active=false) cũng ngắt được -> 200', async () => {
    const { tokenA, connA } = await setup();

    const res = await request(app).delete(`/api/whatsapp/accounts/${connA}`).set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: connA, isActive: false });
  });

  it('id không tồn tại -> 404 ở cả ba thao tác', async () => {
    const { tokenA } = await setup();

    const del = await request(app).delete('/api/whatsapp/accounts/99999999').set(auth(tokenA));
    const def = await request(app).patch('/api/whatsapp/accounts/99999999/default').set(auth(tokenA));
    const tog = await request(app)
      .patch('/api/whatsapp/accounts/99999999/active')
      .set(auth(tokenA))
      .send({ enabled: true });

    expect([del.status, def.status, tog.status]).toEqual([404, 404, 404]);
  });
});

describe('WhatsApp Cloud — người lạ (workspace khác) không động được vào kết nối của chủ khác', () => {
  it('B bật / đặt mặc định / ngắt kết nối của A -> 404 cả ba, DB và audit không đổi', async () => {
    const { tokenB, botA } = await setup();
    const connOn = await createWhatsAppConnection(botA, { isActive: true });
    const before = await readConnection(connOn);

    const tog = await request(app)
      .patch(`/api/whatsapp/accounts/${connOn}/active`)
      .set(auth(tokenB))
      .send({ enabled: false });
    const def = await request(app).patch(`/api/whatsapp/accounts/${connOn}/default`).set(auth(tokenB));
    const del = await request(app).delete(`/api/whatsapp/accounts/${connOn}`).set(auth(tokenB));

    expect([tog.status, def.status, del.status]).toEqual([404, 404, 404]);
    const after = await readConnection(connOn);
    expect(after.is_active).toBe(true);
    expect(after.is_default).toBe('false');
    expect(new Date(after.updated_at).getTime()).toBe(new Date(before.updated_at).getTime());
    expect(await auditCount()).toBe(0);
  });

  it('B cũng không bật được kết nối đang TẮT của A (không rò rỉ qua nhánh is_active=false)', async () => {
    const { tokenB, connA } = await setup();

    const res = await request(app)
      .patch(`/api/whatsapp/accounts/${connA}/active`)
      .set(auth(tokenB))
      .send({ enabled: true });

    expect(res.status).toBe(404);
    expect((await readConnection(connA)).is_active).toBe(false);
  });
});

describe('WhatsApp Cloud — nhân viên của chủ A', () => {
  async function createEmployee(ownerId, permissions) {
    const employee = await createUser({ username: `wa_emp_${rnd()}`.slice(0, 40) });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
      [ownerId, employee.id, JSON.stringify(permissions)]
    );
    return employee;
  }

  it('có quyền chatbot_channels_manage -> bật / đặt mặc định / ngắt kết nối của chủ A như chính chủ (200)', async () => {
    const { ownerA, connA } = await setup();
    const employee = await createEmployee(ownerA.id, { chatbot_channels_manage: true });
    const token = await loginAs(employee);

    const on = await request(app)
      .patch(`/api/whatsapp/accounts/${connA}/active`)
      .set(auth(token, ownerA.id))
      .send({ enabled: true });
    expect(on.status).toBe(200);
    expect((await readConnection(connA)).is_active).toBe(true);

    const def = await request(app).patch(`/api/whatsapp/accounts/${connA}/default`).set(auth(token, ownerA.id));
    expect(def.status).toBe(200);
    expect((await readConnection(connA)).is_default).toBe('true');

    const del = await request(app).delete(`/api/whatsapp/accounts/${connA}`).set(auth(token, ownerA.id));
    expect(del.status).toBe(200);
    expect((await readConnection(connA)).is_active).toBe(false);
  });

  it('không có quyền chatbot_channels_manage -> 403, DB không đổi', async () => {
    const { ownerA, connA } = await setup();
    const employee = await createEmployee(ownerA.id, { campaigns_view: true });
    const token = await loginAs(employee);

    const res = await request(app)
      .patch(`/api/whatsapp/accounts/${connA}/active`)
      .set(auth(token, ownerA.id))
      .send({ enabled: true });

    expect(res.status).toBe(403);
    expect((await readConnection(connA)).is_active).toBe(false);
  });

  it('nhân viên của chủ B không động được kết nối của chủ A dù có đủ quyền -> 404', async () => {
    const { ownerB, connA } = await setup();
    const employeeOfB = await createEmployee(ownerB.id, { chatbot_channels_manage: true });
    const token = await loginAs(employeeOfB);

    const res = await request(app)
      .patch(`/api/whatsapp/accounts/${connA}/active`)
      .set(auth(token, ownerB.id))
      .send({ enabled: true });

    expect(res.status).toBe(404);
    expect((await readConnection(connA)).is_active).toBe(false);
  });
});
