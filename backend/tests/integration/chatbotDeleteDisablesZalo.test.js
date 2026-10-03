/**
 * Xoá chatbot phải tắt dòng Zalo của CHÍNH chatbot đó, kể cả khi chủ còn chatbot khác.
 * (PLAN_SUA_AI_DOT1_2026-10-03 F1.5; A P1-4)
 *
 * Trước: `deleteCustomChatbot` chỉ tắt `chatbot_zalo_account_settings` khi chủ HẾT chatbot (remainingActive === 0).
 * Chủ có A + B, xoá A → dòng của A vẫn is_enabled = true; getSettings JOIN `cb.is_active = true` vẫn trả dòng đó nên
 * hội thoại Zalo đã ghim A vẫn được AI trả lời + trừ credit bằng cấu hình dự phòng của kênh.
 * (Nửa còn lại — zaloInbox coi chatbot đã xoá mềm là tắt — có ca unit ở zaloInbox.debounce.spec.js.)
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import chatbotZaloAccountRepository from '../../src/repositories/chatbot/chatbotZaloAccount.repository.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;
let owner;
let token;
let botA;
let botB;
let zaloSettingId;

async function loginAs(user) {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return login.body.data.accessToken;
}

async function createChatbot(name) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, $2, $3) RETURNING *`,
    [owner.id, name, `del_${name}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`]
  );
  return rows[0];
}

async function enableZaloFor(chatbotId) {
  await db.query(
    `INSERT INTO chatbot_zalo_account_settings (id_user, id_zalo_setting, id_chatbot, is_enabled)
     VALUES ($1, $2, $3, true)`,
    [owner.id, zaloSettingId, chatbotId]
  );
}

async function czsEnabled(chatbotId) {
  const { rows } = await db.query(
    `SELECT is_enabled FROM chatbot_zalo_account_settings WHERE id_user = $1 AND id_chatbot = $2`,
    [owner.id, chatbotId]
  );
  return rows[0]?.is_enabled;
}

const del = (chatbotId) =>
  request(app)
    .delete(`/api/ai/chatbot/custom-chatbots/${chatbotId}`)
    .set('Authorization', `Bearer ${token}`);

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  owner = await createUser({ username: `del-zalo-${Date.now()}` });
  token = await loginAs(owner);
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, is_active, status, display_name) VALUES ($1, true, 'connected', 'Zalo shop') RETURNING id`,
    [owner.id]
  );
  zaloSettingId = rows[0].id;
  botA = await createChatbot('A');
  botB = await createChatbot('B');
  await enableZaloFor(botA.id);
  await enableZaloFor(botB.id);
});

describe('deleteCustomChatbot → chatbot_zalo_account_settings', () => {
  it('xoá A (chủ còn B): dòng Zalo của A bị tắt, dòng của B giữ nguyên', async () => {
    const res = await del(botA.id);
    expect(res.status).toBe(200);

    const { rows } = await db.query(`SELECT is_active FROM custom_chatbots WHERE id = $1`, [botA.id]);
    expect(rows[0].is_active).toBe(false);
    expect(await czsEnabled(botA.id)).toBe(false);
    expect(await czsEnabled(botB.id)).toBe(true);
  });

  it('chatbot đã xoá không còn được chọn cho tài khoản Zalo, chatbot còn lại thì có', async () => {
    await del(botA.id);
    const picked = await chatbotZaloAccountRepository.pickEnabledChatbotForZalo(owner.id, zaloSettingId, 0);
    expect(picked).toBe(Number(botB.id));
  });

  it('đối chứng: xoá chatbot CUỐI CÙNG vẫn tắt toàn bộ (hành vi cũ giữ nguyên)', async () => {
    await del(botA.id);
    const res = await del(botB.id);
    expect(res.status).toBe(200);
    expect(await czsEnabled(botA.id)).toBe(false);
    expect(await czsEnabled(botB.id)).toBe(false);
  });

  it('disableForChatbot chỉ đụng đúng user + chatbot (không tắt dòng của chủ khác trùng id_chatbot không tồn tại)', async () => {
    const other = await createUser({ username: `del-zalo-other-${Date.now()}` });
    const n = await chatbotZaloAccountRepository.disableForChatbot(other.id, botA.id);
    expect(n).toBe(0);
    expect(await czsEnabled(botA.id)).toBe(true);
  });
});
