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
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

// Mời nhân viên có gửi mail. Không mock thì nodemailer mở socket thật →
// 'Unexpected socket close' → endpoint trả 500. Mock phải đăng ký TRƯỚC khi
// import app, nên phần import dưới đây dùng dynamic import.
const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<emp@test>' });
const mockTransport = () => ({ verify: jest.fn().mockResolvedValue(true), sendMail: mockSendMail });
jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: jest.fn(mockTransport) },
  createTransport: jest.fn(mockTransport),
}));

const bcrypt = (await import('bcryptjs')).default;
const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const {
  truncateAll,
  createUser,
  createPlan,
  assignPlanToUser,
} = await import('./helpers/db.js');

/** Chuỗi mật khẩu cố định cũ từng hardcode — không được xuất hiện trong reset. */
const LEGACY_HARDCODED_EMPLOYEE_PASSWORD = 'digiso@2026';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  // truncateAll() không đụng topup_pricing (bảng cấu hình, không phải dữ liệu người dùng) — một
  // test bật is_active=TRUE để kiểm canBuySlot sẽ làm lây sang test chạy sau nếu không trả lại.
  await db.query(`UPDATE topup_pricing SET unit_price = 50000, is_active = FALSE WHERE item_key = 'employees'`);
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
    // Mặc định 'created' = mô phỏng nhân viên do chủ tạo (đúng hình dạng các ca reset/info/delete bên dưới
    // mô tả). Ca cần "tài khoản có sẵn bị liên kết" truyền origin: 'linked' tường minh.
    origin = 'created',
    // Mặc định đã chấp nhận (migration 257 default NOW() cùng tinh thần) — ca cần mô phỏng "đang chờ
    // chấp nhận" (accept/decline, setEmployeeStatus chặn) truyền acceptedAt: null tường minh.
    acceptedAt = new Date(),
  } = overrides;
  await db.query(
    `INSERT INTO user_members
       (owner_id, employee_id, permissions, status,
        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
        origin, accepted_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
    [
      ownerId,
      employeeId,
      JSON.stringify(permissions),
      status,
      dailyEmailLimit,
      monthlyEmailLimit,
      dailyZaloLimit,
      monthlyZaloLimit,
      origin,
      acceptedAt,
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
    const owner = await createUser({ username: 'noplan', role: 'user', withPlan: false });
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
    const owner = await createUser({ username: 'noplan', role: 'user', withPlan: false });
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

  it('đạt quota max_employees, KHÔNG bán slot (mặc định) → 403 EMPLOYEE_LIMIT_REACHED, canBuySlot=false, câu cũ', async () => {
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
    expect(res.body.canBuySlot).toBe(false);
    expect(res.body.message).toBe('Gói của bạn chỉ cho phép tối đa 2 nhân viên. Vui lòng nâng cấp gói để thêm nhân viên.');
  });

  it('đạt quota max_employees, ĐANG bán slot → 403 kèm canBuySlot=true và giá đọc từ topup_pricing (không ghi cứng)', async () => {
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 2 });
    const e1 = await createUser({ username: 'e1b', role: 'user' });
    const e2 = await createUser({ username: 'e2b', role: 'user' });
    await addMembership(owner.id, e1.id, { status: 'active' });
    await addMembership(owner.id, e2.id, { status: 'active' });
    await db.query(`UPDATE topup_pricing SET unit_price = 75000, is_active = TRUE WHERE item_key = 'employees'`);

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'overflow2', email: 'overflow2@test.local' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_LIMIT_REACHED');
    expect(res.body.canBuySlot).toBe(true);
    expect(res.body.message).toBe('Bạn đã dùng hết 2 chỗ nhân viên. Mua thêm slot nhân viên (75.000đ/tháng) hoặc nâng cấp gói để thêm người.');
  });

  it('GET /employees trả thêm khối meta {used, max, topupSlots, lockedCount, canBuySlot}, KHÔNG đổi hình dạng data', async () => {
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 3 });
    const e1 = await createUser({ username: 'm1', role: 'user' });
    const e2 = await createUser({ username: 'm2', role: 'user' });
    await addMembership(owner.id, e1.id, { status: 'active' });
    await addMembership(owner.id, e2.id, { status: 'active' });
    const { rows: [membership2] } = await db.query(
      `SELECT id FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, e2.id]
    );
    // Khoá thẳng 1 người qua bảng khoá (giả lập slot vừa hết hạn) để kiểm lockedCount.
    await db.query(
      `INSERT INTO topup_locked_resources (user_id, resource_key, resource_id) VALUES ($1, 'employees', $2)`,
      [owner.id, membership2.id]
    );

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({
      used: 2,
      max: 3,
      topupSlots: 0,
      lockedCount: 1,
      canBuySlot: false,
    });
  });

  it('GET /employees: gói không giới hạn (max_employees=-1) → meta.max=null, canBuySlot LUÔN false dù đang bán', async () => {
    await db.query(`UPDATE topup_pricing SET is_active = TRUE WHERE item_key = 'employees'`);
    const plan = await createPlan({ maxEmployees: -1 });
    const owner = await createUser({ username: 'owner-unlimited', role: 'user' });
    await assignPlanToUser(owner.id, plan.id);
    const token = await loginAs(owner);

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.max).toBeNull();
    expect(res.body.meta.used).toBe(0);
    // Mua thêm slot không có ý nghĩa khi đã không giới hạn — dù mặt hàng đang bán, đừng gợi ý mua.
    expect(res.body.meta.canBuySlot).toBe(false);
  });

  it('nhân viên có tài khoản đã xoá mềm KHÔNG chiếm suất và KHÔNG hiện trong danh sách', async () => {
    // Production 21/09/2026: membership 33 → user 7 (status = 'deleted') vẫn bị đếm là 1/3 suất của tài
    // khoản 1, và hiện trong danh sách nhân viên dưới tên "…_freed_7" không thao tác được gì.
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 2 });
    const alive = await createUser({ username: 'alive', role: 'user' });
    const ghost = await createUser({ username: 'ghost', role: 'user' });
    await addMembership(owner.id, alive.id, { status: 'active' });
    await addMembership(owner.id, ghost.id, { status: 'active' });
    await db.query(`UPDATE users SET status = 'deleted', deleted_at = NOW() WHERE id = $1`, [ghost.id]);

    const list = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((e) => e.username)).toEqual(['alive']);

    // 2 suất: 1 người sống + 1 "ma" → vẫn còn 1 suất cho người mới.
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newcomer', email: 'newcomer@test.local' });
    expect(res.status).toBe(201);
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

  // ---- PR-1 "thêm nhân viên phải có lối ra" (PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH mục 3) ----

  it('email đã có tài khoản → 400 + EMAIL_ALREADY_REGISTERED, câu chỉ sang tab Link, không tạo user mới', async () => {
    const { token } = await setupOwnerWithPlan();
    await createUser({ username: 'taken', email: 'taken@test.local', role: 'user' });
    const before = await db.query(`SELECT COUNT(*)::int AS n FROM users`);

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newone', email: 'TAKEN@test.local' }); // khác hoa/thường vẫn là cùng email

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(res.body.message).toContain('Link tài khoản có sẵn');
    const after = await db.query(`SELECT COUNT(*)::int AS n FROM users`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('username đã có người dùng (khác hoa/thường) → 400 USERNAME_TAKEN, KHÔNG 500, không tạo user mới', async () => {
    const { token } = await setupOwnerWithPlan();
    await createUser({ username: 'CongTyABC', email: 'abc@test.local', role: 'user' });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'congtyabc', email: 'fresh@test.local' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USERNAME_TAKEN');
    expect(res.body.message).toContain('tên công ty');
    const created = await db.query(`SELECT 1 FROM users WHERE email = $1`, ['fresh@test.local']);
    expect(created.rows).toHaveLength(0);
  });

  it('nhiều request đua nhau cùng username → đúng 1 thành công, còn lại 400 USERNAME_TAKEN, không có 500', async () => {
    const { token } = await setupOwnerWithPlan({ maxEmployees: 10 });

    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        request(app)
          .post('/api/employees')
          .set('Authorization', `Bearer ${token}`)
          .send({ username: 'racer', email: `racer${i}@test.local` })
      )
    );

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 500)).toHaveLength(0);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    for (const r of responses.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('USERNAME_TAKEN');
    }
    const rows = await db.query(`SELECT 1 FROM users WHERE username = 'racer'`);
    expect(rows.rows).toHaveLength(1);
  });

  it('tên ràng buộc unique thật của DB khớp với ánh xạ 23505 của service (users_username_key / users_email_key)', async () => {
    await createUser({ username: 'probe', email: 'probe@test.local', role: 'user' });
    const violate = (username, email) =>
      db.query(
        `INSERT INTO users (username, email, password_hash, status, role) VALUES ($1, $2, 'x', 'active', 'user')`,
        [username, email]
      );

    const byUsername = await violate('probe', 'other1@test.local').catch((e) => e);
    expect(byUsername.code).toBe('23505');
    expect(byUsername.constraint).toBe('users_username_key');

    const byEmail = await violate('other2', 'probe@test.local').catch((e) => e);
    expect(byEmail.code).toBe('23505');
    expect(byEmail.constraint).toBe('users_email_key');
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

  it('link thành công → response có data.id = id nhân viên, audit EMPLOYEE_ADDED có entity_id đúng', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const target = await createUser({ username: 'auditlink', email: 'auditlink@test.local', role: 'user' });

    const res = await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'auditlink@test.local' });

    expect(res.status).toBe(201);
    // BIGINT → pg trả chuỗi; frontend PHẢI so bằng String() khi tìm nhân viên theo data.id.
    expect(String(res.body.data.id)).toBe(String(target.id));

    const audit = await db.query(
      `SELECT entity_id FROM audit_logs WHERE action = 'EMPLOYEE_ADDED' AND entity_type = 'employee'`
    );
    expect(audit.rows).toHaveLength(1);
    expect(String(audit.rows[0].entity_id)).toBe(String(target.id));
    // id trả về mở đúng nhân viên trong danh sách của owner
    const detail = await request(app)
      .get(`/api/employees/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.email).toBe('auditlink@test.local');
    expect(owner.id).not.toBe(target.id);
  });

  it("tài khoản đã xoá (status = 'deleted') → 404 như không tồn tại, không tạo membership", async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const gone = await createUser({ username: 'gone', email: 'gone@test.local', role: 'user', status: 'deleted' });

    const res = await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'gone@test.local' });

    expect(res.status).toBe(404);
    const m = await db.query(`SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id = $2`, [owner.id, gone.id]);
    expect(m.rows).toHaveLength(0);
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

  it('mảng rỗng [] (chưa tick gì) → 200, lưu đủ mọi khoá = false, KHÔNG 400', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'emptyperm', role: 'user' });
    await addMembership(owner.id, emp.id, { permissions: { campaigns_view: true } });

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: [] });

    expect(res.status).toBe(200);
    const stored = await db.query(
      `SELECT permissions FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    const perms = stored.rows[0].permissions;
    expect(Array.isArray(perms)).toBe(false);
    expect(Object.keys(perms).length).toBeGreaterThan(0);
    expect(Object.values(perms).every((v) => v === false)).toBe(true);
  });

  it('mảng CÓ phần tử → vẫn 400 (chỉ mảng rỗng được nhận)', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'arrayperm', role: 'user' });
    await addMembership(owner.id, emp.id);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: ['campaigns_view'] });

    expect(res.status).toBe(400);
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
  // Reset là việc NỘI BỘ trong workspace: chủ shop bấm reset, đọc mật khẩu tạm cho
  // nhân viên, nhân viên đăng nhập rồi bị buộc đổi ngay. Không gửi email.
  // Mật khẩu tạm phải NGẪU NHIÊN từng lần — không dùng hằng số dùng chung
  // (chuỗi digiso@2026 từng nằm trong repo public).
  it('trả mật khẩu tạm ngẫu nhiên + buộc đổi, không dùng hằng số dùng chung', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'reset', role: 'user' });
    await addMembership(owner.id, emp.id);

    const before = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [emp.id]);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const tempPassword = res.body?.data?.tempPassword;
    expect(typeof tempPassword).toBe('string');
    expect(tempPassword.length).toBeGreaterThanOrEqual(8);
    // Không được là hằng số dùng chung
    expect(tempPassword).not.toBe(LEGACY_HARDCODED_EMPLOYEE_PASSWORD);

    const after = await db.query(
      `SELECT password_hash, must_change_password FROM users WHERE id = $1`,
      [emp.id]
    );
    expect(after.rows[0].password_hash).not.toBe(before.rows[0].password_hash);
    // Hash trong DB khớp đúng mật khẩu tạm vừa trả về
    expect(await bcrypt.compare(tempPassword, after.rows[0].password_hash)).toBe(true);
    // Không đoán được bằng hằng số công khai
    expect(await bcrypt.compare(LEGACY_HARDCODED_EMPLOYEE_PASSWORD, after.rows[0].password_hash)).toBe(false);
    // Buộc đổi ngay lần đăng nhập kế tiếp
    expect(after.rows[0].must_change_password).toBe(true);
  });

  it('hai lần reset cho ra hai mật khẩu khác nhau', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'reset2', role: 'user' });
    await addMembership(owner.id, emp.id);

    const first = await request(app)
      .patch(`/api/employees/${emp.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .patch(`/api/employees/${emp.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(first.body.data.tempPassword).not.toBe(second.body.data.tempPassword);
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

// ---------------------------------------------------------------------------
// Contribution / team-overview — ranh giới quyền (PLAN_DO_LUONG_KPI Phần D)
// ---------------------------------------------------------------------------
describe('Contribution tenant isolation (Phần D)', () => {
  it('nhân viên workspace A gọi /contribution/me → chỉ đúng 1 dòng của chính họ', async () => {
    const plan = await createPlan({ maxEmployees: 10 });
    const ownerA = await createUser({ username: 'ownera', role: 'user' });
    const ownerB = await createUser({ username: 'ownerb', role: 'user' });
    await assignPlanToUser(ownerA.id, plan.id);
    await assignPlanToUser(ownerB.id, plan.id);

    const empA = await createUser({ username: 'empa', role: 'employee' });
    const empB = await createUser({ username: 'empb', role: 'employee' });
    await addMembership(ownerA.id, empA.id);
    await addMembership(ownerB.id, empB.id);

    const tokenA = await loginAs(empA);
    const res = await request(app)
      .get('/api/employees/contribution/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Owner-Context', String(ownerA.id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.id).toBe(empA.id);
    expect(res.body.data.id).not.toBe(empB.id);
    expect(res.body.data.username).toBe('empa');
  });

  it('chủ A gọi /contribution kèm ownerId của B trên query/body → không có dòng nào của B', async () => {
    // Bài bắt buộc PLAN_DO_LUONG_KPI — Ranh giới quyền:
    // chủ workspace A gọi API đóng góp → không có một dòng nào của workspace B,
    // kể cả khi truyền ownerId của B lên.
    const plan = await createPlan({ maxEmployees: 10 });
    const ownerA = await createUser({ username: 'ownera2', role: 'user' });
    const ownerB = await createUser({ username: 'ownerb2', role: 'user' });
    await assignPlanToUser(ownerA.id, plan.id);
    await assignPlanToUser(ownerB.id, plan.id);

    const empA1 = await createUser({ username: 'alice_a', role: 'user' });
    const empA2 = await createUser({ username: 'carol_a', role: 'user' });
    const empB1 = await createUser({ username: 'bob_b', role: 'user' });
    const empB2 = await createUser({ username: 'dave_b', role: 'user' });
    await addMembership(ownerA.id, empA1.id);
    await addMembership(ownerA.id, empA2.id);
    await addMembership(ownerB.id, empB1.id);
    await addMembership(ownerB.id, empB2.id);

    const tokenA = await loginAs(ownerA);
    const res = await request(app)
      .get('/api/employees/contribution')
      .query({ ownerId: ownerB.id })
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ownerId: ownerB.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const rows = res.body.data || [];
    const ids = rows.map((r) => r.id);
    const usernames = rows.map((r) => r.username).sort();

    // Không một dòng nào của workspace B
    expect(ids).not.toContain(empB1.id);
    expect(ids).not.toContain(empB2.id);
    expect(ids).not.toContain(ownerB.id);
    expect(usernames).not.toContain('bob_b');
    expect(usernames).not.toContain('dave_b');

    // Chỉ đúng team của A (token), bất chấp ownerId=B trên request
    expect(ids).toContain(empA1.id);
    expect(ids).toContain(empA2.id);
    expect(rows).toHaveLength(2);
    expect(usernames).toEqual(['alice_a', 'carol_a']);
  });

  it('chủ A gọi /team-overview kèm ownerId của B → cũng không rò (cùng ranh giới)', async () => {
    const plan = await createPlan({ maxEmployees: 10 });
    const ownerA = await createUser({ username: 'ownera3', role: 'user' });
    const ownerB = await createUser({ username: 'ownerb3', role: 'user' });
    await assignPlanToUser(ownerA.id, plan.id);
    await assignPlanToUser(ownerB.id, plan.id);

    const empA = await createUser({ username: 'alice_ov', role: 'user' });
    const empB = await createUser({ username: 'bob_ov', role: 'user' });
    await addMembership(ownerA.id, empA.id);
    await addMembership(ownerB.id, empB.id);

    const tokenA = await loginAs(ownerA);
    const res = await request(app)
      .get('/api/employees/team-overview')
      .query({ ownerId: ownerB.id })
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const rows = res.body.data || [];
    expect(rows.some((r) => r.id === empB.id)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(empA.id);
  });

  it('findOwnerIdForEmployee bỏ qua membership inactive', async () => {
    const { findOwnerIdForEmployee } = await import(
      '../../src/repositories/user/employee.repository.js'
    );
    const owner = await createUser({ username: 'own_inactive', role: 'user' });
    const emp = await createUser({ username: 'emp_inactive', role: 'employee' });
    await addMembership(owner.id, emp.id, { status: 'inactive' });

    const ownerId = await findOwnerIdForEmployee(emp.id);
    expect(ownerId).toBeNull();
  });
});

/**
 * Quyền mặc định cho nhân viên MỚI (22/09/2026).
 *
 * Trước đây hai đường thêm nhân viên đều không truyền `permissions` nên hàng nhận mặc định
 * của cột — `'[]'::jsonb` trên production — và nhân viên vào không gian công ty thấy trang
 * trắng. Cờ `defaultForNewEmployee` trong catalog có từ 20/08 nhưng chưa nơi nào đọc.
 */
describe('Nhân viên mới có sẵn quyền xem', () => {
  const permissionsOf = async (ownerId, employeeId) => {
    const res = await db.query(
      `SELECT permissions FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [ownerId, employeeId]
    );
    return res.rows[0]?.permissions;
  };

  it('tạo tài khoản mới → có campaigns_view + reports_view, KHÔNG có quyền ghi/chạm dữ liệu khách', async () => {
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 5 });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'defperm01', email: 'defperm@test.local', fullName: 'Mặc Định' });
    expect(res.status).toBe(201);

    const u = await db.query(`SELECT id FROM users WHERE email = $1`, ['defperm@test.local']);
    const permissions = await permissionsOf(owner.id, u.rows[0].id);

    expect(permissions.campaigns_view).toBe(true);
    expect(permissions.reports_view).toBe(true);
    // Bộ mặc định phải là CHỈ-ĐỌC: mấy quyền dưới đây đụng người nhận thật, dữ liệu khách,
    // kênh gửi và tiền — chủ phải tự tick.
    for (const key of [
      'campaigns_create', 'campaigns_run', 'customers', 'leads', 'email_settings',
      'zalo_settings', 'ai_assistant_use', 'marketplace_purchase', 'inbox_reply',
    ]) {
      expect(permissions[key]).toBe(false);
    }
  });

  it('link tài khoản có sẵn → cũng nhận đúng bộ quyền mặc định đó', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const target = await createUser({ username: 'linkdef', email: 'linkdef@test.local', role: 'user' });

    const res = await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'linkdef@test.local' });
    expect(res.status).toBe(201);

    const permissions = await permissionsOf(owner.id, target.id);
    expect(permissions.campaigns_view).toBe(true);
    expect(permissions.reports_view).toBe(true);
    expect(permissions.campaigns_run).toBe(false);
  });

  // Phép kiểm đi hết đường thật — đúng câu khách phản ánh: "add nhân viên xong
  // không xem được chiến dịch của công ty". PR-2 (PLAN_VA_NHAN_VIEN_PHAN_QUYEN_2026-09-28) thêm
  // bước CHẤP NHẬN bắt buộc trước khi vào được không gian của chủ — link xong chưa đủ nữa.
  it('nhân viên vừa được thêm CHẤP NHẬN lời mời thấy NGAY chiến dịch của công ty, chủ không phải cấp thêm gì', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const target = await createUser({ username: 'seecamp', email: 'seecamp@test.local', role: 'user' });
    await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status)
       VALUES ($1, 'Chiến dịch của công ty', 'email', 'draft')`,
      [owner.id]
    );

    await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'seecamp@test.local' })
      .expect(201);

    const empToken = await loginAs(target);
    await request(app)
      .post(`/api/users/me/memberships/${owner.id}/accept`)
      .set('Authorization', `Bearer ${empToken}`)
      .expect(200);

    const list = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));

    expect(list.status).toBe(200);
    const names = (list.body.data?.items || []).map((c) => c.campaignName);
    expect(names).toContain('Chiến dịch của công ty');
  });

  it('link lại người đã ở trong team KHÔNG ghi đè bộ quyền chủ đã chỉnh', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'relink', email: 'relink@test.local', role: 'user' });
    // Chủ đã cố ý thu hồi hết quyền (bấm "Bỏ hết" rồi Lưu → object đủ khoá, toàn false).
    await addMembership(owner.id, emp.id, {
      status: 'inactive',
      permissions: { campaigns_view: false, reports_view: false },
    });

    await request(app)
      .post('/api/employees/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'relink@test.local' })
      .expect(201);

    const permissions = await permissionsOf(owner.id, emp.id);
    expect(permissions.campaigns_view).toBe(false);
    expect(permissions.reports_view).toBe(false);
  });

  describe('POST /api/employees/invite (PR-A: mời nhân viên chỉ cần email)', () => {
    let originalTestSendEmail;
    beforeAll(() => {
      originalTestSendEmail = process.env.TEST_SEND_EMAIL;
      process.env.TEST_SEND_EMAIL = '1';
    });
    afterAll(() => {
      if (originalTestSendEmail === undefined) delete process.env.TEST_SEND_EMAIL;
      else process.env.TEST_SEND_EMAIL = originalTestSendEmail;
    });

    beforeEach(() => {
      mockSendMail.mockClear();
    });

    it('email của tài khoản đang hoạt động → method: invited_link, không tạo user mới, gửi thư báo (chờ chấp nhận)', async () => {
      const { owner, token } = await setupOwnerWithPlan();
      const existing = await createUser({ username: 'existing_emp', email: 'existing_emp@test.local', role: 'user' });

      const res = await request(app)
        .post('/api/employees/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'existing_emp@test.local' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã gửi lời mời — người này cần chấp nhận trong ứng dụng');
      expect(res.body.data.method).toBe('invited_link');
      expect(res.body.data.id).toBe(existing.id);

      // Gửi đúng 1 thư BÁO (khác thư kích hoạt của method 'invited') — người này phải tự chấp nhận.
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      // Membership trong DB được tạo, origin=linked, CHỜ chấp nhận (accepted_at NULL)
      const memRows = await db.query('SELECT * FROM user_members WHERE owner_id = $1 AND employee_id = $2', [owner.id, existing.id]);
      expect(memRows.rows.length).toBe(1);
      expect(memRows.rows[0].status).toBe('active');
      expect(memRows.rows[0].origin).toBe('linked');
      expect(memRows.rows[0].accepted_at).toBeNull();
    });

    it('email chưa có tài khoản → method: invited, tạo user pending_activation, sinh username, gửi thư', async () => {
      const { token } = await setupOwnerWithPlan();

      const res = await request(app)
        .post('/api/employees/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'brand_new_emp@test.local', fullName: 'Nhân Viên Mới' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.method).toBe('invited');
      expect(res.body.data.invitationSent).toBe(true);

      // Kiểm tra user được tạo trong DB với status pending_activation
      const userRows = await db.query('SELECT * FROM users WHERE email = $1', ['brand_new_emp@test.local']);
      expect(userRows.rows.length).toBe(1);
      expect(userRows.rows[0].status).toBe('pending_activation');
      expect(userRows.rows[0].username).toBe('brandnewemp');
      expect(userRows.rows[0].full_name).toBe('Nhân Viên Mới');

      // Thư mời đã được gửi
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('email viết HOA của tài khoản có sẵn → nhận ra là cùng người và linked', async () => {
      const { owner, token } = await setupOwnerWithPlan();
      const existing = await createUser({ username: 'case_emp', email: 'case_emp@test.local', role: 'user' });

      const res = await request(app)
        .post('/api/employees/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'CASE_EMP@TEST.LOCAL' });

      expect(res.status).toBe(201);
      expect(res.body.data.method).toBe('invited_link');
      expect(res.body.data.id).toBe(existing.id);
    });

    it('email của chính chủ → 400 Không thể tự thêm mình làm nhân viên', async () => {
      const { owner, token } = await setupOwnerWithPlan();

      const res = await request(app)
        .post('/api/employees/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: owner.email });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Không thể tự thêm mình làm nhân viên');
    });

    it('vượt số nhân viên của gói → 403 EMPLOYEE_LIMIT_REACHED', async () => {
      const { token } = await setupOwnerWithPlan({ maxEmployees: 1 });
      // Thêm nhân viên thứ 1
      await request(app)
        .post('/api/employees/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'emp_one@test.local' })
        .expect(201);

      // Mời nhân viên thứ 2 → bị chặn
      const res = await request(app)
        .post('/api/employees/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'emp_two@test.local' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMPLOYEE_LIMIT_REACHED');
    });
  });
});

// ---------------------------------------------------------------------------
// user_members.origin — tài khoản do chủ TẠO ('created') vs tài khoản có sẵn bị LIÊN KẾT ('linked')
// RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 1, 3, 7. Trước bản vá, chủ nhóm mời email của một tài khoản
// độc lập rồi "Đặt lại mật khẩu" → đăng nhập được vào tài khoản người đó (tái hiện bằng test, 28/09).
// ---------------------------------------------------------------------------
describe('user_members.origin — chủ chỉ can thiệp tài khoản do mình tạo', () => {
  it('POST /employees (tạo mới) ghi origin = created; /employees/invite email đã có tài khoản ghi origin = linked', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const existing = await createUser({ username: 'doclap', email: 'doclap@test.local', role: 'user' });

    await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'taomoi', email: 'taomoi@test.local' })
      .expect(201);
    const linked = await request(app)
      .post('/api/employees/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: existing.email });
    expect(linked.status).toBe(201);
    expect(linked.body.data.method).toBe('invited_link');

    const { rows } = await db.query(
      `SELECT u.email, um.origin FROM user_members um JOIN users u ON u.id = um.employee_id
       WHERE um.owner_id = $1 ORDER BY u.email`,
      [owner.id]
    );
    expect(rows).toEqual([
      { email: 'doclap@test.local', origin: 'linked' },
      { email: 'taomoi@test.local', origin: 'created' },
    ]);
    // Danh sách trả cho FE mang theo origin để ẩn nút reset/sửa với người 'linked'
    const list = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.map((e) => e.origin).sort()).toEqual(['created', 'linked']);
  });

  it('reset-password tài khoản linked → 403 EMPLOYEE_ACCOUNT_NOT_OWNED, hash không đổi, mật khẩu cũ vẫn đăng nhập được', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const victim = await createUser({ username: 'nannhan', email: 'nannhan@test.local', role: 'user' });
    await addMembership(owner.id, victim.id, { origin: 'linked' });
    const before = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [victim.id]);

    const res = await request(app)
      .patch(`/api/employees/${victim.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_ACCOUNT_NOT_OWNED');
    expect(res.body.data?.tempPassword).toBeUndefined();
    const after = await db.query(`SELECT password_hash, must_change_password FROM users WHERE id = $1`, [victim.id]);
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
    expect(after.rows[0].must_change_password).not.toBe(true);
    // Nạn nhân vẫn đăng nhập bình thường
    await loginAs(victim);
  });

  it('lớp đỡ ở SQL: UPDATE reset bỏ qua dòng linked kể cả khi gọi thẳng repository', async () => {
    const { owner } = await setupOwnerWithPlan();
    const victim = await createUser({ username: 'nannhan2', role: 'user' });
    await addMembership(owner.id, victim.id, { origin: 'linked' });
    const { resetEmployeePassword } = await import('../../src/repositories/user/employee.repository.js');
    const updated = await resetEmployeePassword(victim.id, owner.id, 'x');
    expect(updated).toBeNull();
  });

  it('PATCH /employees/:id (đổi email) tài khoản linked → 403, email trong users không đổi', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const victim = await createUser({ username: 'nannhan3', email: 'nannhan3@test.local', role: 'user' });
    await addMembership(owner.id, victim.id, { origin: 'linked' });

    const res = await request(app)
      .patch(`/api/employees/${victim.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ke Tan Cong', email: 'attacker@test.local' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_ACCOUNT_NOT_OWNED');
    const u = await db.query(`SELECT email, full_name FROM users WHERE id = $1`, [victim.id]);
    expect(u.rows[0].email).toBe('nannhan3@test.local');
    expect(u.rows[0].full_name).toBe(victim.full_name);
  });

  it('tài khoản linked vẫn chỉnh được quyền, hạn mức, khoá/mở khoá (đó là việc trong không gian của chủ)', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'linkedok', role: 'user' });
    await addMembership(owner.id, emp.id, { origin: 'linked' });

    await request(app).patch(`/api/employees/${emp.id}/permissions`).set('Authorization', `Bearer ${token}`)
      .send({ permissions: { customers: true } }).expect(200);
    await request(app).patch(`/api/employees/${emp.id}/limits`).set('Authorization', `Bearer ${token}`)
      .send({ dailyEmailLimit: 10, monthlyEmailLimit: null, dailyZaloLimit: null, monthlyZaloLimit: null }).expect(200);
    await request(app).patch(`/api/employees/${emp.id}/status`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' }).expect(200);
  });

  it('DELETE nhân viên linked đang pending_activation (chủ khác mời) → chỉ gỡ membership, KHÔNG xoá dòng users', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const otherOwner = await createUser({ username: 'chukhac', role: 'user' });
    const pending = await createUser({ username: 'pendingkhac', role: 'user', status: 'pending_activation', isVerified: false });
    await addMembership(otherOwner.id, pending.id, { origin: 'created' });
    await addMembership(owner.id, pending.id, { origin: 'linked' });

    const res = await request(app)
      .delete(`/api/employees/${pending.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const u = await db.query(`SELECT status FROM users WHERE id = $1`, [pending.id]);
    expect(u.rows).toHaveLength(1); // tài khoản của chủ khác còn nguyên
    const mine = await db.query(`SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id = $2`, [owner.id, pending.id]);
    expect(mine.rows).toHaveLength(0);
    const theirs = await db.query(`SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id = $2`, [otherOwner.id, pending.id]);
    expect(theirs.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Mở khoá nhân viên phải qua cổng trần max_employees (mục 3)
// ---------------------------------------------------------------------------
describe('PATCH /api/employees/:id/status — mở khoá không được vượt trần', () => {
  it('gói 1 nhân viên: khoá A, thêm B, mở khoá A → 403 EMPLOYEE_LIMIT_REACHED, A vẫn inactive', async () => {
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 1 });
    const a = await createUser({ username: 'nvA', role: 'user' });
    await addMembership(owner.id, a.id);

    await request(app).patch(`/api/employees/${a.id}/status`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' }).expect(200);
    await request(app).post('/api/employees/invite').set('Authorization', `Bearer ${token}`)
      .send({ email: 'nvB@test.local' }).expect(201);

    const res = await request(app)
      .patch(`/api/employees/${a.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_LIMIT_REACHED');
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM user_members WHERE owner_id = $1 AND status = 'active'`, [owner.id]
    );
    expect(rows[0].n).toBe(1);
  });

  it('còn suất thì mở khoá bình thường; khoá (inactive) không bao giờ bị cổng trần chặn', async () => {
    const { owner, token } = await setupOwnerWithPlan({ maxEmployees: 2 });
    const a = await createUser({ username: 'nvA2', role: 'user' });
    await addMembership(owner.id, a.id, { status: 'inactive' });

    await request(app).patch(`/api/employees/${a.id}/status`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' }).expect(200);
    await request(app).patch(`/api/employees/${a.id}/status`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' }).expect(200);
  });
});

// ---------------------------------------------------------------------------
// PR-2 (PLAN_VA_NHAN_VIEN_PHAN_QUYEN_2026-09-28) — liên kết tài khoản có sẵn phải được ĐỒNG Ý
// (method invited_link + origin=linked/accepted_at NULL + thư báo đã kiểm ở describe
// 'POST /api/employees/invite (PR-A...)' phía trên — không lặp lại ở đây.)
// ---------------------------------------------------------------------------
describe('resolveUserContext chặn context chưa chấp nhận (auth.middleware.js)', () => {
  it('X-Owner-Context trước khi chấp nhận → 403 INVALID_CONTEXT', async () => {
    const { owner } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'waiting', role: 'employee' });
    await addMembership(owner.id, emp.id, { origin: 'linked', acceptedAt: null });
    const empToken = await loginAs(emp);

    const res = await request(app)
      .get('/api/employees/contribution/me')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVALID_CONTEXT');
  });

  it('sau khi chấp nhận → X-Owner-Context vào được bình thường', async () => {
    const { owner } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'accepted1', role: 'employee' });
    await addMembership(owner.id, emp.id, { origin: 'linked', acceptedAt: null });
    const empToken = await loginAs(emp);

    await request(app)
      .post(`/api/users/me/memberships/${owner.id}/accept`)
      .set('Authorization', `Bearer ${empToken}`)
      .expect(200);

    const res = await request(app)
      .get('/api/employees/contribution/me')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(200);
  });
});

describe('POST /api/users/me/memberships/:ownerId/accept', () => {
  it('chấp nhận thành công → 200, accepted_at được set, audit EMPLOYEE_INVITE_ACCEPTED (owner_id = chủ)', async () => {
    const { owner } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'acceptme', role: 'employee' });
    await addMembership(owner.id, emp.id, { origin: 'linked', acceptedAt: null });
    const empToken = await loginAs(emp);

    const res = await request(app)
      .post(`/api/users/me/memberships/${owner.id}/accept`)
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(200);

    const m = await db.query(
      `SELECT accepted_at FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    expect(m.rows[0].accepted_at).not.toBeNull();

    const audit = await db.query(
      `SELECT id_user, owner_id FROM audit_logs WHERE action = 'EMPLOYEE_INVITE_ACCEPTED'`
    );
    expect(audit.rows).toHaveLength(1);
    expect(Number(audit.rows[0].id_user)).toBe(Number(emp.id));
    expect(Number(audit.rows[0].owner_id)).toBe(Number(owner.id));
  });

  it('không có lời mời đang chờ (không tồn tại / đã chấp nhận rồi) → 404', async () => {
    const { owner } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'noinvite', role: 'employee' });
    const empToken = await loginAs(emp);

    const res = await request(app)
      .post(`/api/users/me/memberships/${owner.id}/accept`)
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(404);
  });

  it('đang đứng trong không gian của MỘT chủ khác (employee context) → 403 OWNER_ONLY (requireSelfContext)', async () => {
    const { owner: ownerA } = await setupOwnerWithPlan();
    const plan = await createPlan({ maxEmployees: 5 });
    const ownerB = await createUser({ username: 'ownerB2', role: 'user' });
    await assignPlanToUser(ownerB.id, plan.id);
    const emp = await createUser({ username: 'dualctx', role: 'employee' });
    await addMembership(ownerA.id, emp.id); // đã chấp nhận — dùng để switch context
    await addMembership(ownerB.id, emp.id, { origin: 'linked', acceptedAt: null }); // đang chờ
    const empToken = await loginAs(emp);

    const res = await request(app)
      .post(`/api/users/me/memberships/${ownerB.id}/accept`)
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(ownerA.id));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNER_ONLY');
  });
});

