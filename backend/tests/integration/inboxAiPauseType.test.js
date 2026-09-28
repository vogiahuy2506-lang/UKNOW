/**
 * POST /api/ai/chatbot/inbox/conversations/:id/ai-pause — `type` quyết định BẢNG nào được kiểm quyền và
 * bảng nào được ghi. Hai bước phải hiểu `type` giống hệt nhau, nếu không người gọi kiểm quyền trên hội thoại
 * CỦA MÌNH ở bảng này rồi ghi đè hội thoại CỦA KHÁCH KHÁC ở bảng kia (cùng số id).
 * (RA_SOAT_BAT_TAT_AI_2026-09-28 mục 1)
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
beforeAll(() => { app = createApp(); });
beforeEach(async () => { await truncateAll(); });

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

/** Khách A có hội thoại Zalo OA/Facebook; kẻ B có hội thoại web CÙNG SỐ id. */
async function setupSameIdConversations() {
  const victim = await createUser({ username: `victim${Date.now()}` });
  const attacker = await createUser({ username: `attacker${Date.now()}` });

  const { rows: conn } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name)
     VALUES ($1, 'zalo_oa', 'oa_1', 'OA nạn nhân') RETURNING id`,
    [victim.id]
  );
  const { rows: cc } = await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name)
     VALUES ($1, $2, 'zalo_oa', 'kh_1', 'Khách của A') RETURNING id`,
    [victim.id, conn[0].id]
  );
  const { rows: widget } = await db.query(
    `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
    [attacker.id, `k_${Date.now()}`]
  );
  // Ép id web trùng id channel (ngoài đời kẻ tấn công tự mở widget của mình tới khi trúng số).
  await db.query(
    `INSERT INTO webchat_conversations (id, id_user, id_widget_config, session_id, visitor_name)
     VALUES ($1, $2, $3, 's1', 'Khách web của B')`,
    [cc[0].id, attacker.id, widget[0].id]
  );
  return { victim, attacker, targetId: Number(cc[0].id) };
}

describe('ai-pause: type lạ không được ghi sang hội thoại của khách khác', () => {
  it.each(['web', 'facebook', 'zalo_oa', 'x'])('type=%s → 400, hội thoại của khách khác không đổi', async (badType) => {
    const { attacker, targetId } = await setupSameIdConversations();
    const token = await loginAs(attacker);

    const res = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${targetId}/ai-pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: badType, paused: true });

    const { rows } = await db.query(`SELECT ai_paused FROM channel_conversations WHERE id = $1`, [targetId]);
    expect(rows[0].ai_paused).toBe(false);
    expect(res.status).toBe(400);
  });

  it('đối chứng: type hợp lệ trên hội thoại của chính mình vẫn tạm dừng được (webchat + channel)', async () => {
    const { victim, attacker, targetId } = await setupSameIdConversations();

    const resWeb = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${targetId}/ai-pause`)
      .set('Authorization', `Bearer ${await loginAs(attacker)}`)
      .send({ type: 'webchat', paused: true });
    expect(resWeb.status).toBe(200);
    const web = await db.query(`SELECT ai_paused FROM webchat_conversations WHERE id = $1`, [targetId]);
    expect(web.rows[0].ai_paused).toBe(true);

    const resCh = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${targetId}/ai-pause`)
      .set('Authorization', `Bearer ${await loginAs(victim)}`)
      .send({ type: 'channel', paused: true });
    expect(resCh.status).toBe(200);
    const ch = await db.query(`SELECT ai_paused FROM channel_conversations WHERE id = $1`, [targetId]);
    expect(ch.rows[0].ai_paused).toBe(true);
  });

  it('kẻ tấn công dùng type=channel trên id của khách khác → 404 (kiểm quyền đúng bảng)', async () => {
    const { attacker, targetId } = await setupSameIdConversations();
    const res = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${targetId}/ai-pause`)
      .set('Authorization', `Bearer ${await loginAs(attacker)}`)
      .send({ type: 'channel', paused: true });
    expect(res.status).toBe(404);
  });
});
