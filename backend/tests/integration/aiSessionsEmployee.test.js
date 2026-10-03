/**
 * Integration test cho G3a.2 (C P1-7) — phiên chat trợ lý của NHÂN VIÊN.
 *
 * Quy ước chốt: phiên chat + tin nhắn + wizard_state thuộc NGƯỜI THAO TÁC (`req.user.id`), không thuộc chủ workspace.
 * `chat()` ghi bằng id nhân viên; trước G3a bốn endpoint list/đọc/PATCH wizard-state/xoá lại tra bằng id CHỦ nên:
 *   - nhân viên thấy + mở + xoá được phiên của chủ (rò dữ liệu);
 *   - phiên của chính nhân viên 404 sau F5, PATCH ranh giới wizard 404 → không lưu.
 *
 * Postgres thật (supertest → Express → repo): SQL `id_user = $2` thật chạy, không mock.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { createSession, saveMessages } from '../../src/repositories/aiSession.repository.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

const tokenOf = (user) => jwt.sign(
  { userId: user.id, email: user.email, role: user.role || 'user' },
  process.env.JWT_SECRET || 'test-jwt-secret'
);

async function addEmployee(owner, employee, permissions = { ai_assistant_use: true }) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
    [owner.id, employee.id, JSON.stringify(permissions)]
  );
}

/** Gọi API với tư cách nhân viên đang làm việc trong workspace của `owner`. */
const asEmployee = (method, url, employee, owner) => request(app)[method](url)
  .set('Authorization', `Bearer ${tokenOf(employee)}`)
  .set('X-Owner-Context', String(owner.id));

const asUser = (method, url, user) => request(app)[method](url)
  .set('Authorization', `Bearer ${tokenOf(user)}`);

async function seed() {
  const owner = await createUser({ email: 'g3a-owner@test.com', username: 'g3a_owner' });
  const employee = await createUser({ email: 'g3a-emp@test.com', username: 'g3a_emp', role: 'employee' });
  const outsider = await createUser({ email: 'g3a-outsider@test.com', username: 'g3a_outsider' });
  await addEmployee(owner, employee);

  const ownerSession = await createSession(owner.id, 'Chat bí mật của chủ');
  await saveMessages(ownerSession.id, owner.id, 'Doanh thu quý này bao nhiêu?', { content: 'Số liệu nội bộ của chủ', type: 'text' });
  const employeeSession = await createSession(employee.id, 'Chat của nhân viên');
  await saveMessages(employeeSession.id, employee.id, 'Soạn email chào khách', { content: 'Đây là email nháp', type: 'text' });
  return { owner, employee, outsider, ownerSession, employeeSession };
}

describe('GET /api/ai/sessions — chỉ liệt kê phiên của chính người gọi', () => {
  it('nhân viên (đang ở workspace chủ) chỉ thấy phiên của MÌNH, không thấy phiên của chủ', async () => {
    const { owner, employee, ownerSession, employeeSession } = await seed();

    const res = await asEmployee('get', '/api/ai/sessions', employee, owner);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => Number(s.id));
    expect(ids).toEqual([Number(employeeSession.id)]);
    expect(ids).not.toContain(Number(ownerSession.id));
  });

  it('chủ chỉ thấy phiên của MÌNH, không thấy phiên của nhân viên', async () => {
    const { owner, ownerSession, employeeSession } = await seed();

    const res = await asUser('get', '/api/ai/sessions', owner);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => Number(s.id));
    expect(ids).toEqual([Number(ownerSession.id)]);
    expect(ids).not.toContain(Number(employeeSession.id));
  });
});

