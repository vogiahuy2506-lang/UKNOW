/**
 * Integration tests cho `/api/employees`.
 *
 * Module này vừa được refactor (multi-context: user/owner) nên ưu tiên cover:
 *   - Authorization layer (token, role, plan).
 *   - Tenant isolation (owner A không thấy/sửa employee của owner B).
 *   - Side effects DB:
 *       * Tạo employee mới: users + user_members.
 *       * Reset password: bcrypt hash trong users.password_hash.
 *       * Delete: nếu pending_activation thì xóa user, active thì giữ.
 *       * Resend invite: verification_codes có row mới.
 *   - Quota / EMPLOYEE_LIMIT_REACHED dựa vào plan.max_employees.
 *
 * Email gửi qua `sendSystemEmail` sẽ no-op khi không có SENDGRID_API_KEY (test env)
 * nên không cần mock SMTP.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import {
  truncateAll,
  createUser,
  createPlan,
  assignPlanToUser,
} from './helpers/db.js';
import { DEFAULT_EMPLOYEE_PASSWORD } from '../../src/services/user/employee.service.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

/**
 * Đăng nhập helper — trả về accessToken Bearer.
 * `createUser` trả về object có `plainPassword` (mặc định "Passw0rd!").
 */
async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login thất bại cho ${user.username}: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

/**
 * Helper insert quan hệ owner ↔ employee trực tiếp vào DB,
 * skip flow tạo qua API (vì các test bên dưới muốn arrange nhanh).
 */
async function addMembership(ownerId, employeeId, overrides = {}) {
  const {
    status = 'active',
    permissions = {},
    dailyEmailLimit = null,
    monthlyEmailLimit = null,
    dailyZaloLimit = null,
    monthlyZaloLimit = null,
  } = overrides;
  await db.query(
    `INSERT INTO user_members
       (owner_id, employee_id, permissions, status,
        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
        created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [
      ownerId,
      employeeId,
      JSON.stringify(permissions),
      status,
      dailyEmailLimit,
      monthlyEmailLimit,
      dailyZaloLimit,
      monthlyZaloLimit,
    ]
  );
}

/** Tạo owner có plan + active token sẵn — case dùng đi dùng lại. */
async function setupOwnerWithPlan({ maxEmployees = 5 } = {}) {
  const plan = await createPlan({ maxEmployees });
  const owner = await createUser({ username: 'owner', role: 'user' });
  await assignPlanToUser(owner.id, plan.id);
  const token = await loginAs(owner);
  return { owner, plan, token };
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------
describe('Authorization layer', () => {
  it('không có token → 401', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });

  it('role = employee (không phải admin/user) → 403', async () => {
    const employee = await createUser({ username: 'emp1', role: 'employee' });
    const token = await loginAs(employee);
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('user_admin không có plan vẫn list được (chỉ create mới cần plan)', async () => {
    const owner = await createUser({ username: 'noplan', role: 'user' });
    const token = await loginAs(owner);
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('super_admin gọi GET / không kèm ?ownerId → 400 "Thiếu ownerId"', async () => {
    const admin = await createUser({ username: 'super', role: 'admin' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ownerId/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/employees
// ---------------------------------------------------------------------------
describe('GET /api/employees', () => {
  it('trả về danh sách employee của owner hiện tại', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const e1 = await createUser({ username: 'alice', role: 'user' });
    const e2 = await createUser({ username: 'bob',   role: 'user' });
    await addMembership(owner.id, e1.id);
    await addMembership(owner.id, e2.id, { permissions: { campaigns_view: true } });

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    const usernames = res.body.data.map((e) => e.username).sort();
    expect(usernames).toEqual(['alice', 'bob']);
  });

  it('không trả về employee của owner khác (tenant isolation)', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const otherOwner = await createUser({ username: 'owner2', role: 'user' });
    const otherEmp = await createUser({ username: 'other-emp', role: 'user' });
    await addMembership(otherOwner.id, otherEmp.id);

    const myEmp = await createUser({ username: 'mine', role: 'user' });
    await addMembership(owner.id, myEmp.id);

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].username).toBe('mine');
  });

  it('super_admin với ?ownerId=X xem được employees của X', async () => {
    const admin = await createUser({ username: 'super', role: 'admin' });
    const adminToken = await loginAs(admin);

    const targetOwner = await createUser({ username: 'target', role: 'user' });
    const emp = await createUser({ username: 'staff', role: 'user' });
    await addMembership(targetOwner.id, emp.id);

    const res = await request(app)
      .get(`/api/employees?ownerId=${targetOwner.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].username).toBe('staff');
  });
});

