/**
 * Integration test cho PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA mục 10 (PR-2) — SQL THẬT.
 *
 * Unit test mock trọn DB nên không bắt được SQL sai cột/cú pháp (bài học 30–31/08). Ở đây chạy trên
 * Postgres thật: saveMessagesReturningIds (RETURNING), getLandingPageMessage (JOIN + gate ownership),
 * getSessionMessages trả id, và PATCH hoàn tác qua HTTP (server tự hoán html ↔ previousHtml).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import {
  createSession,
  saveMessagesReturningIds,
  getLandingPageMessage,
  getSessionMessages,
  updateLandingPageMessage,
} from '../../src/repositories/aiSession.repository.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

const token = (user) =>
  jwt.sign({ userId: user.id, email: user.email, role: user.role || 'user' }, process.env.JWT_SECRET || 'test-jwt-secret');

const landingMsg = (title, html, extra = {}) => ({
  content: `Đã tạo landing page "${title}"`,
  type: 'landing_page',
  data: { title, html, ...extra },
});

async function readData(messageId) {
  const { rows } = await db.query('SELECT data FROM ai_chat_messages WHERE id = $1', [messageId]);
  return rows[0].data;
}

describe('saveMessagesReturningIds', () => {
  it('ghi cặp user + assistant, trả id SỐ đúng theo role, các id có thật trong DB', async () => {
    const user = await createUser({ email: 'lm-save@test.com', username: 'lm_save' });
    const session = await createSession(user.id, 'Chat landing');

    const ids = await saveMessagesReturningIds(session.id, user.id, 'tạo trang khoá học', landingMsg('Khoá học', '<p>A</p>'));

    expect(typeof ids.userMessageId).toBe('number');
    expect(typeof ids.assistantMessageId).toBe('number');
    expect(ids.userMessageId).not.toBe(ids.assistantMessageId);
    const { rows } = await db.query('SELECT id, role, type FROM ai_chat_messages WHERE session_id = $1 ORDER BY id', [session.id]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.role === 'assistant')).toMatchObject({ type: 'landing_page' });
    expect(Number(rows.find((r) => r.role === 'assistant').id)).toBe(ids.assistantMessageId);
    expect(Number(rows.find((r) => r.role === 'user').id)).toBe(ids.userMessageId);
  });

  it('session của người khác → null và KHÔNG ghi gì (gate ownership)', async () => {
    const owner = await createUser({ email: 'lm-own@test.com', username: 'lm_own' });
    const stranger = await createUser({ email: 'lm-str@test.com', username: 'lm_str' });
    const session = await createSession(owner.id, 'Chat của chủ');

    await expect(saveMessagesReturningIds(session.id, stranger.id, 'x', landingMsg('T', '<p/>'))).resolves.toBeNull();
    const { rows } = await db.query('SELECT 1 FROM ai_chat_messages WHERE session_id = $1', [session.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('getLandingPageMessage + getSessionMessages', () => {
  it('có id → đúng tin; id null → tin landing_page MỚI NHẤT; chỉ nhận type landing_page', async () => {
    const user = await createUser({ email: 'lm-get@test.com', username: 'lm_get' });
    const session = await createSession(user.id, 'Chat');
    const first = await saveMessagesReturningIds(session.id, user.id, 'trang 1', landingMsg('Trang 1', '<p>1</p>'));
    const second = await saveMessagesReturningIds(session.id, user.id, 'trang 2', landingMsg('Trang 2', '<p>2</p>'));
    await saveMessagesReturningIds(session.id, user.id, 'hỏi thêm', { content: 'ok', type: 'landing_edit_ack' });

    const older = await getLandingPageMessage(session.id, user.id, first.assistantMessageId);
    expect(older).toEqual({ id: first.assistantMessageId, data: { title: 'Trang 1', html: '<p>1</p>' } });

    const latest = await getLandingPageMessage(session.id, user.id, null);
    expect(latest.id).toBe(second.assistantMessageId);
    expect(latest.data.title).toBe('Trang 2');

    // id của tin KHÔNG phải landing_page (tin user) → không tìm thấy
    await expect(getLandingPageMessage(session.id, user.id, first.userMessageId)).resolves.toBeNull();
  });

  it('người khác / phiên khác không đọc được; phiên chưa có landing → null', async () => {
    const owner = await createUser({ email: 'lm-o2@test.com', username: 'lm_o2' });
    const stranger = await createUser({ email: 'lm-s2@test.com', username: 'lm_s2' });
    const session = await createSession(owner.id, 'Chat');
    const other = await createSession(owner.id, 'Chat khác');
    const ids = await saveMessagesReturningIds(session.id, owner.id, 'x', landingMsg('T', '<p/>'));

    await expect(getLandingPageMessage(session.id, stranger.id, ids.assistantMessageId)).resolves.toBeNull();
    await expect(getLandingPageMessage(other.id, owner.id, ids.assistantMessageId)).resolves.toBeNull();
    await expect(getLandingPageMessage(other.id, owner.id, null)).resolves.toBeNull();
  });

  it('getSessionMessages trả id dạng số cho từng tin — khớp id lúc lưu (frontend dùng làm messageId)', async () => {
    const user = await createUser({ email: 'lm-list@test.com', username: 'lm_list' });
    const session = await createSession(user.id, 'Chat');
    const ids = await saveMessagesReturningIds(session.id, user.id, 'x', landingMsg('T', '<p/>'));

    const { messages } = await getSessionMessages(session.id, user.id);
    expect(messages.map((m) => typeof m.id)).toEqual(['number', 'number']);
    expect(messages.find((m) => m.type === 'landing_page').id).toBe(ids.assistantMessageId);
    expect(messages.find((m) => m.role === 'user').id).toBe(ids.userMessageId);
  });

  it('updateLandingPageMessage gộp jsonb: cập nhật autoLayoutFixCount không làm mất html/title', async () => {
    const user = await createUser({ email: 'lm-merge@test.com', username: 'lm_merge' });
    const session = await createSession(user.id, 'Chat');
    const ids = await saveMessagesReturningIds(session.id, user.id, 'x', landingMsg('T', '<p>giữ</p>'));

    await updateLandingPageMessage(session.id, user.id, { html: '<p>mới</p>', previousHtml: '<p>giữ</p>', autoLayoutFixCount: 1 }, ids.assistantMessageId);
    await updateLandingPageMessage(session.id, user.id, { autoLayoutFixCount: 2 }, ids.assistantMessageId);

    const message = await getLandingPageMessage(session.id, user.id, ids.assistantMessageId);
    expect(message.data).toEqual({ title: 'T', html: '<p>mới</p>', previousHtml: '<p>giữ</p>', autoLayoutFixCount: 2 });
  });
});

describe('PATCH /api/ai/sessions/:id/landing-message — hoàn tác', () => {
  const patch = (user, sessionId, body) =>
    request(app)
      .patch(`/api/ai/sessions/${sessionId}/landing-message`)
      .set('Authorization', `Bearer ${token(user)}`)
      .send(body);

  it('hoán html ↔ previousHtml trong DB, bỏ qua html client gửi; bấm lần hai quay lại bản đầu', async () => {
    const user = await createUser({ email: 'lm-rev@test.com', username: 'lm_rev' });
    const session = await createSession(user.id, 'Chat');
    const ids = await saveMessagesReturningIds(
      session.id, user.id, 'x',
      landingMsg('Trang sau sửa', '<p>SAU</p>', { previousHtml: '<p>TRƯỚC</p>', previousTitle: 'Trang trước sửa', autoLayoutFixCount: 2 }),
    );

    const res = await patch(user, session.id, { messageId: ids.assistantMessageId, data: { revert: true, html: '<script>evil()</script>', title: 'HACK' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ title: 'Trang trước sửa', html: '<p>TRƯỚC</p>', canRevert: true });
    expect(await readData(ids.assistantMessageId)).toMatchObject({
      html: '<p>TRƯỚC</p>', title: 'Trang trước sửa', previousHtml: '<p>SAU</p>', previousTitle: 'Trang sau sửa', autoLayoutFixCount: 2,
    });

    const again = await patch(user, session.id, { messageId: ids.assistantMessageId, data: { revert: true } });
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ title: 'Trang sau sửa', html: '<p>SAU</p>' });
    expect(JSON.stringify(await readData(ids.assistantMessageId))).not.toMatch(/evil|HACK/);
  });

  it('messageId null → hoàn tác tin landing_page mới nhất', async () => {
    const user = await createUser({ email: 'lm-rev2@test.com', username: 'lm_rev2' });
    const session = await createSession(user.id, 'Chat');
    await saveMessagesReturningIds(session.id, user.id, 'a', landingMsg('Cũ', '<p>cũ</p>'));
    const newest = await saveMessagesReturningIds(session.id, user.id, 'b', landingMsg('Mới', '<p>mới</p>', { previousHtml: '<p>bản trước</p>' }));

    const res = await patch(user, session.id, { data: { revert: true } });
    expect(res.status).toBe(200);
    expect(res.body.data.html).toBe('<p>bản trước</p>');
    expect((await readData(newest.assistantMessageId)).html).toBe('<p>bản trước</p>');
  });

  it('chưa có bản trước → 409 NOTHING_TO_REVERT, dữ liệu không đổi', async () => {
    const user = await createUser({ email: 'lm-rev3@test.com', username: 'lm_rev3' });
    const session = await createSession(user.id, 'Chat');
    const ids = await saveMessagesReturningIds(session.id, user.id, 'x', landingMsg('T', '<p>A</p>'));

    const res = await patch(user, session.id, { messageId: ids.assistantMessageId, data: { revert: true } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOTHING_TO_REVERT');
    expect(await readData(ids.assistantMessageId)).toEqual({ title: 'T', html: '<p>A</p>' });
  });

  it('người khác không hoàn tác được tin của mình → 404, dữ liệu không đổi', async () => {
    const owner = await createUser({ email: 'lm-rev4@test.com', username: 'lm_rev4' });
    const stranger = await createUser({ email: 'lm-rev5@test.com', username: 'lm_rev5' });
    const session = await createSession(owner.id, 'Chat');
    const ids = await saveMessagesReturningIds(session.id, owner.id, 'x', landingMsg('T', '<p>B</p>', { previousHtml: '<p>A</p>' }));

    const res = await patch(stranger, session.id, { messageId: ids.assistantMessageId, data: { revert: true } });
    expect(res.status).toBe(404);
    expect((await readData(ids.assistantMessageId)).html).toBe('<p>B</p>');
  });
});
