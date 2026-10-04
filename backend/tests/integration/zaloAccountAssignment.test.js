/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — giao từng tài khoản Zalo cá nhân cho nhân viên (CSDL thật).
 *
 * Gồm: migration 283 (legacy + chạy lại không cấp lại), API giao (chỉ chủ), danh sách `GET /api/zalo/accounts` lọc theo
 * việc giao, các endpoint nhận `:id` tài khoản trả 403 cho nhân viên chưa được giao, đặt mặc định chỉ chủ, FAIL-CLOSED
 * khi bảng giao hỏng, dọn việc giao khi xoá nhân viên / xoá tài khoản, quét QR của nhân viên. Mọi nhóm đều có ca "chủ
 * thấy hết".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import zaloSettingsController from '../../src/controllers/zaloSettings.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(path.resolve(__dirname, '../../migrations/283_member_channel_accounts.sql'), 'utf8');

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

async function addMembership(ownerId, employeeId, { permissions = { zalo_settings: true }, status = 'active', acceptedAt = new Date() } = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin, accepted_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, 'created', $5, NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions), status, acceptedAt]
  );
}

async function createZalo(ownerId, { name, isDefault = false, zaloUserId = null } = {}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, zalo_user_id, status, is_active, is_default)
     VALUES ($1, $2, $3, 'disconnected', TRUE, $4) RETURNING id`,
    [ownerId, name || `Zalo ${Math.random().toString(36).slice(2, 8)}`, zaloUserId, isDefault]
  );
  return Number(rows[0].id);
}

async function assign(ownerId, employeeId, accountId, source = 'assigned') {
  await db.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
     VALUES ($1, $2, 'zalo_personal', $3, $4)`,
    [ownerId, employeeId, String(accountId), source]
  );
}

async function assignedIdsOf(employeeId) {
  const { rows } = await db.query(
    `SELECT account_ref FROM member_channel_accounts WHERE employee_id = $1 AND channel = 'zalo_personal' ORDER BY account_ref::bigint`,
    [employeeId]
  );
  return rows.map((r) => Number(r.account_ref));
}

/** Một chủ có 3 tài khoản Zalo + một nhân viên có quyền zalo_settings + inbox_view. */
async function setupWorkspace() {
  const owner = await createUser({ username: 'chu_zalo', role: 'user' });
  const employee = await createUser({ username: 'nv_zalo', role: 'user' });
  await addMembership(owner.id, employee.id, { permissions: { zalo_settings: true, inbox_view: true, campaigns_create: true } });
  const a = await createZalo(owner.id, { name: 'Shop', isDefault: true });
  const b = await createZalo(owner.id, { name: 'Ban hang' });
  const c = await createZalo(owner.id, { name: 'Gia dinh' });
  return {
    owner, employee, a, b, c,
    ownerToken: await loginAs(owner),
    employeeToken: await loginAs(employee),
  };
}

