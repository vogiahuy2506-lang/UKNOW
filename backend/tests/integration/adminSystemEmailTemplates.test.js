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

describe('Admin welcome email template API', () => {
  it('chỉ cho super admin truy cập', async () => {
    expect((await request(app).get('/api/admin/system-email-templates/welcome')).status).toBe(401);

    const user = await createUser({ role: 'user', username: 'welcome_user' });
    const token = await loginAs(user);
    const forbidden = await request(app)
      .get('/api/admin/system-email-templates/welcome')
      .set('Authorization', `Bearer ${token}`);
    expect(forbidden.status).toBe(403);
  });

  it('trả mẫu code mặc định khi chưa có bản tùy chỉnh', async () => {
    const admin = await createUser({ role: 'admin', username: 'welcome_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .get('/api/admin/system-email-templates/welcome')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      isCustomized: false,
      updatedBy: null,
      updatedAt: null,
    });
    expect(response.body.data.subject).toContain('Chào mừng');
    expect(response.body.data.bodyHtml).toContain('{{user_name}}');
    expect(response.body.data.variables).toContain('login_url');
  });

  it('lưu/sanitize, preview rồi khôi phục bản mặc định', async () => {
    const admin = await createUser({ role: 'admin', username: 'welcome_admin' });
    const token = await loginAs(admin);
    const template = {
      subject: 'Chào {{user_name}}',
      bodyHtml: '<p>Xin chào {{user_name}} — {{user_email}}</p><a href="{{login_url}}">Đăng nhập</a><script>alert(1)</script>',
    };

    const saved = await request(app)
      .put('/api/admin/system-email-templates/welcome')
      .set('Authorization', `Bearer ${token}`)
      .send(template);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      subject: template.subject,
      isCustomized: true,
    });
    expect(saved.body.data.bodyHtml).not.toContain('<script');
    expect(Number(saved.body.data.updatedBy)).toBe(Number(admin.id));

    const persisted = await db.query(
      `SELECT subject, body_html, updated_by
       FROM system_email_templates
       WHERE template_key = 'welcome'`
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].body_html).not.toContain('<script');

    const preview = await request(app)
      .post('/api/admin/system-email-templates/welcome/preview')
      .set('Authorization', `Bearer ${token}`)
      .send(template);
    expect(preview.status).toBe(200);
    expect(preview.body.data.subject).toBe('Chào Nguyễn Minh Anh');
    expect(preview.body.data.html).toContain('minhanh@example.com');
    expect(preview.body.data.html).not.toContain('<script');

    const reset = await request(app)
      .delete('/api/admin/system-email-templates/welcome')
      .set('Authorization', `Bearer ${token}`);
    expect(reset.status).toBe(200);
    expect(reset.body.data.isCustomized).toBe(false);
    expect((await db.query('SELECT 1 FROM system_email_templates')).rows).toHaveLength(0);
  });

  it('từ chối biến không hỗ trợ', async () => {
    const admin = await createUser({ role: 'admin', username: 'welcome_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .put('/api/admin/system-email-templates/welcome')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Chào mừng', bodyHtml: '<p>{{password}}</p>' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Biến không được hỗ trợ');
  });
});

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — tổng quát hoá cho plan_expiring/
// plan_expired sau migration 206. Nghiệm thu mục 5, ca 14 và 15.
describe('Admin system email template API — đa khoá (plan_expiring/plan_expired)', () => {
  it('GET/PUT/preview cho plan_expiring hoạt động, biến {{days_left}} đúng whitelist của khoá này', async () => {
    const admin = await createUser({ role: 'admin', username: 'expiring_admin' });
    const token = await loginAs(admin);

    const getDefault = await request(app)
      .get('/api/admin/system-email-templates/plan_expiring')
      .set('Authorization', `Bearer ${token}`);
    expect(getDefault.status).toBe(200);
    expect(getDefault.body.data.isCustomized).toBe(false);
    expect(getDefault.body.data.bodyHtml).toContain('{{days_left}}');
    expect(getDefault.body.data.variables).toContain('days_left');
    expect(getDefault.body.data.variables).toContain('grace_days');

    const template = {
      subject: 'Còn {{days_left}} ngày cho gói {{plan_name}}',
      bodyHtml: '<p>{{user_name}} ơi, gói hết hạn ngày {{expires_at}}. <a href="{{upgrade_url}}">Gia hạn</a></p>',
    };
    const saved = await request(app)
      .put('/api/admin/system-email-templates/plan_expiring')
      .set('Authorization', `Bearer ${token}`)
      .send(template);
    expect(saved.status).toBe(200);
    expect(saved.body.data.isCustomized).toBe(true);

    // Ca 14 của mục 5: bấm xem trước → thấy chữ mới, {{days_left}} được thay bằng số thật (3,
    // dữ liệu mẫu trong service — xem PREVIEW_SAMPLE_DATA.plan_expiring).
    const preview = await request(app)
      .post('/api/admin/system-email-templates/plan_expiring/preview')
      .set('Authorization', `Bearer ${token}`)
      .send(template);
    expect(preview.status).toBe(200);
    expect(preview.body.data.subject).toContain('Còn 3 ngày');
    expect(preview.body.data.subject).not.toContain('{{');
    expect(preview.body.data.html).toContain('Nguyễn Minh Anh');
    expect(preview.body.data.html).not.toContain('{{days_left}}');
  });

  it('GET plan_expired trả mẫu mặc định riêng — không lẫn nội dung với plan_expiring', async () => {
    const admin = await createUser({ role: 'admin', username: 'expired_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .get('/api/admin/system-email-templates/plan_expired')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.isCustomized).toBe(false);
    expect(response.body.data.subject).toContain('đã hết hạn');
  });

  it('biến hợp lệ của welcome (docs_url) bị từ chối khi lưu cho plan_expiring', async () => {
    const admin = await createUser({ role: 'admin', username: 'cross_key_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .put('/api/admin/system-email-templates/plan_expiring')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Chào', bodyHtml: '<p>{{docs_url}}</p>' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Biến không được hỗ trợ');
  });

  // Ca 15 của mục 5, nguyên văn plan — chốt chặn tái diễn (đột biến: nới isIn(...) thành nhận
  // mọi chuỗi ở route thì ca này phải đỏ).
  it('ca 15 — PUT .../khong_ton_tai trả 400, không phải 500', async () => {
    const admin = await createUser({ role: 'admin', username: 'invalid_key_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .put('/api/admin/system-email-templates/khong_ton_tai')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'X', bodyHtml: '<p>Y</p>' });

    expect(response.status).toBe(400);
    expect(response.status).not.toBe(500);
  });

  it('GET .../khong_ton_tai cũng trả 400 — whitelist áp cho mọi verb, không chỉ PUT', async () => {
    const admin = await createUser({ role: 'admin', username: 'invalid_key_get_admin' });
    const token = await loginAs(admin);
    const response = await request(app)
      .get('/api/admin/system-email-templates/khong_ton_tai')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  // Nghiệm thu bắt buộc thêm (mục 4): INSERT khoá thứ tư trực tiếp vào DB → CHECK vẫn từ chối,
  // dù đi qua API hay không — chốt chặn ở đúng lớp DB, không chỉ ở validate tầng route.
  it('INSERT trực tiếp khoá thứ tư vào system_email_templates → DB từ chối (CHECK còn hiệu lực)', async () => {
    await expect(
      db.query(
        `INSERT INTO system_email_templates (template_key, subject, body_html)
         VALUES ('khong_ton_tai', 'X', 'Y')`
      )
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });
});
