import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import chatbotZaloAccountRepository from '../../src/repositories/chatbot/chatbotZaloAccount.repository.js';

/**
 * PLAN_VA_BAT_TAT_AI_2026-09-28 PR-B (mục 5) — gắn chatbot cho tài khoản Zalo phải là chatbot của
 * chính chủ Zalo đó.
 */
let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return login.body.data.accessToken;
}

describe('Gắn chatbot cho tài khoản Zalo — chỉ chatbot của chính mình', () => {
  it('chủ B gắn id_chatbot của chủ A vào Zalo của B -> 404, không có dòng mới trong chatbot_zalo_account_settings', async () => {
    const ownerA = await createUser({ username: `zalo_owner_a_${Date.now()}` });
    const ownerB = await createUser({ username: `zalo_owner_b_${Date.now()}` });
    const tokenB = await loginAs(ownerB);

    const { rows: chatbotARows } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, 'Bot của A', $2) RETURNING id`,
      [ownerA.id, `bot_a_${Date.now()}`]
    );
    const chatbotAId = chatbotARows[0].id;

    const { rows: zaloBRows } = await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, 'Zalo của B', 'connected', true) RETURNING id`,
      [ownerB.id]
    );
    const zaloBId = zaloBRows[0].id;

    const res = await request(app)
      .post(`/api/ai/chatbot/zalo-account/${zaloBId}/chatbot/toggle`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ enabled: true, id_chatbot: chatbotAId });

    expect(res.status).toBe(404);

    const { rows: settingsRows } = await db.query(
      `SELECT * FROM chatbot_zalo_account_settings WHERE id_zalo_setting = $1`,
      [zaloBId]
    );
    expect(settingsRows).toHaveLength(0);
  });

  it('chủ tự gắn chatbot của chính mình vào Zalo của chính mình -> 200, có dòng mới', async () => {
    const owner = await createUser({ username: `zalo_owner_self_${Date.now()}` });
    const token = await loginAs(owner);

    const { rows: chatbotRows } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, 'Bot của tôi', $2) RETURNING id`,
      [owner.id, `bot_self_${Date.now()}`]
    );
    const chatbotId = chatbotRows[0].id;

    const { rows: zaloRows } = await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, 'Zalo của tôi', 'connected', true) RETURNING id`,
      [owner.id]
    );
    const zaloId = zaloRows[0].id;

    const res = await request(app)
      .post(`/api/ai/chatbot/zalo-account/${zaloId}/chatbot/toggle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true, id_chatbot: chatbotId });

    expect(res.status).toBe(200);

    const { rows: settingsRows } = await db.query(
      `SELECT * FROM chatbot_zalo_account_settings WHERE id_zalo_setting = $1`,
      [zaloId]
    );
    expect(settingsRows).toHaveLength(1);
    expect(Number(settingsRows[0].id_chatbot)).toBe(Number(chatbotId));
  });

  it('pickEnabledChatbotForZalo với dòng cũ trỏ chatbot của người khác (INSERT tay, dữ liệu lịch sử trước khi có assertOwnedConfiguration) -> null', async () => {
    const ownerA = await createUser({ username: `zalo_pick_owner_a_${Date.now()}` });
    const ownerB = await createUser({ username: `zalo_pick_owner_b_${Date.now()}` });

    const { rows: chatbotARows } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key, is_active) VALUES ($1, 'Bot của A', $2, true) RETURNING id`,
      [ownerA.id, `bot_pick_a_${Date.now()}`]
    );
    const chatbotAId = chatbotARows[0].id;

    const { rows: zaloBRows } = await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, 'Zalo của B', 'connected', true) RETURNING id`,
      [ownerB.id]
    );
    const zaloBId = zaloBRows[0].id;

    // Ghi tay dòng "hư" — id_chatbot trỏ sang chatbot của owner A trong khi hàng thuộc owner B.
    // Mô phỏng dữ liệu lịch sử còn sót lại TRƯỚC khi assertOwnedConfiguration được thêm (21/08/2026).
    await db.query(
      `INSERT INTO chatbot_zalo_account_settings (id_user, id_zalo_setting, id_chatbot, is_enabled)
       VALUES ($1, $2, $3, true)`,
      [ownerB.id, zaloBId, chatbotAId]
    );

    const picked = await chatbotZaloAccountRepository.pickEnabledChatbotForZalo(ownerB.id, zaloBId, 0);
    expect(picked).toBeNull();
  });
});
