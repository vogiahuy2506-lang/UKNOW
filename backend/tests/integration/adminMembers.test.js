/**
 * Integration tests cho `/api/admin/members` — quản lý user_admin (role 'user').
 *
 * Phạm vi:
 *   - Authorization: chỉ role 'admin' (super_admin) mới truy cập được.
 *   - GET / — list + filters (search, planId=none/custom/<id>, status, expiry=expiring/expired).
 *   - PATCH /:id/status — toggle active ↔ inactive, chỉ áp dụng cho role='user'.
 *   - PATCH /:id/promote — nâng role 'user' → 'admin'.
 *   - Lỗi 404 khi id không tồn tại.
 *   - Lỗi 400 khi promote tài khoản không phải 'user' (employee/admin).
 *
 * Không cover:
 *   - employeeCount join phức tạp (chỉ assert đếm đúng cho 1 case).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

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
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

/**
 * Set `subscription_expires_at` cho user. Dùng để test filter expiring/expired.
 *
 * @param {number} userId
 * @param {Date|null} date
 */
async function setSubscriptionExpiry(userId, date) {
  await db.query(`UPDATE users SET subscription_expires_at = $1 WHERE id = $2`, [date, userId]);
}

describe('Authorization — /api/admin/members', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/admin/members');
    expect(res.status).toBe(401);
  });

  it('role=user → 403', async () => {
    const user = await createUser({ role: 'user', username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/admin/members')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('role=employee → 403', async () => {
    const emp = await createUser({ role: 'employee', username: 'emp1' });
    const token = await loginAs(emp);
    const res = await request(app)
      .get('/api/admin/members')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('role=admin → 200', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/admin/members — listing', () => {
  it('chỉ trả về user role=user (không gồm admin/employee)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    await createUser({ role: 'user', username: 'cust1', email: 'cust1@test.local' });
    await createUser({ role: 'user', username: 'cust2', email: 'cust2@test.local' });
    await createUser({ role: 'employee', username: 'emp1', email: 'emp1@test.local' });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const usernames = res.body.data.map((m) => m.username).sort();
    expect(usernames).toEqual(['cust1', 'cust2']);
  });

  it('search lọc theo email/username/fullName (ILIKE, case-insensitive)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    await createUser({ role: 'user', username: 'alice', email: 'alice@example.com', fullName: 'Alice A' });
    await createUser({ role: 'user', username: 'bob', email: 'bob@other.com', fullName: 'Robert B' });

    const token = await loginAs(admin);

    const byEmail = await request(app)
      .get('/api/admin/members?search=alice@')
      .set('Authorization', `Bearer ${token}`);
    expect(byEmail.body.data.map((m) => m.username)).toEqual(['alice']);

    const byFullName = await request(app)
      .get('/api/admin/members?search=robert')
      .set('Authorization', `Bearer ${token}`);
    expect(byFullName.body.data.map((m) => m.username)).toEqual(['bob']);
  });

  it('planId=none → chỉ user không có plan', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'basic' });
    const u1 = await createUser({ role: 'user', username: 'has_plan' });
    await assignPlanToUser(u1.id, plan.id);
    await createUser({ role: 'user', username: 'no_plan' });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members?planId=none')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.map((m) => m.username)).toEqual(['no_plan']);
  });

  it('planId=custom → chỉ user dùng plan is_custom=true', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const stdPlan = await createPlan({ code: 'std', isCustom: false });
    const customPlan = await createPlan({ code: 'cust1', isCustom: true });
    const stdUser = await createUser({ role: 'user', username: 'std_user' });
    const customUser = await createUser({ role: 'user', username: 'custom_user' });
    await assignPlanToUser(stdUser.id, stdPlan.id);
    await assignPlanToUser(customUser.id, customPlan.id);

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members?planId=custom')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.map((m) => m.username)).toEqual(['custom_user']);
  });

  it('planId=<id cụ thể> → chỉ user thuộc plan đó', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const pA = await createPlan({ code: 'A' });
    const pB = await createPlan({ code: 'B' });
    const uA = await createUser({ role: 'user', username: 'on_A' });
    const uB = await createUser({ role: 'user', username: 'on_B' });
    await assignPlanToUser(uA.id, pA.id);
    await assignPlanToUser(uB.id, pB.id);

    const token = await loginAs(admin);
    const res = await request(app)
      .get(`/api/admin/members?planId=${pB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].username).toBe('on_B');
    expect(res.body.data[0].planCode).toBe('B');
  });

  it('status=active/inactive lọc đúng', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    await createUser({ role: 'user', username: 'active_u', status: 'active' });
    await createUser({ role: 'user', username: 'inactive_u', status: 'inactive' });

    const token = await loginAs(admin);
    const resActive = await request(app)
      .get('/api/admin/members?status=active')
      .set('Authorization', `Bearer ${token}`);
    expect(resActive.body.data.map((m) => m.username)).toEqual(['active_u']);

    const resInactive = await request(app)
      .get('/api/admin/members?status=inactive')
      .set('Authorization', `Bearer ${token}`);
    expect(resInactive.body.data.map((m) => m.username)).toEqual(['inactive_u']);
  });

  it('expiry=expiring → chỉ user còn hạn ≤ 7 ngày', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const inExpiring = await createUser({ role: 'user', username: 'soon_expire' });
    const safe = await createUser({ role: 'user', username: 'long_far' });
    const expired = await createUser({ role: 'user', username: 'already_expired' });
    await setSubscriptionExpiry(inExpiring.id, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    await setSubscriptionExpiry(safe.id, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    await setSubscriptionExpiry(expired.id, new Date(Date.now() - 24 * 60 * 60 * 1000));

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members?expiry=expiring')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.map((m) => m.username)).toEqual(['soon_expire']);
  });

  it('expiry=expired → chỉ user đã hết hạn VÀ không còn plan', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'basic' });
    const expiredNoPlan = await createUser({ role: 'user', username: 'expired_no_plan' });
    const expiredWithPlan = await createUser({ role: 'user', username: 'expired_with_plan' });
    const stillValid = await createUser({ role: 'user', username: 'still_ok' });

    await setSubscriptionExpiry(expiredNoPlan.id, new Date(Date.now() - 24 * 60 * 60 * 1000));
    await setSubscriptionExpiry(expiredWithPlan.id, new Date(Date.now() - 24 * 60 * 60 * 1000));
    await assignPlanToUser(expiredWithPlan.id, plan.id);
    await setSubscriptionExpiry(stillValid.id, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members?expiry=expired')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.map((m) => m.username)).toEqual(['expired_no_plan']);
  });

  it('trả về planName/planCode khi user có plan', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pro', name: 'Pro Plan' });
    const u = await createUser({ role: 'user', username: 'paid' });
    await assignPlanToUser(u.id, plan.id);

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members')
      .set('Authorization', `Bearer ${token}`);

    const found = res.body.data.find((m) => m.username === 'paid');
    expect(found.planCode).toBe('pro');
    expect(found.planName).toBe('Pro Plan');
  });

  it('employeeCount đếm đúng số user_members thuộc owner', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const owner = await createUser({ role: 'user', username: 'owner_with_team' });
    const e1 = await createUser({ role: 'employee', username: 'emp_x' });
    const e2 = await createUser({ role: 'employee', username: 'emp_y' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status) VALUES ($1, $2, 'active'), ($1, $3, 'active')`,
      [owner.id, e1.id, e2.id]
    );

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members')
      .set('Authorization', `Bearer ${token}`);

    const found = res.body.data.find((m) => m.username === 'owner_with_team');
    expect(Number(found.employeeCount)).toBe(2);
  });
});

