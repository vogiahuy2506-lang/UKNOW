/**
 * PLAN_VIEC_SOT L5 — nhân viên có `campaigns_create` (không có `zalo_settings`) dùng được các route trình dựng
 * (preview/*, restore-session, retry-restore) CHỈ với tài khoản Zalo được giao; route quản trị vẫn cần `zalo_settings`.
 * CSDL thật; phiên Zalo giả nhét vào registry phiên.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import zaloAccountSessionService from '../../src/services/zalo/zaloAccountSession.service.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;
const seededAccountIds = [];

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  while (seededAccountIds.length) zaloAccountSessionService.clearAccountApi(seededAccountIds.pop());
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login thất bại cho ${user.username}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function addMembership(ownerId, employeeId, permissions) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin, accepted_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', 'created', NOW(), NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

async function createZalo(ownerId, name) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, zalo_user_id, zalo_phone, status, is_active, is_default, cookie_text)
     VALUES ($1, $2, $3, '0900000000', 'connected', TRUE, FALSE, 'COOKIE') RETURNING id`,
    [ownerId, name, `uid_${name}`]
  );
  const id = Number(rows[0].id);
  zaloAccountSessionService.setAccountApi(id, { getAllGroups: async () => ({ gridVerMap: {}, version: '1' }) });
  seededAccountIds.push(id);
  return id;
}

async function assign(ownerId, employeeId, accountId) {
  await db.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
     VALUES ($1, $2, 'zalo_personal', $3, 'assigned')`,
    [ownerId, employeeId, String(accountId)]
  );
}

const asEmployee = (req, token, ownerId) => req.set('Authorization', `Bearer ${token}`).set('X-Owner-Context', String(ownerId));

async function setup(employeePermissions) {
  const owner = await createUser({ username: 'chu_l5', role: 'user' });
  const employee = await createUser({ username: 'nv_l5', role: 'user' });
  await addMembership(owner.id, employee.id, employeePermissions);
  const a5 = await createZalo(owner.id, 'TK_5');
  const a6 = await createZalo(owner.id, 'TK_6');
  return { owner, employee, a5, a6, ownerToken: await loginAs(owner), employeeToken: await loginAs(employee) };
}

describe('route trình dựng Zalo cho nhân viên campaigns_create', () => {
  it('được giao TK 5: GET /preview/groups?accountId=5 -> 200', async () => {
    const { owner, employee, a5, employeeToken } = await setup({ campaigns_create: true });
    await assign(owner.id, employee.id, a5);
    const res = await asEmployee(request(app).get(`/api/zalo/preview/groups?accountId=${a5}`), employeeToken, owner.id);
    expect(res.status).toBe(200);
  });

  it('không được giao TK 6: GET /preview/groups -> 403 ZALO_ACCOUNT_NOT_ASSIGNED', async () => {
    const { owner, employee, a5, a6, employeeToken } = await setup({ campaigns_create: true });
    await assign(owner.id, employee.id, a5);
    const res = await asEmployee(request(app).get(`/api/zalo/preview/groups?accountId=${a6}`), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
  });

  it('không được giao TK 6: friends / send-* / restore-session / retry-restore -> 403 ZALO_ACCOUNT_NOT_ASSIGNED', async () => {
    const { owner, employee, a5, a6, employeeToken } = await setup({ campaigns_create: true });
    await assign(owner.id, employee.id, a5);
    const calls = [
      () => request(app).get(`/api/zalo/preview/friends?accountId=${a6}`),
      () => request(app).post('/api/zalo/preview/send-personal').send({ accountId: a6, recipients: ['0911111111'], message: 'x' }),
      () => request(app).post('/api/zalo/preview/send-friend-request').send({ accountId: a6, recipients: ['0911111111'], message: 'x' }),
      () => request(app).post('/api/zalo/preview/send-group').send({ accountId: a6, groupIds: ['g1'], message: 'x' }),
      () => request(app).post(`/api/zalo/accounts/${a6}/restore-session`),
      () => request(app).post(`/api/zalo/accounts/${a6}/retry-restore`),
    ];
    for (const make of calls) {
      const res = await asEmployee(make(), employeeToken, owner.id);
      expect([res.status, res.body.code]).toEqual([403, 'ZALO_ACCOUNT_NOT_ASSIGNED']);
    }
  });

  it('DELETE /accounts/:id (được giao) -> 403 vì thiếu zalo_settings', async () => {
    const { owner, employee, a5, employeeToken } = await setup({ campaigns_create: true });
    await assign(owner.id, employee.id, a5);
    const res = await asEmployee(request(app).delete(`/api/zalo/accounts/${a5}`), employeeToken, owner.id);
    expect(res.status).toBe(403);
    const { rows } = await db.query('SELECT 1 FROM zalo_settings WHERE id = $1', [a5]);
    expect(rows).toHaveLength(1);
  });

  it('NV không quyền nào: preview/groups -> 403', async () => {
    const { owner, employee, a5, employeeToken } = await setup({});
    await assign(owner.id, employee.id, a5);
    const res = await asEmployee(request(app).get(`/api/zalo/preview/groups?accountId=${a5}`), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).not.toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
  });

  it('chủ: preview/groups -> 200 như cũ', async () => {
    const { a5, ownerToken } = await setup({ campaigns_create: true });
    const res = await request(app).get(`/api/zalo/preview/groups?accountId=${a5}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });
});
