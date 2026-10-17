/**
 * PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17 PR-A — GET/PUT /api/campaigns/:id/simple + followUps trên Postgres thật.
 *
 * Chiến dịch được tạo bằng chính `POST /api/campaigns/simple` (hoặc `POST /api/campaigns` cho ca sơ đồ nâng cao) rồi đọc ngược /
 * ghi đè qua API — không giả lập tầng nào. Gemini / Zalo / SMTP KHÔNG được gọi.
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
const put = (user, url, body, ownerId) => call('put', user, url, body, ownerId);
const get = (user, url, ownerId) => call('get', user, url, undefined, ownerId);

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

async function addEmployee(owner, employee, permissions) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
    [owner.id, employee.id, JSON.stringify(permissions)]
  );
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
const groupBody = (r, extra = {}) => ({
  campaignName: 'Chiến dịch nhóm',
  channel: 'zalo_group',
  senderId: r.zaloId,
  audience: { type: 'zalo_groups', groupIds: ['1111111', '2222222'] },
  content: tpl(r.zaloTemplateId),
  ...extra,
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

describe('GET /api/campaigns/:id/simple — đọc ngược', () => {
  it('1 tin nhập tay → editable:true, form khớp body đã gửi', async () => {
    const { owner, r } = await setup('edit-get1');
    const body = emailBody(r);
    const id = await createSimple(owner, body);

    const res = await get(owner, `/api/campaigns/${id}/simple`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      editable: true,
      readOnlyReasons: [],
      running: false,
      campaignName: 'Chiến dịch email',
      channel: 'email',
      status: 'draft',
      form: {
        senderId: r.emailId,
        audience: { type: 'manual', emails: ['khach1@example.test', 'khach2@example.test'] },
        content: tpl(r.emailTemplateId),
        followUps: [],
      },
      schedules: [],
    });
    // eslint-disable-next-line no-console
    console.log('[GET /:id/simple, 1 tin]', JSON.stringify(res.body.data));
  });

  it('3 tin → editable:true, followUps đúng độ trễ + templateId từng bước', async () => {
    const { owner, r } = await setup('edit-get3');
    const body = threeSteps(r);
    const id = await createSimple(owner, body);
    const res = await get(owner, `/api/campaigns/${id}/simple`);
    expect(res.status).toBe(200);
    expect(res.body.data.editable).toBe(true);
    expect(res.body.data.form.content).toEqual(body.content);
    expect(res.body.data.form.followUps).toEqual(body.followUps);
    // eslint-disable-next-line no-console
    console.log('[GET /:id/simple, 3 tin]', JSON.stringify(res.body.data.form));
  });

  it('tin 1 tự soạn: sau khi tạo mẫu → form.content là template với templateId của mẫu vừa tạo', async () => {
    const { owner, r } = await setup('edit-get-custom');
    const id = await createSimple(owner, emailBody(r, { content: { mode: 'custom', subject: 'Tiêu đề', body: 'Nội dung' } }));
    const res = await get(owner, `/api/campaigns/${id}/simple`);
    expect(res.body.data.editable).toBe(true);
    expect(res.body.data.form.content.mode).toBe('template');
    const template = (await db.query('SELECT subject FROM email_templates WHERE id = $1', [res.body.data.form.content.templateId])).rows[0];
    expect(template.subject).toBe('Tiêu đề');
  });

  it('customers → editable:true, audience {type:customers}; Zalo cá nhân cũng vậy', async () => {
    const { owner, r } = await setup('edit-get-customers');
    const emailId = await createSimple(owner, emailBody(r, { audience: { type: 'customers' } }));
    const zaloId = await createSimple(owner, {
      channel: 'zalo', senderId: r.zaloId, audience: { type: 'customers' }, content: tpl(r.zaloTemplateId),
    });
    for (const id of [emailId, zaloId]) {
      const res = await get(owner, `/api/campaigns/${id}/simple`);
      expect(res.body.data.editable).toBe(true);
      expect(res.body.data.form.audience).toEqual({ type: 'customers' });
    }
  });

  it('Zalo nhóm 2 tin → editable:true, groupIds + followUps khớp', async () => {
    const { owner, r } = await setup('edit-get-group');
    const body = groupBody(r, { followUps: [{ delayValue: 1, delayUnit: 'days', content: tpl(r.zaloTemplateId2) }] });
    const id = await createSimple(owner, body);
    const res = await get(owner, `/api/campaigns/${id}/simple`);
    expect(res.body.data.editable).toBe(true);
    expect(res.body.data.channel).toBe('zalo_group');
    expect(res.body.data.form.audience).toEqual({ type: 'zalo_groups', groupIds: ['1111111', '2222222'] });
    expect(res.body.data.form.followUps).toEqual(body.followUps);
  });

  it('Zalo cá nhân SĐT nhập tay + chuỗi 2 tin, và zalo_friends (uid) → editable:true', async () => {
    const { owner, r } = await setup('edit-get-zalo');
    const phones = await createSimple(owner, {
      channel: 'zalo',
      senderId: r.zaloId,
      audience: { type: 'manual', phones: ['+84912345678', '0987654321'] },
      content: tpl(r.zaloTemplateId),
      followUps: [{ delayValue: 2, delayUnit: 'days', content: tpl(r.zaloTemplateId2) }],
    });
    const res = await get(owner, `/api/campaigns/${phones}/simple`);
    expect(res.body.data.editable).toBe(true);
    expect(res.body.data.form.audience).toEqual({ type: 'manual', phones: ['0912345678', '0987654321'] });

    const uids = await createSimple(owner, {
      channel: 'zalo', senderId: r.zaloId, audience: { type: 'zalo_friends', uids: ['1234567890'] }, content: tpl(r.zaloTemplateId),
    });
    const res2 = await get(owner, `/api/campaigns/${uids}/simple`);
    expect(res2.body.data.editable).toBe(true);
    expect(res2.body.data.form.audience).toEqual({ type: 'zalo_friends', uids: ['1234567890'] });
  });

  it('chiến dịch dựng bằng trình dựng có khối Rẽ nhánh → editable:false, not_simple, form:null', async () => {
    const { owner, r } = await setup('edit-get-branch');
    const created = await post(owner, '/api/campaigns', {
      campaignName: 'Có rẽ nhánh',
      campaignType: 'email',
      nodes: [
        { tempId: 't1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', config: {} },
        { tempId: 'c1', nodeType: 'condition', nodeSubtype: 'condition', nodeName: 'Rẽ nhánh', config: {} },
        { tempId: 's1', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Gửi', config: { fromEmailId: r.emailId, emailSteps: [{ templateId: r.emailTemplateId, delayValue: 0, delayUnit: 'days' }] } },
      ],
      connections: [
        { sourceNodeId: 't1', targetNodeId: 'c1' },
        { sourceNodeId: 'c1', targetNodeId: 's1' },
      ],
    });
    expect(created.status).toBe(201);
    const res = await get(owner, `/api/campaigns/${created.body.data.id}/simple`);
    expect(res.status).toBe(200);
    expect(res.body.data.editable).toBe(false);
    expect(res.body.data.form).toBeNull();
    expect(res.body.data.readOnlyReasons).toEqual([expect.objectContaining({ code: 'not_simple', message: expect.stringContaining('Rẽ nhánh') })]);
  });

  it('Zalo chuỗi tin đếm từ tin đầu (delayFrom start, dạng trình dựng) → editable:false, delay_from_start', async () => {
    const { owner, r } = await setup('edit-get-start');
    const id = await createSimple(owner, {
      channel: 'zalo', senderId: r.zaloId, audience: { type: 'manual', phones: ['0912345678'] }, content: tpl(r.zaloTemplateId),
      followUps: [{ delayValue: 1, delayUnit: 'days', content: tpl(r.zaloTemplateId2) }],
    });
    const send = (await nodesOf(id)).find((node) => node.node_subtype === 'send_zalo_personal');
    const config = { ...send.config };
    config.zaloPersonalTemplateSteps = config.zaloPersonalTemplateSteps.map((step) => ({ ...step, delayFrom: 'start' }));
    await db.query('UPDATE campaign_nodes SET config = $1::jsonb WHERE id = $2', [JSON.stringify(config), send.id]);

    const res = await get(owner, `/api/campaigns/${id}/simple`);
    expect(res.body.data.editable).toBe(false);
    expect(res.body.data.form).toBeNull();
    expect(res.body.data.readOnlyReasons.map((item) => item.code)).toEqual(['delay_from_start']);
  });

  it('cài đặt nâng cao mà form không điều khiển (cc bật) → editable:false, advanced_settings, form vẫn đọc được để xem', async () => {
    const { owner, r } = await setup('edit-get-adv');
    const id = await createSimple(owner, emailBody(r));
    const send = (await nodesOf(id)).find((node) => node.node_subtype === 'send_email');
    await db.query('UPDATE campaign_nodes SET config = $1::jsonb WHERE id = $2', [JSON.stringify({ ...send.config, ccEnabled: true }), send.id]);
    const res = await get(owner, `/api/campaigns/${id}/simple`);
    expect(res.body.data.editable).toBe(false);
    expect(res.body.data.form).not.toBeNull();
    expect(res.body.data.readOnlyReasons.map((item) => item.code)).toEqual(['advanced_settings']);
    expect(res.body.data).not.toHaveProperty('diffs');
  });

  it('đang chạy (campaign_runs running) → running:true, editable:false, lý do running', async () => {
    const { owner, r } = await setup('edit-get-running');
    const id = await createSimple(owner, emailBody(r));
    await db.query(`INSERT INTO campaign_runs (id_campaign, workspace_owner_id, status) VALUES ($1, $2, 'running')`, [id, owner.id]);
    const res = await get(owner, `/api/campaigns/${id}/simple`);
    expect(res.body.data.running).toBe(true);
    expect(res.body.data.editable).toBe(false);
    expect(res.body.data.readOnlyReasons.map((item) => item.code)).toEqual(['running']);
    expect(res.body.data.form).not.toBeNull();
  });

  it('1 lịch → trả đúng lịch; 2 lịch → lý do multiple_schedules NHƯNG vẫn editable:true', async () => {
    const { owner, r } = await setup('edit-get-sched');
    const id = await createSimple(owner, emailBody(r));
    const addSchedule = (cron, enabled = true) => db.query(
      `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, schedule_name, schedule_type, cron_expression, enabled)
       VALUES ($1, $2, 'Lịch', 'daily', $3, $4) RETURNING id`,
      [id, owner.id, cron, enabled]
    );
    await addSchedule('0 9 * * *');
    const one = await get(owner, `/api/campaigns/${id}/simple`);
    expect(one.body.data.schedules).toEqual([expect.objectContaining({ scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true })]);
    expect(one.body.data.readOnlyReasons).toEqual([]);

    await addSchedule('0 15 * * *');
    const two = await get(owner, `/api/campaigns/${id}/simple`);
    expect(two.body.data.schedules).toHaveLength(2);
    expect(two.body.data.readOnlyReasons.map((item) => item.code)).toEqual(['multiple_schedules']);
    expect(two.body.data.editable).toBe(true);
  });

  it('chiến dịch của workspace khác → 404; id không hợp lệ → 400; thiếu campaigns_view → 403', async () => {
    const { owner, r } = await setup('edit-get-perm');
    const outsider = await createUser({ email: 'edit-get-perm-out@test.com', username: 'edit_get_perm_out' });
    const id = await createSimple(owner, emailBody(r));
    expect((await get(outsider, `/api/campaigns/${id}/simple`)).status).toBe(404);
    expect((await get(owner, '/api/campaigns/abc/simple')).status).toBe(400);

    const employee = await createUser({ email: 'edit-get-perm-emp@test.com', username: 'edit_get_perm_emp', role: 'user' });
    await addEmployee(owner, employee, { campaigns_create: true });
    expect((await get(employee, `/api/campaigns/${id}/simple`, owner.id)).status).toBe(403);
  });
});

describe('PUT /api/campaigns/:id/simple — ghi đè', () => {
  it('đổi độ trễ tin 2 + đổi tin 3 sang chữ tự soạn → GET thấy đổi; số khối KHÔNG phình; id/trạng thái/lịch giữ nguyên; mẫu cũ không bị sửa; audit via=simple', async () => {
    const { owner, r } = await setup('edit-put-main');
    const id = await createSimple(owner, threeSteps(r));
    await db.query(
      `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, schedule_name, schedule_type, cron_expression, enabled)
       VALUES ($1, $2, 'Lịch', 'daily', '0 9 * * *', true)`,
      [id, owner.id]
    );
    const nodesBefore = await countOf('campaign_nodes');
    const oldTemplate = (await db.query('SELECT subject, body_html FROM email_templates WHERE id = $1', [r.emailTemplateId3])).rows[0];
    const templatesBefore = await emailTemplates();

    const putBody = {
      ...threeSteps(r),
      campaignName: 'Tên mới',
      followUps: [
        { delayValue: 4, delayUnit: 'days', content: tpl(r.emailTemplateId2) },
        { delayValue: 6, delayUnit: 'hours', content: { mode: 'custom', subject: 'Tin 3 mới', body: 'Nội dung tin 3 mới' } },
      ],
    };
    const res = await put(owner, `/api/campaigns/${id}/simple`, putBody);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ campaignId: String(id), campaignName: 'Tên mới', channel: 'email', recipientCountHint: 2 });
    // eslint-disable-next-line no-console
    console.log('[PUT /:id/simple]', JSON.stringify(res.body.data));

    expect(await countOf('campaign_nodes')).toBe(nodesBefore);
    expect(await emailTemplates()).toBe(templatesBefore + 1);
    expect((await db.query('SELECT subject, body_html FROM email_templates WHERE id = $1', [r.emailTemplateId3])).rows[0]).toEqual(oldTemplate);

    const campaign = (await db.query('SELECT status, campaign_name FROM campaigns WHERE id = $1', [id])).rows[0];
    expect(campaign).toEqual({ status: 'draft', campaign_name: 'Tên mới' });
    expect(await countOf('campaign_schedules')).toBe(1);

    const got = await get(owner, `/api/campaigns/${id}/simple`);
    expect(got.body.data.editable).toBe(true);
    expect(got.body.data.campaignName).toBe('Tên mới');
    expect(got.body.data.form.followUps[0]).toEqual({ delayValue: 4, delayUnit: 'days', content: tpl(r.emailTemplateId2) });
    expect(got.body.data.form.followUps[1].delayValue).toBe(6);
    const newTemplateId = got.body.data.form.followUps[1].content.templateId;
    expect(newTemplateId).not.toBe(r.emailTemplateId3);
    expect((await db.query('SELECT subject FROM email_templates WHERE id = $1', [newTemplateId])).rows[0].subject).toBe('Tin 3 mới');

    const audit = (await db.query(`SELECT details FROM audit_logs WHERE action = 'CAMPAIGN_UPDATED' AND entity_id = $1`, [String(id)])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ via: 'simple', nodesTruoc: 2, nodesSau: 2 });
  });

  it('giữ tên cũ khi body không gửi campaignName; đổi nguồn customers → danh sách, bớt tin (3 → 1)', async () => {
    const { owner, r } = await setup('edit-put-name');
    const id = await createSimple(owner, threeSteps(r));
    const { campaignName, ...rest } = emailBody(r, { audience: { type: 'customers' } });
    const res = await put(owner, `/api/campaigns/${id}/simple`, rest);
    expect(res.status).toBe(200);
    expect(campaignName).toBe('Chiến dịch email');
    const got = await get(owner, `/api/campaigns/${id}/simple`);
    expect(got.body.data.campaignName).toBe('Chiến dịch email');
    expect(got.body.data.form.audience).toEqual({ type: 'customers' });
    expect(got.body.data.form.followUps).toEqual([]);
    expect((await nodesOf(id)).map((node) => node.node_subtype)).toEqual(['manual', 'interested_customers', 'send_email']);
  });

  it('chiến dịch có khối Rẽ nhánh → 409 CAMPAIGN_NOT_EDITABLE, sơ đồ KHÔNG đổi, KHÔNG tạo mẫu', async () => {
    const { owner, r } = await setup('edit-put-branch');
    const created = await post(owner, '/api/campaigns', {
      campaignName: 'Có rẽ nhánh',
      campaignType: 'email',
      nodes: [
        { tempId: 't1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', config: {} },
        { tempId: 'c1', nodeType: 'condition', nodeSubtype: 'condition', nodeName: 'Rẽ nhánh', config: {} },
        { tempId: 's1', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Gửi', config: { fromEmailId: r.emailId, emailSteps: [{ templateId: r.emailTemplateId }] } },
      ],
      connections: [{ sourceNodeId: 't1', targetNodeId: 'c1' }, { sourceNodeId: 'c1', targetNodeId: 's1' }],
    });
    const id = created.body.data.id;
    const before = { nodes: await nodesOf(id), templates: await emailTemplates() };

    const res = await put(owner, `/api/campaigns/${id}/simple`, emailBody(r, { content: { mode: 'custom', subject: 'S', body: 'B' } }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAMPAIGN_NOT_EDITABLE');
    expect(res.body.readOnlyReasons.map((item) => item.code)).toEqual(['not_simple']);
    expect(await nodesOf(id)).toEqual(before.nodes);
    expect(await emailTemplates()).toBe(before.templates);
  });

  it('đang chạy → 409 CAMPAIGN_RUNNING, không ghi gì, không để mẫu mồ côi', async () => {
    const { owner, r } = await setup('edit-put-running');
    const id = await createSimple(owner, emailBody(r));
    await db.query(`INSERT INTO campaign_runs (id_campaign, workspace_owner_id, status) VALUES ($1, $2, 'running')`, [id, owner.id]);
    const before = { nodes: await nodesOf(id), templates: await emailTemplates() };
    const res = await put(owner, `/api/campaigns/${id}/simple`, emailBody(r, { content: { mode: 'custom', subject: 'S', body: 'B' } }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAMPAIGN_RUNNING');
    expect(await nodesOf(id)).toEqual(before.nodes);
    expect(await emailTemplates()).toBe(before.templates);
  });

  it('2 lịch (multiple_schedules) → PUT vẫn được (không đụng lịch)', async () => {
    const { owner, r } = await setup('edit-put-2sched');
    const id = await createSimple(owner, emailBody(r));
    for (const cron of ['0 9 * * *', '0 15 * * *']) {
      await db.query(
        `INSERT INTO campaign_schedules (id_campaign, workspace_owner_id, schedule_name, schedule_type, cron_expression, enabled)
         VALUES ($1, $2, 'Lịch', 'daily', $3, true)`,
        [id, owner.id, cron]
      );
    }
    const res = await put(owner, `/api/campaigns/${id}/simple`, emailBody(r, { campaignName: 'Vẫn sửa được' }));
    expect(res.status).toBe(200);
    expect(await countOf('campaign_schedules')).toBe(2);
  });

  it('đổi kênh → 400 CHANNEL_CHANGE_NOT_ALLOWED; mẫu của workspace khác → 400 TEMPLATE_NOT_FOUND và dọn mẫu tự soạn của tin trước', async () => {
    const { owner, r } = await setup('edit-put-bad');
    const outsider = await createUser({ email: 'edit-put-bad-out@test.com', username: 'edit_put_bad_out' });
    const foreign = await seedOwnerResources(outsider.id);
    const id = await createSimple(owner, emailBody(r));

    const channel = await put(owner, `/api/campaigns/${id}/simple`, groupBody(r));
    expect(channel.status).toBe(400);
    expect(channel.body.code).toBe('CHANNEL_CHANGE_NOT_ALLOWED');

    const nodesBefore = await nodesOf(id);
    const templatesBefore = await emailTemplates();
    const bad = await put(owner, `/api/campaigns/${id}/simple`, emailBody(r, {
      content: { mode: 'custom', subject: 'Tự soạn', body: 'Nội dung' },
      followUps: [{ delayValue: 1, delayUnit: 'days', content: tpl(foreign.emailTemplateId) }],
    }));
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('TEMPLATE_NOT_FOUND');
    expect(await nodesOf(id)).toEqual(nodesBefore);
    expect(await emailTemplates()).toBe(templatesBefore);
  });

  it('quyền: thiếu campaigns_create → 403; chiến dịch workspace khác → 404; body không hợp lệ → 400 và sơ đồ giữ nguyên', async () => {
    const { owner, r } = await setup('edit-put-perm');
    const outsider = await createUser({ email: 'edit-put-perm-out@test.com', username: 'edit_put_perm_out' });
    const employee = await createUser({ email: 'edit-put-perm-emp@test.com', username: 'edit_put_perm_emp', role: 'user' });
    await addEmployee(owner, employee, { campaigns_view: true });
    const id = await createSimple(owner, emailBody(r));
    const before = await nodesOf(id);

    expect((await put(employee, `/api/campaigns/${id}/simple`, emailBody(r), owner.id)).status).toBe(403);
    expect((await put(outsider, `/api/campaigns/${id}/simple`, emailBody(r))).status).toBe(404);
    const invalid = await put(owner, `/api/campaigns/${id}/simple`, emailBody(r, { followUps: [{ delayValue: 0, delayUnit: 'days', content: tpl(r.emailTemplateId2) }] }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_FOLLOW_UP_DELAY');
    expect(await nodesOf(id)).toEqual(before);
  });

  it('Zalo nhóm: PUT đổi nhóm + thêm tin → GET khớp', async () => {
    const { owner, r } = await setup('edit-put-group');
    const id = await createSimple(owner, groupBody(r));
    const body = groupBody(r, {
      audience: { type: 'zalo_groups', groupIds: ['3333333'] },
      followUps: [{ delayValue: 12, delayUnit: 'hours', content: tpl(r.zaloTemplateId2) }],
    });
    expect((await put(owner, `/api/campaigns/${id}/simple`, body)).status).toBe(200);
    const got = await get(owner, `/api/campaigns/${id}/simple`);
    expect(got.body.data.editable).toBe(true);
    expect(got.body.data.form.audience).toEqual({ type: 'zalo_groups', groupIds: ['3333333'] });
    expect(got.body.data.form.followUps).toEqual(body.followUps);
  });
});
