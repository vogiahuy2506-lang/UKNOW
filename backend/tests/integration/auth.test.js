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
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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

function extractRefreshToken(res) {
  const setCookie = res.headers['set-cookie'];
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  const line = lines.find((c) => String(c).startsWith('refreshToken='));
  expect(line).toBeTruthy();
  return String(line).split(';')[0].slice('refreshToken='.length);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function loginForRefresh(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  expect(res.status).toBe(200);
  return { loginRes: res, refreshToken: extractRefreshToken(res) };
}

async function countLiveRefreshTokens(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE id_user = $1 AND is_revoked = FALSE`,
    [userId]
  );
  return rows[0].n;
}

describe('POST /api/auth/refresh-token — reuse detection', () => {
  it('làm mới bình thường → 200, token cũ bị thu hồi', async () => {
    const user = await createUser({ username: 'rfresh1', email: 'rfresh1@test.local' });
    const { refreshToken: oldToken } = await loginForRefresh(user);

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${oldToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const newToken = extractRefreshToken(res);
    expect(newToken).not.toBe(oldToken);

    const oldRow = await db.query(
      `SELECT is_revoked FROM refresh_tokens WHERE token_hash = $1`,
      [hashToken(oldToken)]
    );
    expect(oldRow.rows[0].is_revoked).toBe(true);
  });

  it('token bịa (JWT hợp lệ nhưng không có trong DB) → 401, không thu hồi phiên ai', async () => {
    const user = await createUser({ username: 'rfake', email: 'rfake@test.local' });
    await loginForRefresh(user);
    const liveBefore = await countLiveRefreshTokens(user.id);

    const forged = jwt.sign(
      { userId: user.id, tokenId: 'forged-not-in-db' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${forged}`);

    expect(res.status).toBe(401);
    expect(await countLiveRefreshTokens(user.id)).toBe(liveBefore);
  });

  it('token thu hồi 2 giây trước → 401, các token khác vẫn sống (grace)', async () => {
    const user = await createUser({ username: 'rgrace', email: 'rgrace@test.local' });
    const { refreshToken: tokenA } = await loginForRefresh(user);
    // Phiên thứ hai còn sống
    await loginForRefresh(user);

    const rotate = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);
    expect(rotate.status).toBe(200);

    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL '2 seconds'
       WHERE token_hash = $1`,
      [hashToken(tokenA)]
    );

    const liveBefore = await countLiveRefreshTokens(user.id);
    expect(liveBefore).toBeGreaterThanOrEqual(1);

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);

    expect(res.status).toBe(401);
    expect(await countLiveRefreshTokens(user.id)).toBe(liveBefore);

    const reuseRows = await db.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens
       WHERE id_user = $1 AND revoked_reason = 'reuse_detected'`,
      [user.id]
    );
    expect(reuseRows.rows[0].n).toBe(0);
  });

  it('token thu hồi 30 giây trước → thu hồi mọi token còn sống với reuse_detected', async () => {
    const user = await createUser({ username: 'rreuse', email: 'rreuse@test.local' });
    const { refreshToken: tokenA } = await loginForRefresh(user);
    await loginForRefresh(user);

    const rotate = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);
    expect(rotate.status).toBe(200);
    const tokenB = extractRefreshToken(rotate);

    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL '30 seconds'
       WHERE token_hash = $1`,
      [hashToken(tokenA)]
    );

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);

    expect(res.status).toBe(401);
    expect(await countLiveRefreshTokens(user.id)).toBe(0);

    const reusedLive = await db.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens
       WHERE id_user = $1 AND is_revoked = TRUE AND revoked_reason = 'reuse_detected'`,
      [user.id]
    );
    expect(reusedLive.rows[0].n).toBeGreaterThanOrEqual(1);

    // Token đang gửi lại đã revoked từ lúc xoay — không đổi sang reuse_detected
    const presented = await db.query(
      `SELECT revoked_reason FROM refresh_tokens WHERE token_hash = $1`,
      [hashToken(tokenA)]
    );
    expect(presented.rows[0].revoked_reason).not.toBe('reuse_detected');

    // Ca 5: token "mới nhất" kẻ trộm giữ cũng chết
    const thiefRes = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenB}`);
    expect(thiefRes.status).toBe(401);
  });

  it('sau reuse detection, đăng nhập lại bằng mật khẩu vẫn được', async () => {
    const user = await createUser({ username: 'rrelogin', email: 'rrelogin@test.local' });
    const { refreshToken: tokenA } = await loginForRefresh(user);
    await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL '30 seconds'
       WHERE token_hash = $1`,
      [hashToken(tokenA)]
    );
    await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toEqual(expect.any(String));
  });

  it('tài khoản bị khoá gửi token hợp lệ chưa thu hồi → 401, không ghi reuse', async () => {
    const user = await createUser({ username: 'rlocked', email: 'rlocked@test.local' });
    const { refreshToken } = await loginForRefresh(user);

    await db.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [user.id]);

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(res.status).toBe(401);
    expect(await countLiveRefreshTokens(user.id)).toBe(1);

    const reuseRows = await db.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens
       WHERE id_user = $1 AND revoked_reason = 'reuse_detected'`,
      [user.id]
    );
    expect(reuseRows.rows[0].n).toBe(0);
  });

  it('JWT còn hạn nhưng expires_at DB đã quá → 401, không thu hồi hàng loạt', async () => {
    const user = await createUser({ username: 'rexpired', email: 'rexpired@test.local' });
    const { refreshToken } = await loginForRefresh(user);
    await loginForRefresh(user);

    await db.query(
      `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 hour'
       WHERE token_hash = $1`,
      [hashToken(refreshToken)]
    );

    const liveBefore = await countLiveRefreshTokens(user.id);
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(res.status).toBe(401);
    // Token hết hạn DB vẫn is_revoked=FALSE → vẫn đếm là "live"; phiên kia cũng còn
    expect(await countLiveRefreshTokens(user.id)).toBe(liveBefore);

    const reuseRows = await db.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens
       WHERE id_user = $1 AND revoked_reason = 'reuse_detected'`,
      [user.id]
    );
    expect(reuseRows.rows[0].n).toBe(0);
  });

  it('JWT hết hạn → 401 ngay, không đụng DB reuse', async () => {
    const user = await createUser({ username: 'rjwtexp', email: 'rjwtexp@test.local' });
    await loginForRefresh(user);

    const expiredJwt = jwt.sign(
      { userId: user.id, tokenId: 'expired-jwt' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '-1h' }
    );

    const liveBefore = await countLiveRefreshTokens(user.id);
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${expiredJwt}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/không hợp lệ|hết hạn/i);
    expect(await countLiveRefreshTokens(user.id)).toBe(liveBefore);
  });

  it('token thu hồi bởi password_changed quá 10 giây → 401, phiên mới vẫn sống', async () => {
    const user = await createUser({ username: 'rpwchg', email: 'rpwchg@test.local' });
    const { refreshToken: oldPhoneToken } = await loginForRefresh(user);

    // Đổi mật khẩu / revoke all với lý do password_changed (giống production)
    await db.query(
      `UPDATE refresh_tokens
       SET is_revoked = TRUE, revoked_at = NOW() - INTERVAL '30 seconds',
           revoked_reason = 'password_changed'
       WHERE id_user = $1 AND is_revoked = FALSE`,
      [user.id]
    );

    // Đăng nhập lại trên "laptop" → phiên mới
    const { refreshToken: laptopToken } = await loginForRefresh(user);
    expect(await countLiveRefreshTokens(user.id)).toBe(1);

    // Điện thoại còn giữ cookie cũ, tự refresh
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${oldPhoneToken}`);

    expect(res.status).toBe(401);
    expect(await countLiveRefreshTokens(user.id)).toBe(1);

    const laptop = await db.query(
      `SELECT is_revoked, revoked_reason FROM refresh_tokens WHERE token_hash = $1`,
      [hashToken(laptopToken)]
    );
    expect(laptop.rows[0].is_revoked).toBe(false);
    expect(laptop.rows[0].revoked_reason).toBeNull();

    const reuseRows = await db.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens
       WHERE id_user = $1 AND revoked_reason = 'reuse_detected'`,
      [user.id]
    );
    expect(reuseRows.rows[0].n).toBe(0);
  });

  it('token xoay đã quá expires_at → 401, không quét reuse', async () => {
    const user = await createUser({ username: 'rrotExp', email: 'rrotexp@test.local' });
    const { refreshToken: tokenA } = await loginForRefresh(user);
    await loginForRefresh(user);

    const rotate = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);
    expect(rotate.status).toBe(200);

    // Giả lập token xoay cũ từ lâu: revoked do xoay (reason NULL) nhưng đã hết hạn
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW() - INTERVAL '30 days',
           expires_at = NOW() - INTERVAL '29 days',
           revoked_reason = NULL
       WHERE token_hash = $1`,
      [hashToken(tokenA)]
    );

    const liveBefore = await countLiveRefreshTokens(user.id);
    expect(liveBefore).toBeGreaterThanOrEqual(1);

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', `refreshToken=${tokenA}`);

    expect(res.status).toBe(401);
    expect(await countLiveRefreshTokens(user.id)).toBe(liveBefore);

    const reuseRows = await db.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens
       WHERE id_user = $1 AND revoked_reason = 'reuse_detected'`,
      [user.id]
    );
    expect(reuseRows.rows[0].n).toBe(0);
  });
});
