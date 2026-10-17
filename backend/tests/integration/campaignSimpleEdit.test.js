/**
 * POST /api/campaigns/simple + followUps (chuỗi tin) trên Postgres thật. (Đã gỡ phần GET/PUT /api/campaigns/:id/simple cùng chế độ sửa của trình từng bước.)
 *
 * Chiến dịch được tạo bằng chính `POST /api/campaigns/simple` rồi đọc từ DB — không giả lập tầng nào. Gemini / Zalo / SMTP KHÔNG được gọi.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
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

const tokenOf = (user) => jwt.sign(
  { userId: user.id, email: user.email, role: user.role || 'user' },
  process.env.JWT_SECRET || 'test-jwt-secret'
);

const call = (method, user, url, body, ownerId = null) => {
  const req = request(app)[method](url).set('Authorization', `Bearer ${tokenOf(user)}`);
  if (ownerId != null) req.set('X-Owner-Context', String(ownerId));
  return body === undefined ? req : req.send(body);
};
const post = (user, url, body, ownerId) => call('post', user, url, body, ownerId);

async function seedOwnerResources(ownerId) {
  const email = (await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, status, email_mode)
     VALUES ($1, 'Email của chủ', 'chu@example.test', 'chu@example.test', 'active', 'smtp') RETURNING id`,
    [ownerId]
  )).rows[0];
  const zalo = (await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active, is_default)
     VALUES ($1, 'Zalo của chủ', 'connected', true, true) RETURNING id`,
    [ownerId]
  )).rows[0];
  const emailTemplate = (await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html)
     VALUES ($1, 'Mẫu email 1', 'Chào bạn', '<p>Nội dung</p>') RETURNING id`,
    [ownerId]
  )).rows[0];
  const emailTemplate2 = (await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html)
     VALUES ($1, 'Mẫu email 2', 'Nhắc bạn', '<p>Nhắc</p>') RETURNING id`,
    [ownerId]
  )).rows[0];
  const emailTemplate3 = (await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html)
     VALUES ($1, 'Mẫu email 3', 'Lần cuối', '<p>Lần cuối</p>') RETURNING id`,
    [ownerId]
  )).rows[0];
  const zaloTemplate = (await db.query(
    `INSERT INTO zalo_templates (id_user, template_name, subject, body_text)
     VALUES ($1, 'Mẫu Zalo 1', 'Chào', 'Xin chào bạn') RETURNING id`,
    [ownerId]
  )).rows[0];
  const zaloTemplate2 = (await db.query(
    `INSERT INTO zalo_templates (id_user, template_name, subject, body_text)
     VALUES ($1, 'Mẫu Zalo 2', 'Nhắc', 'Nhắc bạn nhé') RETURNING id`,
    [ownerId]
  )).rows[0];
  return {
    emailId: Number(email.id),
    zaloId: Number(zalo.id),
    emailTemplateId: Number(emailTemplate.id),
    emailTemplateId2: Number(emailTemplate2.id),
    emailTemplateId3: Number(emailTemplate3.id),
    zaloTemplateId: Number(zaloTemplate.id),
    zaloTemplateId2: Number(zaloTemplate2.id),
  };
}

const countOf = async (table) => Number((await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);
const nodesOf = async (campaignId) => (await db.query(
  `SELECT id, node_type, node_subtype, config FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order, id`,
  [campaignId]
)).rows;
const emailTemplates = async () => countOf('email_templates');

const tpl = (id) => ({ mode: 'template', templateId: id });
const emailBody = (r, extra = {}) => ({
  campaignName: 'Chiến dịch email',
  channel: 'email',
  senderId: r.emailId,
  audience: { type: 'manual', emails: ['khach1@example.test', 'khach2@example.test'] },
  content: tpl(r.emailTemplateId),
  ...extra,
});
const threeSteps = (r) => emailBody(r, {
  content: tpl(r.emailTemplateId),
  followUps: [
    { delayValue: 2, delayUnit: 'days', content: tpl(r.emailTemplateId2) },
    { delayValue: 6, delayUnit: 'hours', content: tpl(r.emailTemplateId3) },
  ],
});
async function createSimple(user, body, ownerId) {
  const res = await post(user, '/api/campaigns/simple', body, ownerId);
  expect(res.status).toBe(201);
  return Number(res.body.data.campaignId);
}

async function setup(email) {
  const owner = await createUser({ email: `${email}@test.com`, username: email.replace(/[^a-z0-9]/gi, '_') });
  const r = await seedOwnerResources(owner.id);
  return { owner, r };
}

describe('POST /api/campaigns/simple + followUps', () => {
  it('3 tin → khối gửi có 3 bước, độ trễ từng bước, delayFrom=prev, sendMode=schedule (đọc từ campaign_nodes thật)', async () => {
    const { owner, r } = await setup('edit-create3');
    const id = await createSimple(owner, threeSteps(r));
    const send = (await nodesOf(id)).find((node) => node.node_subtype === 'send_email').config;
    expect(send.sendMode).toBe('schedule');
    expect(send.emailSteps.map((step) => [step.templateId, step.delayValue, step.delayUnit, step.delayFrom])).toEqual([
      [r.emailTemplateId, 0, 'days', 'prev'],
      [r.emailTemplateId2, 2, 'days', 'prev'],
      [r.emailTemplateId3, 6, 'hours', 'prev'],
    ]);
  });

  it('tin 3 tự soạn thiếu tiêu đề (email) → 400 SUBJECT_REQUIRED, KHÔNG tạo chiến dịch hay mẫu', async () => {
    const { owner, r } = await setup('edit-create-nosubject');
    const before = { campaigns: await countOf('campaigns'), templates: await emailTemplates() };
    const res = await post(owner, '/api/campaigns/simple', emailBody(r, {
      followUps: [
        { delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: 'Có tiêu đề', body: 'Nội dung 2' } },
        { delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: '', body: 'Nội dung 3' } },
      ],
    }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SUBJECT_REQUIRED');
    expect({ campaigns: await countOf('campaigns'), templates: await emailTemplates() }).toEqual(before);
  });

  it('nhiều tin tự soạn → mỗi tin thành một mẫu', async () => {
    const { owner, r } = await setup('edit-create-custom');
    const before = await emailTemplates();
    const id = await createSimple(owner, emailBody(r, {
      content: { mode: 'custom', subject: 'Tin 1', body: 'Nội dung 1' },
      followUps: [{ delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: 'Tin 2', body: 'Nội dung 2' } }],
    }));
    expect(await emailTemplates()).toBe(before + 2);
    const steps = (await nodesOf(id)).find((node) => node.node_subtype === 'send_email').config.emailSteps;
    expect(steps.every((step) => Number.isInteger(Number(step.templateId)))).toBe(true);
  });

  it('preview customers: đếm tổng khách của workspace, không ghi gì', async () => {
    const { owner, r } = await setup('edit-prev-customers');
    await db.query(`INSERT INTO customers (id_user, workspace_owner_id, email) VALUES ($1, $1, 'a@example.test'), ($1, $1, 'b@example.test')`, [owner.id]);
    const res = await post(owner, '/api/campaigns/simple/preview', emailBody(r, { audience: { type: 'customers' } }));
    expect(res.status).toBe(200);
    expect(res.body.data.recipientCount).toBe(2);
    expect(res.body.data.readyToCreate).toBe(true);
    expect(res.body.data.issues).toEqual([]);
  });
});
