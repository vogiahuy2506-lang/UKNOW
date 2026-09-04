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
import { truncateAll, createUser, createVerificationCode } from './helpers/db.js';

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

/**
 * Trước bản vá này, /auth/register có riêng một regex `/^[0-9]{10,11}$/` ở tầng
 * route (auth.routes.js) chạy TRƯỚC khi controller kịp chuẩn hoá — chặn nhầm mọi
 * SĐT có dấu `+`/khoảng trắng dù chúng hợp lệ và đã có sẵn số trùng trong DB.
 * Route giờ chỉ kiểm không rỗng; chuẩn hoá + kiểm độ dài chuyển hết vào controller
 * (isValidNormalizedPhoneLength, zaloPhoneCampaign.util.js) — một nguồn sự thật.
 */
describe('Đăng ký chấp nhận mọi định dạng SĐT hợp lý (route không còn regex riêng)', () => {
  async function registerWithPhone(phone, usernameSuffix) {
    const email = `fmt${usernameSuffix}@test.local`;
    await createVerificationCode({ email, code: '123456' });
    return request(app).post('/api/auth/register').send({
      username: `fmt${usernameSuffix}`,
      email,
      password: 'Passw0rd!',
      phone,
      emailVerificationCode: '123456',
    });
  }

  it('"+84 912 345 678" (dấu + và khoảng trắng) → 201, chuẩn hoá xuống 0912345678', async () => {
    const res = await registerWithPhone('+84 912 345 678', '1');
    expect(res.status).toBe(201);
    const { rows } = await db.query('SELECT phone FROM users WHERE id = $1', [res.body.data.user.id]);
    expect(rows[0].phone).toBe('0912345678');
  });

  it('"0912-345-679" (gạch nối) → 201', async () => {
    const res = await registerWithPhone('0912-345-679', '2');
    expect(res.status).toBe(201);
  });

  it('trùng với số đã có dưới dạng khác (+84 vs 0xxx) → 409 PHONE_TAKEN, không phải 400', async () => {
    await createUser({ username: 'fmt_owner', phone: '0912345680' });
    const res = await registerWithPhone('+84 912 345 680', '3');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  it('Bẫy 2b đã vá: "812345680" (9 số, thiếu số 0 đầu, KHÔNG bắt đầu bằng 9) → 400', async () => {
    // normalizePhoneForZaloCampaign chỉ khôi phục số 0 cho số 9 chữ số bắt đầu
    // bằng "9" — "812345680" giữ nguyên 9 chữ số, giờ bị isValidNormalizedPhoneLength
    // (đòi 10-11) bắt được. Trước bản vá, ngưỡng cũ `< 9` để lọt ca này.
    const res = await registerWithPhone('812345680', '4');
    expect(res.status).toBe(400);
  });

  it('rác hoàn toàn ("abc") → 400, không tạo tài khoản', async () => {
    const res = await registerWithPhone('abc', '5');
    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT id FROM users WHERE username = $1', ['fmt5']);
    expect(rows).toHaveLength(0);
  });
});

describe('PUT /api/users/profile chấp nhận mọi định dạng SĐT hợp lý và chuẩn hoá', () => {
  it('"+84 912 000 099" (dấu + và khoảng trắng) → 200, lưu DB dạng 0912000099', async () => {
    const user = await createUser({ username: 'prof_plus84', phone: '0912000098' });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+84 912 000 099' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('0912000099');
    const { rows } = await db.query('SELECT phone FROM users WHERE id = $1', [user.id]);
    expect(rows[0].phone).toBe('0912000099');
  });

  it('"0912-345-679" (gạch nối) → 200, chuẩn hoá lưu DB 0912345679', async () => {
    const user = await createUser({ username: 'prof_dash', phone: '0912000090' });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912-345-679' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('0912345679');
  });

  it('trùng SĐT của user khác dưới dạng +84 vs 0xxx → 409 PHONE_TAKEN', async () => {
    await createUser({ username: 'prof_owner', phone: '0912345688' });
    const user = await createUser({ username: 'prof_other', phone: '0912000088' });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+84 912 345 688' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  it('gửi lại đúng SĐT của chính mình dưới dạng +84 → 200 no-op', async () => {
    const user = await createUser({ username: 'prof_self', phone: '0912345689' });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+84 912 345 689' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('0912345689');
  });

  it('SĐT rác ("123") → 400 Số điện thoại không hợp lệ', async () => {
    const user = await createUser({ username: 'prof_bad', phone: '0912000077' });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '123' });

    expect(res.status).toBe(400);
  });

  it('không truyền phone (chỉ sửa fullName) → 200, giữ nguyên phone cũ', async () => {
    const user = await createUser({ username: 'prof_nofield', phone: '0912000066', fullName: 'Cũ' });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Mới' });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Mới');
    expect(res.body.data.phone).toBe('0912000066');
  });
});
