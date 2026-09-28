/**
 * Integration tests cho tệp đính kèm mẫu email — chỉ chủ không gian sở hữu mẫu
 * (hoặc super admin) mới tải được.
 *
 * PLAN_VA_NHAN_VIEN_PHAN_QUYEN_2026-09-28.md — PR-4 (mục 5 báo cáo RA_SOAT).
 * Trước bản vá: GET /api/attachments/:attachmentId/presigned-download chỉ cần
 * đăng nhập, ai cũng tải được tệp đính kèm mẫu email của khách khác theo id.
 *
 * Phạm vi:
 *   - GET /api/attachments/:attachmentId/presigned-download — JOIN email_templates
 *     lấy chủ mẫu, so với resolveWorkspaceOwnerId(req.user).
 *   - GET /api/attachments/presigned-by-key — key phải thuộc uploads/<chủ không gian>/.
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

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login thất bại cho ${user.username}: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function addMembership(ownerId, employeeId) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, '{}'::jsonb, 'active', NOW(), NOW())`,
    [ownerId, employeeId]
  );
}

async function createEmailTemplate(userId, name = 'Mẫu test') {
  const { rows } = await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html)
     VALUES ($1, $2, 'Chào bạn', '<p>Nội dung</p>') RETURNING *`,
    [userId, name]
  );
  return rows[0];
}

async function createTemplateFile(templateId, storageKey, overrides = {}) {
  const { rows } = await db.query(
    `INSERT INTO template_files (template_id, storage_key, original_name, display_name, mime_type, file_size)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      templateId,
      storageKey,
      overrides.originalName || 'tai-lieu.pdf',
      overrides.displayName || 'Tài liệu',
      overrides.mimeType || 'application/pdf',
      overrides.fileSize || 1234,
    ]
  );
  return rows[0];
}

describe('GET /api/attachments/:attachmentId/presigned-download', () => {
  it('chủ mẫu (A) → 200', async () => {
    const userA = await createUser({ username: 'attA1' });
    const template = await createEmailTemplate(userA.id);
    const file = await createTemplateFile(template.id, `uploads/${userA.id}/bang-gia.pdf`);
    const token = await loginAs(userA);

    const res = await request(app)
      .get(`/api/attachments/${file.id}/presigned-download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBeTruthy();
  });

  it('user khác (B, gói riêng) gọi tệp mẫu của A → 404 (không lộ tệp có tồn tại)', async () => {
    const userA = await createUser({ username: 'attA2' });
    const userB = await createUser({ username: 'attB2' });
    const template = await createEmailTemplate(userA.id);
    const file = await createTemplateFile(template.id, `uploads/${userA.id}/noi-bo.pdf`);
    const tokenB = await loginAs(userB);

    const res = await request(app)
      .get(`/api/attachments/${file.id}/presigned-download`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('nhân viên của A, đang ở context A → 200', async () => {
    const userA = await createUser({ username: 'attA3' });
    const emp = await createUser({ username: 'attEmp3', role: 'employee' });
    await addMembership(userA.id, emp.id);
    const template = await createEmailTemplate(userA.id);
    const file = await createTemplateFile(template.id, `uploads/${userA.id}/cho-nhan-vien.pdf`);
    const tokenEmp = await loginAs(emp);

    const res = await request(app)
      .get(`/api/attachments/${file.id}/presigned-download`)
      .set('Authorization', `Bearer ${tokenEmp}`)
      .set('X-Owner-Context', String(userA.id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('super admin → 200 dù không phải chủ mẫu', async () => {
    const userA = await createUser({ username: 'attA4' });
    const admin = await createUser({ username: 'attAdmin4', role: 'admin' });
    const template = await createEmailTemplate(userA.id);
    const file = await createTemplateFile(template.id, `uploads/${userA.id}/xem-boi-admin.pdf`);
    const tokenAdmin = await loginAs(admin);

    const res = await request(app)
      .get(`/api/attachments/${file.id}/presigned-download`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
  });

  it('id không tồn tại → 404', async () => {
    const userA = await createUser({ username: 'attA5' });
    const token = await loginAs(userA);

    const res = await request(app)
      .get('/api/attachments/999999/presigned-download')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('tệp không liên kết mẫu nào (template_id NULL) → 404 cho người thường', async () => {
    const userA = await createUser({ username: 'attA6' });
    const file = await createTemplateFile(null, `uploads/${userA.id}/mo-coi.pdf`);
    const token = await loginAs(userA);

    const res = await request(app)
      .get(`/api/attachments/${file.id}/presigned-download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('không có token → 401', async () => {
    const res = await request(app).get('/api/attachments/1/presigned-download');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/attachments/presigned-by-key', () => {
  it('B gọi key của A → 403', async () => {
    const userA = await createUser({ username: 'attKeyA1' });
    const userB = await createUser({ username: 'attKeyB1' });
    const key = `uploads/${userA.id}/bi-mat.pdf`;
    const tokenB = await loginAs(userB);

    const res = await request(app)
      .get('/api/attachments/presigned-by-key')
      .query({ key })
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('A gọi key của chính mình → 200', async () => {
    const userA = await createUser({ username: 'attKeyA2' });
    const key = `uploads/${userA.id}/cua-toi.pdf`;
    const token = await loginAs(userA);

    const res = await request(app)
      .get('/api/attachments/presigned-by-key')
      .query({ key })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeTruthy();
  });

  it('nhân viên của A, đang ở context A, gọi key của A → 200', async () => {
    const userA = await createUser({ username: 'attKeyA3' });
    const emp = await createUser({ username: 'attKeyEmp3', role: 'employee' });
    await addMembership(userA.id, emp.id);
    const key = `uploads/${userA.id}/cho-nhan-vien-key.pdf`;
    const tokenEmp = await loginAs(emp);

    const res = await request(app)
      .get('/api/attachments/presigned-by-key')
      .query({ key })
      .set('Authorization', `Bearer ${tokenEmp}`)
      .set('X-Owner-Context', String(userA.id));

    expect(res.status).toBe(200);
  });

  it('super admin gọi key của người khác → 200', async () => {
    const userA = await createUser({ username: 'attKeyA4' });
    const admin = await createUser({ username: 'attKeyAdmin4', role: 'admin' });
    const key = `uploads/${userA.id}/admin-xem.pdf`;
    const tokenAdmin = await loginAs(admin);

    const res = await request(app)
      .get('/api/attachments/presigned-by-key')
      .query({ key })
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
  });

  it('key không hợp lệ (không bắt đầu uploads/) → 403', async () => {
    const userA = await createUser({ username: 'attKeyA5' });
    const token = await loginAs(userA);

    const res = await request(app)
      .get('/api/attachments/presigned-by-key')
      .query({ key: '../../etc/passwd' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('thiếu key → 400', async () => {
    const userA = await createUser({ username: 'attKeyA6' });
    const token = await loginAs(userA);

    const res = await request(app)
      .get('/api/attachments/presigned-by-key')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('không có token → 401', async () => {
    const res = await request(app).get('/api/attachments/presigned-by-key').query({ key: 'uploads/1/x.pdf' });
    expect(res.status).toBe(401);
  });
});
