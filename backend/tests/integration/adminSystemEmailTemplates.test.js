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
