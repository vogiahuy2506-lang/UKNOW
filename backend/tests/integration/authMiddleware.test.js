/**
 * Integration tests cho `auth.middleware.js` + `authorization.middleware.js`.
 *
 * Tập trung vào những nhánh chưa được phủ trong auth.test.js:
 *   - Token expired vs invalid (mã lỗi khác nhau)
 *   - Header `X-Owner-Context` (employee switching) — tính năng multi-context
 *     vừa refactor, dễ vỡ và liên quan trực tiếp tới bảo mật.
 *   - Quyền truy cập với user_members.status = inactive.
 *   - Status `pending_activation` được phép qua middleware (để activate page hoạt động).
 *
 * Dùng `/api/auth/me` làm endpoint test vì nó là route admin-agnostic
 * có authMiddleware nhưng không gắn thêm `requireRole`.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

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
  return res.body.data.accessToken;
}

/**
 * Tạo membership: owner thuê employee với permissions cho trước.
 */
async function addMembership(ownerId, employeeId, { status = 'active', permissions = {} } = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions), status]
  );
}

describe('authMiddleware — JWT validation', () => {
  it('header Authorization sai format (không có "Bearer ") → 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'token-without-bearer');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token/i);
  });

  it('token expired → 401 + code TOKEN_EXPIRED', async () => {
    const user = await createUser({ username: 'expired' });
    // Tạo token đã hết hạn (expiresIn âm)
    const expiredToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('token ký bằng secret khác → 401 KHÔNG có code TOKEN_EXPIRED', async () => {
    const user = await createUser({ username: 'badsig' });
    const wrongSecret = jwt.sign({ userId: user.id }, 'WRONG_SECRET');

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${wrongSecret}`);

    expect(res.status).toBe(401);
    expect(res.body.code).not.toBe('TOKEN_EXPIRED');
  });

  it('token decode được nhưng user đã bị xóa → 401', async () => {
    const user = await createUser({ username: 'will-delete' });
    const token = await loginAs(user);
    await db.query('DELETE FROM users WHERE id = $1', [user.id]);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('user status = pending_activation vẫn pass middleware (cho phép activate)', async () => {
    const user = await createUser({ username: 'pending', status: 'pending_activation' });
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
  });

  it('user status = inactive → 401 (bị middleware reject)', async () => {
    const user = await createUser({ username: 'inactive', status: 'inactive' });
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('authMiddleware — X-Owner-Context (employee switching)', () => {
  it('không có header → activeContext = self (mặc định)', async () => {
    const user = await createUser({ username: 'selfonly' });
    const token = await loginAs(user);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // /me không trả activeContext ra response, kiểm tra gián tiếp:
    // - role vẫn là user (không bị override bởi context)
    expect(res.body.data.user.role).toBe('user');
  });

  it('header X-Owner-Context trỏ tới owner mà KHÔNG có membership → 403 INVALID_CONTEXT', async () => {
    const employee = await createUser({ username: 'emp1', role: 'user' });
    const owner = await createUser({ username: 'own1', role: 'user' });
    // KHÔNG tạo membership

    const token = await loginAs(employee);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVALID_CONTEXT');
  });

  it('header X-Owner-Context trỏ tới owner CÓ membership active → 200', async () => {
    const employee = await createUser({ username: 'emp2', role: 'user' });
    const owner = await createUser({ username: 'own2', role: 'user' });
    await addMembership(owner.id, employee.id, { status: 'active' });

    const token = await loginAs(employee);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(employee.id);
  });

  it('membership status = inactive → 403 (không cho switch sang owner đã ngưng hợp tác)', async () => {
    const employee = await createUser({ username: 'emp3' });
    const owner = await createUser({ username: 'own3' });
    await addMembership(owner.id, employee.id, { status: 'inactive' });

    const token = await loginAs(employee);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVALID_CONTEXT');
  });

  it('không thể switch sang chính mình (employee = owner) — vì DB có CHECK no_self_member', async () => {
    const user = await createUser({ username: 'self' });
    // Insert tự thân sẽ bị CHECK chặn → kiểm tra điều đó
    await expect(
      db.query(
        `INSERT INTO user_members (owner_id, employee_id, status) VALUES ($1, $1, 'active')`,
        [user.id]
      )
    ).rejects.toThrow();
  });

  it('header X-Owner-Context với owner.id không tồn tại → 403', async () => {
    const employee = await createUser({ username: 'emp4' });
    const token = await loginAs(employee);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', '999999');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVALID_CONTEXT');
  });

  it('SECURITY: employee A KHÔNG thể giả vờ là employee của owner B (cross-tenant)', async () => {
    const ownerA = await createUser({ username: 'ownerA' });
    const ownerB = await createUser({ username: 'ownerB' });
    const empA = await createUser({ username: 'empA' });
    // empA là employee của ownerA, KHÔNG của ownerB
    await addMembership(ownerA.id, empA.id, { status: 'active' });

    const token = await loginAs(empA);

    // Switch sang ownerA (hợp lệ)
    const okRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(ownerA.id));
    expect(okRes.status).toBe(200);

    // Switch sang ownerB (không có membership) → phải bị chặn
    const denyRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(ownerB.id));
    expect(denyRes.status).toBe(403);
    expect(denyRes.body.code).toBe('INVALID_CONTEXT');
  });
});

describe('requireRole authorization', () => {
  // Dùng /api/admin/plans làm proxy (đã có `requireRole('admin')`).
  it('role = user → 403 trên route admin-only', async () => {
    const user = await createUser({ username: 'regular', role: 'user' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('role = admin → 200', async () => {
    const admin = await createUser({ username: 'admin', role: 'admin' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('SECURITY: admin switching sang employee context của user thường KHÔNG bị tụt quyền hệ thống', async () => {
    // Đây là kịch bản tế nhị: admin có thể là employee của một user khác.
    // Tùy code, role context có thể bị override hay không. Test này
    // chỉ document hành vi hiện tại để ai sửa middleware sẽ thấy.
    const admin = await createUser({ username: 'admin2', role: 'admin' });
    const owner = await createUser({ username: 'someowner', role: 'user' });
    await addMembership(owner.id, admin.id, { status: 'active' });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id));

    // requireRole đọc req.user.role (vẫn là 'admin') → pass
    expect(res.status).toBe(200);
  });
});