describe('GET /api/ai/sessions/:id/messages', () => {
  it('nhân viên đọc được phiên của chính mình (trước đây 404 sau F5)', async () => {
    const { owner, employee, employeeSession } = await seed();

    const res = await asEmployee('get', `/api/ai/sessions/${employeeSession.id}/messages`, employee, owner);

    expect(res.status).toBe(200);
    expect(res.body.data.map((m) => m.content)).toEqual(['Soạn email chào khách', 'Đây là email nháp']);
  });

  it('nhân viên KHÔNG đọc được tin nhắn của phiên chủ → 404', async () => {
    const { owner, employee, ownerSession } = await seed();

    const res = await asEmployee('get', `/api/ai/sessions/${ownerSession.id}/messages`, employee, owner);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Số liệu nội bộ của chủ');
  });

  it('chủ không đọc được phiên của nhân viên; người ngoài không đọc được phiên nào → 404', async () => {
    const { owner, outsider, ownerSession, employeeSession } = await seed();

    expect((await asUser('get', `/api/ai/sessions/${employeeSession.id}/messages`, owner)).status).toBe(404);
    expect((await asUser('get', `/api/ai/sessions/${ownerSession.id}/messages`, outsider)).status).toBe(404);
  });
});

describe('PATCH /api/ai/sessions/:id/wizard-state', () => {
  it('nhân viên lưu được ranh giới wizard của phiên MÌNH (trước đây 404 → không lưu), tin ranh giới nằm đúng phiên', async () => {
    const { owner, employee, employeeSession } = await seed();

    const res = await asEmployee('patch', `/api/ai/sessions/${employeeSession.id}/wizard-state`, employee, owner)
      .send({ action: 'mark_campaign_created', payload: { campaignId: 321, content: 'Đã tạo chiến dịch của nhân viên.' } });

    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);
    expect(res.body.data.wizardState.plan.campaignId).toBe(321);

    const { rows } = await db.query(
      `SELECT content FROM ai_chat_messages WHERE session_id = $1 AND type = 'campaign_created'`,
      [employeeSession.id]
    );
    expect(rows.map((r) => r.content)).toEqual(['Đã tạo chiến dịch của nhân viên.']);
  });

  it('nhân viên KHÔNG PATCH được wizard-state của phiên chủ → 404, dữ liệu chủ nguyên vẹn', async () => {
    const { owner, employee, ownerSession } = await seed();
    const before = await db.query('SELECT wizard_state FROM ai_chat_sessions WHERE id = $1', [ownerSession.id]);

    const res = await asEmployee('patch', `/api/ai/sessions/${ownerSession.id}/wizard-state`, employee, owner)
      .send({ action: 'mark_campaign_created', payload: { campaignId: 999, content: 'Nhân viên cố ghi vào phiên của chủ.' } });

    expect(res.status).toBe(404);
    const after = await db.query('SELECT wizard_state FROM ai_chat_sessions WHERE id = $1', [ownerSession.id]);
    expect(after.rows[0].wizard_state).toEqual(before.rows[0].wizard_state);
    const boundary = await db.query(
      `SELECT 1 FROM ai_chat_messages WHERE session_id = $1 AND type = 'campaign_created'`,
      [ownerSession.id]
    );
    expect(boundary.rowCount).toBe(0);
  });
});

describe('DELETE /api/ai/sessions/:id', () => {
  it('nhân viên KHÔNG xoá được phiên của chủ → 404, phiên vẫn còn', async () => {
    const { owner, employee, ownerSession } = await seed();

    const res = await asEmployee('delete', `/api/ai/sessions/${ownerSession.id}`, employee, owner);

    expect(res.status).toBe(404);
    const { rowCount } = await db.query('SELECT 1 FROM ai_chat_sessions WHERE id = $1', [ownerSession.id]);
    expect(rowCount).toBe(1);
  });

  it('nhân viên xoá được phiên của chính mình; phiên của chủ không bị đụng', async () => {
    const { owner, employee, ownerSession, employeeSession } = await seed();

    const res = await asEmployee('delete', `/api/ai/sessions/${employeeSession.id}`, employee, owner);

    expect(res.status).toBe(200);
    expect((await db.query('SELECT 1 FROM ai_chat_sessions WHERE id = $1', [employeeSession.id])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM ai_chat_sessions WHERE id = $1', [ownerSession.id])).rowCount).toBe(1);
  });
});
