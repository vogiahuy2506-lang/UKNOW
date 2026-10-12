import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return response.body.data.accessToken;
}

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 3.5, mục 4 — nghiệm thu PR-1 phần API.
describe('Admin subscription reminder settings API', () => {
  it('chỉ cho admin truy cập', async () => {
    expect((await request(app).get('/api/admin/subscription-reminder-settings')).status).toBe(401);

    const user = await createUser({ role: 'user', username: 'reminder_user' });
    const token = await loginAs(user);
    const forbidden = await request(app)
      .get('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`);
    expect(forbidden.status).toBe(403);
  });

  it('ca 1 — GET khi chưa ai sửa → mặc định [7,3] (hành vi y hệt hôm nay)', async () => {
    const admin = await createUser({ role: 'admin', username: 'reminder_admin_default' });
    const token = await loginAs(admin);

    const response = await request(app)
      .get('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ daysBefore: [7, 3], updatedBy: null, updatedAt: null });
  });

  it('ca 2 — PUT [10, 5, 2] rồi GET lại → đọc đúng cấu hình mới, updatedBy đúng người sửa', async () => {
    const admin = await createUser({ role: 'admin', username: 'reminder_admin_save' });
    const token = await loginAs(admin);

    const saved = await request(app)
      .put('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ daysBefore: [10, 5, 2] });
    expect(saved.status).toBe(200);
    expect(saved.body.data.daysBefore).toEqual([10, 5, 2]);
    expect(Number(saved.body.data.updatedBy)).toBe(Number(admin.id));

    const read = await request(app)
      .get('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`);
    expect(read.body.data.daysBefore).toEqual([10, 5, 2]);

    const persisted = await db.query('SELECT days_before FROM subscription_reminder_settings WHERE id');
    expect(persisted.rows[0].days_before).toEqual([10, 5, 2]);
  });

  it('ca 3 — PUT [] → 200, 0 mốc nhắc trước hạn (thư ngày hết hạn không nằm trong bảng này, luôn bật)', async () => {
    const admin = await createUser({ role: 'admin', username: 'reminder_admin_empty' });
    const token = await loginAs(admin);

    const saved = await request(app)
      .put('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ daysBefore: [] });

    expect(saved.status).toBe(200);
    expect(saved.body.data.daysBefore).toEqual([]);
  });

  it('ca 7 — PUT [7, 7] (trùng mốc) → 400, không phải 500', async () => {
    const admin = await createUser({ role: 'admin', username: 'reminder_admin_dup' });
    const token = await loginAs(admin);

    const response = await request(app)
      .put('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ daysBefore: [7, 7] });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('trùng mốc');
  });

  it('ca 8 — PUT [0] và PUT [400] → 400 "mốc phải từ 1 đến 365 ngày"', async () => {
    const admin = await createUser({ role: 'admin', username: 'reminder_admin_range' });
    const token = await loginAs(admin);

    const tooLow = await request(app)
      .put('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ daysBefore: [0] });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.message).toContain('1 đến 365 ngày');

    const tooHigh = await request(app)
      .put('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ daysBefore: [400] });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.message).toContain('1 đến 365 ngày');
  });

  it('ca 9 — PUT 6 mốc → 400 "Tối đa 5 mốc"', async () => {
    const admin = await createUser({ role: 'admin', username: 'reminder_admin_toomany' });
    const token = await loginAs(admin);

    const response = await request(app)
      .put('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ daysBefore: [1, 2, 3, 4, 5, 6] });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Tối đa 5 mốc');
  });

  it('PUT daysBefore không phải mảng (sai kiểu hẳn) → 400 ở tầng route, không phải 500', async () => {
    const admin = await createUser({ role: 'admin', username: 'reminder_admin_badtype' });
    const token = await loginAs(admin);

    const response = await request(app)
      .put('/api/admin/subscription-reminder-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ daysBefore: 'khong-phai-mang' });

    expect(response.status).toBe(400);
  });

  // PLAN_MOC_NHAC_HAN_THEO_KY_2026-10-12.md B2 — mốc nhắc riêng cho gói năm (daysBeforeYearly).
  describe('mốc gói năm (daysBeforeYearly)', () => {
    const URL = '/api/admin/subscription-reminder-settings';
    const put = (token, body) => request(app).put(URL).set('Authorization', `Bearer ${token}`).send(body);
    const read = (token) => request(app).get(URL).set('Authorization', `Bearer ${token}`);

    it('GET khi chưa ai sửa → daysBefore [7,3] (gói tháng, y hệt cũ) và daysBeforeYearly [30,7,3]', async () => {
      const admin = await createUser({ role: 'admin', username: 'reminder_admin_yearly_default' });
      const token = await loginAs(admin);

      const response = await read(token);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ daysBefore: [7, 3], daysBeforeYearly: [30, 7, 3] });
    });

    it('PUT cả hai danh sách → 200, GET đọc lại đúng, cột days_before_yearly trong DB đúng', async () => {
      const admin = await createUser({ role: 'admin', username: 'reminder_admin_yearly_save' });
      const token = await loginAs(admin);

      const saved = await put(token, { daysBefore: [7, 3, 1], daysBeforeYearly: [1, 30, 3, 7] });
      expect(saved.status).toBe(200);
      expect(saved.body.data.daysBefore).toEqual([7, 3, 1]);
      expect(saved.body.data.daysBeforeYearly).toEqual([30, 7, 3, 1]);

      const after = await read(token);
      expect(after.body.data).toMatchObject({ daysBefore: [7, 3, 1], daysBeforeYearly: [30, 7, 3, 1] });
      const persisted = await db.query('SELECT days_before, days_before_yearly FROM subscription_reminder_settings WHERE id');
      expect(persisted.rows[0]).toEqual({ days_before: [7, 3, 1], days_before_yearly: [30, 7, 3, 1] });
    });

    it('PUT CHỈ daysBefore (client cũ) → daysBeforeYearly ĐANG LƯU được giữ nguyên, không bị xoá/ghi về mặc định', async () => {
      const admin = await createUser({ role: 'admin', username: 'reminder_admin_yearly_keep' });
      const token = await loginAs(admin);
      await put(token, { daysBefore: [7, 3], daysBeforeYearly: [60, 30, 14] });

      const legacy = await put(token, { daysBefore: [5] });

      expect(legacy.status).toBe(200);
      expect(legacy.body.data.daysBefore).toEqual([5]);
      expect(legacy.body.data.daysBeforeYearly).toEqual([60, 30, 14]);
      const persisted = await db.query('SELECT days_before, days_before_yearly FROM subscription_reminder_settings WHERE id');
      expect(persisted.rows[0]).toEqual({ days_before: [5], days_before_yearly: [60, 30, 14] });
    });

    it('PUT daysBeforeYearly [] → 200, tắt nhắc trước hạn cho gói năm (lưu thật là mảng rỗng, không phải mặc định)', async () => {
      const admin = await createUser({ role: 'admin', username: 'reminder_admin_yearly_empty' });
      const token = await loginAs(admin);

      const saved = await put(token, { daysBefore: [7, 3], daysBeforeYearly: [] });

      expect(saved.status).toBe(200);
      expect(saved.body.data.daysBeforeYearly).toEqual([]);
      expect((await read(token)).body.data.daysBeforeYearly).toEqual([]);
    });

    it('PUT daysBeforeYearly [30,30] / [0] / [400] / 6 mốc / không phải mảng → 400 (cùng luật với gói tháng), DB không đổi', async () => {
      const admin = await createUser({ role: 'admin', username: 'reminder_admin_yearly_bad' });
      const token = await loginAs(admin);

      const dup = await put(token, { daysBefore: [7], daysBeforeYearly: [30, 30] });
      expect(dup.status).toBe(400);
      expect(dup.body.message).toContain('trùng mốc');
      const low = await put(token, { daysBefore: [7], daysBeforeYearly: [0] });
      expect(low.status).toBe(400);
      expect(low.body.message).toContain('1 đến 365 ngày');
      const high = await put(token, { daysBefore: [7], daysBeforeYearly: [400] });
      expect(high.status).toBe(400);
      const many = await put(token, { daysBefore: [7], daysBeforeYearly: [1, 2, 3, 4, 5, 6] });
      expect(many.status).toBe(400);
      expect(many.body.message).toContain('Tối đa 5 mốc');
      const notArray = await put(token, { daysBefore: [7], daysBeforeYearly: 'khong-phai-mang' });
      expect(notArray.status).toBe(400);

      expect((await read(token)).body.data).toMatchObject({ daysBefore: [7, 3], daysBeforeYearly: [30, 7, 3], updatedAt: null });
    });
  });

  // Chốt chặn ở đúng lớp DB (id BOOLEAN PRIMARY KEY CHECK (id)) — độc lập với validate tầng
  // route/service: dù bỏ qua API, không thể có 2 dòng cấu hình cùng lúc.
  it('INSERT trực tiếp dòng thứ hai (id = FALSE) vào subscription_reminder_settings → DB từ chối (CHECK còn hiệu lực)', async () => {
    await expect(
      db.query(`INSERT INTO subscription_reminder_settings (id, days_before) VALUES (FALSE, '{1}')`)
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });
});