const asEmployee = (req, token, ownerId) => req.set('Authorization', `Bearer ${token}`).set('X-Owner-Context', String(ownerId));
const asOwner = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('migration 283 — legacy + chạy lại không cấp lại', () => {
  afterEach(async () => {
    // Đảm bảo bảng luôn tồn tại cho các test sau (migration tự tạo lại khi thiếu).
    await db.query(MIGRATION_SQL);
  });

  it('chèn legacy cho nhân viên ĐANG HOẠT ĐỘNG có quyền chạm Zalo x mọi tài khoản của chủ; bỏ qua người không đủ điều kiện; chạy lại sau khi chủ gỡ bớt KHÔNG cấp lại', async () => {
    const owner = await createUser({ username: 'chu_legacy', role: 'user' });
    const otherOwner = await createUser({ username: 'chu_khac', role: 'user' });
    const a = await createZalo(owner.id);
    const b = await createZalo(owner.id);
    const c = await createZalo(owner.id);
    const otherAcc = await createZalo(otherOwner.id);

    const empZalo = await createUser({ username: 'nv_zalo_settings', role: 'user' });
    const empInbox = await createUser({ username: 'nv_inbox', role: 'user' });
    const empCampaign = await createUser({ username: 'nv_campaign_run', role: 'user' });
    const empReadOnly = await createUser({ username: 'nv_chi_xem', role: 'user' });
    const empInactive = await createUser({ username: 'nv_khoa', role: 'user' });
    const empPending = await createUser({ username: 'nv_cho_chap_nhan', role: 'user' });
    const empArrayPerm = await createUser({ username: 'nv_quyen_mang', role: 'user' });
    const empOtherWs = await createUser({ username: 'nv_chu_khac', role: 'user' });

    await addMembership(owner.id, empZalo.id, { permissions: { zalo_settings: true } });
    await addMembership(owner.id, empInbox.id, { permissions: { inbox_view: true, campaigns_view: true } });
    await addMembership(owner.id, empCampaign.id, { permissions: { campaigns_run: true } });
    await addMembership(owner.id, empReadOnly.id, { permissions: { campaigns_view: true, reports_view: true, courses: true, zalo_settings: false } });
    await addMembership(owner.id, empInactive.id, { permissions: { zalo_settings: true }, status: 'inactive' });
    await addMembership(owner.id, empPending.id, { permissions: { zalo_settings: true }, acceptedAt: null });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin) VALUES ($1, $2, '[]'::jsonb, 'active', 'created')`,
      [owner.id, empArrayPerm.id]
    );
    await addMembership(otherOwner.id, empOtherWs.id, { permissions: { inbox_view: true } });

    // Dựng lại đúng trạng thái "trước migration": bảng chưa có.
    await db.query('DROP TABLE member_channel_accounts');
    await db.query(MIGRATION_SQL);

    const rowsOf = async () => (await db.query(
      `SELECT owner_id, employee_id, account_ref, source, channel FROM member_channel_accounts ORDER BY employee_id, account_ref::bigint`
    )).rows.map((r) => ({ ...r, owner_id: Number(r.owner_id), employee_id: Number(r.employee_id) }));

    const rows = await rowsOf();
    const byEmployee = (id) => rows.filter((r) => r.employee_id === Number(id)).map((r) => Number(r.account_ref));

    expect(byEmployee(empZalo.id)).toEqual([a, b, c]);
    expect(byEmployee(empInbox.id)).toEqual([a, b, c]);
    expect(byEmployee(empCampaign.id)).toEqual([a, b, c]);
    expect(byEmployee(empOtherWs.id)).toEqual([otherAcc]);
    expect(byEmployee(empReadOnly.id)).toEqual([]);
    expect(byEmployee(empInactive.id)).toEqual([]);
    expect(byEmployee(empPending.id)).toEqual([]);
    expect(byEmployee(empArrayPerm.id)).toEqual([]);
    expect(rows.every((r) => r.source === 'legacy' && r.channel === 'zalo_personal')).toBe(true);
    // Không có hàng nào gán tài khoản của chủ này cho nhân viên của chủ khác (và ngược lại).
    expect(rows.filter((r) => r.owner_id === Number(owner.id)).every((r) => [a, b, c].includes(Number(r.account_ref)))).toBe(true);
    expect(rows.filter((r) => r.owner_id === Number(otherOwner.id)).every((r) => Number(r.account_ref) === otherAcc)).toBe(true);

    // Chủ gỡ bớt tài khoản c khỏi empZalo, rồi migration chạy LẠI: không được cấp lại, không nhân đôi.
    await db.query(`DELETE FROM member_channel_accounts WHERE employee_id = $1 AND account_ref = $2`, [empZalo.id, String(c)]);
    const before = await rowsOf();
    await db.query(MIGRATION_SQL);
    const after = await rowsOf();
    expect(after).toEqual(before);
    expect(after.filter((r) => r.employee_id === Number(empZalo.id)).map((r) => Number(r.account_ref))).toEqual([a, b]);
  });

  it('nhân viên MỚI (thêm sau migration) mặc định không có tài khoản nào', async () => {
    const { owner } = await setupWorkspace();
    const newbie = await createUser({ username: 'nv_moi', role: 'user' });
    await addMembership(owner.id, newbie.id, { permissions: { zalo_settings: true, inbox_view: true } });
    expect(await assignedIdsOf(newbie.id)).toEqual([]);
  });
});

describe('API giao: GET/PUT /api/employees/:id/channel-accounts (chỉ chủ)', () => {
  it('chủ xem danh sách: đủ tài khoản của chủ, nhân viên mới chưa giao gì', async () => {
    const { owner, employee, ownerToken, a, b, c } = await setupWorkspace();
    const res = await asOwner(request(app).get(`/api/employees/${employee.id}/channel-accounts`), ownerToken);

    expect(res.status).toBe(200);
    const accounts = res.body.data.zaloAccounts;
    expect(accounts.map((x) => x.id).sort((x, y) => x - y)).toEqual([a, b, c]);
    expect(accounts.every((x) => x.assigned === false && x.source === null)).toBe(true);
    expect(owner.id).toBeTruthy();
  });

  it('chủ giao a + b: DB có 2 hàng source=assigned, bump user_members.updated_at, ghi audit EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED', async () => {
    const { owner, employee, ownerToken, a, b } = await setupWorkspace();
    const rev0 = (await db.query(`SELECT updated_at FROM user_members WHERE employee_id = $1`, [employee.id])).rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 20));

    const res = await asOwner(request(app).put(`/api/employees/${employee.id}/channel-accounts`), ownerToken)
      .send({ zaloAccountIds: [a, b] });

    expect(res.status).toBe(200);
    expect(res.body.data.zaloAccounts.filter((x) => x.assigned).map((x) => x.id).sort((x, y) => x - y)).toEqual([a, b]);
    expect(await assignedIdsOf(employee.id)).toEqual([a, b]);
    const { rows } = await db.query(`SELECT source, created_by FROM member_channel_accounts WHERE employee_id = $1`, [employee.id]);
    expect(rows.every((r) => r.source === 'assigned' && Number(r.created_by) === Number(owner.id))).toBe(true);

    const rev1 = (await db.query(`SELECT updated_at FROM user_members WHERE employee_id = $1`, [employee.id])).rows[0].updated_at;
    expect(new Date(rev1).getTime()).toBeGreaterThan(new Date(rev0).getTime());

    const audit = await db.query(`SELECT details FROM audit_logs WHERE action = 'EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED' AND entity_id = $1`, [employee.id]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].details).toMatchObject({ channel: 'zalo_personal', before: [], after: [a, b] });
  });

  it('thay toàn bộ: giao lại chỉ c → a, b bị thu hồi; danh sách rỗng → thu hồi hết', async () => {
    const { employee, ownerToken, a, b, c } = await setupWorkspace();
    await asOwner(request(app).put(`/api/employees/${employee.id}/channel-accounts`), ownerToken).send({ zaloAccountIds: [a, b] });
    await asOwner(request(app).put(`/api/employees/${employee.id}/channel-accounts`), ownerToken).send({ zaloAccountIds: [c] });
    expect(await assignedIdsOf(employee.id)).toEqual([c]);

    const res = await asOwner(request(app).put(`/api/employees/${employee.id}/channel-accounts`), ownerToken).send({ zaloAccountIds: [] });
    expect(res.status).toBe(200);
    expect(await assignedIdsOf(employee.id)).toEqual([]);
  });

  it('giữ nguyên hàng legacy / self_login còn nằm trong danh sách mới (không đổi nguồn)', async () => {
    const { owner, employee, ownerToken, a, b } = await setupWorkspace();
    await assign(owner.id, employee.id, a, 'legacy');
    await assign(owner.id, employee.id, b, 'self_login');
    const res = await asOwner(request(app).put(`/api/employees/${employee.id}/channel-accounts`), ownerToken).send({ zaloAccountIds: [a, b] });
    expect(res.status).toBe(200);
    const { rows } = await db.query(`SELECT account_ref, source FROM member_channel_accounts WHERE employee_id = $1 ORDER BY account_ref::bigint`, [employee.id]);
    expect(rows.map((r) => [Number(r.account_ref), r.source])).toEqual([[a, 'legacy'], [b, 'self_login']]);
  });

  it('id tài khoản của chủ KHÁC bị loại, không báo lỗi', async () => {
    const { employee, ownerToken, a } = await setupWorkspace();
    const stranger = await createUser({ username: 'chu_la', role: 'user' });
    const foreignAccount = await createZalo(stranger.id, { name: 'Cua nguoi la' });

    const res = await asOwner(request(app).put(`/api/employees/${employee.id}/channel-accounts`), ownerToken)
      .send({ zaloAccountIds: [a, foreignAccount, 987654] });

    expect(res.status).toBe(200);
    expect(await assignedIdsOf(employee.id)).toEqual([a]);
  });

  it('nhân viên gọi PUT / GET → 403 OWNER_ONLY, DB không đổi', async () => {
    const { owner, employee, employeeToken, a } = await setupWorkspace();
    const put = await asEmployee(request(app).put(`/api/employees/${employee.id}/channel-accounts`), employeeToken, owner.id)
      .send({ zaloAccountIds: [a] });
    expect(put.status).toBe(403);
    expect(put.body.code).toBe('OWNER_ONLY');
    const get = await asEmployee(request(app).get(`/api/employees/${employee.id}/channel-accounts`), employeeToken, owner.id);
    expect(get.status).toBe(403);
    expect(await assignedIdsOf(employee.id)).toEqual([]);
  });

  it('nhân viên của chủ khác → 404 (chủ không giao được cho người ngoài nhóm), DB không đổi', async () => {
    const { ownerToken, a } = await setupWorkspace();
    const outsider = await createUser({ username: 'ngoai_nhom', role: 'user' });
    const res = await asOwner(request(app).put(`/api/employees/${outsider.id}/channel-accounts`), ownerToken).send({ zaloAccountIds: [a] });
    expect(res.status).toBe(404);
    expect(await assignedIdsOf(outsider.id)).toEqual([]);
  });

  it('thân body sai (không phải mảng số) → 400', async () => {
    const { employee, ownerToken } = await setupWorkspace();
    const res = await asOwner(request(app).put(`/api/employees/${employee.id}/channel-accounts`), ownerToken).send({ zaloAccountIds: ['x'] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/zalo/accounts — danh sách lọc theo việc giao', () => {
  it('nhân viên mới (chưa giao gì) → danh sách rỗng; CHỦ thấy đủ 3', async () => {
    const { owner, employeeToken, ownerToken } = await setupWorkspace();
    const emp = await asEmployee(request(app).get('/api/zalo/accounts'), employeeToken, owner.id);
    expect(emp.status).toBe(200);
    expect(emp.body.data.items).toEqual([]);

    const own = await asOwner(request(app).get('/api/zalo/accounts'), ownerToken);
    expect(own.body.data.items).toHaveLength(3);
  });

  it('nhân viên chỉ thấy tài khoản được giao; chủ vẫn thấy đủ, kèm số nhân viên được giao; nhân viên không thấy số đó', async () => {
    const { owner, employee, employeeToken, ownerToken, a, b, c } = await setupWorkspace();
    await assign(owner.id, employee.id, b);

    const emp = await asEmployee(request(app).get('/api/zalo/accounts'), employeeToken, owner.id);
    expect(emp.body.data.items.map((i) => Number(i.id))).toEqual([b]);
    expect(emp.body.data.items[0].assignedEmployeeCount).toBeNull();

    const own = await asOwner(request(app).get('/api/zalo/accounts'), ownerToken);
    const ownItems = own.body.data.items;
    expect(ownItems.map((i) => Number(i.id)).sort((x, y) => x - y)).toEqual([a, b, c]);
    expect(Object.fromEntries(ownItems.map((i) => [Number(i.id), i.assignedEmployeeCount]))).toEqual({ [a]: 0, [b]: 1, [c]: 0 });
  });

  it('super admin thấy tài khoản của mọi chủ', async () => {
    const { a, b, c } = await setupWorkspace();
    const admin = await createUser({ username: 'sa_zalo', role: 'admin' });
    const token = await loginAs(admin);
    const res = await asOwner(request(app).get('/api/zalo/accounts'), token);
    expect(res.body.data.items.map((i) => Number(i.id)).sort((x, y) => x - y)).toEqual([a, b, c]);
  });

  it('hàng giao trỏ sang tài khoản của chủ KHÁC không cho nhân viên thấy tài khoản đó', async () => {
    const { owner, employee, employeeToken, b } = await setupWorkspace();
    const stranger = await createUser({ username: 'chu_la_2', role: 'user' });
    const foreign = await createZalo(stranger.id, { name: 'Cua nguoi la' });
    await assign(owner.id, employee.id, foreign);
    await assign(owner.id, employee.id, b);

    const emp = await asEmployee(request(app).get('/api/zalo/accounts'), employeeToken, owner.id);
    expect(emp.body.data.items.map((i) => Number(i.id))).toEqual([b]);
  });

  it('FAIL-CLOSED: bảng giao hỏng (đổi tên tạm) → nhân viên thấy 0 tài khoản; chủ vẫn thấy đủ', async () => {
    const { owner, employee, employeeToken, ownerToken, a } = await setupWorkspace();
    await assign(owner.id, employee.id, a);
    await db.query('ALTER TABLE member_channel_accounts RENAME TO member_channel_accounts_tmp_broken');
    try {
      const emp = await asEmployee(request(app).get('/api/zalo/accounts'), employeeToken, owner.id);
      expect(emp.status).toBe(200);
      expect(emp.body.data.items).toEqual([]);
      const own = await asOwner(request(app).get('/api/zalo/accounts'), ownerToken);
      // Chủ không đọc bảng giao để lọc: danh sách vẫn đủ 3, chỉ mất con số "nhân viên được giao".
      expect(own.status).toBe(200);
      expect(own.body.data.items).toHaveLength(3);
      expect(own.body.data.items.every((i) => i.assignedEmployeeCount === null)).toBe(true);
    } finally {
      await db.query('ALTER TABLE member_channel_accounts_tmp_broken RENAME TO member_channel_accounts');
    }
  });
});

describe('endpoint nhận :id tài khoản Zalo — nhân viên chưa được giao bị 403, DB không đổi', () => {
  it('PATCH send-limit / send-speed, POST restore-session / retry-restore / restore-session-by-cookie, DELETE → 403 ZALO_ACCOUNT_NOT_ASSIGNED', async () => {
    const { owner, employee, employeeToken, a, b } = await setupWorkspace();
    await assign(owner.id, employee.id, a); // chỉ được a; b KHÔNG được giao

    const calls = [
      ['patch', `/api/zalo/accounts/${b}/send-limit`, { userDailySendLimit: 10 }],
      ['patch', `/api/zalo/accounts/${b}/send-speed`, { sendSpeed: 'fast' }],
      ['post', `/api/zalo/accounts/${b}/restore-session`, {}],
      ['post', `/api/zalo/accounts/${b}/retry-restore`, {}],
      ['post', `/api/zalo/accounts/${b}/restore-session-by-cookie`, {}],
      ['delete', `/api/zalo/accounts/${b}`, undefined],
      // id không tồn tại cũng 403 — không lộ id nào có thật
      ['delete', '/api/zalo/accounts/999999', undefined],
    ];
    for (const [method, url, body] of calls) {
      const req = asEmployee(request(app)[method](url), employeeToken, owner.id);
      const res = body === undefined ? await req : await req.send(body);
      expect({ url, status: res.status, code: res.body.code }).toEqual({ url, status: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    }

    const { rows } = await db.query(`SELECT id, user_daily_send_limit, zalo_personal_outbound_delay_min_ms FROM zalo_settings WHERE id = $1`, [b]);
    expect(rows).toHaveLength(1); // chưa bị xoá
    expect(rows[0].user_daily_send_limit).toBeNull();
    expect(rows[0].zalo_personal_outbound_delay_min_ms).toBeNull();
  });

  it('tài khoản ĐƯỢC giao: nhân viên đặt giới hạn / tốc độ được', async () => {
    const { owner, employee, employeeToken, a } = await setupWorkspace();
    await assign(owner.id, employee.id, a);

    const limit = await asEmployee(request(app).patch(`/api/zalo/accounts/${a}/send-limit`), employeeToken, owner.id).send({ userDailySendLimit: 40 });
    expect(limit.status).toBe(200);
    const speed = await asEmployee(request(app).patch(`/api/zalo/accounts/${a}/send-speed`), employeeToken, owner.id).send({ sendSpeed: 'fast' });
    expect(speed.status).toBe(200);
    const { rows } = await db.query(`SELECT user_daily_send_limit, zalo_personal_outbound_delay_min_ms FROM zalo_settings WHERE id = $1`, [a]);
    expect(rows[0].user_daily_send_limit).toBe(40);
    expect(rows[0].zalo_personal_outbound_delay_min_ms).toBe(50000);
  });

  it('CHỦ làm được mọi thứ trên mọi tài khoản của mình (không phá chủ)', async () => {
    const { ownerToken, b } = await setupWorkspace();
    const limit = await asOwner(request(app).patch(`/api/zalo/accounts/${b}/send-limit`), ownerToken).send({ userDailySendLimit: 25 });
    expect(limit.status).toBe(200);
    const speed = await asOwner(request(app).patch(`/api/zalo/accounts/${b}/send-speed`), ownerToken).send({ sendSpeed: 'safe' });
    expect(speed.status).toBe(200);
    const retry = await asOwner(request(app).post(`/api/zalo/accounts/${b}/retry-restore`), ownerToken).send({});
    expect([200, 409]).toContain(retry.status);
    expect(retry.status).not.toBe(403);
  });

  it('PATCH /accounts/:id/default: nhân viên (kể cả tài khoản được giao) → 403 WORKSPACE_OWNER_ONLY; chủ đổi được', async () => {
    const { owner, employee, employeeToken, ownerToken, a, b } = await setupWorkspace();
    await assign(owner.id, employee.id, b);

    const emp = await asEmployee(request(app).patch(`/api/zalo/accounts/${b}/default`), employeeToken, owner.id);
    expect(emp.status).toBe(403);
    expect(emp.body.code).toBe('WORKSPACE_OWNER_ONLY');
    expect(Number((await db.query(`SELECT id FROM zalo_settings WHERE is_default = TRUE AND id_user = $1`, [owner.id])).rows[0].id)).toBe(a);

    const own = await asOwner(request(app).patch(`/api/zalo/accounts/${b}/default`), ownerToken);
    expect(own.status).toBe(200);
    expect(Number((await db.query(`SELECT id FROM zalo_settings WHERE is_default = TRUE AND id_user = $1`, [owner.id])).rows[0].id)).toBe(b);
  });

  it('xoá tài khoản (chủ) → dọn luôn các hàng giao của nó, giữ hàng của tài khoản khác', async () => {
    const { owner, employee, ownerToken, a, b } = await setupWorkspace();
    await assign(owner.id, employee.id, a);
    await assign(owner.id, employee.id, b);

    const del = await asOwner(request(app).delete(`/api/zalo/accounts/${b}`), ownerToken);
    expect(del.status).toBe(200);
    expect(await assignedIdsOf(employee.id)).toEqual([a]);
  });

  it('nhân viên được giao có thể xoá tài khoản đó; hàng giao đi theo', async () => {
    const { owner, employee, employeeToken, a } = await setupWorkspace();
    await assign(owner.id, employee.id, a);
    const del = await asEmployee(request(app).delete(`/api/zalo/accounts/${a}`), employeeToken, owner.id);
    expect(del.status).toBe(200);
    expect(await assignedIdsOf(employee.id)).toEqual([]);
  });
});

describe('gỡ nhân viên khỏi nhóm → mất mọi việc giao', () => {
  it('DELETE /api/employees/:id xoá hàng giao; mời lại không tự lấy lại danh sách cũ', async () => {
    const { owner, employee, ownerToken, a, b } = await setupWorkspace();
    await assign(owner.id, employee.id, a);
    await assign(owner.id, employee.id, b);

    const del = await asOwner(request(app).delete(`/api/employees/${employee.id}`), ownerToken);
    expect(del.status).toBe(200);
    expect(await assignedIdsOf(employee.id)).toEqual([]);

    await addMembership(owner.id, employee.id, { permissions: { zalo_settings: true } });
    expect(await assignedIdsOf(employee.id)).toEqual([]);
  });
});

describe('quét QR bởi nhân viên (upsertQrLoggedInAccount, không mở phiên Zalo thật)', () => {
  const identity = (over = {}) => ({ zaloUserId: 'zu-new-1', displayName: 'Tài khoản Zalo', zaloName: 'NV', zaloPhone: '0900000001', cookieText: '[]', ...over });

  it('nhân viên tạo hàng MỚI → có hàng source=self_login, created_by = nhân viên, user_members.updated_at được bump', async () => {
    const { owner, employee } = await setupWorkspace();
    const rev0 = (await db.query(`SELECT updated_at FROM user_members WHERE employee_id = $1`, [employee.id])).rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 20));

    const account = await zaloSettingsController.upsertQrLoggedInAccount(owner.id, identity(), 'user', { employeeActorUserId: employee.id });

    const { rows } = await db.query(`SELECT source, created_by FROM member_channel_accounts WHERE employee_id = $1 AND account_ref = $2`, [employee.id, String(account.id)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('self_login');
    expect(Number(rows[0].created_by)).toBe(Number(employee.id));
    const rev1 = (await db.query(`SELECT updated_at FROM user_members WHERE employee_id = $1`, [employee.id])).rows[0].updated_at;
    expect(new Date(rev1).getTime()).toBeGreaterThan(new Date(rev0).getTime());
    // Hàng zalo_settings vẫn thuộc chủ.
    expect(Number((await db.query(`SELECT id_user FROM zalo_settings WHERE id = $1`, [account.id])).rows[0].id_user)).toBe(Number(owner.id));
  });

  it('tên hiển thị TRÙNG hàng của chủ ("Tài khoản Zalo"): nhân viên KHÔNG ghi đè hàng của chủ, mà tạo hàng mới', async () => {
    const { owner, employee } = await setupWorkspace();
    const ownerRow = await createZalo(owner.id, { name: 'Tài khoản Zalo', zaloUserId: 'owner-zu' });

    const account = await zaloSettingsController.upsertQrLoggedInAccount(owner.id, identity({ zaloUserId: 'emp-zu' }), 'user', { employeeActorUserId: employee.id });

    expect(account.id).not.toBe(ownerRow);
    const { rows } = await db.query(`SELECT zalo_user_id, status FROM zalo_settings WHERE id = $1`, [ownerRow]);
    expect(rows[0].zalo_user_id).toBe('owner-zu');
    expect(rows[0].status).toBe('disconnected');
    expect(await assignedIdsOf(employee.id)).toEqual([Number(account.id)]);
  });

  it('nhân viên quét lại tài khoản ĐÃ CÓ (cùng zalo_user_id) → cập nhật, KHÔNG tự cấp quyền', async () => {
    const { owner, employee } = await setupWorkspace();
    const existing = await createZalo(owner.id, { name: 'Cua chu', zaloUserId: 'zu-existing' });

    const account = await zaloSettingsController.upsertQrLoggedInAccount(owner.id, identity({ zaloUserId: 'zu-existing' }), 'user', { employeeActorUserId: employee.id });

    expect(Number(account.id)).toBe(existing);
    expect(await assignedIdsOf(employee.id)).toEqual([]);
  });

  it('CHỦ quét tài khoản mới → tạo hàng, KHÔNG chèn việc giao nào; chủ vẫn thấy hết', async () => {
    const { owner, ownerToken } = await setupWorkspace();
    await zaloSettingsController.upsertQrLoggedInAccount(owner.id, identity({ zaloUserId: 'owner-new' }), 'user', {});
    const { rows } = await db.query(`SELECT 1 FROM member_channel_accounts`);
    expect(rows).toHaveLength(0);
    const own = await asOwner(request(app).get('/api/zalo/accounts'), ownerToken);
    expect(own.body.data.items).toHaveLength(4);
  });
});