// ---------------------------------------------------------------------------
// GET /api/employees/:id
// ---------------------------------------------------------------------------
describe('GET /api/employees/:id', () => {
  it('lấy được chi tiết employee thuộc owner', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'detail', role: 'user', fullName: 'Detail Person' });
    await addMembership(owner.id, emp.id, {
      permissions: { campaigns_view: true },
      dailyEmailLimit: 100,
    });

    const res = await request(app)
      .get(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('detail');
    expect(res.body.data.fullName).toBe('Detail Person');
    expect(res.body.data.dailyEmailLimit).toBe(100);
    expect(res.body.data.permissions).toEqual({ campaigns_view: true });
  });

  it('employee của owner khác → 404 (tenant isolation, không leak existence)', async () => {
    const { token } = await setupOwnerWithPlan();
    const otherOwner = await createUser({ username: 'other', role: 'user' });
    const otherEmp = await createUser({ username: 'foreign', role: 'user' });
    await addMembership(otherOwner.id, otherEmp.id);

    const res = await request(app)
      .get(`/api/employees/${otherEmp.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('id không hợp lệ (string) → 400 validator', async () => {
    const { token } = await setupOwnerWithPlan();
    const res = await request(app)
      .get('/api/employees/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/employees
// ---------------------------------------------------------------------------
describe('POST /api/employees', () => {
  it('owner không có plan → 403 NO_ACTIVE_PLAN (chặn bởi requireActivePlan)', async () => {
    const owner = await createUser({ username: 'noplan', role: 'user' });
    const token = await loginAs(owner);

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newemp', email: 'newemp@test.local' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NO_ACTIVE_PLAN');
  });

  it('owner có plan + còn quota → 201 + user.pending_activation + user_members ghi đúng', async () => {
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 5 });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newemp01', email: 'newemp@test.local', fullName: 'Em Mới' });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('newemp@test.local');

    const u = await db.query(`SELECT status, role FROM users WHERE email = $1`, ['newemp@test.local']);
    expect(u.rows[0].status).toBe('pending_activation');
    expect(u.rows[0].role).toBe('user');

    const m = await db.query(
      `SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id =
         (SELECT id FROM users WHERE email = $2)`,
      [owner.id, 'newemp@test.local']
    );
    expect(m.rows).toHaveLength(1);

    // sendEmployeeInvitation tạo verification_code (sendSystemEmail no-op vì không có SENDGRID_API_KEY)
    const vc = await db.query(
      `SELECT 1 FROM verification_codes WHERE email = $1 AND type = 'employee_invitation'`,
      ['newemp@test.local']
    );
    expect(vc.rows).toHaveLength(1);
  });

  it('đạt quota max_employees → 403 EMPLOYEE_LIMIT_REACHED', async () => {
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 2 });
    const e1 = await createUser({ username: 'e1', role: 'user' });
    const e2 = await createUser({ username: 'e2', role: 'user' });
    await addMembership(owner.id, e1.id, { status: 'active' });
    await addMembership(owner.id, e2.id, { status: 'active' });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'overflow', email: 'overflow@test.local' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_LIMIT_REACHED');
  });

  it('plan max_employees = -1 → unlimited', async () => {
    const plan = await createPlan({ maxEmployees: -1 });
    const owner = await createUser({ username: 'unl', role: 'user' });
    await assignPlanToUser(owner.id, plan.id);
    const token = await loginAs(owner);

    // Đã có 3 employees nhưng vẫn add được
    for (let i = 0; i < 3; i++) {
      const e = await createUser({ username: `e${i}`, role: 'user' });
      await addMembership(owner.id, e.id);
    }

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'extra', email: 'extra@test.local' });

    expect(res.status).toBe(201);
  });

  it('email đã tồn tại → 400', async () => {
    const { token } = await setupOwnerWithPlan();
    await createUser({ username: 'taken', email: 'taken@test.local', role: 'user' });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newone', email: 'taken@test.local' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('username chứa ký tự không hợp lệ → 400 (validator)', async () => {
    const { token } = await setupOwnerWithPlan();
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'invalid name!', email: 'ok@test.local' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/employees/link
// ---------------------------------------------------------------------------
describe('POST /api/employees/link', () => {
  it('link tài khoản có sẵn → 201, user_members tạo, KHÔNG đổi role user', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const target = await createUser({ username: 'existing', email: 'existing@test.local', role: 'user' });

    const res = await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'existing@test.local' });

    expect(res.status).toBe(201);

    const m = await db.query(
      `SELECT status FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, target.id]
    );
    expect(m.rows[0].status).toBe('active');

    const u = await db.query(`SELECT role FROM users WHERE id = $1`, [target.id]);
    expect(u.rows[0].role).toBe('user');
  });

  it('email không tồn tại → 404', async () => {
    const { token } = await setupOwnerWithPlan();
    const res = await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'ghost@test.local' });
    expect(res.status).toBe(404);
  });

  it('owner tự link chính mình → 400', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const res = await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: owner.email });
    expect(res.status).toBe(400);
  });

  it('link lại employee đang inactive → upsert thành active (ON CONFLICT)', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const target = await createUser({ username: 'rejoin', email: 'rejoin@test.local', role: 'user' });
    await addMembership(owner.id, target.id, { status: 'inactive' });

    const res = await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'rejoin@test.local' });

    expect(res.status).toBe(201);
    const m = await db.query(
      `SELECT status FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, target.id]
    );
    expect(m.rows[0].status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/employees/:id  (info)
// ---------------------------------------------------------------------------
describe('PATCH /api/employees/:id (info)', () => {
  it('update fullName + email → DB cập nhật', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'before', email: 'before@test.local', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Updated Name', email: 'after@test.local' });

    expect(res.status).toBe(200);
    const u = await db.query(`SELECT email, full_name FROM users WHERE id = $1`, [emp.id]);
    expect(u.rows[0].email).toBe('after@test.local');
    expect(u.rows[0].full_name).toBe('Updated Name');
  });

  it('email mới trùng email user khác → 400', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'me', email: 'me@test.local', role: 'user' });
    await addMembership(owner.id, emp.id);
    await createUser({ username: 'someone', email: 'taken@test.local', role: 'user' });

    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@test.local' });

    expect(res.status).toBe(400);
  });

  it('owner khác cố sửa employee không thuộc team → 404', async () => {
    const { token } = await setupOwnerWithPlan();
    const otherOwner = await createUser({ username: 'oo', role: 'user' });
    const foreign = await createUser({ username: 'foreign', role: 'user' });
    await addMembership(otherOwner.id, foreign.id);

    const res = await request(app)
      .patch(`/api/employees/${foreign.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Hack' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/employees/:id/permissions
// ---------------------------------------------------------------------------
describe('PATCH /api/employees/:id/permissions', () => {
  it('set campaigns_create=true → tự động campaigns_view=true', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'perm', role: 'user' });
    await addMembership(owner.id, emp.id, { permissions: {} });

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: { campaigns_create: true } });

    expect(res.status).toBe(200);
    expect(res.body.data.permissions.campaigns_create).toBe(true);
    expect(res.body.data.permissions.campaigns_view).toBe(true);
  });

  it('chỉ giữ lại keys hợp lệ (loại bỏ key lạ)', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'sani', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        permissions: {
          courses: true,
          random_unknown_key: true,
          campaigns_run: true,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toHaveProperty('courses', true);
    expect(res.body.data.permissions).toHaveProperty('campaigns_run', true);
    expect(res.body.data.permissions).not.toHaveProperty('random_unknown_key');
  });

  it('permissions không phải object → 400 (validator)', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'badperm', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: 'not-an-object' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/employees/:id/status
// ---------------------------------------------------------------------------
describe('PATCH /api/employees/:id/status', () => {
  it('active → inactive cập nhật vào user_members.status', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'tog', role: 'user' });
    await addMembership(owner.id, emp.id, { status: 'active' });

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    const m = await db.query(
      `SELECT status FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    expect(m.rows[0].status).toBe('inactive');
  });

  it('status không hợp lệ → 400', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'bs', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'frozen' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/employees/:id/limits
// ---------------------------------------------------------------------------
describe('PATCH /api/employees/:id/limits', () => {
  it('set các limit số nguyên ≥ 0 → 200 + DB lưu đúng', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'lim', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/limits`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dailyEmailLimit: 50,
        monthlyEmailLimit: 1000,
        dailyZaloLimit: 30,
        monthlyZaloLimit: 500,
      });

    expect(res.status).toBe(200);
    const m = await db.query(
      `SELECT daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit
       FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    expect(m.rows[0].daily_email_limit).toBe(50);
    expect(m.rows[0].monthly_email_limit).toBe(1000);
    expect(m.rows[0].daily_zalo_limit).toBe(30);
    expect(m.rows[0].monthly_zalo_limit).toBe(500);
  });

  it('null = unlimited → DB lưu NULL', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'unl', role: 'user' });
    await addMembership(owner.id, emp.id, { dailyEmailLimit: 10 });

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/limits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dailyEmailLimit: null });

    expect(res.status).toBe(200);
    const m = await db.query(
      `SELECT daily_email_limit FROM user_members
       WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    expect(m.rows[0].daily_email_limit).toBeNull();
  });

  it('giá trị âm → 400 (validator)', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'neg', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/limits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dailyEmailLimit: -5 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/employees/:id/reset-password
// ---------------------------------------------------------------------------
describe('PATCH /api/employees/:id/reset-password', () => {
  it('reset xong password_hash khớp với DEFAULT_EMPLOYEE_PASSWORD', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'reset', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const u = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [emp.id]);
    const ok = await bcrypt.compare(DEFAULT_EMPLOYEE_PASSWORD, u.rows[0].password_hash);
    expect(ok).toBe(true);
  });

  it('reset employee thuộc owner khác → 404 (không leak), password_hash không đổi', async () => {
    const { token } = await setupOwnerWithPlan();
    const otherOwner = await createUser({ username: 'oo', role: 'user' });
    const foreign = await createUser({ username: 'fp', role: 'user' });
    await addMembership(otherOwner.id, foreign.id);

    const before = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [foreign.id]);
    const res = await request(app)
      .patch(`/api/employees/${foreign.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    const after = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [foreign.id]);
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/employees/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/employees/:id', () => {
  it('xóa employee đang pending_activation → user row bị xóa khỏi users', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({
      username: 'pending',
      role: 'user',
      status: 'pending_activation',
      isVerified: false,
    });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .delete(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const u = await db.query(`SELECT 1 FROM users WHERE id = $1`, [emp.id]);
    expect(u.rows).toHaveLength(0);
  });

  it('xóa employee đang active → chỉ xóa user_members, users giữ nguyên', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'act', role: 'user', status: 'active' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .delete(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const u = await db.query(`SELECT status FROM users WHERE id = $1`, [emp.id]);
    expect(u.rows[0].status).toBe('active');
    const m = await db.query(
      `SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    expect(m.rows).toHaveLength(0);
  });

  it('xóa employee thuộc owner khác → 404, dữ liệu không đổi', async () => {
    const { token } = await setupOwnerWithPlan();
    const otherOwner = await createUser({ username: 'oo', role: 'user' });
    const foreign = await createUser({ username: 'foreign', role: 'user' });
    await addMembership(otherOwner.id, foreign.id);

    const res = await request(app)
      .delete(`/api/employees/${foreign.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    const m = await db.query(
      `SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [otherOwner.id, foreign.id]
    );
    expect(m.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/employees/:id/resend-invite
// ---------------------------------------------------------------------------
describe('POST /api/employees/:id/resend-invite', () => {
  it('employee pending_activation → 200 + verification_code mới', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({
      username: 'invite',
      email: 'invite@test.local',
      role: 'user',
      status: 'pending_activation',
      isVerified: false,
    });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .post(`/api/employees/${emp.id}/resend-invite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const vc = await db.query(
      `SELECT COUNT(*)::int AS n FROM verification_codes
       WHERE email = $1 AND type = 'employee_invitation'`,
      ['invite@test.local']
    );
    expect(vc.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('employee đã active → 400 ALREADY_ACTIVATED', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'already', role: 'user', status: 'active' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .post(`/api/employees/${emp.id}/resend-invite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ALREADY_ACTIVATED');
  });

  it('employee không tồn tại → 404', async () => {
    const { token } = await setupOwnerWithPlan();
    const res = await request(app)
      .post('/api/employees/9999999/resend-invite')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
