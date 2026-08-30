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
import { truncateAll, createUser, createPlan, assignPlanToUser, createOrder, createVerificationCode } from './helpers/db.js';

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
    await createUser({ role: 'user', username: 'no_plan', withPlan: false });

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
    const expiredNoPlan = await createUser({ role: 'user', username: 'expired_no_plan', withPlan: false });
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

describe('PATCH /api/admin/members/:id/detach-email — Mức 1 (P1-6)', () => {
  it('giải phóng email/username, status=deleted, thu hồi refresh token', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const target = await createUser({ role: 'user', username: 'stuck_user', email: 'stuck@test.local' });
    const targetToken = await loginAs(target); // tạo refresh token còn sống cho target

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${target.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'stuck@test.local' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('stuck@test.local');

    const { rows } = await db.query(
      'SELECT email, username, status FROM users WHERE id = $1',
      [target.id]
    );
    expect(rows[0].email).toBe(`freed+${target.id}@deleted.local`);
    expect(rows[0].username).toBe(`stuck_user_freed_${target.id}`);
    expect(rows[0].status).toBe('deleted');

    // Refresh token của target phải bị thu hồi
    const tokenRow = await db.query(
      `SELECT is_revoked FROM refresh_tokens WHERE id_user = $1`,
      [target.id]
    );
    expect(tokenRow.rows.every((r) => r.is_revoked)).toBe(true);
    void targetToken; // chỉ cần token được tạo ra trong DB, không dùng lại giá trị

    // Không đụng đơn hàng/dữ liệu khác — chỉ verify không lỗi khi chưa có gì để giữ
  });

  it('confirmEmail không khớp → 400, không đổi gì', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const target = await createUser({ role: 'user', username: 'target', email: 'real@test.local' });

    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${target.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'wrong@test.local' });

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT email FROM users WHERE id = $1', [target.id]);
    expect(rows[0].email).toBe('real@test.local');
  });

  it('tự gỡ email chính mình → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa', email: 'sa@test.local' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${admin.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'sa@test.local' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('chính');
  });

  it('gỡ email của Super Admin khác → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const otherAdmin = await createUser({ role: 'admin', username: 'sa2', email: 'sa2@test.local' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch(`/api/admin/members/${otherAdmin.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'sa2@test.local' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Super Admin');
  });

  it('gỡ email 2 lần liên tiếp → lần 2 báo 400 "đã được gỡ trước đó"', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const target = await createUser({ role: 'user', username: 'target', email: 'twice@test.local' });
    const token = await loginAs(admin);

    const first = await request(app)
      .patch(`/api/admin/members/${target.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'twice@test.local' });
    expect(first.status).toBe(200);

    const freedEmail = `freed+${target.id}@deleted.local`;
    const second = await request(app)
      .patch(`/api/admin/members/${target.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: freedEmail });
    expect(second.status).toBe(400);
    expect(second.body.message).toContain('trước đó');
  });

  it('404 khi không tìm thấy', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const token = await loginAs(admin);
    const res = await request(app)
      .patch('/api/admin/members/999999/detach-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'x@x.com' });
    expect(res.status).toBe(404);
  });

  it('403 khi caller không phải admin', async () => {
    const target = await createUser({ role: 'user', username: 'target', email: 't@test.local' });
    const regular = await createUser({ role: 'user', username: 'caller' });
    const callerToken = await loginAs(regular);
    const res = await request(app)
      .patch(`/api/admin/members/${target.id}/detach-email`)
      .set('Authorization', `Bearer ${callerToken}`)
      .send({ confirmEmail: 't@test.local' });
    expect(res.status).toBe(403);
  });

  it('BẰNG CHỨNG TÍNH NĂNG HOẠT ĐỘNG: sau khi gỡ email, đăng ký lại đúng email gốc → user mới không bị lịch sử trial của user cũ chặn', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const original = await createUser({ role: 'user', username: 'stuck_google', email: 'canfree@test.local' });
    const trialPlan = await createPlan({ code: 'trial', name: 'Dùng thử', price: 0, durationDays: 14 });
    const paidPlan = await createPlan({ code: 'pro', name: 'Chuyên nghiệp', price: 100000 });

    // Tạo đơn dùng thử và đơn trả tiền thành công cho tài khoản cũ
    const trialOrder = await createOrder({ planId: trialPlan.id, userId: original.id, userEmail: original.email, status: 'success' });
    const paidOrder = await createOrder({ planId: paidPlan.id, userId: original.id, userEmail: original.email, status: 'success' });

    const token = await loginAs(admin);

    // Ca A: releaseTrialHistory = false -> đơn trial vẫn thuộc user cũ qua user_id.
    // Email tái sử dụng phải được xem là tài khoản mới, không bị lịch sử cũ chặn.
    const originalA = await createUser({ role: 'user', username: 'stuck_a', email: 'no_release@test.local' });
    await createOrder({ planId: trialPlan.id, userId: originalA.id, userEmail: originalA.email, status: 'success' });

    const detachResA = await request(app)
      .patch(`/api/admin/members/${originalA.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'no_release@test.local', releaseTrialHistory: false });
    expect(detachResA.status).toBe(200);

    await createVerificationCode({ email: 'no_release@test.local', code: '123456' });
    const registerResA = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'noreleasenew',
        email: 'no_release@test.local',
        password: 'Passw0rd123',
        emailVerificationCode: '123456',
      });
    expect(registerResA.status).toBe(201);
    expect(registerResA.body.data.user.email).toBe('no_release@test.local');
    expect(registerResA.body.data.user.id).not.toBe(originalA.id);
    expect(registerResA.body.data.trial).not.toBeNull();
    expect(registerResA.body.data.trial.planCode).toBe('trial');

    // Ca B: releaseTrialHistory = true -> gỡ email và ẩn danh đơn trial -> đăng ký lại được cấp trial
    const detachResB = await request(app)
      .patch(`/api/admin/members/${original.id}/detach-email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'canfree@test.local', releaseTrialHistory: true });
    expect(detachResB.status).toBe(200);

    // Kiểm tra đơn trial đã được đổi email sang freed+<id>@deleted.local
    const { rows: trialRows } = await db.query('SELECT user_email FROM orders WHERE id = $1', [trialOrder.id]);
    expect(trialRows[0].user_email).toBe(`freed+${original.id}@deleted.local`);

    // Kiểm tra đơn trả tiền KHÔNG bị đổi email
    const { rows: paidRows } = await db.query('SELECT user_email FROM orders WHERE id = $1', [paidOrder.id]);
    expect(paidRows[0].user_email).toBe(original.email);

    // Đăng ký lại đúng email gốc canfree@test.local -> thành công và được cấp trial
    await createVerificationCode({ email: 'canfree@test.local', code: '123456' });
    const registerResB = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'canfreenew',
        email: 'canfree@test.local',
        password: 'Passw0rd123',
        emailVerificationCode: '123456',
      });

    expect(registerResB.status).toBe(201);
    expect(registerResB.body.data.user.email).toBe('canfree@test.local');
    expect(registerResB.body.data.user.id).not.toBe(original.id);
    expect(registerResB.body.data.trial).not.toBeNull();
    expect(registerResB.body.data.trial.planCode).toBe('trial');
  });
});

