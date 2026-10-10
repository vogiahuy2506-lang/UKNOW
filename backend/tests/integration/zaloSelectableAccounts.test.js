/**
 * PLAN_VIEC_SOT L2 — GET /api/zalo/accounts/selectable: nhân viên có `campaigns_create` nhưng KHÔNG có `zalo_settings`
 * vẫn thấy đúng tài khoản Zalo được giao (trình dựng chiến dịch + Gửi nhanh). CSDL thật.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

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

async function createZalo(ownerId, name, isDefault = false) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, zalo_user_id, zalo_phone, status, is_active, is_default, notes, cookie_text)
     VALUES ($1, $2, $3, '0900000000', 'connected', TRUE, $4, 'ghi chu rieng', 'COOKIE_BI_MAT') RETURNING id`,
    [ownerId, name, `uid_${name}`, isDefault]
  );
  return Number(rows[0].id);
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
  const owner = await createUser({ username: 'chu_sel', role: 'user' });
  const employee = await createUser({ username: 'nv_sel', role: 'user' });
  await addMembership(owner.id, employee.id, employeePermissions);
  const a1 = await createZalo(owner.id, 'TK_1', true);
  const a5 = await createZalo(owner.id, 'TK_5');
  const a9 = await createZalo(owner.id, 'TK_9');
  return { owner, employee, a1, a5, a9, ownerToken: await loginAs(owner), employeeToken: await loginAs(employee) };
}

describe('GET /api/zalo/accounts/selectable', () => {
  it('NV có campaigns_create, không zalo_settings, được giao 1 TK: thấy đúng TK đó, không trường nhạy cảm', async () => {
    const { owner, employee, a5, employeeToken } = await setup({ campaigns_create: true });
    await assign(owner.id, employee.id, a5);

    const res = await asEmployee(request(app).get('/api/zalo/accounts/selectable'), employeeToken, owner.id);

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((x) => Number(x.id))).toEqual([a5]);
    expect(res.body.data.items[0].displayName).toBe('TK_5');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/COOKIE_BI_MAT|cookie|imei|session|ghi chu rieng|0900000000|uid_TK/i);
  });

  it('NV có campaigns_create, không được giao TK nào: 200 + danh sách rỗng (không 403)', async () => {
    const { owner, employeeToken } = await setup({ campaigns_create: true });
    const res = await asEmployee(request(app).get('/api/zalo/accounts/selectable'), employeeToken, owner.id);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('NV không có quyền nào trong hai quyền: 403 như cũ', async () => {
    const { owner, employee, a5, employeeToken } = await setup({ campaigns_view: true, inbox_view: true });
    await assign(owner.id, employee.id, a5);
    const res = await asEmployee(request(app).get('/api/zalo/accounts/selectable'), employeeToken, owner.id);
    expect(res.status).toBe(403);
  });

  it('endpoint cũ GET /api/zalo/accounts vẫn 403 với NV chỉ có campaigns_create', async () => {
    const { owner, employee, a5, employeeToken } = await setup({ campaigns_create: true });
    await assign(owner.id, employee.id, a5);
    const res = await asEmployee(request(app).get('/api/zalo/accounts'), employeeToken, owner.id);
    expect(res.status).toBe(403);
  });

  it('chủ thấy mọi TK như cũ', async () => {
    const { a1, a5, a9, ownerToken } = await setup({ campaigns_create: true });
    const res = await request(app).get('/api/zalo/accounts/selectable').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((x) => Number(x.id)).sort((x, y) => x - y)).toEqual([a1, a5, a9]);
  });
});
