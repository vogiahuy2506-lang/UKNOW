/**
 * Integration tests cho `/api/auth` endpoints:
 *   - POST /api/auth/register
 *   - POST /api/auth/login
 *   - GET  /api/auth/me
 *
 * Mỗi test gọi HTTP thật qua supertest và kiểm tra cả response + DB state.
 * Mỗi test phải tự reset DB qua `truncateAll()` để không bị nhiễm chéo.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createVerificationCode } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

describe('POST /api/auth/register', () => {
  it('đăng ký thành công với OTP hợp lệ → trả 201 + accessToken', async () => {
    const email = 'newuser@test.local';
    await createVerificationCode({ email, code: '123456' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser01',
        email,
        password: 'Passw0rd!',
        fullName: 'New User',
        emailVerificationCode: '123456',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.username).toBe('newuser01');
    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    // DB phải có user mới + verification code đã đánh dấu used
    const userRow = await db.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);
    expect(userRow.rows[0]).toBeDefined();
    expect(userRow.rows[0].is_verified).toBe(true);

    const codeRow = await db.query(
      'SELECT is_used FROM verification_codes WHERE email = $1 LIMIT 1',
      [email]
    );
    expect(codeRow.rows[0].is_used).toBe(true);

    // Refresh token phải được lưu DB
    const refresh = await db.query(
      'SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE id_user = $1',
      [userRow.rows[0].id]
    );
    expect(refresh.rows[0].n).toBe(1);
  });

  it('thiếu emailVerificationCode → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'noverify',
      email: 'noverify@test.local',
      password: 'Passw0rd!',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/x[áa]c minh email/i);
  });

  it('OTP sai → 400', async () => {
    const email = 'wrongotp@test.local';
    await createVerificationCode({ email, code: '123456' });

    const res = await request(app).post('/api/auth/register').send({
      username: 'wrongotp',
      email,
      password: 'Passw0rd!',
      emailVerificationCode: '000000',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/không đúng|hết hạn/i);
  });

  it('email đã tồn tại → 400', async () => {
    const email = 'dup@test.local';
    await createUser({ email, username: 'dupuser' });
    await createVerificationCode({ email });

    const res = await request(app).post('/api/auth/register').send({
      username: 'newdup',
      email,
      password: 'Passw0rd!',
      emailVerificationCode: '123456',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('username đã tồn tại → 400', async () => {
    await createUser({ username: 'taken', email: 'taken@test.local' });
    await createVerificationCode({ email: 'other@test.local' });

    const res = await request(app).post('/api/auth/register').send({
      username: 'taken',
      email: 'other@test.local',
      password: 'Passw0rd!',
      emailVerificationCode: '123456',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tên đăng nhập/i);
  });

  it('validation: password quá ngắn → 400 (express-validator)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'shortpw',
      email: 'shortpw@test.local',
      password: '123',
      emailVerificationCode: '123456',
    });
    expect(res.status).toBe(400);
  });

  it('validation: username chứa ký tự đặc biệt → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'has space',
      email: 'space@test.local',
      password: 'Passw0rd!',
      emailVerificationCode: '123456',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('login thành công → 200, trả accessToken + memberships', async () => {
    const user = await createUser({ username: 'loginuser', email: 'login@test.local' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.username).toBe(user.username);
    expect(res.body.data.user.memberships).toEqual([]);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    // Cookie refresh token phải có
    const setCookie = res.headers['set-cookie'];
    expect(Array.isArray(setCookie) ? setCookie.join(';') : setCookie).toMatch(/refreshToken=/);

    // login_history phải ghi success
    const history = await db.query(
      `SELECT login_status FROM login_history WHERE id_user = $1 ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    expect(history.rows[0].login_status).toBe('success');
  });

  it('username không tồn tại → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/sai|không đúng/i);

    // login_history vẫn ghi failed (id_user = null)
    const history = await db.query(
      `SELECT login_status, failure_reason FROM login_history WHERE email = $1`,
      ['ghost']
    );
    expect(history.rows[0].login_status).toBe('failed');
  });

  it.skip('sai password → 401 + tăng failed_login_attempts', async () => {
    const user = await createUser({ username: 'wrongpw', email: 'wrongpw@test.local' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: 'WRONG' });

    expect(res.status).toBe(401);

    const row = await db.query(`SELECT failed_login_attempts FROM users WHERE id = $1`, [user.id]);
    expect(row.rows[0].failed_login_attempts).toBe(1);
  });

  it.skip('sau 5 lần sai password → tài khoản bị khóa locked_until', async () => {
    const user = await createUser({ username: 'lockme', email: 'lockme@test.local' });

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/auth/login')
        .send({ username: user.username, password: 'WRONG' });
    }

    const row = await db.query(
      `SELECT failed_login_attempts, locked_until FROM users WHERE id = $1`,
      [user.id]
    );
    expect(row.rows[0].failed_login_attempts).toBe(5);
    expect(row.rows[0].locked_until).not.toBeNull();
  });

  it('tài khoản inactive → 403', async () => {
    const user = await createUser({
      username: 'inactive',
      email: 'inactive@test.local',
      status: 'inactive',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/vô hiệu hóa/i);
  });

  it('validation: thiếu username → 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'x' });
    expect(res.status).toBe(400);
  });

  it('login thành công reset failed_login_attempts về 0', async () => {
    const user = await createUser({ username: 'resetcount', email: 'reset@test.local' });

    // 2 lần sai trước
    await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: 'WRONG' });
    await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: 'WRONG' });

    // Lần đúng
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });
    expect(res.status).toBe(200);

    const row = await db.query(`SELECT failed_login_attempts FROM users WHERE id = $1`, [user.id]);
    expect(row.rows[0].failed_login_attempts).toBe(0);
  });
});

describe('GET /api/auth/me', () => {
  async function loginAndGetToken(user) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });
    return res.body.data.accessToken;
  }

  it('không có Bearer token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token/i);
  });

  it('token sai format → 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('token hợp lệ → 200 + trả user info', async () => {
    const user = await createUser({ username: 'meuser', email: 'me@test.local' });
    const token = await loginAndGetToken(user);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.user.memberships).toEqual([]);
  });

  it('không trả password_hash trong response', async () => {
    const user = await createUser({ username: 'safeuser', email: 'safe@test.local' });
    const token = await loginAndGetToken(user);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('user bị xóa giữa chừng → 401', async () => {
    const user = await createUser({ username: 'gone', email: 'gone@test.local' });
    const token = await loginAndGetToken(user);

    await db.query('DELETE FROM users WHERE id = $1', [user.id]);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
