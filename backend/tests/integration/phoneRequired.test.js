/**
 * Integration tests cho cổng bắt buộc SĐT (PR-1 của
 * _internal/PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md).
 *
 * Phủ đúng bảng "Nghiệm thu > PR-1" của plan. Ba ca dưới đây là ba lỗi đã tốn 5 vòng
 * phản biện mới tìm ra, và KHÔNG ca nào bị bắt bởi test sẵn có:
 *   1. `resolveUserContext` không SELECT `phone` → requirePhone chặn 100% user vĩnh viễn.
 *   2. `PUT /me/phone` kiểm trùng thiếu `id <> $2` → khoá cứng người gửi lại số của mình.
 *   3. Chuẩn hoá không nhận ra `+84 912 345 678` và `0912345678` là một số.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
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

async function loginToken(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
}

describe('requirePhone — cổng chặn user chưa có SĐT', () => {
  it('user chưa có SĐT bị 403 PHONE_REQUIRED ở route đã gắn cổng', async () => {
    const user = await createUser({ username: 'nophone1', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PHONE_REQUIRED');
  });

  it('user đã có SĐT đi qua cổng bình thường', async () => {
    const user = await createUser({ username: 'hasphone1', phone: '0912000001' });
    const token = await loginToken(user);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('superadmin không bị chặn dù chưa có SĐT', async () => {
    const admin = await createUser({ username: 'sa_nophone', role: 'admin', phone: null });
    const token = await loginToken(admin);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).not.toBe(403);
  });

  it('login trả về phone để frontend biết có phải mở modal không', async () => {
    const user = await createUser({ username: 'loginphone', phone: '0912000002' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });

    expect(res.status).toBe(200);
    expect(res.body.data.user.phone).toBe('0912000002');
  });

  it('GET /auth/me trả về phone (resolveUserContext phải SELECT cột này)', async () => {
    const user = await createUser({ username: 'mephone', phone: '0912000003' });
    const token = await loginToken(user);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.phone).toBe('0912000003');
  });
});

describe('PUT /api/users/me/phone', () => {
  it('nhập SĐT xong thì request kế tiếp qua được ngay — KHÔNG 403 lần nữa', async () => {
    // Đây là ca DUY NHẤT bắt được lỗi resolveUserContext thiếu `phone`: các ca khác
    // đi qua modal đã cập nhật state ở frontend nên che mất.
    const user = await createUser({ username: 'setphone1', phone: null });
    const token = await loginToken(user);

    const blocked = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(403);

    const set = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0913000001' });
    expect(set.status).toBe(200);
    expect(set.body.data.phone).toBe('0913000001');

    const after = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(200);
  });

  it('gửi lại ĐÚNG số mình đang có → 200 no-op, không phải 409', async () => {
    // Thiếu `AND id <> $2` ở kiểm trùng sẽ làm ca này trả 409 và khoá cứng user:
    // modal không đóng được, số của chính mình thì bị báo trùng.
    const user = await createUser({ username: 'samephone', phone: '0913000002' });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0913000002' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('0913000002');
  });

  it('lấy số của người khác → 409 PHONE_TAKEN', async () => {
    await createUser({ username: 'owner_of_number', phone: '0913000003' });
    const user = await createUser({ username: 'thief', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0913000003' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  it('nhận ra +84 912 345 678 và 0912345678 là CÙNG một số', async () => {
    await createUser({ username: 'norm_owner', phone: '0912345678' });
    const user = await createUser({ username: 'norm_other', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+84 912 345 678' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  it('chuẩn hoá trước khi lưu — +84 lưu xuống DB thành dạng 0xxx', async () => {
    const user = await createUser({ username: 'norm_save', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+84 913 000 004' });

    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT phone FROM users WHERE id = $1', [user.id]);
    expect(rows[0].phone).toBe('0913000004');
  });

  it('SĐT rác → 400', async () => {
    const user = await createUser({ username: 'badphone', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '123' });

    expect(res.status).toBe(400);
  });

  it('route này KHÔNG bị requirePhone chặn — nếu bị thì user không có đường thoát', async () => {
    const user = await createUser({ username: 'escapehatch', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0913000005' });

    expect(res.status).not.toBe(403);
  });
});

describe('Ràng buộc UNIQUE trên users.phone (migration 179)', () => {
  it('hai user không thể cùng một SĐT', async () => {
    await createUser({ username: 'uniq_a', phone: '0914000001' });
    await expect(
      createUser({ username: 'uniq_b', phone: '0914000001' })
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('nhiều user cùng để NULL thì vẫn được (partial index)', async () => {
    const a = await createUser({ username: 'null_a', phone: null });
    const b = await createUser({ username: 'null_b', phone: null });
    expect(a.id).toBeDefined();
    expect(b.id).toBeDefined();
  });
});