describe('PATCH /api/admin/members/:id/status — toggle status', () => {
  it('active → inactive', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const u = await createUser({ role: 'user', username: 'target', status: 'active' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${u.id}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');

    const { rows } = await db.query('SELECT status FROM users WHERE id = $1', [u.id]);
    expect(rows[0].status).toBe('inactive');
  });

  it('inactive → active (toggle 2 lần)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const u = await createUser({ role: 'user', username: 'target', status: 'inactive' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${u.id}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('id không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/members/999999/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('id không phải số → 400 (validator)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/members/abc/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('toggle status trên admin/employee → không update (repo có WHERE role=user), trả về 200 nhưng data null', async () => {
    // Note: hiện service không guard role trước khi update, repo dùng WHERE role='user'.
    // Trường hợp này findMemberById trả về member (vì không lọc role) nhưng setMemberStatus
    // không cập nhật được → trả null. Hành vi này bộc lộ một edge case đáng để biết.
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const otherAdmin = await createUser({ role: 'admin', username: 'sa2' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${otherAdmin.id}/status`)
      .set('Authorization', `Bearer ${token}`);

    // Service không throw; trả 200 nhưng data === null vì UPDATE...WHERE role='user' không match.
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();

    // DB không đổi
    const { rows } = await db.query('SELECT status FROM users WHERE id = $1', [otherAdmin.id]);
    expect(rows[0].status).toBe('active');
  });
});

describe('PATCH /api/admin/members/:id/promote — promote to super_admin', () => {
  it('user → admin (role thay đổi trong DB)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const u = await createUser({ role: 'user', username: 'rising_star', email: 'rs@test.local' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${u.id}/promote`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.message).toContain('rs@test.local');

    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [u.id]);
    expect(rows[0].role).toBe('admin');
  });

  it('id không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/members/999999/promote')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('promote một admin → 400 (không phải user)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const otherAdmin = await createUser({ role: 'admin', username: 'sa2' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${otherAdmin.id}/promote`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('không phải');
  });

  it('promote một employee → 400 (không phải user)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const emp = await createUser({ role: 'employee', username: 'emp_lift' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${emp.id}/promote`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/members/:id/demote — demote super_admin to user', () => {
  it('admin → user thành công (verify DB role=user)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const target = await createUser({ role: 'admin', username: 'sa2', email: 'sa2@test.local' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${target.id}/demote`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('user');
    expect(res.body.message).toContain('sa2@test.local');

    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [target.id]);
    expect(rows[0].role).toBe('user');
  });

  it('400 khi target không phải admin (role=user)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const user = await createUser({ role: 'user', username: 'regular' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${user.id}/demote`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('super admin');
  });

  it('400 khi tự hạ chính mình', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${admin.id}/demote`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('chính mình');
  });

  it('400 khi chỉ còn 1 admin (guardrail admin cuối cùng)', async () => {
    const soleAdmin = await createUser({ role: 'admin', username: 'sole' });
    const { demoteFromSuperAdmin } = await import('../../src/services/admin/adminMembers.service.js');

    await expect(
      demoteFromSuperAdmin(soleAdmin.id, 999999)
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('cuối cùng'),
    });
  });

  it('403 khi caller không phải admin', async () => {
    const target = await createUser({ role: 'admin', username: 'sa2' });
    const regular = await createUser({ role: 'user', username: 'caller' });
    const callerToken = await loginAs(regular);
    const res = await request(app)
      .patch(`/api/admin/members/${target.id}/demote`)
      .set('Authorization', `Bearer ${callerToken}`);
    expect(res.status).toBe(403);
  });

  it('404 khi không tìm thấy', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/members/999999/demote')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/members?role=admin — admin listing', () => {
  it('role=admin trả về đúng danh sách admin', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    await createUser({ role: 'admin', username: 'sa2', email: 'sa2@test.local' });
    await createUser({ role: 'user', username: 'cust1', email: 'cust1@test.local' });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/members?role=admin')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    const usernames = res.body.data.map((m) => m.username).sort();
    expect(usernames).toContain('sa');
    expect(usernames).toContain('sa2');
    expect(usernames).not.toContain('cust1');
  });
});
