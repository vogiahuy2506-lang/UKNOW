/**
 * Integration tests cho liên kết người giới thiệu (Affiliate PR-A1):
 * POST /api/users/me/referrer
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await db.pool.end();
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

describe('User Referrer Bind Integration (POST /api/users/me/referrer)', () => {
  it('liên kết người giới thiệu thành công khi tài khoản mới tạo', async () => {
    const referrer = await createUser({ username: 'referrer_vip', email: 'referrer_vip@example.com' });
    await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', ['VIP999', referrer.id]);

    const newUser = await createUser({ username: 'newbie_1', email: 'newbie_1@example.com' });
    const token = await loginAs(newUser);

    const res = await request(app)
      .post('/api/users/me/referrer')
      .set('Authorization', `Bearer ${token}`)
      .send({ referralCode: 'vip999' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.referredByUserId).toBe(referrer.id);
    expect(res.body.data.referrerCode).toBe('VIP999');

    // Kiểm tra DB
    const { rows } = await db.query(
      'SELECT referred_by_user_id, referred_at FROM users WHERE id = $1',
      [newUser.id]
    );
    expect(rows[0].referred_by_user_id).toBe(referrer.id);
    expect(rows[0].referred_at).not.toBeNull();

    // Kiểm tra GET /api/users/profile trả về đúng referredByUserId và referrerCode
    const profRes = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(profRes.status).toBe(200);
    expect(profRes.body.data.referredByUserId).toBe(referrer.id);
    expect(profRes.body.data.referrerCode).toBe('VIP999');

    // Kiểm tra GET /api/auth/me trả về referredByUserId
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.referredByUserId).toBe(referrer.id);
  });

  it('từ chối khi tài khoản đã có người giới thiệu', async () => {
    const referrerA = await createUser({ username: 'ref_a', email: 'ref_a@example.com' });
    const referrerB = await createUser({ username: 'ref_b', email: 'ref_b@example.com' });
    await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', ['REFAAA', referrerA.id]);
    await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', ['REFBBB', referrerB.id]);

    const newUser = await createUser({ username: 'newbie_2', email: 'newbie_2@example.com' });
    // Đã có referred_by_user_id từ trước
    await db.query('UPDATE users SET referred_by_user_id = $1, referred_at = NOW() WHERE id = $2', [referrerA.id, newUser.id]);
    const token = await loginAs(newUser);

    const res = await request(app)
      .post('/api/users/me/referrer')
      .set('Authorization', `Bearer ${token}`)
      .send({ referralCode: 'REFBBB' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('đã được liên kết người giới thiệu');
  });

  it('chống tự giới thiệu chính mình', async () => {
    const user = await createUser({ username: 'self_ref', email: 'self_ref@example.com' });
    await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', ['MYSELF88', user.id]);
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/users/me/referrer')
      .set('Authorization', `Bearer ${token}`)
      .send({ referralCode: 'MYSELF88' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('không thể tự nhập mã giới thiệu của chính mình');
  });

  it('báo lỗi khi mã giới thiệu không tồn tại', async () => {
    const user = await createUser({ username: 'newbie_3', email: 'newbie_3@example.com' });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/users/me/referrer')
      .set('Authorization', `Bearer ${token}`)
      .send({ referralCode: 'NOTFOUND' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('không tồn tại');
  });

  it('từ chối khi tài khoản đã tạo quá 24 giờ (chỉ áp dụng lúc mới đăng ký)', async () => {
    const referrer = await createUser({ username: 'ref_old', email: 'ref_old@example.com' });
    await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', ['REFOLD88', referrer.id]);

    const oldUser = await createUser({ username: 'old_user', email: 'old_user@example.com' });
    // Giả lập tài khoản tạo từ 3 ngày trước
    await db.query("UPDATE users SET created_at = NOW() - INTERVAL '3 days' WHERE id = $1", [oldUser.id]);
    const token = await loginAs(oldUser);

    const res = await request(app)
      .post('/api/users/me/referrer')
      .set('Authorization', `Bearer ${token}`)
      .send({ referralCode: 'REFOLD88' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('quá thời hạn');
  });
});