describe('POST /api/users/me/memberships/:ownerId/decline', () => {
  it('từ chối → dòng bị xoá, chủ không còn thấy người này trong danh sách, audit EMPLOYEE_INVITE_DECLINED', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'declineme', role: 'employee' });
    await addMembership(owner.id, emp.id, { origin: 'linked', acceptedAt: null });
    const empToken = await loginAs(emp);

    const res = await request(app)
      .post(`/api/users/me/memberships/${owner.id}/decline`)
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(200);

    const m = await db.query(
      `SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    expect(m.rows).toHaveLength(0);

    const list = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.find((e) => Number(e.id) === Number(emp.id))).toBeUndefined();

    const audit = await db.query(`SELECT 1 FROM audit_logs WHERE action = 'EMPLOYEE_INVITE_DECLINED'`);
    expect(audit.rows).toHaveLength(1);
  });

  it('đã chấp nhận rồi mới gọi từ chối → 404, KHÔNG xoá membership đã chấp nhận', async () => {
    const { owner } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'toolate', role: 'employee' });
    await addMembership(owner.id, emp.id); // mặc định đã chấp nhận
    const empToken = await loginAs(emp);

    const res = await request(app)
      .post(`/api/users/me/memberships/${owner.id}/decline`)
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(404);
    const m = await db.query(
      `SELECT 1 FROM user_members WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, emp.id]
    );
    expect(m.rows).toHaveLength(1);
  });
});

