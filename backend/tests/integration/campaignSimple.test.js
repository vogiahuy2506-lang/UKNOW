/**
 * PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14 PR-1 — POST /api/campaigns/simple[/preview] trên Postgres thật.
 *
 * Chuỗi kiểm của đường AI (prepareScript, thẻ xác nhận, validateNodeConfig, tạo mẫu tin, campaignController.create, audit) chạy THẬT:
 * SQL tra tài khoản gửi, mẫu tin, biểu mẫu, khách hàng chỉ lộ sai tên cột khi chạm DB thật. Gemini / Zalo / SMTP KHÔNG được gọi:
 * trình này chỉ tạo bản nháp, không chạy chiến dịch.
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

const post = (user, url, body, ownerId = null) => {
  const req = request(app).post(url).set('Authorization', `Bearer ${tokenOf(user)}`);
  if (ownerId != null) req.set('X-Owner-Context', String(ownerId));
  return req.send(body);
};

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
     VALUES ($1, 'Mẫu email của chủ', 'Chào bạn', '<p>Nội dung</p>') RETURNING id`,
    [ownerId]
  )).rows[0];
  const zaloTemplate = (await db.query(
    `INSERT INTO zalo_templates (id_user, template_name, subject, body_text)
     VALUES ($1, 'Mẫu Zalo của chủ', 'Chào', 'Xin chào bạn') RETURNING id`,
    [ownerId]
  )).rows[0];
  return {
    emailId: Number(email.id),
    zaloId: Number(zalo.id),
    emailTemplateId: Number(emailTemplate.id),
    zaloTemplateId: Number(zaloTemplate.id),
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
const snapshot = async () => ({
  campaigns: await countOf('campaigns'),
  nodes: await countOf('campaign_nodes'),
  emailTemplates: await countOf('email_templates'),
  zaloTemplates: await countOf('zalo_templates'),
  createdAudits: Number((await db.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'CAMPAIGN_CREATED'`)).rows[0].n),
});

const nodesOf = async (campaignId) => (await db.query(
  `SELECT node_type, node_subtype, config FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order, id`,
  [campaignId]
)).rows;

const emailCustomBody = (r, overrides = {}) => ({
  campaignName: 'Chiến dịch thử',
  channel: 'email',
  senderId: r.emailId,
  audience: { type: 'manual', emails: ['khach1@example.test', 'Khach2@example.test'] },
  content: { mode: 'custom', subject: 'Ưu đãi tháng 10', body: 'Xin chào bạn' },
  ...overrides,
});

describe('POST /api/campaigns/simple — tạo chiến dịch nháp', () => {
  it('email + nhập tay + tự soạn → 1 campaigns draft, đúng campaign_nodes, 1 mẫu email mới, audit via=simple', async () => {
    const owner = await createUser({ email: 'simple-owner1@test.com', username: 'simple_owner1' });
    const r = await seedOwnerResources(owner.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple', emailCustomBody(r));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      // Giống `POST /campaigns` (data.id): BIGSERIAL đọc từ pg ra dạng chuỗi.
      campaignId: expect.stringMatching(/^\d+$/),
      campaignName: 'Chiến dịch thử',
      channel: 'email',
      recipientCountHint: 2,
    });

    const campaign = (await db.query('SELECT * FROM campaigns WHERE id = $1', [res.body.data.campaignId])).rows[0];
    expect(campaign.status).toBe('draft');
    expect(campaign.campaign_type).toBe('email');
    expect(campaign.campaign_name).toBe('Chiến dịch thử');
    expect(Number(campaign.id_user)).toBe(Number(owner.id));

    const nodes = await nodesOf(campaign.id);
    expect(nodes.map((n) => n.node_subtype)).toEqual(['manual', 'send_email']);
    const sendConfig = nodes[1].config;
    expect(sendConfig.recipientSource).toBe('manual');
    expect(sendConfig.recipientEmails).toEqual(['khach1@example.test', 'khach2@example.test']);
    expect(Number(sendConfig.fromEmailId)).toBe(r.emailId);

    const after = await snapshot();
    expect(after.campaigns).toBe(before.campaigns + 1);
    expect(after.nodes).toBe(before.nodes + 2);
    expect(after.emailTemplates).toBe(before.emailTemplates + 1);
    expect(after.zaloTemplates).toBe(before.zaloTemplates);

    // Chữ tự soạn đã thành mẫu tin thật thuộc chủ workspace, gắn vào bước gửi (bộ chạy chỉ gửi bước có templateId số).
    const template = (await db.query(
      'SELECT * FROM email_templates WHERE id = $1',
      [sendConfig.emailSteps[0].templateId]
    )).rows[0];
    expect(Number(template.id_user)).toBe(Number(owner.id));
    expect(template.subject).toBe('Ưu đãi tháng 10');
    expect(template.body_html).toBe('<p>Xin chào bạn</p>');
    expect(template.template_name).not.toMatch(/từ AI/);

    const audit = (await db.query(
      `SELECT details FROM audit_logs WHERE action = 'CAMPAIGN_CREATED' AND entity_id = $1`,
      [String(campaign.id)]
    )).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].details.via).toBe('simple');
  });

  it('zalo nhóm + mẫu có sẵn → zaloSelectedGroupIds đúng nhóm đã chọn trên khối gửi, KHÔNG tạo mẫu tin nào', async () => {
    const owner = await createUser({ email: 'simple-owner2@test.com', username: 'simple_owner2' });
    const r = await seedOwnerResources(owner.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple', {
      channel: 'zalo_group',
      senderId: r.zaloId,
      audience: { type: 'zalo_groups', groupIds: ['1111111', '2222222'] },
      content: { mode: 'template', templateId: r.zaloTemplateId },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.channel).toBe('zalo_group');
    expect(res.body.data.recipientCountHint).toBe(2);
    // Không gửi tên: server đặt "<Kênh> – dd/MM/yyyy HH:mm".
    expect(res.body.data.campaignName).toMatch(/^Zalo nhóm – \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

    const nodes = await nodesOf(res.body.data.campaignId);
    expect(nodes.map((n) => n.node_subtype)).toEqual(['manual', 'select_zalo_account', 'get_all_groups', 'send_zalo_group']);
    const send = nodes.find((n) => n.node_subtype === 'send_zalo_group').config;
    expect(send.zaloSelectedGroupIds).toEqual(['1111111', '2222222']);
    expect(send.zaloGroupIds).toEqual(['1111111', '2222222']);
    expect(nodes.find((n) => n.node_subtype === 'get_all_groups').config.zaloSelectedGroupIds).toEqual(['1111111', '2222222']);
    expect(send.zaloGroupTemplateSteps[0].templateId).toBe(r.zaloTemplateId);

    const after = await snapshot();
    expect(after.zaloTemplates).toBe(before.zaloTemplates);
    expect(after.emailTemplates).toBe(before.emailTemplates);
  });

  it('zalo cá nhân + SĐT nhập tay + tự soạn → mẫu Zalo mới, SĐT đã chuẩn hoá trên khối gửi', async () => {
    const owner = await createUser({ email: 'simple-owner3@test.com', username: 'simple_owner3' });
    const r = await seedOwnerResources(owner.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple', {
      channel: 'zalo',
      senderId: r.zaloId,
      audience: { type: 'manual', phones: ['+84912345678', '0987654321'] },
      content: { mode: 'custom', body: 'Xin chào, tuần này có ưu đãi' },
    });

    expect(res.status).toBe(201);
    const nodes = await nodesOf(res.body.data.campaignId);
    const send = nodes.find((n) => n.node_subtype === 'send_zalo_personal').config;
    expect(send.zaloRecipientSource).toBe('manual');
    expect(send.zaloRecipientType).toBe('phone');
    expect(send.zaloRecipientPhones).toEqual(['0912345678', '0987654321']);
    expect((await snapshot()).zaloTemplates).toBe(before.zaloTemplates + 1);
    const template = (await db.query('SELECT * FROM zalo_templates WHERE id = $1', [send.zaloPersonalTemplateSteps[0].templateId])).rows[0];
    expect(template.body_text).toBe('Xin chào, tuần này có ưu đãi');
  });

  it('khách hàng đã lưu → khối động interested_customers loại all (KHÔNG chụp danh sách lúc tạo); khách thêm sau vẫn thuộc nguồn', async () => {
    const owner = await createUser({ email: 'simple-owner4@test.com', username: 'simple_owner4' });
    const r = await seedOwnerResources(owner.id);
    await db.query(
      `INSERT INTO customers (id_user, workspace_owner_id, email) VALUES ($1, $1, 'mot@example.test')`,
      [owner.id]
    );
    expect(await countOf('customer_purchases')).toBe(0);

    const res = await post(owner, '/api/campaigns/simple', emailCustomBody(r, { audience: { type: 'customers' } }));

    expect(res.status).toBe(201);
    expect(res.body.data.recipientCountHint).toBeNull();
    const nodes = await nodesOf(res.body.data.campaignId);
    expect(nodes.map((n) => n.node_subtype)).toEqual(['manual', 'interested_customers', 'send_email']);
    expect(nodes[1].config).toEqual({ interestedCustomerType: 'all' });
    expect(nodes[2].config.recipientSource).toBe('node');
    expect(nodes[2].config.recipientEmails).toBeUndefined();
  });

  it('khách hàng đã lưu + Zalo cá nhân → khối all, cột phone, không có danh sách SĐT chụp sẵn', async () => {
    const owner = await createUser({ email: 'simple-owner4z@test.com', username: 'simple_owner4z' });
    const r = await seedOwnerResources(owner.id);
    const res = await post(owner, '/api/campaigns/simple', {
      channel: 'zalo',
      senderId: r.zaloId,
      audience: { type: 'customers' },
      content: { mode: 'template', templateId: r.zaloTemplateId },
    });
    expect(res.status).toBe(201);
    const nodes = await nodesOf(res.body.data.campaignId);
    expect(nodes.map((n) => n.node_subtype)).toEqual(['manual', 'select_zalo_account', 'interested_customers', 'send_zalo_personal']);
    const send = nodes[3].config;
    expect(send.zaloRecipientSource).toBe('node');
    expect(send.zaloRecipientField).toBe('phone');
    expect(send.zaloRecipientPhones).toBeUndefined();
  });

  it('hết hạn mức chiến dịch của gói → trả 400 limitReached của campaignController.create và XOÁ mẫu tin vừa tạo từ chữ tự soạn', async () => {
    const owner = await createUser({ email: 'simple-owner12@test.com', username: 'simple_owner12' });
    const r = await seedOwnerResources(owner.id);
    await db.query('UPDATE users SET max_campaigns = 0 WHERE id = $1', [owner.id]);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple', emailCustomBody(r));

    expect(res.status).toBe(400);
    expect(res.body.limitReached).toBe(true);
    // Mẫu email tự soạn đã được tạo trước bước tạo chiến dịch → phải bị dọn, không để mẫu mồ côi trong thư viện của khách.
    expect(await snapshot()).toEqual(before);
  });

  it('mẫu tin của workspace khác → 400 TEMPLATE_NOT_FOUND, không tạo chiến dịch', async () => {
    const owner = await createUser({ email: 'simple-owner5@test.com', username: 'simple_owner5' });
    const outsider = await createUser({ email: 'simple-out5@test.com', username: 'simple_out5' });
    const r = await seedOwnerResources(owner.id);
    const foreign = await seedOwnerResources(outsider.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple', emailCustomBody(r, {
      content: { mode: 'template', templateId: foreign.emailTemplateId },
    }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TEMPLATE_NOT_FOUND');
    expect(await snapshot()).toEqual(before);
  });

  it('tài khoản gửi của workspace khác → 400 SENDER_NOT_AVAILABLE; mẫu tự soạn KHÔNG bị tạo', async () => {
    const owner = await createUser({ email: 'simple-owner6@test.com', username: 'simple_owner6' });
    const outsider = await createUser({ email: 'simple-out6@test.com', username: 'simple_out6' });
    const r = await seedOwnerResources(owner.id);
    const foreign = await seedOwnerResources(outsider.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple', emailCustomBody(r, { senderId: foreign.emailId }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SENDER_NOT_AVAILABLE');
    expect(await snapshot()).toEqual(before);
  });

  it('zalo_groups rỗng → 400 ZALO_GROUPS_REQUIRED (rỗng = gửi MỌI nhóm), không tạo gì', async () => {
    const owner = await createUser({ email: 'simple-owner7@test.com', username: 'simple_owner7' });
    const r = await seedOwnerResources(owner.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple', {
      channel: 'zalo_group',
      senderId: r.zaloId,
      audience: { type: 'zalo_groups', groupIds: [] },
      content: { mode: 'template', templateId: r.zaloTemplateId },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ZALO_GROUPS_REQUIRED');
    expect(await snapshot()).toEqual(before);
  });

  it('biểu mẫu không thuộc workspace → 400 FORM_NOT_FOUND (truy vấn forms thật)', async () => {
    const owner = await createUser({ email: 'simple-owner8@test.com', username: 'simple_owner8' });
    const r = await seedOwnerResources(owner.id);

    const res = await post(owner, '/api/campaigns/simple', emailCustomBody(r, { audience: { type: 'form', formIds: [987654] } }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FORM_NOT_FOUND');
  });

  it('gói không có kênh Zalo (đọc qua channelEntitlementContext) → 403 CHANNEL_NOT_IN_PLAN; email cùng tài khoản vẫn tạo được', async () => {
    const owner = await createUser({ email: 'simple-owner9@test.com', username: 'simple_owner9' });
    const r = await seedOwnerResources(owner.id);
    await db.query('UPDATE users SET max_zalo_accounts = 0 WHERE id = $1', [owner.id]);
    const before = await snapshot();

    const zalo = await post(owner, '/api/campaigns/simple', {
      channel: 'zalo_group',
      senderId: r.zaloId,
      audience: { type: 'zalo_groups', groupIds: ['1111111'] },
      content: { mode: 'template', templateId: r.zaloTemplateId },
    });
    expect(zalo.status).toBe(403);
    expect(zalo.body.code).toBe('CHANNEL_NOT_IN_PLAN');
    expect(await snapshot()).toEqual(before);

    const email = await post(owner, '/api/campaigns/simple', emailCustomBody(r));
    expect(email.status).toBe(201);
  });

  it('nhân viên chưa được giao tài khoản Zalo → 400 SENDER_NOT_AVAILABLE; được giao thì tạo được, chiến dịch thuộc CHỦ', async () => {
    const owner = await createUser({ email: 'simple-owner10@test.com', username: 'simple_owner10' });
    const employee = await createUser({ email: 'simple-emp10@test.com', username: 'simple_emp10', role: 'user' });
    await addEmployee(owner, employee, { campaigns_view: true, campaigns_create: true });
    const r = await seedOwnerResources(owner.id);
    const body = {
      channel: 'zalo_group',
      senderId: r.zaloId,
      audience: { type: 'zalo_groups', groupIds: ['1111111'] },
      content: { mode: 'template', templateId: r.zaloTemplateId },
    };

    const blocked = await post(employee, '/api/campaigns/simple', body, owner.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('SENDER_NOT_AVAILABLE');
    expect(await countOf('campaigns')).toBe(0);

    await db.query(
      `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
       VALUES ($1, $2, 'zalo_personal', $3, 'assigned')`,
      [owner.id, employee.id, String(r.zaloId)]
    );
    const allowed = await post(employee, '/api/campaigns/simple', body, owner.id);
    expect(allowed.status).toBe(201);
    const campaign = (await db.query('SELECT id_user, workspace_owner_id, created_by FROM campaigns WHERE id = $1', [allowed.body.data.campaignId])).rows[0];
    expect(Number(campaign.workspace_owner_id)).toBe(Number(owner.id));
  });

  it('nhân viên thiếu campaigns_create → 403', async () => {
    const owner = await createUser({ email: 'simple-owner11@test.com', username: 'simple_owner11' });
    const employee = await createUser({ email: 'simple-emp11@test.com', username: 'simple_emp11', role: 'user' });
    await addEmployee(owner, employee, { campaigns_view: true });
    const r = await seedOwnerResources(owner.id);

    const res = await post(employee, '/api/campaigns/simple', emailCustomBody(r), owner.id);
    expect(res.status).toBe(403);
    const preview = await post(employee, '/api/campaigns/simple/preview', emailCustomBody(r), owner.id);
    expect(preview.status).toBe(403);
    expect(await countOf('campaigns')).toBe(0);
  });
});

describe('POST /api/campaigns/simple/preview — không ghi DB', () => {
  it('preview email tự soạn → readyToCreate + ước tính; KHÔNG tạo chiến dịch, node, mẫu tin hay audit', async () => {
    const owner = await createUser({ email: 'simple-prev1@test.com', username: 'simple_prev1' });
    const r = await seedOwnerResources(owner.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple/preview', emailCustomBody(r));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      readyToCreate: true,
      issues: [],
      recipientCount: 2,
      recipientUnit: 'person',
      summary: {
        channel: 'email',
        senderLabel: 'chu@example.test',
        audienceType: 'manual',
        contentLabel: 'Ưu đãi tháng 10',
      },
    });
    expect(res.body.data.estimate).toEqual(expect.objectContaining({ startAt: expect.any(String) }));
    expect(await snapshot()).toEqual(before);
  });

  it('preview zalo nhóm + mẫu có sẵn → tên mẫu trong summary, KHÔNG tạo gì', async () => {
    const owner = await createUser({ email: 'simple-prev2@test.com', username: 'simple_prev2' });
    const r = await seedOwnerResources(owner.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple/preview', {
      channel: 'zalo_group',
      senderId: r.zaloId,
      audience: { type: 'zalo_groups', groupIds: ['1111111'] },
      content: { mode: 'template', templateId: r.zaloTemplateId },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.readyToCreate).toBe(true);
    expect(res.body.data.recipientUnit).toBe('group');
    expect(res.body.data.summary.contentLabel).toBe('Mẫu Zalo của chủ');
    expect(await snapshot()).toEqual(before);
  });

  it('lỗi dữ liệu (mẫu của workspace khác, tài khoản lạ) → 200 readyToCreate=false + issues, không phải 500', async () => {
    const owner = await createUser({ email: 'simple-prev3@test.com', username: 'simple_prev3' });
    const outsider = await createUser({ email: 'simple-prev3o@test.com', username: 'simple_prev3o' });
    const r = await seedOwnerResources(owner.id);
    const foreign = await seedOwnerResources(outsider.id);
    const before = await snapshot();

    const res = await post(owner, '/api/campaigns/simple/preview', emailCustomBody(r, {
      senderId: foreign.emailId,
      content: { mode: 'template', templateId: foreign.emailTemplateId },
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.readyToCreate).toBe(false);
    expect(res.body.data.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['missing_sender', 'template_not_found']));
    expect(res.body.data.issues.every((i) => typeof i.message === 'string' && i.message.length > 0)).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('body sai hình dạng (zalo_groups rỗng) vẫn là 400', async () => {
    const owner = await createUser({ email: 'simple-prev4@test.com', username: 'simple_prev4' });
    const r = await seedOwnerResources(owner.id);
    const res = await post(owner, '/api/campaigns/simple/preview', {
      channel: 'zalo_group',
      senderId: r.zaloId,
      audience: { type: 'zalo_groups', groupIds: [] },
      content: { mode: 'template', templateId: r.zaloTemplateId },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ZALO_GROUPS_REQUIRED');
  });
});
