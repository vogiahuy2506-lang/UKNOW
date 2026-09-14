/**
 * Integration test cho PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md, PR-1 (Việc 1.1/1.2).
 *
 * Chép khuôn tests/integration/aiWizardState.test.js (JWT tay + createUser + createSession trực
 * tiếp từ repository) — cùng nhóm route /api/ai/sessions, cùng middleware toàn cục ai.routes.js
 * (requirePasswordChange/requirePhone/requireActivePlan — createUser() mặc định đã qua đủ ba).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { createSession } from '../../src/repositories/aiSession.repository.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

function createAuthToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET || 'test-jwt-secret'
  );
}

async function creditRowCount(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM usage_logs WHERE id_user = $1 AND resource_type = 'ai_credit'`,
    [userId]
  );
  return rows[0].n;
}

describe('POST /api/ai/landing-from-html', () => {
  it('HTML hợp lệ, không sessionId → tạo session mới, lưu marker + tin landing_page nguyên văn HTML, KHÔNG trừ credit', async () => {
    const user = await createUser({ email: 'landing-paste@test.com', username: 'landing_paste' });
    const token = createAuthToken(user);
    const html = '<html><head><title>Trang khách dán</title></head><body><h1>Chào</h1></body></html>';
    const creditBefore = await creditRowCount(user.id);

    const res = await request(app)
      .post('/api/ai/landing-from-html')
      .set('Authorization', `Bearer ${token}`)
      .send({ html });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { sessionId, message } = res.body.data;
    expect(message.type).toBe('landing_page');
    expect(message.data.html).toBe(html);
    expect(message.data.source).toBe('pasted');

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${token}`);
    expect(msgsRes.status).toBe(200);
    const rows = msgsRes.body.data;
    expect(rows).toHaveLength(2);

    const userRow = rows.find((m) => m.role === 'user');
    const assistantRow = rows.find((m) => m.role === 'assistant');
    // Bẫy 1: tin user là marker, KHÔNG chứa HTML thật.
    expect(userRow.content).toBe(`[Dán HTML có sẵn: "Trang khách dán", ${html.length} ký tự]`);
    expect(userRow.content).not.toContain('<h1>');
    expect(userRow.type).toBeNull();
    expect(assistantRow.type).toBe('landing_page');
    expect(assistantRow.data.html).toBe(html);

    // Không qua aiLimiter/assertAiCreditAvailable → không có dòng trừ credit mới.
    const creditAfter = await creditRowCount(user.id);
    expect(creditAfter).toBe(creditBefore);
  });

  it('có sessionId của chính mình → nối thêm vào session cũ, không tạo session thứ hai', async () => {
    const user = await createUser({ email: 'landing-paste-2@test.com', username: 'landing_paste_2' });
    const session = await createSession(user.id, 'Phiên có trước');
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/ai/landing-from-html')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: session.id, html: '<div>Landing thứ hai trong cùng phiên</div>' });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.sessionId)).toBe(Number(session.id));

    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM ai_chat_sessions WHERE id_user = $1', [user.id]);
    expect(rows[0].n).toBe(1);
  });

  it('sessionId thuộc về người khác → 404, không lưu tin nào', async () => {
    const owner = await createUser({ email: 'owner@test.com', username: 'landing_owner' });
    const intruder = await createUser({ email: 'intruder@test.com', username: 'landing_intruder' });
    const session = await createSession(owner.id, 'Phiên của owner');
    const token = createAuthToken(intruder);

    const res = await request(app)
      .post('/api/ai/landing-from-html')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: session.id, html: '<div>Không được vào đây</div>' });

    expect(res.status).toBe(404);

    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM ai_chat_messages WHERE session_id = $1', [session.id]);
    expect(rows[0].n).toBe(0);
  });

  it('HTML quá 500.000 ký tự → 400', async () => {
    const user = await createUser({ email: 'landing-toolong@test.com', username: 'landing_toolong' });
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/ai/landing-from-html')
      .set('Authorization', `Bearer ${token}`)
      .send({ html: `<div>${'a'.repeat(500001)}</div>` });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/ai/sessions/:id/landing-message', () => {
  it('merge landingPageId/slug/isPublished vào data đã có, giữ nguyên title/html/source cũ', async () => {
    const user = await createUser({ email: 'landing-patch@test.com', username: 'landing_patch' });
    const token = createAuthToken(user);
    const html = '<div>Trang đã dán</div>';

    const pasteRes = await request(app)
      .post('/api/ai/landing-from-html')
      .set('Authorization', `Bearer ${token}`)
      .send({ html, title: 'Trang cần lưu' });
    const { sessionId } = pasteRes.body.data;

    const patchRes = await request(app)
      .patch(`/api/ai/sessions/${sessionId}/landing-message`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { landingPageId: 42, slug: 'test-chat-1', isPublished: true } });

    expect(patchRes.status).toBe(200);

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const landingMsg = msgsRes.body.data.find((m) => m.type === 'landing_page');
    // Merge — KHÔNG mất title/html/source đã lưu ở bước paste.
    expect(landingMsg.data).toEqual({
      title: 'Trang cần lưu',
      html,
      source: 'pasted',
      landingPageId: 42,
      slug: 'test-chat-1',
      isPublished: true,
    });
  });

  it('khoá lạ trong data bị bỏ qua ở tầng thật (không chỉ mock)', async () => {
    const user = await createUser({ email: 'landing-patch-2@test.com', username: 'landing_patch_2' });
    const token = createAuthToken(user);
    const pasteRes = await request(app)
      .post('/api/ai/landing-from-html')
      .set('Authorization', `Bearer ${token}`)
      .send({ html: '<div>x</div>' });
    const { sessionId } = pasteRes.body.data;

    await request(app)
      .patch(`/api/ai/sessions/${sessionId}/landing-message`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { landingPageId: 1, htmlContent: '<script>xss</script>' } });

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const landingMsg = msgsRes.body.data.find((m) => m.type === 'landing_page');
    expect(landingMsg.data.htmlContent).toBeUndefined();
    expect(landingMsg.data.landingPageId).toBe(1);
  });

  it('session của người khác → 404', async () => {
    const owner = await createUser({ email: 'patch-owner@test.com', username: 'patch_owner' });
    const intruder = await createUser({ email: 'patch-intruder@test.com', username: 'patch_intruder' });
    const session = await createSession(owner.id, 'Phiên của owner');
    const token = createAuthToken(intruder);

    const res = await request(app)
      .patch(`/api/ai/sessions/${session.id}/landing-message`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { isPublished: true } });

    expect(res.status).toBe(404);
  });
});