describe('PATCH /api/employees/:id/status — chưa chấp nhận thì chặn khoá/mở khoá', () => {
  it('accepted_at NULL → 400 "chưa chấp nhận lời mời"', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'pendingacc', role: 'user' });
    await addMembership(owner.id, emp.id, { origin: 'linked', acceptedAt: null });

    const res = await request(app)
      .patch(`/api/employees/${emp.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('chưa chấp nhận');
  });
});

describe('findTeamOverview — đếm chiến dịch trong KHÔNG GIAN CỦA CHỦ, bỏ người chưa chấp nhận', () => {
  it('nhân viên linked có chiến dịch trong KHÔNG GIAN RIÊNG của họ → KHÔNG được đếm vào team overview của chủ', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'ownspace', role: 'user' });
    await addMembership(owner.id, emp.id, { origin: 'linked' }); // đã chấp nhận (mặc định)

    // Chiến dịch trong KHÔNG GIAN RIÊNG của emp (workspace_owner_id = chính họ, không phải owner).
    await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status)
       VALUES ($1, $1, $1, 'Chien dich rieng', 'running')`,
      [emp.id]
    );

    const res = await request(app)
      .get('/api/employees/team-overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => Number(r.id) === Number(emp.id));
    expect(row.runningCampaigns).toBe(0);
  });

  it('nhân viên tạo chiến dịch TRONG không gian của chủ → được đếm', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'inspace', role: 'user' });
    await addMembership(owner.id, emp.id);

    await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status)
       VALUES ($1, $1, $2, 'Chien dich cho chu', 'running')`,
      [owner.id, emp.id]
    );

    const res = await request(app)
      .get('/api/employees/team-overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => Number(r.id) === Number(emp.id));
    expect(row.runningCampaigns).toBe(1);
  });

  it('nhân viên chưa chấp nhận → không xuất hiện trong team overview của chủ', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({ username: 'notyet', role: 'user' });
    await addMembership(owner.id, emp.id, { origin: 'linked', acceptedAt: null });

    const res = await request(app)
      .get('/api/employees/team-overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((r) => Number(r.id) === Number(emp.id))).toBeUndefined();
  });
});

describe('PATCH /api/employees/:id — audit EMPLOYEE_INFO_UPDATED (mục 6)', () => {
  it('sửa fullName/email → ghi audit_logs kèm before/after', async () => {
    const { owner, token } = await setupOwnerWithPlan();
    const emp = await createUser({
      username: 'infoaudit', email: 'before@test.local', fullName: 'Before Name', role: 'user',
    });
    await addMembership(owner.id, emp.id); // origin='created' mặc định → được sửa info

    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'After Name', email: 'after@test.local' });

    expect(res.status).toBe(200);

    const audit = await db.query(
      `SELECT details FROM audit_logs WHERE action = 'EMPLOYEE_INFO_UPDATED' AND entity_type = 'employee'`
    );
    expect(audit.rows).toHaveLength(1);
    const { details } = audit.rows[0];
    expect(details.before.email).toBe('before@test.local');
    expect(details.after.email).toBe('after@test.local');
  });
});