describe('DELETE /api/admin/members/:id/purge — Mức 2 (P1-6)', () => {
  it('tài khoản sạch (không đơn hàng/marketplace) → xoá cứng thành công', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const target = await createUser({ role: 'user', username: 'clean_user', email: 'clean@test.local', withPlan: false });

    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/members/${target.id}/purge`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'clean@test.local' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('clean@test.local');

    const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [target.id]);
    expect(rows).toHaveLength(0);
  });

  it('có đơn hàng thành công → 409, KHÔNG xoá', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pro', price: 100000 });
    const target = await createUser({ role: 'user', username: 'paying_user', email: 'paying@test.local' });
    await createOrder({ planId: plan.id, userId: target.id, userEmail: target.email, status: 'success' });

    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/members/${target.id}/purge`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'paying@test.local' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('đơn hàng');
    expect(res.body.message).toContain('Gỡ email');

    const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [target.id]);
    expect(rows).toHaveLength(1);
  });

  it('có dữ liệu marketplace (đã bán) → 409, KHÔNG xoá', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const target = await createUser({ role: 'user', username: 'seller_user', email: 'seller@test.local', withPlan: false });
    await db.query(
      `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, snapshot_data)
       VALUES ($1, 'chatbot', 1, 'My bot', '{}'::jsonb)`,
      [target.id]
    );

    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/members/${target.id}/purge`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'seller@test.local' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('marketplace');

    const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [target.id]);
    expect(rows).toHaveLength(1);
  });

  it('confirmEmail không khớp → 400, không xoá', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const target = await createUser({ role: 'user', username: 'target', email: 'real2@test.local', withPlan: false });

    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/members/${target.id}/purge`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'wrong@test.local' });

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [target.id]);
    expect(rows).toHaveLength(1);
  });

  it('tự xoá chính mình → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa', email: 'sa3@test.local' });
    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/members/${admin.id}/purge`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'sa3@test.local' });
    expect(res.status).toBe(400);
  });

  it('xoá Super Admin khác → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const otherAdmin = await createUser({ role: 'admin', username: 'sa4', email: 'sa4@test.local' });
    const token = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/admin/members/${otherAdmin.id}/purge`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'sa4@test.local' });
    expect(res.status).toBe(400);
  });

  it('404 khi không tìm thấy', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const token = await loginAs(admin);
    const res = await request(app)
      .delete('/api/admin/members/999999/purge')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmEmail: 'x@x.com' });
    expect(res.status).toBe(404);
  });

  it('403 khi caller không phải admin', async () => {
    const target = await createUser({ role: 'user', username: 'target', email: 't2@test.local', withPlan: false });
    const regular = await createUser({ role: 'user', username: 'caller' });
    const callerToken = await loginAs(regular);
    const res = await request(app)
      .delete(`/api/admin/members/${target.id}/purge`)
      .set('Authorization', `Bearer ${callerToken}`)
      .send({ confirmEmail: 't2@test.local' });
    expect(res.status).toBe(403);
  });
});
