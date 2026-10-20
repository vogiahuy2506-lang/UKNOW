/**
 * PLAN_GOM_MUC_NHE_2026-10-20 PR-1 — chatbot + WhatsApp (Postgres + Express thật).
 *
 *  1a. Chủ bot bật/tắt link công khai theo id số cho TỪNG bot: tắt thì /chatbot-public/chatbot/<id> 404; khoá `chatbot_<số>` đổi sang
 *      khoá ngẫu nhiên (cùng transaction, dòng web_widget_configs của chủ đi theo); người lạ 404; nhân viên theo quyền chatbots_manage.
 *  1b. widget_key không sửa được qua PUT cập nhật bot (gửi lại đúng khoá hiện tại vẫn 200, không đổi).
 *  1c. GET /whatsapp/accounts/oauth/pending: người lạ 404, chủ chỉ nhận phần giao diện cần — KHÔNG có accessToken/code/appId/userId.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { stashPendingOAuth } from '../../src/services/chatbot/whatsappOAuth.service.js';
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
  ...(ownerContextId ? { 'X-Owner-Context': String(ownerContextId) } : {}),
});

async function createEmployee(ownerId, permissions) {
  const employee = await createUser({ username: `gm_emp_${rnd()}`.slice(0, 40) });
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employee.id, JSON.stringify(permissions)]
  );
  return employee;
}

async function insertBot(ownerId, { widgetKey, allowNumericId = true } = {}) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key, allow_public_numeric_id, system_instruction)
     VALUES ($1, 'Bot gom muc nhe', $2, $3, 'BI_MAT') RETURNING *`,
    [ownerId, widgetKey === undefined ? `wk_${rnd()}` : widgetKey, allowNumericId]
  );
  return rows[0];
}

const readBot = async (id) =>
  (await db.query('SELECT widget_key, allow_public_numeric_id FROM custom_chatbots WHERE id = $1', [id])).rows[0];

async function setup() {
  const ownerA = await createUser({ username: `gm_a_${rnd()}`.slice(0, 40) });
  const ownerB = await createUser({ username: `gm_b_${rnd()}`.slice(0, 40) });
  return { ownerA, ownerB, tokenA: await loginAs(ownerA), tokenB: await loginAs(ownerB) };
}

describe('1a — công tắc link công khai theo id số', () => {
  const toggle = (token, botId, body, headers = {}) =>
    request(app)
      .put(`/api/ai/chatbot/custom-chatbots/${botId}/public-numeric-id`)
      .set({ Authorization: `Bearer ${token}`, ...headers })
      .send(body);

  it('chủ tắt: link theo id số 404 (cùng thân với id không tồn tại), link theo khoá VẪN chạy, bot khác của chủ không đổi', async () => {
    const { ownerA, tokenA } = await setup();
    const bot = await insertBot(ownerA.id, { widgetKey: 'khoa_ngau_nhien', allowNumericId: true });
    const otherBot = await insertBot(ownerA.id, { allowNumericId: true });

    const before = await request(app).get(`/api/chatbot-public/chatbot/${bot.id}`);
    expect(before.status).toBe(200);

    const res = await toggle(tokenA, bot.id, { enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ allow_public_numeric_id: false, widget_key: 'khoa_ngau_nhien' });
    expect(await readBot(bot.id)).toEqual({ widget_key: 'khoa_ngau_nhien', allow_public_numeric_id: false });

    const byId = await request(app).get(`/api/chatbot-public/chatbot/${bot.id}`);
    const missing = await request(app).get('/api/chatbot-public/chatbot/987654321');
    expect(byId.status).toBe(404);
    expect(byId.body).toEqual(missing.body);
    const byKey = await request(app).get('/api/chatbot-public/chatbot/khoa_ngau_nhien');
    expect(byKey.status).toBe(200);

    expect((await readBot(otherBot.id)).allow_public_numeric_id).toBe(true);
    const audit = await db.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE entity_type = 'chatbot'`);
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('tắt khi khoá là dạng đoán được `chatbot_<số>`: khoá đổi sang khoá ngẫu nhiên, web_widget_configs của chủ đổi theo (giữ hội thoại), link theo khoá mới chạy', async () => {
    const { ownerA, tokenA } = await setup();
    const bot = await insertBot(ownerA.id, { widgetKey: null, allowNumericId: true });
    const legacyKey = `chatbot_${bot.id}`;
    await db.query('UPDATE custom_chatbots SET widget_key = $2 WHERE id = $1', [bot.id, legacyKey]);
    const { rows: widget } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
      [ownerA.id, legacyKey]
    );
    await request(app).get(`/api/chatbot-public/chatbot/${legacyKey}`).expect(200);

    const res = await toggle(tokenA, bot.id, { enabled: false });
    expect(res.status).toBe(200);
    const newKey = res.body.data.widget_key;
    expect(newKey).toBeTruthy();
    expect(newKey).not.toMatch(/^chatbot_[0-9]+$/);

    expect((await readBot(bot.id)).widget_key).toBe(newKey);
    const { rows: widgetAfter } = await db.query('SELECT widget_key FROM web_widget_configs WHERE id = $1', [widget[0].id]);
    expect(widgetAfter[0].widget_key).toBe(newKey);

    expect((await request(app).get(`/api/chatbot-public/chatbot/${legacyKey}`)).status).toBe(404);
    expect((await request(app).get(`/api/chatbot-public/chatbot/${newKey}`)).status).toBe(200);
  });

  it('tắt khi bot THIẾU khoá: cấp khoá ngẫu nhiên (không phải chatbot_<id>), dòng chatbot_<id> của chủ đổi theo', async () => {
    const { ownerA, tokenA } = await setup();
    const bot = await insertBot(ownerA.id, { widgetKey: null, allowNumericId: true });
    await db.query(`INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2)`, [ownerA.id, `chatbot_${bot.id}`]);

    const res = await toggle(tokenA, bot.id, { enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.widget_key).not.toMatch(/^chatbot_[0-9]+$/);
    const { rows } = await db.query('SELECT widget_key FROM web_widget_configs WHERE id_user = $1', [ownerA.id]);
    expect(rows.map((r) => r.widget_key)).toEqual([res.body.data.widget_key]);
  });

  it('dòng web_widget_configs của NGƯỜI KHÁC mang khoá chatbot_<id> không bị đụng tới', async () => {
    const { ownerA, ownerB, tokenA } = await setup();
    const bot = await insertBot(ownerA.id, { widgetKey: null, allowNumericId: true });
    await db.query('UPDATE custom_chatbots SET widget_key = $2 WHERE id = $1', [bot.id, `chatbot_${bot.id}`]);
    await db.query(`INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2)`, [ownerB.id, `chatbot_${bot.id}`]);

    const res = await toggle(tokenA, bot.id, { enabled: false });
    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT widget_key FROM web_widget_configs WHERE id_user = $1', [ownerB.id]);
    expect(rows[0].widget_key).toBe(`chatbot_${bot.id}`);
  });

  it('chủ bật lại -> link theo id số chạy lại; thân yêu cầu không phải boolean -> 400', async () => {
    const { ownerA, tokenA } = await setup();
    const bot = await insertBot(ownerA.id, { widgetKey: 'wk_bat_lai', allowNumericId: false });
    expect((await request(app).get(`/api/chatbot-public/chatbot/${bot.id}`)).status).toBe(404);

    const on = await toggle(tokenA, bot.id, { enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.data.allow_public_numeric_id).toBe(true);
    expect((await request(app).get(`/api/chatbot-public/chatbot/${bot.id}`)).status).toBe(200);

    const bad = await toggle(tokenA, bot.id, { enabled: 'false' });
    expect(bad.status).toBe(400);
    expect((await readBot(bot.id)).allow_public_numeric_id).toBe(true);
  });

  it('người lạ (B) bật/tắt bot của A -> 404, cờ và khoá của A không đổi', async () => {
    const { ownerA, tokenB } = await setup();
    const bot = await insertBot(ownerA.id, { widgetKey: 'wk_cua_a', allowNumericId: true });

    const off = await toggle(tokenB, bot.id, { enabled: false });
    expect(off.status).toBe(404);
    expect(await readBot(bot.id)).toEqual({ widget_key: 'wk_cua_a', allow_public_numeric_id: true });
  });

  it('bot đã xoá mềm -> 404', async () => {
    const { ownerA, tokenA } = await setup();
    const bot = await insertBot(ownerA.id);
    await db.query('UPDATE custom_chatbots SET is_active = false WHERE id = $1', [bot.id]);
    expect((await toggle(tokenA, bot.id, { enabled: false })).status).toBe(404);
  });

  it('nhân viên: có chatbots_manage -> tắt được bot của chủ; thiếu quyền -> 403; nhân viên của chủ khác -> 404', async () => {
    const { ownerA, ownerB } = await setup();
    const bot = await insertBot(ownerA.id, { widgetKey: 'wk_nv', allowNumericId: true });

    const can = await createEmployee(ownerA.id, { chatbots_manage: true });
    const cannot = await createEmployee(ownerA.id, { campaigns_view: true });
    const ofB = await createEmployee(ownerB.id, { chatbots_manage: true });

    const denied = await toggle(await loginAs(cannot), bot.id, { enabled: false }, { 'X-Owner-Context': String(ownerA.id) });
    expect(denied.status).toBe(403);
    expect((await readBot(bot.id)).allow_public_numeric_id).toBe(true);

    const stranger = await toggle(await loginAs(ofB), bot.id, { enabled: false }, { 'X-Owner-Context': String(ownerB.id) });
    expect(stranger.status).toBe(404);
    expect((await readBot(bot.id)).allow_public_numeric_id).toBe(true);

    const ok = await toggle(await loginAs(can), bot.id, { enabled: false }, { 'X-Owner-Context': String(ownerA.id) });
    expect(ok.status).toBe(200);
    expect((await readBot(bot.id)).allow_public_numeric_id).toBe(false);
  });

  it('danh sách chatbot trả allow_public_numeric_id để giao diện biết bot nào còn công tắc', async () => {
    const { ownerA, tokenA } = await setup();
    const legacy = await insertBot(ownerA.id, { allowNumericId: true });
    const fresh = await insertBot(ownerA.id, { allowNumericId: false });

    const res = await request(app).get('/api/ai/chatbot/custom-chatbots').set(auth(tokenA));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((b) => [String(b.id), b.allow_public_numeric_id]));
    expect(byId[String(legacy.id)]).toBe(true);
    expect(byId[String(fresh.id)]).toBe(false);
  });
});

describe('1b — widget_key không sửa được qua PUT cập nhật bot', () => {
  const put = (token, botId, body) =>
    request(app).put(`/api/ai/chatbot/custom-chatbots/${botId}`).set(auth(token)).send(body);

  it('đặt widget_key tuỳ ý (kể cả chatbot_<id bot người khác>) -> 200 nhưng khoá KHÔNG đổi; các trường khác vẫn ghi', async () => {
    const { ownerA, ownerB, tokenA } = await setup();
    const botA = await insertBot(ownerA.id, { widgetKey: 'khoa_that_cua_a' });
    const botB = await insertBot(ownerB.id, { widgetKey: null, allowNumericId: true });

    const res = await put(tokenA, botA.id, { name: 'Ten moi', widget_key: `chatbot_${botB.id}` });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Ten moi');
    expect(res.body.data.widget_key).toBe('khoa_that_cua_a');
    expect((await readBot(botA.id)).widget_key).toBe('khoa_that_cua_a');
    const { rows } = await db.query('SELECT 1 FROM web_widget_configs WHERE widget_key = $1', [`chatbot_${botB.id}`]);
    expect(rows).toHaveLength(0);
  });

  it('giao diện gửi lại đúng khoá hiện tại -> 200, không lỗi, không đổi', async () => {
    const { ownerA, tokenA } = await setup();
    const botA = await insertBot(ownerA.id, { widgetKey: 'khoa_hien_tai' });

    const res = await put(tokenA, botA.id, { name: 'Bot A', widget_key: 'khoa_hien_tai' });
    expect(res.status).toBe(200);
    expect((await readBot(botA.id)).widget_key).toBe('khoa_hien_tai');
  });
});

describe('1c — GET /whatsapp/accounts/oauth/pending phải đúng chủ và không trả bí mật', () => {
  const pending = (token, state) =>
    request(app).get('/api/whatsapp/accounts/oauth/pending').query({ state }).set(auth(token));

  function stash(state, userId) {
    stashPendingOAuth(state, {
      userId,
      appId: 'APP_ID_BI_MAT',
      wabaId: 'waba_123',
      accessToken: 'EAAG_ACCESS_TOKEN_BI_MAT',
      code: 'CODE_BI_MAT',
      phoneNumbers: [
        { id: 'pn_1', display_phone_number: '+84 90 000 0000', verified_name: 'Shop', quality_rating: 'GREEN', extra_secret: 'KHONG_DUOC_LO' },
      ],
    });
  }

  it('chủ của lượt kết nối nhận danh sách số, KHÔNG có accessToken / code / appId / userId / trường lạ', async () => {
    const { ownerA, tokenA } = await setup();
    const state = `st_${rnd()}`;
    stash(state, ownerA.id);

    const res = await pending(tokenA, state);
    expect(res.status).toBe(200);
    expect(res.body.data.wabaId).toBe('waba_123');
    expect(res.body.data.phoneNumbers).toHaveLength(1);
    expect(res.body.data.phoneNumbers[0]).toMatchObject({ id: 'pn_1', display_phone_number: '+84 90 000 0000', verified_name: 'Shop' });
    const body = JSON.stringify(res.body);
    for (const secret of ['EAAG_ACCESS_TOKEN_BI_MAT', 'CODE_BI_MAT', 'APP_ID_BI_MAT', 'KHONG_DUOC_LO']) {
      expect(body).not.toContain(secret);
    }
    expect(res.body.data).not.toHaveProperty('accessToken');
    expect(res.body.data).not.toHaveProperty('userId');
  });

  it('người lạ (B) có state của A -> 404 cùng thông điệp với state không tồn tại, không lộ gì', async () => {
    const { ownerA, tokenB } = await setup();
    const state = `st_${rnd()}`;
    stash(state, ownerA.id);

    const stranger = await pending(tokenB, state);
    const missing = await pending(tokenB, `khong_ton_tai_${rnd()}`);
    expect(stranger.status).toBe(404);
    expect(stranger.body).toEqual(missing.body);
    expect(JSON.stringify(stranger.body)).not.toContain('EAAG_ACCESS_TOKEN_BI_MAT');
  });

  it('nhân viên của chủ A có quyền kênh nhận như chủ; nhân viên của chủ B -> 404', async () => {
    const { ownerA, ownerB } = await setup();
    const state = `st_${rnd()}`;
    stash(state, ownerA.id);
    const ofA = await createEmployee(ownerA.id, { chatbot_channels_manage: true });
    const ofB = await createEmployee(ownerB.id, { chatbot_channels_manage: true });

    const ok = await request(app)
      .get('/api/whatsapp/accounts/oauth/pending')
      .query({ state })
      .set(auth(await loginAs(ofA), ownerA.id));
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain('EAAG_ACCESS_TOKEN_BI_MAT');

    const no = await request(app)
      .get('/api/whatsapp/accounts/oauth/pending')
      .query({ state })
      .set(auth(await loginAs(ofB), ownerB.id));
    expect(no.status).toBe(404);
  });
});
