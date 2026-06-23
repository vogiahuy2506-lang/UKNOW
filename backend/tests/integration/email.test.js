/**
 * Integration tests cho module Email — `/api/email-settings` + `/api/email-templates`.
 *
 * Phạm vi:
 *   - CRUD email-settings (list/get/create/update/delete, active).
 *   - SMTP testConnection (mock `transporter.verify()`).
 *   - sendTestEmail (mock `transporter.sendMail()`).
 *   - Tenant isolation giữa các owner.
 *   - Resource limit (`max_email_accounts`, `max_email_templates`).
 *   - Mã hóa-at-rest SMTP password (verify prefix `enc:v1:` trong DB).
 *   - CRUD email-templates cơ bản (skip attachments).
 *   - Validators.
 *
 * KHÔNG cover:
 *   - Attachments upload (cần mock uploadController + S3).
 *   - sendCustomEmail flow với campaign (cần customers/campaigns đầy đủ).
 *
 * Vì `nodemailer.createTransport` được gọi trong controller/service, test
 * mock cả module `nodemailer` qua `jest.unstable_mockModule` để chặn network
 * và assert đúng args truyền vào `sendMail()`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

// ─── Mock nodemailer trước mọi import dùng nó ────────────────────────────
const mockVerify = jest.fn().mockResolvedValue(true);
const mockSendMail = jest.fn().mockResolvedValue({
  messageId: '<test-message-id@uknow.test>',
  accepted: ['target@test.local'],
});
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: mockVerify,
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
  createTransport: mockCreateTransport,
}));

const originalSendGridKey = process.env.SENDGRID_API_KEY;
process.env.SENDGRID_API_KEY = 'SG.test-key-for-integration-only';

const originalSmtpSecretKey = process.env.SMTP_SECRET_KEY;
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY
  || process.env.JWT_SECRET
  || 'integration-test-smtp-secret-key';

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { isEncryptedSmtpSecret, decryptSmtpSecret } = await import(
  '../../src/utils/smtpSecretCrypto.js'
);

let app;

beforeAll(() => {
  app = createApp();
});

afterAll(() => {
  if (originalSendGridKey === undefined) delete process.env.SENDGRID_API_KEY;
  else process.env.SENDGRID_API_KEY = originalSendGridKey;
  if (originalSmtpSecretKey === undefined) delete process.env.SMTP_SECRET_KEY;
  else process.env.SMTP_SECRET_KEY = originalSmtpSecretKey;
});

beforeEach(async () => {
  await truncateAll();
  mockVerify.mockClear().mockResolvedValue(true);
  mockSendMail.mockClear().mockResolvedValue({
    messageId: '<test-message-id@uknow.test>',
    accepted: ['target@test.local'],
  });
  mockCreateTransport.mockClear().mockReturnValue({
    verify: mockVerify,
    sendMail: mockSendMail,
  });
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

const baseSettingBody = (overrides = {}) => ({
  name: 'My SendGrid',
  email: 'sender@example.com',
  smtpHost: 'smtp.sendgrid.net',
  smtpPort: 587,
  smtpUsername: 'apikey',
  smtpPassword: 'SG.my-real-api-key',
  useTls: true,
  dailyLimit: 1000,
  hourlyLimit: 100,
  ...overrides,
});

// ===========================================================================
// CRUD /api/email-settings
// ===========================================================================
describe('POST /api/email-settings (create)', () => {
  it('không token → 401', async () => {
    const res = await request(app).post('/api/email-settings').send(baseSettingBody());
    expect(res.status).toBe(401);
  });

  it('thiếu field bắt buộc → 400 validator', async () => {
    const user = await createUser({ username: 'creator' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', email: 'x' });
    expect(res.status).toBe(400);
  });

  it('happy path → 201, password được mã hóa AES-256-GCM trong DB', async () => {
    const user = await createUser({ username: 'creator' });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(baseSettingBody());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      name: 'My SendGrid',
      email: 'sender@example.com',
      smtpHost: 'smtp.sendgrid.net',
      smtpPort: 587,
      isVerified: true,
    });

    const { rows } = await db.query(
      `SELECT smtp_password, id_user FROM email_settings WHERE id = $1`,
      [res.body.data.id]
    );
    expect(isEncryptedSmtpSecret(rows[0].smtp_password)).toBe(true);
    expect(decryptSmtpSecret(rows[0].smtp_password)).toBe('SG.my-real-api-key');
    expect(Number(rows[0].id_user)).toBe(Number(user.id));
  });

  it('chỉ gửi tên/email → dùng SMTP mặc định của hệ thống', async () => {
    const user = await createUser({ username: 'defaultsmtp' });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Default SMTP',
        email: 'default@example.com',
        smtpHost: '',
        smtpPort: '',
        smtpUsername: '',
        smtpPassword: '',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      name: 'Default SMTP',
      email: 'default@example.com',
      smtpHost: 'smtp.sendgrid.net',
      smtpPort: 587,
      isVerified: true,
    });

    const { rows } = await db.query(
      `SELECT smtp_username, smtp_password FROM email_settings WHERE id = $1`,
      [res.body.data.id]
    );
    expect(rows[0].smtp_username).toBe('apikey');
    expect(isEncryptedSmtpSecret(rows[0].smtp_password)).toBe(true);
    expect(decryptSmtpSecret(rows[0].smtp_password)).toBe('SG.test-key-for-integration-only');
  });

  it('vượt max_email_accounts → 400 EMPLOYEE LIMIT (resource limit)', async () => {
    const user = await createUser({ username: 'capped' });
    await db.query(`UPDATE users SET max_email_accounts = 1 WHERE id = $1`, [user.id]);
    const token = await loginAs(user);

    const r1 = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(baseSettingBody({ name: 'First' }));
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(baseSettingBody({ name: 'Second' }));
    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/giới hạn|limit/i);
  });
});

describe('GET /api/email-settings (list/get/active)', () => {
  it('GET / chỉ trả setting của owner hiện tại (tenant isolation)', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password)
       VALUES ($1, 'Mine', 'm@x.com', 'h', 587, 'u', 'p'),
              ($2, 'Foreign', 'f@x.com', 'h', 587, 'u', 'p')`,
      [me.id, other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .get('/api/email-settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Mine');
  });

  it('GET /:id của owner khác → 404', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    const { rows } = await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password)
       VALUES ($1, 'Foreign', 'f@x.com', 'h', 587, 'u', 'p') RETURNING id`,
      [other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .get(`/api/email-settings/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('GET /active chỉ trả status="active"', async () => {
    const me = await createUser({ username: 'me' });
    await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status)
       VALUES ($1, 'A1', 'a1@x.com', 'h', 587, 'u', 'p', 'active'),
              ($1, 'A2', 'a2@x.com', 'h', 587, 'u', 'p', 'inactive')`,
      [me.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .get('/api/email-settings/active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('A1');
  });

  it('route /active đặt TRƯỚC /:id — regression guard: GET /active KHÔNG bị parse thành id="active"', async () => {
    const me = await createUser({ username: 'me' });
    const token = await loginAs(me);
    const res = await request(app)
      .get('/api/email-settings/active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('PUT /api/email-settings/:id (update)', () => {
  it('chỉ cập nhật field được gửi, password mới cũng được mã hóa lại', async () => {
    const me = await createUser({ username: 'me' });
    const token = await loginAs(me);

    const create = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(baseSettingBody());
    const id = create.body.data.id;

    const upd = await request(app)
      .put(`/api/email-settings/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', smtpPassword: 'SG.new-key' });

    expect(upd.status).toBe(200);
    expect(upd.body.data.name).toBe('Renamed');
    const { rows } = await db.query(`SELECT smtp_password FROM email_settings WHERE id = $1`, [id]);
    expect(decryptSmtpSecret(rows[0].smtp_password)).toBe('SG.new-key');
  });

  it('không gửi smtpPassword → DB vẫn giữ password cũ', async () => {
    const me = await createUser({ username: 'me' });
    const token = await loginAs(me);
    const create = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(baseSettingBody({ smtpPassword: 'SG.original-key' }));
    const id = create.body.data.id;

    await request(app)
      .put(`/api/email-settings/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Just rename' });

    const { rows } = await db.query(`SELECT smtp_password FROM email_settings WHERE id = $1`, [id]);
    expect(decryptSmtpSecret(rows[0].smtp_password)).toBe('SG.original-key');
  });

  it('update của owner khác → 404, không thay đổi DB', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    const { rows } = await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password)
       VALUES ($1, 'Foreign', 'f@x.com', 'h', 587, 'u', 'p') RETURNING id`,
      [other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .put(`/api/email-settings/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(404);
    const after = await db.query(`SELECT name FROM email_settings WHERE id = $1`, [rows[0].id]);
    expect(after.rows[0].name).toBe('Foreign');
  });
});

describe('DELETE /api/email-settings/:id', () => {
  it('xóa đúng setting của owner', async () => {
    const me = await createUser({ username: 'me' });
    const token = await loginAs(me);
    const create = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(baseSettingBody());

    const res = await request(app)
      .delete(`/api/email-settings/${create.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const { rows } = await db.query(
      `SELECT 1 FROM email_settings WHERE id = $1`,
      [create.body.data.id]
    );
    expect(rows).toHaveLength(0);
  });

  it('xóa của owner khác → 404, row vẫn còn', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    const { rows } = await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password)
       VALUES ($1, 'Foreign', 'f@x.com', 'h', 587, 'u', 'p') RETURNING id`,
      [other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .delete(`/api/email-settings/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    const after = await db.query(`SELECT 1 FROM email_settings WHERE id = $1`, [rows[0].id]);
    expect(after.rows).toHaveLength(1);
  });
});

// ===========================================================================
// SMTP testConnection + sendTestEmail (mocked)
// ===========================================================================
describe('POST /api/email-settings/test-connection (SMTP verify)', () => {
  it('verify thành công → 200', async () => {
    const me = await createUser({ username: 'tester' });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/email-settings/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({
        smtpHost: 'smtp.sendgrid.net',
        smtpPort: 587,
        smtpUsername: 'apikey',
        smtpPassword: 'SG.fake-key',
      });

    expect(res.status).toBe(200);
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    const transportArgs = mockCreateTransport.mock.calls[0][0];
    expect(transportArgs).toMatchObject({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: 'SG.fake-key' },
    });
  });

  it('verify reject → 400 với thông báo từ SMTP', async () => {
    mockVerify.mockRejectedValueOnce(new Error('Connection refused'));
    const me = await createUser({ username: 'tester' });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/email-settings/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({
        smtpHost: 'smtp.sendgrid.net',
        smtpPort: 587,
        smtpUsername: 'apikey',
        smtpPassword: 'SG.fake-key',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Connection refused|SMTP/);
  });
});

describe('POST /api/email-settings/:id/send-test', () => {
  it('mock SMTP, verify args + transporter.sendMail được gọi 1 lần', async () => {
    const me = await createUser({ username: 'sender' });
    const token = await loginAs(me);
    const create = await request(app)
      .post('/api/email-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(baseSettingBody({ smtpPassword: 'SG.stored-key' }));
    const id = create.body.data.id;

    const res = await request(app)
      .post(`/api/email-settings/${id}/send-test`)
      .set('Authorization', `Bearer ${token}`)
      .send({ to: 'target@test.local', content: 'Hello UKNOW' });

    expect(res.status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockSendMail.mock.calls[0][0];
    expect(mailArgs.text).toContain('Hello UKNOW');

    // Transporter dùng password đã decrypt
    const transportArgs = mockCreateTransport.mock.calls.at(-1)[0];
    expect(transportArgs.auth.pass).toBe('SG.stored-key');

    // sent_count được tăng
    const { rows } = await db.query(
      `SELECT daily_sent_count, total_sent_count FROM email_settings WHERE id = $1`,
      [id]
    );
    expect(rows[0].daily_sent_count).toBe(1);
    expect(rows[0].total_sent_count).toBe(1);
  });

  it('setting của owner khác → 404, không gọi SMTP', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    const { rows } = await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password)
       VALUES ($1, 'Foreign', 'f@x.com', 'h', 587, 'u', 'p') RETURNING id`,
      [other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .post(`/api/email-settings/${rows[0].id}/send-test`)
      .set('Authorization', `Bearer ${token}`)
      .send({ to: 'someone@test.local' });

    expect(res.status).toBe(404);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// /api/email-templates
// ===========================================================================
describe('POST /api/email-templates (create)', () => {
  it('happy path → 201, row được lưu với id_user', async () => {
    const me = await createUser({ username: 'tmpl' });
    const token = await loginAs(me);

    const res = await request(app)
      .post('/api/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        templateName: 'Welcome',
        subject: 'Chào mừng',
        bodyHtml: '<p>Xin chào {{name}}</p>',
        variables: ['name'],
        category: 'onboarding',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.templateName).toBe('Welcome');

    const { rows } = await db.query(
      `SELECT id_user, subject, body_html, category, variables
       FROM email_templates WHERE id = $1`,
      [res.body.data.id]
    );
    expect(Number(rows[0].id_user)).toBe(Number(me.id));
    expect(rows[0].subject).toBe('Chào mừng');
    expect(rows[0].body_html).toBe('<p>Xin chào {{name}}</p>');
    expect(rows[0].category).toBe('onboarding');
    expect(rows[0].variables).toEqual(['name']);
  });

  it('thiếu templateName → 400 validator', async () => {
    const me = await createUser({ username: 'tmpl' });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ templateName: '', subject: 'x', bodyHtml: '<p>x</p>' });
    expect(res.status).toBe(400);
  });

  it('không có bodyHtml lẫn bodyText → 400 validator', async () => {
    const me = await createUser({ username: 'tmpl' });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ templateName: 'Bare', subject: 'Sub', bodyHtml: '', bodyText: '' });
    expect(res.status).toBe(400);
    // `handleValidationErrors` trả thông báo chung + `errors[]` chi tiết
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'bodyHtml', msg: expect.stringMatching(/HTML|Text/i) }),
      ])
    );
  });

  it('vượt max_email_templates → 400 resource limit', async () => {
    const me = await createUser({ username: 'capped' });
    await db.query(`UPDATE users SET max_email_templates = 1 WHERE id = $1`, [me.id]);
    const token = await loginAs(me);

    const r1 = await request(app)
      .post('/api/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ templateName: 'T1', subject: 's', bodyHtml: '<p>x</p>' });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ templateName: 'T2', subject: 's', bodyHtml: '<p>x</p>' });
    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/giới hạn|limit/i);
  });
});

describe('GET /api/email-templates (list/get)', () => {
  it('list — chỉ trả template của owner; phân trang ok', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html, category)
       VALUES ($1, 'Mine 1', 's', '<p>x</p>', 'a'),
              ($1, 'Mine 2', 's', '<p>x</p>', 'a'),
              ($2, 'Foreign', 's', '<p>x</p>', 'a')`,
      [me.id, other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .get('/api/email-templates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items.map((t) => t.templateName).sort()).toEqual(['Mine 1', 'Mine 2']);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('search query lọc theo template_name ILIKE', async () => {
    const me = await createUser({ username: 'me' });
    await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html)
       VALUES ($1, 'Welcome email', 's', '<p>x</p>'),
              ($1, 'Cancellation notice', 's', '<p>x</p>')`,
      [me.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .get('/api/email-templates?search=welcome')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].templateName).toBe('Welcome email');
  });

  it('GET /:id của owner khác → 404', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    const { rows } = await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html)
       VALUES ($1, 'Foreign', 's', '<p>x</p>') RETURNING id`,
      [other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .get(`/api/email-templates/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/email-templates/:id', () => {
  it('update field, GIỮ field không gửi (COALESCE), DB cập nhật đúng', async () => {
    const me = await createUser({ username: 'me' });
    const { rows } = await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html, category)
       VALUES ($1, 'Old', 'Old subject', '<p>old</p>', 'cat1') RETURNING id`,
      [me.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .put(`/api/email-templates/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ templateName: 'New' });
    expect(res.status).toBe(200);

    const after = await db.query(
      `SELECT template_name, subject, category FROM email_templates WHERE id = $1`,
      [rows[0].id]
    );
    expect(after.rows[0].template_name).toBe('New');
    expect(after.rows[0].subject).toBe('Old subject');
    expect(after.rows[0].category).toBe('cat1');
  });

  it('update của owner khác → 404', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    const { rows } = await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html)
       VALUES ($1, 'Foreign', 's', '<p>x</p>') RETURNING id`,
      [other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .put(`/api/email-templates/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ templateName: 'Hacked' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/email-templates/:id', () => {
  it('xóa template của mình → 200, row biến mất', async () => {
    const me = await createUser({ username: 'me' });
    const { rows } = await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html)
       VALUES ($1, 'T', 's', '<p>x</p>') RETURNING id`,
      [me.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .delete(`/api/email-templates/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const after = await db.query(`SELECT 1 FROM email_templates WHERE id = $1`, [rows[0].id]);
    expect(after.rows).toHaveLength(0);
  });

  it('xóa của owner khác → 404, row vẫn còn', async () => {
    const me = await createUser({ username: 'me' });
    const other = await createUser({ username: 'other' });
    const { rows } = await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html)
       VALUES ($1, 'Foreign', 's', '<p>x</p>') RETURNING id`,
      [other.id]
    );
    const token = await loginAs(me);

    const res = await request(app)
      .delete(`/api/email-templates/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    const after = await db.query(`SELECT 1 FROM email_templates WHERE id = $1`, [rows[0].id]);
    expect(after.rows).toHaveLength(1);
  });
});
